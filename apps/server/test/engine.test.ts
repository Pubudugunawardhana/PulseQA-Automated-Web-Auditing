import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CHECK_IDS,
  type AccessibilityDetails,
  type CheckResult,
  type ConsoleNetworkSummary,
  type PerformanceSummary,
  type SmokeDetails,
} from '@pulseqa/shared';
import { closeBrowser } from '../src/audit/browser.js';
import { runAuditEngine } from '../src/audit/engine.js';
import { startFixtureServer } from './fixtureServer.js';

let server: Awaited<ReturnType<typeof startFixtureServer>>;
let artifactsDir: string;

beforeAll(async () => {
  server = await startFixtureServer();
  artifactsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulseqa-test-'));
});

afterAll(async () => {
  await closeBrowser();
  await server.close();
  await fs.rm(artifactsDir, { recursive: true, force: true });
});

const byId = (results: CheckResult[]) => Object.fromEntries(results.map((r) => [r.checkId, r])) as Record<string, CheckResult>;

describe('audit engine (integration)', () => {
  it('flags every problem on the bad fixture', async () => {
    const { results, aborted } = await runAuditEngine({
      auditId: 'bad',
      url: `${server.baseUrl}/bad.html`,
      checks: [...CHECK_IDS],
      artifactsDir,
    });
    const r = byId(results);
    expect(aborted).toBeNull();
    expect(results).toHaveLength(7);
    for (const res of results) {
      expect(res.status, `${res.checkId}: ${res.error}`).not.toBe('error');
      expect(res.startedAt).toBeTruthy();
    }

    expect(r.smoke.summary.httpStatus).toBe(200);
    expect(r.smoke.status).toBe('warn'); // no viewport meta
    const smoke = r.smoke.details as unknown as SmokeDetails;
    expect(smoke.notes?.join(' ')).toMatch(/meta name="description"/);
    expect(smoke.notes?.join(' ')).toMatch(/lang/);

    expect(r.links.status).toBe('fail');
    expect(r.links.summary.brokenLinks).toBe(1);
    expect(r.links.summary.brokenImages).toBe(1);

    const cn = r.consoleNetwork.summary as unknown as ConsoleNetworkSummary;
    expect(r.consoleNetwork.status).toBe('fail');
    expect(cn.uncaughtExceptions).toBeGreaterThanOrEqual(1);
    expect(cn.apiFailures).toBeGreaterThanOrEqual(1);
    expect(cn.consoleErrors).toBeGreaterThanOrEqual(1);
    expect(cn.thirdPartyIssues).toBe(0);

    expect(r.responsive.status).toBe('fail');
    expect(r.responsive.summary.overflowing).toContain('mobile');
    expect(r.responsive.screenshots.map((s) => s.label)).toEqual(['desktop', 'tablet', 'mobile']);
    await fs.access(path.join(artifactsDir, 'bad', 'responsive-mobile.png'));

    expect(r.accessibility.status).toBe('fail');
    const a11y = r.accessibility.details as unknown as AccessibilityDetails;
    expect(a11y.violations.map((v) => v.id)).toEqual(expect.arrayContaining(['image-alt', 'color-contrast', 'button-name']));
    expect(a11y.highlighted).toBeGreaterThan(0);
    await fs.access(path.join(artifactsDir, 'bad', 'accessibility-violations-highlighted.png'));

    const perf = r.performance.summary as unknown as PerformanceSummary;
    expect(['pass', 'warn', 'fail']).toContain(r.performance.status);
    expect(perf.fcp).not.toBeNull();
    expect(perf.mobile?.fcp).not.toBeNull(); // throttled mobile run happened

    expect(r.security.status).toBe('fail'); // not https
    expect(r.security.summary.https).toBe(false);
  }, 180_000);

  it('passes the good fixture on links, console, responsive and accessibility', async () => {
    const { results } = await runAuditEngine({
      auditId: 'good',
      url: `${server.baseUrl}/good.html`,
      checks: ['smoke', 'links', 'consoleNetwork', 'responsive', 'accessibility'],
      artifactsDir,
    });
    const r = byId(results);
    expect(r.smoke.status).toBe('pass');
    expect(r.links.status).toBe('pass');
    expect(r.consoleNetwork.status).toBe('pass');
    expect(r.responsive.status).toBe('pass');
    expect(r.accessibility.status).toBe('pass');
    expect(r.accessibility.screenshots).toHaveLength(0); // nothing to highlight
  }, 180_000);

  it('treats errors from another site as third-party (warn, not fail)', async () => {
    const { results } = await runAuditEngine({
      auditId: 'thirdparty',
      url: `${server.baseUrl}/thirdparty.html`,
      checks: ['consoleNetwork'],
      artifactsDir,
    });
    const r = byId(results);
    const s = r.consoleNetwork.summary as unknown as ConsoleNetworkSummary;
    expect(r.consoleNetwork.status).toBe('warn');
    expect(s.uncaughtExceptions).toBe(0);
    expect(s.consoleErrors).toBe(0);
    expect(s.thirdPartyIssues).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it('fails smoke and skips the rest when the host is unreachable', async () => {
    const { results } = await runAuditEngine({
      auditId: 'down',
      url: 'http://127.0.0.1:1/',
      checks: ['smoke', 'links', 'security'],
      artifactsDir,
    });
    const r = byId(results);
    expect(r.smoke.status).toBe('fail');
    expect(r.links.status).toBe('skipped');
    expect(r.security.status).toBe('skipped');
  }, 60_000);

  it('blocks private-network targets when allowPrivateHosts is false (SSRF guard)', async () => {
    const { results } = await runAuditEngine({
      auditId: 'ssrf',
      url: `${server.baseUrl}/good.html`,
      checks: ['smoke', 'links'],
      artifactsDir,
      allowPrivateHosts: false,
    });
    const r = byId(results);
    expect(r.smoke.status).toBe('fail');
    expect(String(r.smoke.error)).toMatch(/private network/);
    expect(r.links.status).toBe('skipped');
  }, 60_000);

  it('stops quickly when cancelled and marks the remaining checks skipped', async () => {
    const controller = new AbortController();
    const started = Date.now();
    const run = runAuditEngine({
      auditId: 'cancel',
      url: `${server.baseUrl}/slow.html`, // never finishes loading
      checks: ['smoke', 'links', 'accessibility'],
      artifactsDir,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(new DOMException('Cancelled by user', 'AbortError')), 1_500);
    const { results, aborted } = await run;
    expect(aborted).toBe('cancelled');
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(results.every((x) => x.status === 'skipped' || x.status === 'fail')).toBe(true);
  }, 60_000);

  it('enforces the overall time limit', async () => {
    const { aborted } = await runAuditEngine({
      auditId: 'timeout',
      url: `${server.baseUrl}/slow.html`,
      checks: ['smoke'],
      artifactsDir,
      timeoutMs: 2_000,
    });
    expect(aborted).toBe('timeout');
  }, 60_000);
});
