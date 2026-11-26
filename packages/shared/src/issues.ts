// Turns raw check results into a flat, severity-ranked list of issues, each with a "how to fix" tip
// (used by the Overview dashboard, run-to-run comparison and the exported report).
import type { BrowserName, CheckShapes, PerfMetricKey, SeoRuleId } from './details';
import type { CheckId, CheckResult } from './index';
import { CRAWL_FIXES, CROSS_BROWSER_FIXES, FIXES, HEADER_FIXES, HEADER_HOWTO, perfFix, SEO_FIXES, smokeFix, VISUAL_FIXES, type Fix } from './remediation';

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

export const BROWSER_NAME: Record<BrowserName, string> = { chromium: 'Chrome', firefox: 'Firefox', webkit: 'Safari (WebKit)' };

const SEO_TITLES: Record<SeoRuleId, string> = {
  title: 'Title tag missing or the wrong length',
  description: 'Meta description missing or the wrong length',
  canonical: 'No canonical URL',
  robotsMeta: 'Page is hidden from search engines (noindex)',
  lang: 'Page language (html lang) not set',
  h1: 'Not exactly one h1 heading',
  headingOrder: 'Heading levels are skipped',
  imageAlt: 'Images without alt text',
  openGraph: 'Incomplete Open Graph (social sharing) tags',
  twitterCard: 'No Twitter / X card',
  structuredData: 'No or invalid structured data (JSON-LD)',
  robotsTxt: 'robots.txt missing',
  sitemap: 'XML sitemap missing or invalid',
};

function seoTitle(id: SeoRuleId, failed: boolean, value: string): string {
  if (id === 'robotsTxt' && failed) return 'robots.txt blocks the whole site';
  if (id === 'title' && value === 'missing') return 'Title tag missing';
  if (id === 'robotsMeta' && !failed) return 'Links on this page are not followed (nofollow)';
  return SEO_TITLES[id];
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
    case 'seo': {
      const d = as(r, 'seo').details;
      for (const rule of d.rules ?? []) {
        if (rule.status === 'pass' || rule.status === 'unknown') continue;
        const minor = ['twitterCard', 'structuredData', 'headingOrder'].includes(rule.id);
        const sev: IssueSeverity = rule.status === 'fail' ? 'error' : minor ? 'notice' : 'warning';
        add(sev, seoTitle(rule.id, rule.status === 'fail', rule.value), [`seo ${rule.id} ${rule.status}`], SEO_FIXES[rule.id], { example: rule.value });
      }
      break;
    }
    case 'visual': {
      const d = as(r, 'visual').details;
      for (const v of d.viewports ?? []) {
        if (v.error && v.diffPercent === null) {
          add('notice', `Visual baseline missing (${v.label})`, [`visual ${v.label} missing`], VISUAL_FIXES.missingBaseline, { example: v.error });
        } else if (v.status === 'fail' || v.status === 'warn') {
          const h = v.heightChangePercent ?? 0;
          add(v.status === 'fail' ? 'error' : 'warning', `Visual change on ${v.label} (${v.diffPercent}% of pixels)`, [`visual ${v.label} changed`], VISUAL_FIXES.changed, {
            example: `${(v.changedPixels ?? 0).toLocaleString()} pixels changed · page height ${h > 0 ? '+' : ''}${h}%`,
          });
        }
      }
      break;
    }
    case 'crawl': {
      const { summary: s, details: d } = as(r, 'crawl');
      const pages = d.pages ?? [];
      const urls = (xs: typeof pages) => xs.map((p) => p.url);
      const broken = pages.filter((p) => !p.loaded);
      add('error', `Broken pages on the site (${broken.length})`, urls(broken).map((u) => `crawl broken ${u}`), CRAWL_FIXES.broken, {
        example: broken[0] && `${broken[0].url} → ${broken[0].status ?? broken[0].error ?? 'failed'}`,
      });
      const slow = pages.filter((p) => p.loaded && (p.loadMs ?? 0) > (d.limits?.slowMs ?? 3000));
      add('warning', `Slow pages (over ${(d.limits?.slowMs ?? 3000) / 1000} s)`, urls(slow).map((u) => `crawl slow ${u}`), CRAWL_FIXES.slow, {
        example: slow[0] && `${slow[0].url} → ${((slow[0].loadMs ?? 0) / 1000).toFixed(1)} s`,
      });
      const js = pages.filter((p) => p.jsErrors > 0);
      add('warning', 'Pages with JavaScript errors', urls(js).map((u) => `crawl js ${u}`), CRAWL_FIXES.jsErrors, { example: js[0] && `${js[0].url} → ${js[0].firstJsError ?? ''}` });
      const imgs = pages.filter((p) => p.brokenImages > 0);
      add('warning', 'Pages with broken images', urls(imgs).map((u) => `crawl img ${u}`), CRAWL_FIXES.brokenImages, { example: imgs[0]?.url });
      const a11y = pages.filter((p) => (p.a11yIssues ?? 0) > 0);
      add('warning', 'Pages with serious accessibility violations', urls(a11y).map((u) => `crawl a11y ${u}`), CRAWL_FIXES.a11y, {
        example: a11y[0] && `${a11y[0].url} → ${a11y[0].a11yIssues} critical/serious`,
      });
      for (const t of d.duplicateTitles ?? [])
        add('warning', `Duplicate title on ${t.urls.length} pages`, [`crawl duptitle ${t.title}`], CRAWL_FIXES.duplicateTitles, { count: t.urls.length, example: `“${t.title}”` });
      const noTitle = pages.filter((p) => p.loaded && !p.title);
      add('warning', 'Pages without a title', urls(noTitle).map((u) => `crawl notitle ${u}`), CRAWL_FIXES.missingTitles, { example: noTitle[0]?.url });
      const noDesc = pages.filter((p) => p.loaded && !p.description);
      add('notice', 'Pages without a meta description', urls(noDesc).map((u) => `crawl nodesc ${u}`), CRAWL_FIXES.missingDescriptions, { example: noDesc[0]?.url });
      if (s.notCrawled > 0) add('notice', `${s.notCrawled} more internal pages not crawled`, ['crawl capped'], CRAWL_FIXES.notCrawled, { count: s.notCrawled });
      break;
    }
    case 'crossBrowser': {
      const d = as(r, 'crossBrowser').details;
      for (const run of d.runs ?? []) {
        if (run.browser === 'chromium' || run.loaded) continue;
        if (/not installed/.test(run.error ?? ''))
          add('notice', `${BROWSER_NAME[run.browser]} not installed on the server`, [`xb ${run.browser} missing`], CROSS_BROWSER_FIXES.notInstalled, { example: run.error });
        else
          add('error', `Page fails to load in ${BROWSER_NAME[run.browser]}`, [`xb ${run.browser} load`], CROSS_BROWSER_FIXES.failsToLoad, {
            example: run.error ?? `HTTP ${run.httpStatus}`,
          });
      }
      for (const e of d.browserOnlyErrors ?? []) {
        add(
          'warning',
          `JavaScript error only in ${e.browsers.map((b) => BROWSER_NAME[b]).join(', ')}`,
          [`xb error ${e.browsers.join('+')}: ${e.message.slice(0, 120)}`],
          CROSS_BROWSER_FIXES.browserOnlyError,
          { example: e.message },
        );
      }
      const loaded = (d.runs ?? []).filter((x) => x.loaded);
      const over = loaded.filter((x) => x.horizontalOverflow);
      if (over.length && over.length < loaded.length) {
        add(
          'warning',
          `Horizontal scrolling only in ${over.map((x) => BROWSER_NAME[x.browser]).join(', ')}`,
          [`xb layout ${over.map((x) => x.browser).join('+')}`],
          CROSS_BROWSER_FIXES.layout,
          { example: over.map((x) => `${BROWSER_NAME[x.browser]}: ${x.overflowPx}px wider than the screen`).join(' · ') },
        );
      }
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
