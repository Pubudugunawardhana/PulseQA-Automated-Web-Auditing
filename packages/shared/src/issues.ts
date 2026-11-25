// Turns raw check results into a flat, severity-ranked list of issues, each with a "how to fix" tip
// (used by the Overview dashboard, run-to-run comparison and the exported report).
import type { CheckShapes, PerfMetricKey } from './details';
import type { CheckId, CheckResult } from './index';
import { FIXES, HEADER_FIXES, HEADER_HOWTO, perfFix, smokeFix, type Fix } from './remediation';

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
  /** How to fix it. */
  fix: Fix;
  /** First affected element / URL, to show where the problem is. */
  example?: string;
}

export const SEVERITY_ORDER: IssueSeverity[] = ['error', 'warning', 'notice'];

const METRIC: Record<PerfMetricKey, string> = { ttfb: 'TTFB', fcp: 'FCP', lcp: 'LCP', cls: 'CLS', load: 'Load time' };

const as = <K extends CheckId>(r: CheckResult, _id: K) => ({ summary: r.summary, details: r.details }) as unknown as CheckShapes[K];
const firstParty = <T extends { party?: string }>(xs: T[] = []) => xs.filter((x) => x.party !== 'third');
const thirdParty = <T extends { party?: string }>(xs: T[] = []) => xs.filter((x) => x.party === 'third');
const bare = (u: string) => u.split('?')[0];

function issuesOf(r: CheckResult): Issue[] {
  if (r.status === 'skipped' || r.status === 'error') return [];
  const out: Issue[] = [];
  const add = (severity: IssueSeverity, title: string, keys: string[], fix: Fix, opts: { count?: number; example?: string } = {}) => {
    if (keys.length) out.push({ checkId: r.checkId, severity, title, count: opts.count ?? keys.length, keys, fix, example: opts.example });
  };

  switch (r.checkId) {
    case 'smoke': {
      const d = as(r, 'smoke').details;
      for (const i of d.issues ?? []) add('error', i, [i], smokeFix(i));
      for (const n of d.notes ?? []) add('notice', n, [`note: ${n}`], smokeFix(n));
      break;
    }
    case 'links': {
      const d = as(r, 'links').details;
      const links = d.brokenLinks ?? [];
      const internal = links.filter((p) => p.internal);
      const external = links.filter((p) => !p.internal);
      const images = d.brokenImages ?? [];
      const restricted = d.restricted ?? [];
      add('error', 'Broken internal link', internal.map((p) => `broken link: ${p.url}`), FIXES.brokenInternalLink, { example: internal[0]?.url });
      add('warning', 'Broken external link', external.map((p) => `broken link: ${p.url}`), FIXES.brokenExternalLink, { example: external[0]?.url });
      add('error', 'Broken image', images.map((p) => `broken image: ${p.url}`), FIXES.brokenImage, { example: images[0]?.url });
      add('notice', 'Link blocked by bot protection (not verified)', restricted.map((p) => `restricted: ${p.url}`), FIXES.restrictedLink, {
        example: restricted[0]?.url,
      });
      break;
    }
    case 'consoleNetwork': {
      const d = as(r, 'consoleNetwork').details;
      const exc = firstParty(d.pageErrors);
      const api = firstParty(d.apiFailures);
      const cons = firstParty(d.consoleErrors);
      const res = firstParty(d.otherFailures);
      add('error', 'Uncaught JavaScript exception', exc.map((e) => `exception: ${e.message}`), FIXES.exception, { example: exc[0]?.message });
      add('error', 'Failed API request', api.map((n) => `api ${n.status ?? n.failure}: ${bare(n.url)}`), FIXES.apiFailure, {
        example: api[0] && `${api[0].method} ${bare(api[0].url)} → ${api[0].status ?? api[0].failure}`,
      });
      add('warning', 'Console error', cons.map((c) => `console: ${c.text.slice(0, 120)}`), FIXES.consoleError, { example: cons[0]?.text.slice(0, 200) });
      add('warning', 'Failed resource request', res.map((n) => `request ${n.status ?? n.failure}: ${bare(n.url)}`), FIXES.failedResource, {
        example: res[0] && `${bare(res[0].url)} → ${res[0].status ?? res[0].failure}`,
      });
      const third = [...thirdParty(d.pageErrors), ...thirdParty(d.consoleErrors), ...thirdParty(d.apiFailures), ...thirdParty(d.otherFailures)];
      add(
        'notice',
        'Third-party script / request problem',
        third.map((x) => `third-party: ${'message' in x ? x.message : 'text' in x ? x.text.slice(0, 120) : bare(x.url)}`),
        FIXES.thirdParty,
      );
      break;
    }
    case 'responsive': {
      const { summary: s, details: d } = as(r, 'responsive');
      const vp = (d.viewports ?? []).find((v) => v.horizontalOverflow && v.offenders?.length);
      const off = vp?.offenders?.[0];
      add('error', 'Horizontal scrolling on small screens', (s.overflowing ?? []).map((v) => `overflow on ${v}`), FIXES.overflow, {
        example: vp && off ? `${vp.label}: ${off.selector} (${Math.round(off.width)}px wide)` : undefined,
      });
      break;
    }
    case 'accessibility': {
      const d = as(r, 'accessibility').details;
      const tagged = [
        ...(d.violations ?? []).map((v) => ({ v, mobile: false })),
        ...(d.mobileOnly ?? []).map((v) => ({ v, mobile: true })),
      ];
      for (const { v, mobile } of tagged) {
        const sev: IssueSeverity = v.impact === 'critical' || v.impact === 'serious' ? 'error' : v.impact === 'moderate' ? 'warning' : 'notice';
        // axe's own per-element advice, minus its "Fix any of the following:" preamble
        const steps = (v.nodes[0]?.failureSummary ?? '')
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l && !/^fix (any|all) of the following/i.test(l));
        add(
          sev,
          mobile ? `${v.help} (mobile only)` : v.help,
          [`${mobile ? 'mobile ' : ''}${v.id} (${v.impact})`],
          { tip: steps.length ? `${v.description} To fix: ${steps.join('; ')}.` : v.description, docs: v.helpUrl },
          { count: Math.max(1, v.nodeCount), example: v.nodes[0]?.html.slice(0, 200) },
        );
      }
      break;
    }
    case 'performance': {
      const d = as(r, 'performance').details;
      for (const [k, v] of Object.entries(d.ratings ?? {}) as [PerfMetricKey, string][]) {
        if (v === 'fail') add('error', `Poor ${METRIC[k]} (desktop)`, [`${k} fail`], perfFix(k));
        else if (v === 'warn') add('warning', `${METRIC[k]} needs improvement (desktop)`, [`${k} warn`], perfFix(k));
      }
      for (const [k, v] of Object.entries(d.mobileRatings ?? {}) as [PerfMetricKey, string][]) {
        if (v === 'fail') add('warning', `Poor ${METRIC[k]} on throttled mobile`, [`mobile ${k} fail`], perfFix(k, true));
      }
      break;
    }
    case 'security': {
      const { summary: s, details: d } = as(r, 'security');
      if (s.https === false) add('error', 'Site is not served over HTTPS', ['no https'], FIXES.noHttps);
      if (s.https !== false && d.httpRedirectsToHttps === false)
        add('warning', 'http:// does not redirect to https://', ['no https redirect'], FIXES.noHttpsRedirect);
      const mixed = d.mixedContent ?? [];
      add('error', 'Mixed content (HTTP resources on an HTTPS page)', mixed.map((u) => `mixed: ${u}`), FIXES.mixedContent, { example: mixed[0] });
      for (const h of (d.headers ?? []).filter((x) => !x.ok)) {
        const known = HEADER_FIXES[h.header.toLowerCase()];
        const fix: Fix = known ? { ...known, tip: `${known.tip} ${HEADER_HOWTO}` } : { tip: `${h.recommendation} ${HEADER_HOWTO}` };
        add('warning', `Missing or weak ${h.header}`, [`missing ${h.header}`], fix, {
          example: h.present && h.value ? `current value: ${h.value}` : undefined,
        });
      }
      const leaks = (d.issues ?? []).filter((i) => /discloses/i.test(i));
      add('notice', 'Server software version is exposed', leaks.map((i) => `leak: ${i}`), FIXES.serverDisclosure, { example: leaks[0] });
      const cookies = d.insecureCookies ?? [];
      add('notice', 'Cookie without Secure / HttpOnly flags', cookies.map((c) => `cookie: ${c.name}`), FIXES.insecureCookie, {
        example: cookies[0]?.name,
      });
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
