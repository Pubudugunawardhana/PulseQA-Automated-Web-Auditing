// Turns raw check results into a flat, severity-ranked list of issues
// (used by the Overview dashboard, run-to-run comparison and the exported report).
import type { CheckShapes, PerfMetricKey } from './details';
import type { CheckId, CheckResult } from './index';

export type IssueSeverity = 'error' | 'warning' | 'notice';

export interface Issue {
  checkId: CheckId;
  severity: IssueSeverity;
  /** Human-readable group title, e.g. "Broken image". */
  title: string;
  /** Affected instances (elements, URLs, headers…). */
  count: number;
  /** Stable identifiers of each instance, so two runs can be diffed. */
  keys: string[];
}

export const SEVERITY_ORDER: IssueSeverity[] = ['error', 'warning', 'notice'];

const METRIC: Record<PerfMetricKey, string> = { ttfb: 'TTFB', fcp: 'FCP', lcp: 'LCP', cls: 'CLS', load: 'Load time' };

const as = <K extends CheckId>(r: CheckResult, _id: K) => ({ summary: r.summary, details: r.details }) as unknown as CheckShapes[K];
const firstParty = <T extends { party?: string }>(xs: T[] = []) => xs.filter((x) => x.party !== 'third');
const thirdParty = <T extends { party?: string }>(xs: T[] = []) => xs.filter((x) => x.party === 'third');

function issuesOf(r: CheckResult): Issue[] {
  if (r.status === 'skipped' || r.status === 'error') return [];
  const out: Issue[] = [];
  const add = (severity: IssueSeverity, title: string, keys: string[], count = keys.length) => {
    if (keys.length) out.push({ checkId: r.checkId, severity, title, count, keys });
  };

  switch (r.checkId) {
    case 'smoke': {
      const d = as(r, 'smoke').details;
      for (const i of d.issues ?? []) add('error', i, [i]);
      for (const n of d.notes ?? []) add('notice', n, [`note: ${n}`]);
      break;
    }
    case 'links': {
      const d = as(r, 'links').details;
      const links = d.brokenLinks ?? [];
      add('error', 'Broken internal link', links.filter((p) => p.internal).map((p) => `broken link: ${p.url}`));
      add('warning', 'Broken external link', links.filter((p) => !p.internal).map((p) => `broken link: ${p.url}`));
      add('error', 'Broken image', (d.brokenImages ?? []).map((p) => `broken image: ${p.url}`));
      add('notice', 'Link blocked by bot protection (not verified)', (d.restricted ?? []).map((p) => `restricted: ${p.url}`));
      break;
    }
    case 'consoleNetwork': {
      const d = as(r, 'consoleNetwork').details;
      add('error', 'Uncaught JavaScript exception', firstParty(d.pageErrors).map((e) => `exception: ${e.message}`));
      add('error', 'Failed API request', firstParty(d.apiFailures).map((n) => `api ${n.status ?? n.failure}: ${n.url.split('?')[0]}`));
      add('warning', 'Console error', firstParty(d.consoleErrors).map((c) => `console: ${c.text.slice(0, 120)}`));
      add('warning', 'Failed resource request', firstParty(d.otherFailures).map((n) => `request ${n.status ?? n.failure}: ${n.url.split('?')[0]}`));
      const third = [...thirdParty(d.pageErrors), ...thirdParty(d.consoleErrors), ...thirdParty(d.apiFailures), ...thirdParty(d.otherFailures)];
      add('notice', 'Third-party script / request problem', third.map((x) => `third-party: ${'message' in x ? x.message : 'text' in x ? x.text.slice(0, 120) : x.url.split('?')[0]}`));
      break;
    }
    case 'responsive': {
      const s = as(r, 'responsive').summary;
      add('error', 'Horizontal scrolling on small screens', (s.overflowing ?? []).map((v) => `overflow on ${v}`));
      break;
    }
    case 'accessibility': {
      const d = as(r, 'accessibility').details;
      for (const v of d.violations ?? []) {
        const sev: IssueSeverity = v.impact === 'critical' || v.impact === 'serious' ? 'error' : v.impact === 'moderate' ? 'warning' : 'notice';
        add(sev, v.help, [`${v.id} (${v.impact})`], Math.max(1, v.nodeCount));
      }
      break;
    }
    case 'performance': {
      const d = as(r, 'performance').details;
      for (const [k, v] of Object.entries(d.ratings ?? {}) as [PerfMetricKey, string][]) {
        if (v === 'fail') add('error', `Poor ${METRIC[k]} (desktop)`, [`${k} fail`]);
        else if (v === 'warn') add('warning', `${METRIC[k]} needs improvement (desktop)`, [`${k} warn`]);
      }
      for (const [k, v] of Object.entries(d.mobileRatings ?? {}) as [PerfMetricKey, string][]) {
        if (v === 'fail') add('warning', `Poor ${METRIC[k]} on throttled mobile`, [`mobile ${k} fail`]);
      }
      break;
    }
    case 'security': {
      const { summary: s, details: d } = as(r, 'security');
      if (s.https === false) add('error', 'Site is not served over HTTPS', ['no https']);
      add('error', 'Mixed content (HTTP resources on an HTTPS page)', (d.mixedContent ?? []).map((u) => `mixed: ${u}`));
      for (const h of (d.headers ?? []).filter((x) => !x.ok)) add('warning', `Missing or weak ${h.header}`, [`missing ${h.header}`]);
      add('notice', 'Cookie without Secure / HttpOnly flags', (d.insecureCookies ?? []).map((c) => `cookie: ${c.name}`));
      break;
    }
  }
  return out;
}

/** All issues of an audit, most severe first, then by affected count. */
export function classifyIssues(results: CheckResult[]): Issue[] {
  return results
    .flatMap(issuesOf)
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || b.count - a.count);
}

/** Stable keys of one check's problems (for run-to-run diffs). */
export function issueKeys(r: CheckResult): string[] {
  return issuesOf(r).flatMap((i) => i.keys);
}

/** Affected-instance totals per severity. */
export function countBySeverity(issues: Issue[]): Record<IssueSeverity, number> {
  const c: Record<IssueSeverity, number> = { error: 0, warning: 0, notice: 0 };
  for (const i of issues) c[i.severity] += i.count;
  return c;
}
