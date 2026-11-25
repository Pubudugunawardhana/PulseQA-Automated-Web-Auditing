import fs from 'node:fs/promises';
import path from 'node:path';
import type { Response } from 'playwright';
import type { CheckId, CheckResult, Screenshot } from '@pulseqa/shared';
import { assertSafeRedirectChain } from '../lib/urlGuard.js';
import { getBrowser, newAuditContext, userAgentFor } from './browser.js';
import { accessibilityCheck } from './checks/accessibility.js';
import { consoleNetworkCheck } from './checks/consoleNetwork.js';
import { linksCheck } from './checks/links.js';
import { performanceCheck } from './checks/performance.js';
import { responsiveCheck } from './checks/responsive.js';
import { securityCheck } from './checks/security.js';
import { smokeCheck } from './checks/smoke.js';
import type { Check, CheckContext, Collected } from './types.js';

/** Execution order matters: page-state-sensitive checks first, page-reloading checks last. */
const EXECUTION_ORDER: Check[] = [
  smokeCheck,
  consoleNetworkCheck,
  securityCheck,
  performanceCheck,
  linksCheck,
  accessibilityCheck,
  responsiveCheck,
];

/** Hard ceiling for a whole audit, whatever the target does. */
export const AUDIT_TIMEOUT_MS = 4 * 60_000;

export interface EngineOptions {
  auditId: string;
  url: string;
  checks: CheckId[];
  artifactsDir: string;
  /** Public URL prefix for saved artifacts. */
  artifactsUrlPrefix?: string;
  /** Default true (dev). Set false on public deployments to block private-network targets. */
  allowPrivateHosts?: boolean;
  /** Abort to cancel the audit. Combined with the overall AUDIT_TIMEOUT_MS. */
  signal?: AbortSignal;
  timeoutMs?: number;
  onCheckStarted?: (checkId: CheckId) => void | Promise<void>;
  onCheckCompleted?: (result: CheckResult) => void | Promise<void>;
}

export interface EngineResult {
  finalUrl: string | null;
  results: CheckResult[];
  /** Set when the audit was cancelled or timed out before all checks ran. */
  aborted: 'cancelled' | 'timeout' | null;
}

class TimeoutError extends Error {}

/** Resolves/rejects with `p`, or rejects on timeout or abort — whichever comes first. */
function race<T>(p: Promise<T>, ms: number, signal: AbortSignal): Promise<T> {
  let timer: NodeJS.Timeout;
  let onAbort: () => void = () => {};
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new TimeoutError(`Timed out after ${Math.round(ms / 1000)}s`)), ms);
      onAbort = () => reject(new Error(abortReason(signal) === 'timeout' ? 'Audit time limit reached' : 'Cancelled'));
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }),
  ]).finally(() => {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  });
}

function abortReason(signal: AbortSignal): 'cancelled' | 'timeout' {
  const r = signal.reason as { name?: string } | undefined;
  return r?.name === 'TimeoutError' ? 'timeout' : 'cancelled';
}

const NAV_TIMEOUT = 45_000;

function skipped(checkId: CheckId, error: string, startedAt: Date): CheckResult {
  return { checkId, status: 'skipped', durationMs: 0, summary: {}, details: {}, screenshots: [], error, startedAt: startedAt.toISOString() };
}

export async function runAuditEngine(opts: EngineOptions): Promise<EngineResult> {
  const { auditId, url } = opts;
  const allowPrivateHosts = opts.allowPrivateHosts ?? true;
  const signal = AbortSignal.any([
    ...(opts.signal ? [opts.signal] : []),
    AbortSignal.timeout(opts.timeoutMs ?? AUDIT_TIMEOUT_MS),
  ]);
  const prefix = opts.artifactsUrlPrefix ?? '/artifacts';
  const outDir = path.join(opts.artifactsDir, auditId);
  await fs.mkdir(outDir, { recursive: true });

  const browser = await getBrowser();
  const context = await newAuditContext(browser, { viewport: { width: 1920, height: 1080 } }, { allowPrivateHosts });
  const results: CheckResult[] = [];
  const selected = EXECUTION_ORDER.filter((c) => opts.checks.includes(c.id));

  // Close the browser context as soon as we're cancelled so in-flight Playwright calls fail fast.
  const onAbort = () => void context.close().catch(() => {});
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    const page = await context.newPage();

    const collected: Collected = { console: [], pageErrors: [], failedRequests: [], errorResponses: [], requestUrls: [] };
    page.on('console', (msg) => {
      const type = msg.type();
      if (type !== 'error' && type !== 'warning') return;
      const loc = msg.location();
      collected.console.push({
        type,
        text: msg.text().slice(0, 1000),
        location: loc?.url ? `${loc.url}:${loc.lineNumber}:${loc.columnNumber}` : undefined,
      });
    });
    page.on('pageerror', (err) => collected.pageErrors.push({ message: err.message, stack: err.stack?.slice(0, 2000) }));
    page.on('request', (req) => {
      if (collected.requestUrls.length < 2000) collected.requestUrls.push(req.url());
    });
    page.on('requestfailed', (req) => {
      const failure = req.failure()?.errorText ?? 'failed';
      // Aborted requests on navigation/teardown are noise; blocked ones are our own SSRF guard
      if (failure.includes('ERR_ABORTED') || failure.includes('ERR_BLOCKED_BY_CLIENT')) return;
      collected.failedRequests.push({ url: req.url(), method: req.method(), resourceType: req.resourceType(), failure });
    });
    page.on('response', (res) => {
      if (res.status() >= 400) {
        const req = res.request();
        collected.errorResponses.push({ url: res.url(), method: req.method(), resourceType: req.resourceType(), status: res.status() });
      }
    });

    let mainResponse: Response | null = null;
    let navError: string | null = null;
    try {
      if (!allowPrivateHosts) await assertSafeRedirectChain(url, userAgentFor(browser, 'desktop'));
      mainResponse = await race(page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT }), NAV_TIMEOUT + 5_000, signal);
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    } catch (err) {
      navError = (err as Error).message.split('\n')[0];
    }

    for (const check of selected) {
      const startedAt = new Date();
      if (signal.aborted) {
        const reason = abortReason(signal);
        results.push(skipped(check.id, reason === 'timeout' ? 'Skipped: audit time limit reached' : 'Skipped: audit cancelled', startedAt));
        continue; // no events for skipped-by-abort checks; the runner reports the whole audit
      }

      await opts.onCheckStarted?.(check.id);
      let result: CheckResult;

      if (!mainResponse && check.id !== 'smoke') {
        result = skipped(check.id, `Skipped: page could not be loaded${navError ? ` (${navError})` : ''}`, startedAt);
      } else if (!mainResponse && check.id === 'smoke') {
        result = {
          checkId: 'smoke',
          status: 'fail',
          durationMs: 0,
          summary: { reachable: false },
          details: { issues: [navError ?? 'No response received'] },
          screenshots: [],
          error: navError,
          startedAt: startedAt.toISOString(),
        };
      } else {
        const ctx: CheckContext = {
          auditId,
          url,
          browser,
          context,
          page,
          mainResponse,
          collected,
          signal,
          allowPrivateHosts,
          async saveScreenshot(label: string, buffer: Buffer): Promise<Screenshot> {
            const file = `${check.id}-${label}.png`;
            await fs.writeFile(path.join(outDir, file), buffer);
            return { label, url: `${prefix}/${auditId}/${file}` };
          },
        };
        try {
          const out = await race(check.run(ctx), check.timeoutMs, signal);
          result = { checkId: check.id, durationMs: Date.now() - startedAt.getTime(), startedAt: startedAt.toISOString(), ...out };
        } catch (err) {
          result = {
            checkId: check.id,
            status: signal.aborted ? 'skipped' : 'error',
            durationMs: Date.now() - startedAt.getTime(),
            summary: {},
            details: {},
            screenshots: [],
            error: (err as Error).message.split('\n')[0],
            startedAt: startedAt.toISOString(),
          };
        }
      }
      results.push(result);
      await opts.onCheckCompleted?.(result);
    }

    return {
      finalUrl: mainResponse && !signal.aborted ? page.url() : mainResponse ? mainResponse.url() : null,
      results,
      aborted: signal.aborted ? abortReason(signal) : null,
    };
  } finally {
    signal.removeEventListener('abort', onAbort);
    await context.close().catch(() => {});
  }
}
