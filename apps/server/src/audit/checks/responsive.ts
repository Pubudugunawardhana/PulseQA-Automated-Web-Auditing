import type { ResponsiveDetails, ResponsiveSummary, Screenshot, ViewportResult } from '@pulseqa/shared';
import { newAuditContext } from '../browser.js';
import { outcome, type Check } from '../types.js';

export const VIEWPORTS = [
  { label: 'desktop', width: 1920, height: 1080, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  { label: 'tablet', width: 768, height: 1024, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  { label: 'mobile', width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
] as const;

/** Very tall pages make huge PNGs — clip full-page shots to this height. */
const MAX_SHOT_HEIGHT = 6000;

export const responsiveCheck: Check = {
  id: 'responsive',
  timeoutMs: 60_000,
  requiresPage: true,
  async run(ctx) {
    const target = ctx.page.url() || ctx.url;

    // All viewports run IN PARALLEL as separate contexts (tabs) of the one shared browser —
    // never extra browser processes, so memory stays low on small cloud instances.
    const runViewport = async (vp: (typeof VIEWPORTS)[number]): Promise<{ viewport: ViewportResult; shot: Screenshot | null }> => {
      const context = await newAuditContext(
        ctx.browser,
        {
          viewport: { width: vp.width, height: vp.height },
          isMobile: vp.isMobile,
          hasTouch: vp.hasTouch,
          deviceScaleFactor: vp.deviceScaleFactor,
        },
        { profile: vp.label, allowPrivateHosts: ctx.allowPrivateHosts },
      );
      const close = () => void context.close().catch(() => {});
      ctx.signal.addEventListener('abort', close, { once: true });
      try {
        const page = await context.newPage();
        // Video/audio files are the heaviest downloads and don't change layout (their CSS box is
        // sized either way) — skip them so 3 parallel loads fit on slow connections.
        // fallback() (not continue()) keeps the context-level SSRF guard in the chain.
        await page.route('**/*', (route) => (route.request().resourceType() === 'media' ? route.abort() : route.fallback()));

        // 3 viewports load in parallel and share bandwidth: only DOMContentLoaded is required, and even
        // a timeout isn't fatal as long as a document exists — we measure what has rendered so far.
        let partial = false;
        await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(async (err: Error) => {
          const hasDocument = await page.evaluate(() => !!document.body).catch(() => false);
          if (!/Timeout/i.test(err.message) || !hasDocument) throw err;
          partial = true;
        });
        await page.waitForLoadState('load', { timeout: 20_000 }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => {});

        const info = await page.evaluate(() => {
          const doc = document.documentElement;
          const vw = doc.clientWidth;
          const scrollWidth = Math.max(doc.scrollWidth, document.body?.scrollWidth ?? 0);
          const selectorOf = (el: Element) => {
            if (el.id) return `#${el.id}`;
            const cls = (el.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
            return el.tagName.toLowerCase() + (cls.length ? `.${cls.join('.')}` : '');
          };
          // The real question: can the user actually scroll the page sideways?
          // (scrollWidth alone is misleading when html/body use overflow-x: hidden/clip)
          const startX = window.scrollX;
          window.scrollTo(100_000, window.scrollY);
          const maxScrollX = Math.round(window.scrollX);
          window.scrollTo(startX, window.scrollY);

          // An element inside a clipping ancestor (overflow-x hidden/clip/scroll/auto) can't cause page overflow.
          const clipped = (el: Element) => {
            for (let p = el.parentElement; p && p !== document.body && p !== doc; p = p.parentElement) {
              const ox = getComputedStyle(p).overflowX;
              if (ox !== 'visible') return true;
            }
            return false;
          };
          // Without a viewport meta, mobile browsers zoom out instead of scrolling — still broken layout.
          const rootClips = [doc, document.body].some((e) => e && getComputedStyle(e).overflowX !== 'visible');
          const layoutOverflow = rootClips ? 0 : Math.max(0, scrollWidth - vw);
          const overflowPx = Math.max(maxScrollX, layoutOverflow);

          const offenders: { selector: string; right: number; width: number }[] = [];
          if (overflowPx > 1) {
            for (const el of Array.from(document.body?.querySelectorAll('*') ?? [])) {
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              if (r.right > vw + 1 && !clipped(el)) {
                offenders.push({ selector: selectorOf(el), right: Math.round(r.right), width: Math.round(r.width) });
              }
            }
            offenders.sort((a, b) => b.right - a.right);
          }
          return {
            overflowPx,
            maxScrollX,
            scrollWidth,
            clientWidth: doc.clientWidth,
            pageHeight: Math.max(doc.scrollHeight, document.body?.scrollHeight ?? 0),
            offenders: offenders.slice(0, 10),
            offenderCount: offenders.length,
          };
        });

        const { overflowPx } = info;
        const shot = await page.screenshot({
          fullPage: info.pageHeight <= MAX_SHOT_HEIGHT,
          clip: info.pageHeight > MAX_SHOT_HEIGHT ? { x: 0, y: 0, width: vp.width, height: MAX_SHOT_HEIGHT } : undefined,
          animations: 'disabled',
        });
        return {
          shot: await ctx.saveScreenshot(vp.label, shot),
          viewport: { label: vp.label, width: vp.width, height: vp.height, horizontalOverflow: overflowPx > 1, partial, ...info },
        };
      } catch (err) {
        return { shot: null, viewport: { label: vp.label, width: vp.width, height: vp.height, error: (err as Error).message.split('\n')[0] } };
      } finally {
        ctx.signal.removeEventListener('abort', close);
        close();
      }
    };

    const runs = await Promise.all(VIEWPORTS.map(runViewport)); // keeps desktop/tablet/mobile order
    const viewports = runs.map((r) => r.viewport);
    const screenshots = runs.flatMap((r) => (r.shot ? [r.shot] : []));

    const overflowing = viewports.filter((v) => v.horizontalOverflow);
    const errored = viewports.filter((v) => v.error);
    const status = overflowing.length > 0 ? 'fail' : errored.length > 0 ? 'warn' : 'pass';

    return outcome(
      status,
      {
        viewportsTested: viewports.length,
        overflowing: overflowing.map((v) => v.label),
        ...Object.fromEntries(viewports.map((v) => [`${v.label}OverflowPx`, v.overflowPx ?? null])),
      } satisfies ResponsiveSummary,
      { viewports } satisfies ResponsiveDetails,
      screenshots,
    );
  },
};
