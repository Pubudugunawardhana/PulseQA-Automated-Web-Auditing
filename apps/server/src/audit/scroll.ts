import type { Page } from 'playwright';
import type { PageScan } from '@pulseqa/shared';

export interface AutoScrollOptions {
  /** Stop after scrolling this far (guards against infinite feeds). */
  maxPx?: number;
  /** Stop after this long. */
  maxMs?: number;
  /** Pause between steps so lazy loaders / IntersectionObservers can react. */
  stepDelayMs?: number;
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Scrolls a page to the bottom in viewport-sized steps (like a reader would), so lazy-loaded images
 * and sections render, then returns to the top and lets the new content finish loading.
 * Never throws: on any failure it returns null and the audit carries on with the page as it is.
 */
export async function autoScroll(page: Page, opts: AutoScrollOptions = {}): Promise<PageScan | null> {
  const maxPx = opts.maxPx ?? 20_000;
  const maxMs = opts.maxMs ?? 10_000;
  const delay = opts.stepDelayMs ?? 150;
  const started = Date.now();
  try {
    const before = await page.evaluate(() => Array.from(document.images).filter((i) => i.complete && i.naturalWidth > 0).length);
    let steps = 0;
    let scrolledPx = 0;
    let stable = 0;
    let lastHeight = 0;
    let capped = false;

    for (;;) {
      if (opts.signal?.aborted) break;
      const s = await page.evaluate(() => {
        const el = document.scrollingElement ?? document.documentElement;
        const step = Math.max(200, Math.round(window.innerHeight * 0.8));
        window.scrollBy(0, step);
        return { y: window.scrollY + window.innerHeight, height: el.scrollHeight };
      });
      steps++;
      scrolledPx = Math.max(scrolledPx, s.y);
      await sleep(delay);
      const atBottom = s.y >= s.height - 2;
      // bottom reached and the page stopped growing for 2 steps → done
      stable = atBottom && s.height === lastHeight ? stable + 1 : 0;
      lastHeight = s.height;
      if (stable >= 2) break;
      if (scrolledPx >= maxPx || Date.now() - started >= maxMs) {
        capped = true;
        break;
      }
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => {});
    // give images that started loading a moment to finish (best-effort)
    await page
      .evaluate(
        (ms) =>
          Promise.race([
            Promise.all(Array.from(document.images).filter((i) => !i.complete).map((i) => i.decode().catch(() => {}))),
            new Promise((r) => setTimeout(r, ms)),
          ]),
        3_000,
      )
      .catch(() => {});

    const after = await page.evaluate(() => ({
      loaded: Array.from(document.images).filter((i) => i.complete && i.naturalWidth > 0).length,
      height: (document.scrollingElement ?? document.documentElement).scrollHeight,
    }));
    return {
      scrolledPx: Math.round(scrolledPx),
      pageHeight: after.height,
      steps,
      durationMs: Date.now() - started,
      capped,
      lazyImagesLoaded: Math.max(0, after.loaded - before),
    };
  } catch {
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    return null;
  }
}
