import { firefox, webkit, type Browser, type BrowserType } from 'playwright';
import type { BrowserName, BrowserRun, CrossBrowserDetails, CrossBrowserSummary } from '@pulseqa/shared';
import { firstUrlIn, siteOf, siteOfUrl } from '../../lib/site.js';
import { newAuditContext } from '../browser.js';
import { outcome, type Check, type CheckContext } from '../types.js';

const VIEWPORT = { width: 1366, height: 768 };
const LOAD_TIMEOUT = 30_000;
const LAUNCH_TIMEOUT = 30_000;

const ENGINES: { name: Exclude<BrowserName, 'chromium'>; type: BrowserType }[] = [
  { name: 'firefox', type: firefox },
  { name: 'webkit', type: webkit },
];

/** Loads the page in one browser and records what went wrong there. */
async function runIn(ctx: CheckContext, name: BrowserName, browser: Browser): Promise<BrowserRun> {
  const run: BrowserRun = {
    browser: name,
    version: browser.version(),
    loaded: false,
    httpStatus: null,
    loadMs: null,
    jsErrors: [],
    consoleErrors: [],
    failedRequests: 0,
    horizontalOverflow: false,
    overflowPx: 0,
    screenshot: null,
  };
  const site = siteOf(new URL(ctx.page.url() || ctx.url).hostname);
  // Unknown origin (inline script) counts as first-party — it's the page's own code
  const isFirstParty = (url: string | null) => {
    const s = siteOfUrl(url);
    return s === null || s === site;
  };

  const context = await newAuditContext(browser, { viewport: VIEWPORT }, { allowPrivateHosts: ctx.allowPrivateHosts });
  const close = () => void context.close().catch(() => {});
  ctx.signal.addEventListener('abort', close, { once: true });
  try {
    const page = await context.newPage();
    page.on('pageerror', (e) => {
      if (isFirstParty(firstUrlIn(e.stack))) run.jsErrors.push(e.message.split('\n')[0].slice(0, 300));
    });
    page.on('console', (m) => {
      if (m.type() === 'error' && isFirstParty(firstUrlIn(m.location().url) ?? firstUrlIn(m.text()))) run.consoleErrors.push(m.text().slice(0, 300));
    });
    page.on('requestfailed', () => run.failedRequests++);
    page.on('response', (r) => {
      if (r.status() >= 400 && r.request().resourceType() !== 'document') run.failedRequests++;
    });

    const started = Date.now();
    const res = await page.goto(ctx.page.url() || ctx.url, { waitUntil: 'domcontentloaded', timeout: LOAD_TIMEOUT });
    await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => {});
    run.loadMs = Date.now() - started;
    run.httpStatus = res?.status() ?? null;
    run.loaded = !!res && res.status() < 400;
    await page.waitForTimeout(800); // late errors from deferred scripts

    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement ?? document.documentElement;
      window.scrollTo(10_000, 0);
      const x = window.scrollX;
      window.scrollTo(0, 0);
      return Math.max(0, Math.min(el.scrollWidth - el.clientWidth, x));
    });
    run.overflowPx = overflow;
    run.horizontalOverflow = overflow > 8;
    run.screenshot = (await ctx.saveScreenshot(name, await page.screenshot({ animations: 'disabled' }))).url;
  } catch (err) {
    run.error = (err as Error).message.split('\n')[0];
  } finally {
    ctx.signal.removeEventListener('abort', close);
    close();
  }
  run.jsErrors = [...new Set(run.jsErrors)];
  run.consoleErrors = [...new Set(run.consoleErrors)];
  return run;
}

export const crossBrowserCheck: Check = {
  id: 'crossBrowser',
  timeoutMs: 150_000,
  requiresPage: true,
  async run(ctx) {
    // Chromium: the shared instance. Firefox/WebKit: launched just for this check and closed right
    // after, one at a time, so they never sit in RAM between audits.
    const runs: BrowserRun[] = [await runIn(ctx, 'chromium', ctx.browser)];
    for (const { name, type } of ENGINES) {
      if (ctx.signal.aborted) break;
      let browser: Browser | null = null;
      try {
        browser = await type.launch({ headless: true, timeout: LAUNCH_TIMEOUT });
        const close = () => void browser?.close().catch(() => {});
        ctx.signal.addEventListener('abort', close, { once: true });
        runs.push(await runIn(ctx, name, browser));
        ctx.signal.removeEventListener('abort', close);
      } catch (err) {
        const msg = (err as Error).message;
        runs.push({
          browser: name,
          version: null,
          loaded: false,
          httpStatus: null,
          loadMs: null,
          jsErrors: [],
          consoleErrors: [],
          failedRequests: 0,
          horizontalOverflow: false,
          overflowPx: 0,
          screenshot: null,
          error: /Executable doesn't exist|browserType\.launch/i.test(msg)
            ? `${name} is not installed on the server (run: npx playwright install ${name})`
            : msg.split('\n')[0],
        });
      } finally {
        await browser?.close().catch(() => {});
      }
    }

    // Errors that only some browsers hit (messages differ per engine, so compare per browser)
    const ran = runs.filter((r) => r.loaded);
    const allMessages = new Map<string, Set<BrowserName>>();
    for (const r of ran) for (const m of r.jsErrors) allMessages.set(m, (allMessages.get(m) ?? new Set()).add(r.browser));
    const minErrors = ran.length ? Math.min(...ran.map((r) => r.jsErrors.length)) : 0;
    const browserOnlyErrors: CrossBrowserDetails['browserOnlyErrors'] = [];
    for (const r of ran) {
      if (r.jsErrors.length <= minErrors) continue;
      for (const m of r.jsErrors) {
        const seen = allMessages.get(m)!;
        if (seen.size < ran.length && !browserOnlyErrors.some((e) => e.message === m)) browserOnlyErrors.push({ message: m, browsers: [...seen] });
      }
    }
    const overflowIn = ran.filter((r) => r.horizontalOverflow).length;
    const inconsistentLayout = overflowIn > 0 && overflowIn < ran.length;

    const chromium = runs[0];
    const brokenElsewhere = chromium.loaded && runs.some((r) => r.browser !== 'chromium' && !r.loaded && !/not installed/.test(r.error ?? ''));
    const notInstalled = runs.some((r) => /not installed/.test(r.error ?? ''));
    const status = brokenElsewhere ? 'fail' : browserOnlyErrors.length || inconsistentLayout || notInstalled ? 'warn' : 'pass';

    return outcome(
      status,
      {
        browsersTested: runs.length,
        loadedIn: ran.length,
        browserSpecificErrors: browserOnlyErrors.length,
        inconsistentLayout,
      } satisfies CrossBrowserSummary,
      { runs, browserOnlyErrors, viewport: `${VIEWPORT.width}×${VIEWPORT.height}` } satisfies CrossBrowserDetails,
      runs.filter((r) => r.screenshot).map((r) => ({ label: r.browser, url: r.screenshot! })),
    );
  },
};
