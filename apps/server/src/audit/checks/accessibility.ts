import { AxeBuilder } from '@axe-core/playwright';
import type { Page } from 'playwright';
import type { A11yViolation, AccessibilityDetails, AccessibilitySummary, Impact, Screenshot } from '@pulseqa/shared';
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

export const accessibilityCheck: Check = {
  id: 'accessibility',
  timeoutMs: 60_000,
  requiresPage: true,
  async run(ctx) {
    const results = await new AxeBuilder({ page: ctx.page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const counts: Record<Impact, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    const violations: A11yViolation[] = results.violations.map((v) => {
      const impact = (v.impact ?? 'minor') as Impact;
      counts[impact] += 1;
      return {
        id: v.id,
        impact,
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
      };
    });
    const order: Impact[] = ['critical', 'serious', 'moderate', 'minor'];
    violations.sort((a, b) => order.indexOf(a.impact) - order.indexOf(b.impact));

    const screenshots: Screenshot[] = [];
    let highlighted = 0;
    if (violations.length) {
      const { shot, count } = await highlightViolations(ctx.page, violations);
      highlighted = count;
      if (shot) screenshots.push(await ctx.saveScreenshot('violations-highlighted', shot));
    }

    let status: 'pass' | 'warn' | 'fail' = 'pass';
    if (counts.critical + counts.serious > 0) status = 'fail';
    else if (counts.moderate + counts.minor > 0) status = 'warn';

    return outcome(
      status,
      { violations: violations.length, ...counts, passes: results.passes.length, incomplete: results.incomplete.length } satisfies AccessibilitySummary,
      {
        violations,
        incomplete: results.incomplete.slice(0, 20).map((v) => ({ id: v.id, help: v.help, helpUrl: v.helpUrl, nodeCount: v.nodes.length })),
        axeVersion: results.testEngine.version,
        highlighted,
      } satisfies AccessibilityDetails,
      screenshots,
    );
  },
};
