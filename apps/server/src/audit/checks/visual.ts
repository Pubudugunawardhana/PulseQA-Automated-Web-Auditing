import fs from 'node:fs/promises';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import type { Rating, Screenshot, VisualDetails, VisualSummary, VisualViewport } from '@pulseqa/shared';
import { newAuditContext, type DeviceProfile } from '../browser.js';
import { outcome, type Check, type CheckContext } from '../types.js';

const VIEWPORTS: { label: VisualViewport['label']; width: number; height: number; profile: DeviceProfile; mobile: boolean }[] = [
  { label: 'desktop', width: 1440, height: 900, profile: 'desktop', mobile: false },
  { label: 'mobile', width: 375, height: 812, profile: 'mobile', mobile: true },
];
const MAX_HEIGHT = 3000;
const LOAD_TIMEOUT = 30_000;
/** % of changed pixels: below WARN = pass, above FAIL = fail. */
export const VISUAL_THRESHOLDS = { warn: 0.5, fail: 15 } as const;
/** Page height changing this much (%) is treated as a layout break. */
const HEIGHT_FAIL = 25;

/** Freeze everything that moves so two captures of the same page are pixel-identical. */
const FREEZE_CSS = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important;scroll-behavior:auto!important}`;

async function capture(ctx: CheckContext, vp: (typeof VIEWPORTS)[number]): Promise<Buffer> {
  const context = await newAuditContext(
    ctx.browser,
    { viewport: { width: vp.width, height: vp.height }, isMobile: vp.mobile, hasTouch: vp.mobile, deviceScaleFactor: 1, reducedMotion: 'reduce' },
    { profile: vp.profile, allowPrivateHosts: ctx.allowPrivateHosts },
  );
  const close = () => void context.close().catch(() => {});
  ctx.signal.addEventListener('abort', close, { once: true });
  try {
    const page = await context.newPage();
    await page.goto(ctx.page.url() || ctx.url, { waitUntil: 'load', timeout: LOAD_TIMEOUT }).catch((err: Error) => {
      if (!/Timeout/i.test(err.message)) throw err;
    });
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    await page.addStyleTag({ content: FREEZE_CSS }).catch(() => {});
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page.waitForTimeout(300);
    const height = Math.min(MAX_HEIGHT, Math.max(vp.height, await page.evaluate(() => document.documentElement.scrollHeight)));
    return await page.screenshot({ fullPage: true, clip: { x: 0, y: 0, width: vp.width, height }, animations: 'disabled', caret: 'hide' });
  } finally {
    ctx.signal.removeEventListener('abort', close);
    close();
  }
}

/** Top-left crop to w × h (PNGs of different heights are compared over their common area). */
function crop(img: PNG, w: number, h: number): Buffer {
  if (img.width === w && img.height === h) return img.data;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) img.data.copy(out, y * w * 4, y * img.width * 4, y * img.width * 4 + w * 4);
  return out;
}

export function diffImages(baselinePng: Buffer, currentPng: Buffer) {
  const a = PNG.sync.read(baselinePng);
  const b = PNG.sync.read(currentPng);
  const w = Math.min(a.width, b.width);
  const h = Math.min(a.height, b.height);
  const diff = new PNG({ width: w, height: h });
  const changed = pixelmatch(crop(a, w, h), crop(b, w, h), diff.data, w, h, { threshold: 0.1, includeAA: false, alpha: 0.25, diffColor: [255, 32, 32] });
  return {
    changedPixels: changed,
    diffPercent: Math.round((changed / (w * h)) * 10_000) / 100,
    baselineHeight: a.height,
    heightChangePercent: Math.round(((b.height - a.height) / a.height) * 1000) / 10,
    diffPng: PNG.sync.write(diff),
  };
}

export function rateDiff(diffPercent: number | null, heightChangePercent: number | null): Rating {
  if (diffPercent === null) return 'pass';
  if (diffPercent > VISUAL_THRESHOLDS.fail || Math.abs(heightChangePercent ?? 0) > HEIGHT_FAIL) return 'fail';
  return diffPercent >= VISUAL_THRESHOLDS.warn ? 'warn' : 'pass';
}

export const visualCheck: Check = {
  id: 'visual',
  timeoutMs: 90_000,
  requiresPage: true,
  async run(ctx) {
    const baseline = ctx.baseline;
    const screenshots: Screenshot[] = [];

    const viewports: VisualViewport[] = await Promise.all(
      VIEWPORTS.map(async (vp): Promise<VisualViewport> => {
        const base: VisualViewport = {
          label: vp.label,
          width: vp.width,
          height: vp.height,
          diffPercent: null,
          changedPixels: null,
          baselineHeight: null,
          heightChangePercent: null,
          current: '',
          baseline: null,
          diff: null,
          status: 'pass',
        };
        let shot: Buffer;
        try {
          shot = await capture(ctx, vp);
        } catch (err) {
          return { ...base, status: 'fail', error: `Could not capture: ${(err as Error).message.split('\n')[0]}` };
        }
        const current = await ctx.saveScreenshot(vp.label, shot);
        screenshots.push(current);
        const out: VisualViewport = { ...base, current: current.url };
        if (!baseline) return out;

        const file = `visual-${vp.label}.png`;
        const baselinePng = await fs.readFile(path.join(ctx.artifactsDir, baseline.auditId, file)).catch(() => null);
        if (!baselinePng) return { ...out, error: 'Baseline screenshot is missing — approve this run as the new baseline' };
        const d = diffImages(baselinePng, shot);
        const diff = await ctx.saveScreenshot(`diff-${vp.label}`, d.diffPng);
        screenshots.push(diff);
        return {
          ...out,
          baseline: ctx.artifactUrl(baseline.auditId, file),
          diff: diff.url,
          diffPercent: d.diffPercent,
          changedPixels: d.changedPixels,
          baselineHeight: d.baselineHeight,
          heightChangePercent: d.heightChangePercent,
          status: rateDiff(d.diffPercent, d.heightChangePercent),
        };
      }),
    );

    const order: Rating[] = ['fail', 'warn', 'pass'];
    const status = order.find((s) => viewports.some((v) => v.status === s)) ?? 'pass';
    const diffs = viewports.map((v) => v.diffPercent).filter((v): v is number => v !== null);
    if (viewports.every((v) => v.error && !v.current)) throw new Error(viewports[0].error ?? 'Could not capture screenshots');
    return outcome(
      status === 'fail' ? 'fail' : status === 'warn' ? 'warn' : 'pass',
      { baselineCreated: !baseline, maxDiffPercent: diffs.length ? Math.max(...diffs) : null } satisfies VisualSummary,
      { baseline, viewports, thresholds: VISUAL_THRESHOLDS } satisfies VisualDetails,
      // keep a stable order: desktop, mobile, then diffs
      screenshots.sort((a, b) => Number(a.label.startsWith('diff')) - Number(b.label.startsWith('diff')) || a.label.localeCompare(b.label)),
    );
  },
};
