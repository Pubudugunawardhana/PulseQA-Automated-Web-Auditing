import type { CheckId, CheckResult, CheckShapes } from '@pulseqa/shared';
import { formatMs } from './format';

/** Short CLI-style flag names shown in the terminal UI. */
export const CHECK_FLAG: Record<CheckId, string> = {
  smoke: 'smoke',
  links: 'links',
  consoleNetwork: 'console',
  responsive: 'responsive',
  accessibility: 'a11y',
  performance: 'perf',
  security: 'security',
  seo: 'seo',
  visual: 'visual',
  crossBrowser: 'browsers',
  crawl: 'crawl',
};

/** Same order the server runs them in, so the log reads top-to-bottom. */
export const EXECUTION_ORDER: CheckId[] = ['smoke', 'security', 'seo', 'performance', 'consoleNetwork', 'links', 'accessibility', 'responsive', 'visual', 'crossBrowser', 'crawl'];

/** How the checks are grouped in the navigation menu and on the landing page. */
export const CHECK_CATEGORIES: { id: string; label: string; blurb: string; checks: CheckId[] }[] = [
  { id: 'reliability', label: 'Reliability', blurb: 'Is the site up and working?', checks: ['smoke', 'links', 'consoleNetwork', 'crawl'] },
  { id: 'experience', label: 'User experience', blurb: 'Does it work for everyone, on every screen?', checks: ['responsive', 'accessibility', 'crossBrowser', 'visual'] },
  { id: 'trust', label: 'Speed, SEO & security', blurb: 'Is it fast, findable and safe?', checks: ['performance', 'seo', 'security'] },
];

/** The server auto-scrolls the page (lazy content) right before the first of these runs. */
export const AFTER_SCROLL: CheckId[] = ['consoleNetwork', 'links', 'accessibility', 'responsive', 'visual', 'crossBrowser', 'crawl'];

/** Typed view of a result's summary/details for a given check. */
export function shape<K extends CheckId>(r: CheckResult, _id: K): CheckShapes[K] {
  return { summary: r.summary, details: r.details } as unknown as CheckShapes[K];
}

/** One-line headline per check. */
export function headline(r: CheckResult): string {
  if (r.status === 'skipped' || r.status === 'error') return r.error ?? '';
  switch (r.checkId) {
    case 'smoke': {
      const { summary: s } = shape(r, 'smoke');
      return s.reachable === false ? 'site unreachable' : `HTTP ${s.httpStatus} · ${s.title ? `"${s.title}"` : 'no <title>'}`;
    }
    case 'links': {
      const { summary: s } = shape(r, 'links');
      return `${s.brokenLinks} broken links · ${s.brokenImages} broken images · ${s.linksChecked + s.imagesChecked} checked`;
    }
    case 'consoleNetwork': {
      const { summary: s } = shape(r, 'consoleNetwork');
      const tp = s.thirdPartyIssues ? ` · ${s.thirdPartyIssues} third-party` : '';
      return `${s.uncaughtExceptions} exceptions · ${s.consoleErrors} console errors · ${s.apiFailures} api failures${tp}`;
    }
    case 'responsive': {
      const { summary: s } = shape(r, 'responsive');
      return s.overflowing?.length ? `overflow on ${s.overflowing.join(', ')}` : 'desktop ✓ tablet ✓ mobile ✓';
    }
    case 'accessibility': {
      const { summary: s } = shape(r, 'accessibility');
      const mobileOnly = shape(r, 'accessibility').details.mobileOnly?.length;
      const mobile = s.mobile ? ` · mobile ${s.mobile.violations}${mobileOnly ? ` (+${mobileOnly} mobile-only)` : ''}` : '';
      return `${s.violations} violations (${s.critical} critical, ${s.serious} serious)${mobile}`;
    }
    case 'performance': {
      const { summary: s } = shape(r, 'performance');
      const mobile = s.mobile ? ` · mobile lcp ${formatMs(s.mobile.lcp)}` : '';
      return `lcp ${formatMs(s.lcp)} · load ${formatMs(s.load)}${mobile}`;
    }
    case 'security': {
      const { summary: s } = shape(r, 'security');
      return `${s.https ? 'https' : 'NO HTTPS'} · ${s.headersPassed ?? 0}/${s.headersTotal ?? 0} headers`;
    }
    case 'seo': {
      const { summary: s } = shape(r, 'seo');
      return `${s.passed} passed · ${s.warnings} warnings · ${s.failed} failed${s.indexable ? '' : ' · NOT INDEXABLE'}`;
    }
    case 'visual': {
      const { summary: s, details: d } = shape(r, 'visual');
      if (s.baselineCreated) return 'first run — saved as the visual baseline';
      return d.viewports.map((v) => `${v.label} ${v.diffPercent === null ? '—' : `${v.diffPercent}%`}`).join(' · ') + ' changed';
    }
    case 'crawl': {
      const { summary: s } = shape(r, 'crawl');
      return `${s.pagesCrawled} pages · ${s.broken} broken · ${s.slow} slow · ${s.withJsErrors} with JS errors${s.partial ? ' · partial' : ''}`;
    }
    case 'crossBrowser': {
      const { summary: s } = shape(r, 'crossBrowser');
      return `loads in ${s.loadedIn}/${s.browsersTested} browsers · ${s.browserSpecificErrors} browser-only errors${s.inconsistentLayout ? ' · layout differs' : ''}`;
    }
  }
}
