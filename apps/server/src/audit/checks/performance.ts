import type { Page } from 'playwright';
import type { PerfMetricKey, PerfMetrics, PerformanceDetails, PerformanceSummary, Rating } from '@pulseqa/shared';
import { applyMobileThrottling, MOBILE_THROTTLING, newAuditContext } from '../browser.js';
import { outcome, type Check } from '../types.js';

/** [good, poor] thresholds — at or below good = pass, above poor = fail, in between = warn. */
export const PERF_THRESHOLDS = {
  ttfb: [800, 1800],
  fcp: [1800, 3000],
  lcp: [2500, 4000],
  cls: [0.1, 0.25],
  load: [3000, 6000],
} as const satisfies Record<PerfMetricKey, readonly [number, number]>;

export type PerfMetric = PerfMetricKey;

export function rateMetric(metric: PerfMetric, value: number | null): Rating {
  if (value === null || Number.isNaN(value)) return 'unknown';
  const [good, poor] = PERF_THRESHOLDS[metric];
  if (value <= good) return 'pass';
  if (value <= poor) return 'warn';
  return 'fail';
}

function rateAll(m: PerfMetrics): Record<PerfMetricKey, Rating> {
  return {
    ttfb: rateMetric('ttfb', m.ttfb),
    fcp: rateMetric('fcp', m.fcp),
    lcp: rateMetric('lcp', m.lcp),
    cls: rateMetric('cls', m.cls),
    load: rateMetric('load', m.load),
  };
}

function worst(ratings: Rating[]): 'pass' | 'warn' | 'fail' {
  return ratings.includes('fail') ? 'fail' : ratings.includes('warn') ? 'warn' : 'pass';
}

/** Reads Navigation Timing, paint, LCP and CLS entries from an already-loaded page. */
async function collectMetrics(page: Page) {
  const m = await page.evaluate(async () => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null;

    const observe = (type: string) =>
      new Promise<PerformanceEntry[]>((resolve) => {
        const list: PerformanceEntry[] = [];
        try {
          const po = new PerformanceObserver((l) => list.push(...l.getEntries()));
          po.observe({ type, buffered: true } as PerformanceObserverInit);
          setTimeout(() => {
            po.disconnect();
            resolve(list);
          }, 300);
        } catch {
          resolve(list);
        }
      });

    const [lcpEntries, shiftEntries] = await Promise.all([observe('largest-contentful-paint'), observe('layout-shift')]);
    const lcp = lcpEntries.length ? lcpEntries[lcpEntries.length - 1].startTime : null;
    const cls = shiftEntries.reduce(
      (sum, e) => sum + ((e as unknown as { hadRecentInput: boolean }).hadRecentInput ? 0 : (e as unknown as { value: number }).value),
      0,
    );

    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const byType: Record<string, { count: number; bytes: number }> = {};
    let transfer = nav?.transferSize ?? 0;
    for (const r of resources) {
      const t = r.initiatorType || 'other';
      byType[t] ??= { count: 0, bytes: 0 };
      byType[t].count++;
      byType[t].bytes += r.transferSize || 0;
      transfer += r.transferSize || 0;
    }
    const slowest = resources
      .slice()
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10)
      .map((r) => ({ url: r.name, type: r.initiatorType, durationMs: Math.round(r.duration), bytes: r.transferSize }));

    return {
      ttfb: nav ? nav.responseStart - nav.startTime : null,
      domContentLoaded: nav && nav.domContentLoadedEventEnd > 0 ? nav.domContentLoadedEventEnd - nav.startTime : null,
      load: nav && nav.loadEventEnd > 0 ? nav.loadEventEnd - nav.startTime : null,
      fcp,
      lcp,
      cls,
      requestCount: resources.length + 1,
      transferBytes: transfer,
      domNodes: document.getElementsByTagName('*').length,
      byType,
      slowest,
    };
  });
  const round = (v: number | null) => (v === null ? null : Math.round(v));
  const metrics: PerfMetrics = {
    ttfb: round(m.ttfb),
    fcp: round(m.fcp),
    lcp: round(m.lcp),
    cls: Math.round(m.cls * 1000) / 1000,
    load: round(m.load),
    domContentLoaded: round(m.domContentLoaded),
  };
  return { metrics, raw: m };
}

const MOBILE_LOAD_TIMEOUT = 45_000;

export const performanceCheck: Check = {
  id: 'performance',
  timeoutMs: 75_000,
  requiresPage: true,
  async run(ctx) {
    // 1) Desktop: the shared page that was already loaded (no throttling)
    const desktop = await collectMetrics(ctx.page);
    const ratings = rateAll(desktop.metrics);

    // 2) Mobile: fresh load in a new context of the SAME browser, with Lighthouse-like throttling
    let mobile: PerfMetrics | null = null;
    let mobileError: string | null = null;
    const context = await newAuditContext(
      ctx.browser,
      { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 },
      { profile: 'mobile', allowPrivateHosts: ctx.allowPrivateHosts },
    );
    const close = () => void context.close().catch(() => {});
    ctx.signal.addEventListener('abort', close, { once: true });
    try {
      const page = await context.newPage();
      await applyMobileThrottling(context, page);
      // A slow page may not reach "load" in time — still read FCP/LCP collected so far.
      await page.goto(ctx.page.url() || ctx.url, { waitUntil: 'load', timeout: MOBILE_LOAD_TIMEOUT }).catch((err: Error) => {
        if (!/Timeout/i.test(err.message)) throw err;
      });
      mobile = (await collectMetrics(page)).metrics;
    } catch (err) {
      mobileError = (err as Error).message.split('\n')[0];
    } finally {
      ctx.signal.removeEventListener('abort', close);
      close();
    }
    const mobileRatings = mobile ? rateAll(mobile) : null;

    // Status: desktop decides; a failing mobile profile can lower a pass to warn (field data varies by device).
    let status = worst(Object.values(ratings));
    if (status === 'pass' && mobileRatings && worst(Object.values(mobileRatings)) !== 'pass') status = 'warn';

    return outcome(
      status,
      {
        ...desktop.metrics,
        requestCount: desktop.raw.requestCount,
        transferKb: Math.round(desktop.raw.transferBytes / 1024),
        mobile,
      } satisfies PerformanceSummary,
      {
        ratings,
        mobileRatings,
        mobileError,
        conditions: { desktop: 'desktop · 1920×1080 · no throttling', mobile: MOBILE_THROTTLING.label },
        thresholds: PERF_THRESHOLDS,
        byType: desktop.raw.byType,
        slowestResources: desktop.raw.slowest,
        domNodes: desktop.raw.domNodes,
      } satisfies PerformanceDetails,
    );
  },
};
