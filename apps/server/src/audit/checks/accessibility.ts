import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from 'playwright';
import type { A11yViolation, AccessibilityDetails, AccessibilitySummary, Impact, ImpactCounts, Screenshot } from '@pulseqa/shared';
import { newAuditContext } from '../browser.js';
import { outcome, type Check } from '../types.js';

const MAX_SHOT_HEIGHT = 6000;
const IMPACT_COLOR: Record<Impact, string> = { critical: '#ff2d55', serious: '#ff6b3d', moderate: '#f5b400', minor: '#4aa8ff' };

/** Outlines each violating element on the page, screenshots it, then removes the overlay. */
async function highlightViolations(page: Page, violations: A11yViolation[]): Promise<{ shot: Buffer | null; count: number }> {
  const marks = violations.flatMap((v) => v.nodes.map((n) => ({ selector: n.target, color: IMPACT_COLOR[v.impact] })));
  const count = await page.evaluate((items) => {
    let found = 0;
    for (const { selector, color } of items) {
      let el: Element | null = null;
      try {
        el = document.querySelector(selector);
      } catch {
        continue; // iframe/shadow-DOM targets aren't plain CSS selectors
      }
      if (!(el instanceof HTMLElement || el instanceof SVGElement)) continue;
      if (!el.hasAttribute('data-pulseqa-a11y')) {
        // remember the page's own inline values so they can be restored exactly
        el.setAttribute('data-pulseqa-a11y', JSON.stringify([el.style.getPropertyValue('outline'), el.style.getPropertyValue('outline-offset')]));
      }
      el.style.setProperty('outline', `3px solid ${color}`, 'important');
      el.style.setProperty('outline-offset', '2px', 'important');
      found++;
    }
    return found;
  }, marks);
  if (count === 0) return { shot: null, count };

  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const width = page.viewportSize()?.width ?? 1920;
  const shot = await page
    .screenshot({
      fullPage: height <= MAX_SHOT_HEIGHT,
      clip: height > MAX_SHOT_HEIGHT ? { x: 0, y: 0, width, height: MAX_SHOT_HEIGHT } : undefined,
      animations: 'disabled',
    })
    .catch(() => null);

  // Restore the page so later checks see it untouched
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll('[data-pulseqa-a11y]')) as (HTMLElement | SVGElement)[]) {
      let prev: [string, string] = ['', ''];
      try {
        prev = JSON.parse(el.getAttribute('data-pulseqa-a11y') || '["",""]');
      } catch {
        /* keep defaults */
      }
      if (prev[0]) el.style.setProperty('outline', prev[0]);
      else el.style.removeProperty('outline');
      if (prev[1]) el.style.setProperty('outline-offset', prev[1]);
      else el.style.removeProperty('outline-offset');
      el.removeAttribute('data-pulseqa-a11y');
    }
  });
  return { shot, count };
}

const MOBILE_VIEWPORT = { width: 375, height: 812 };
const MOBILE_LOAD_TIMEOUT = 30_000;
const IMPACT_ORDER: Impact[] = ['critical', 'serious', 'moderate', 'minor'];

interface Scan {
  violations: A11yViolation[];
  counts: ImpactCounts;
  passes: number;
  incomplete: AccessibilityDetails['incomplete'];
  axeVersion: string;
}

function countImpacts(violations: A11yViolation[]): ImpactCounts {
  const c: ImpactCounts = { critical: 0, serious: 0, moderate: 0, minor: 0, violations: violations.length };
  for (const v of violations) c[v.impact] += 1;
  return c;
}

async function scan(page: Page): Promise<Scan> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const violations: A11yViolation[] = results.violations.map((v) => ({
    id: v.id,
    impact: (v.impact ?? 'minor') as Impact,
    help: v.help,
    description: v.description,
    helpUrl: v.helpUrl,
    tags: v.tags.filter((t) => t.startsWith('wcag')),
    nodeCount: v.nodes.length,
    nodes: v.nodes.slice(0, 10).map((n) => ({
      target: n.target.map(String).join(' '),
      html: n.html.slice(0, 300),
      failureSummary: n.failureSummary ?? '',
    })),
  }));
  violations.sort((a, b) => IMPACT_ORDER.indexOf(a.impact) - IMPACT_ORDER.indexOf(b.impact));
  return {
    violations,
    counts: countImpacts(violations),
    passes: results.passes.length,
    incomplete: results.incomplete.slice(0, 20).map((v) => ({ id: v.id, help: v.help, helpUrl: v.helpUrl, nodeCount: v.nodes.length })),
    axeVersion: results.testEngine.version,
  };
}

/** Rules that only fail on mobile, or fail on more elements there (only the extra elements are kept). */
function mobileOnlyViolations(desktop: A11yViolation[], mobile: A11yViolation[]): A11yViolation[] {
  const byId = new Map(desktop.map((v) => [v.id, v]));
  const out: A11yViolation[] = [];
  for (const v of mobile) {
    const d = byId.get(v.id);
    if (!d) out.push(v);
    else if (v.nodeCount > d.nodeCount) {
      const seen = new Set(d.nodes.map((n) => n.target));
      out.push({ ...v, nodeCount: v.nodeCount - d.nodeCount, nodes: v.nodes.filter((n) => !seen.has(n.target)) });
    }
  }
  return out;
}

export const accessibilityCheck: Check = {
  id: 'accessibility',
  timeoutMs: 90_000,
  requiresPage: true,
  async run(ctx) {
    // Mobile: a fresh 375px touch context in the SAME shared browser, loaded while desktop is scanned.
    const context = await newAuditContext(
      ctx.browser,
      { viewport: MOBILE_VIEWPORT, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
      { profile: 'mobile', allowPrivateHosts: ctx.allowPrivateHosts },
    );
    const close = () => void context.close().catch(() => {});
    ctx.signal.addEventListener('abort', close, { once: true });

    try {
      const mobileRun = (async () => {
        const page = await context.newPage();
        await page.goto(ctx.page.url() || ctx.url, { waitUntil: 'domcontentloaded', timeout: MOBILE_LOAD_TIMEOUT });
        await page.waitForLoadState('load', { timeout: 10_000 }).catch(() => {});
        return { page, result: await scan(page) };
      })().then(
        (ok) => ({ ok, error: null as string | null }),
        (err: Error) => ({ ok: null, error: err.message.split('\n')[0] }),
      );

      const desktop = await scan(ctx.page);
      const mobile = await mobileRun;
      const mobileOnly = mobile.ok ? mobileOnlyViolations(desktop.violations, mobile.ok.result.violations) : [];

      const screenshots: Screenshot[] = [];
      let highlighted = 0;
      if (desktop.violations.length) {
        const { shot, count } = await highlightViolations(ctx.page, desktop.violations);
        highlighted = count;
        if (shot) screenshots.push(await ctx.saveScreenshot('violations-highlighted', shot));
      }
      if (mobile.ok && mobileOnly.length) {
        const { shot } = await highlightViolations(mobile.ok.page, mobileOnly);
        if (shot) screenshots.push(await ctx.saveScreenshot('mobile-violations-highlighted', shot));
      }

      // Status covers both viewports: desktop violations + the extra ones only mobile users hit.
      const all = countImpacts([...desktop.violations, ...mobileOnly]);
      let status: 'pass' | 'warn' | 'fail' = 'pass';
      if (all.critical + all.serious > 0) status = 'fail';
      else if (all.moderate + all.minor > 0) status = 'warn';

      return outcome(
        status,
        {
          ...desktop.counts,
          passes: desktop.passes,
          incomplete: desktop.incomplete.length,
          mobile: mobile.ok ? mobile.ok.result.counts : null,
        } satisfies AccessibilitySummary,
        {
          violations: desktop.violations,
          incomplete: desktop.incomplete,
          axeVersion: desktop.axeVersion,
          highlighted,
          mobileOnly,
          mobileError: mobile.error,
          mobileViewport: `${MOBILE_VIEWPORT.width}×${MOBILE_VIEWPORT.height} · touch · mobile UA`,
        } satisfies AccessibilityDetails,
        screenshots,
      );
    } finally {
      ctx.signal.removeEventListener('abort', close);
      close();
    }
  },
};
