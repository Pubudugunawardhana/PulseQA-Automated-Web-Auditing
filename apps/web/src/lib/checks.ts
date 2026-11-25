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
};

/** Same order the server runs them in, so the log reads top-to-bottom. */
export const EXECUTION_ORDER: CheckId[] = ['smoke', 'consoleNetwork', 'security', 'performance', 'links', 'accessibility', 'responsive'];

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
      return `${s.violations} violations (${s.critical} critical, ${s.serious} serious)`;
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
  }
}
