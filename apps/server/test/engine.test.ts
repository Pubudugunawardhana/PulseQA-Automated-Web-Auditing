import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CHECK_IDS,
  classifyIssues,
  countBySeverity,
  type AccessibilityDetails,
  type AccessibilitySummary,
  type CrossBrowserDetails,
  type SeoDetails,
  type VisualDetails,
  type VisualSummary,
  type CheckResult,
  type ConsoleNetworkSummary,
  type PerformanceSummary,
  type SmokeDetails,
} from '@pulseqa/shared';
import { closeBrowser } from '../src/audit/browser.js';
import { VISUAL_THRESHOLDS } from '../src/audit/checks/visual.js';
import { runAuditEngine } from '../src/audit/engine.js';
import { startFixtureServer } from './fixtureServer.js';

let server: Awaited<ReturnType<typeof startFixtureServer>>;
let artifactsDir: string;

beforeAll(async () => {
  server = await startFixtureServer();
  artifactsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulseqa-test-'));
});

afterAll(async () => {
  await closeBrowser();
  await server.close();
  await fs.rm(artifactsDir, { recursive: true, force: true });
});

const byId = (results: CheckResult[]) => Object.fromEntries(results.map((r) => [r.checkId, r])) as Record<string, CheckResult>;

describe('audit engine (integration)', () => {
  it('flags every problem on the bad fixture', async () => {
    const { results, aborted } = await runAuditEngine({
      auditId: 'bad',
      url: `${server.baseUrl}/bad.html`,
      checks: [...CHECK_IDS],
      artifactsDir,
    });
    const r = byId(results);
    expect(aborted).toBeNull();
    expect(results).toHaveLength(CHECK_IDS.length);
    for (const res of results) {
      expect(res.status, `${res.checkId}: ${res.error}`).not.toBe('error');
      expect(res.startedAt).toBeTruthy();
    }

    expect(r.smoke.summary.httpStatus).toBe(200);
    expect(r.smoke.status).toBe('warn'); // no viewport meta
    const smoke = r.smoke.details as unknown as SmokeDetails;
    expect(smoke.notes?.join(' ')).toMatch(/favicon/);

    expect(r.links.status).toBe('fail');
    expect(r.links.summary.brokenLinks).toBe(1);
    expect(r.links.summary.brokenImages).toBe(1);

    const cn = r.consoleNetwork.summary as unknown as ConsoleNetworkSummary;
    expect(r.consoleNetwork.status).toBe('fail');
    expect(cn.uncaughtExceptions).toBeGreaterThanOrEqual(1);
    expect(cn.apiFailures).toBeGreaterThanOrEqual(1);
    expect(cn.consoleErrors).toBeGreaterThanOrEqual(1);
    expect(cn.thirdPartyIssues).toBe(0);

    expect(r.responsive.status).toBe('fail');
    expect(r.responsive.summary.overflowing).toContain('mobile');
    expect(r.responsive.screenshots.map((s) => s.label)).toEqual(['desktop', 'tablet', 'mobile']);
    await fs.access(path.join(artifactsDir, 'bad', 'responsive-mobile.png'));

    expect(r.accessibility.status).toBe('fail');
    const a11y = r.accessibility.details as unknown as AccessibilityDetails;
    expect(a11y.violations.map((v) => v.id)).toEqual(expect.arrayContaining(['image-alt', 'color-contrast', 'button-name']));
    expect(a11y.highlighted).toBeGreaterThan(0);
    // Mobile viewport: the touch-only icon link without a name is caught as a mobile-only problem
    const a11ySummary = r.accessibility.summary as unknown as AccessibilitySummary;
    expect(a11ySummary.mobile?.violations).toBeGreaterThanOrEqual(a11ySummary.violations);
    expect(a11y.mobileOnly?.map((v) => v.id)).toContain('link-name');
    expect(a11y.violations.map((v) => v.id)).not.toContain('link-name');
    await fs.access(path.join(artifactsDir, 'bad', 'accessibility-mobile-violations-highlighted.png'));
    await fs.access(path.join(artifactsDir, 'bad', 'accessibility-violations-highlighted.png'));

    const perf = r.performance.summary as unknown as PerformanceSummary;
    expect(['pass', 'warn', 'fail']).toContain(r.performance.status);
    expect(perf.fcp).not.toBeNull();
    expect(perf.mobile?.fcp).not.toBeNull(); // throttled mobile run happened

    expect(r.security.status).toBe('fail'); // not https
    expect(r.security.summary.https).toBe(false);

    // SEO: noindex + no description/lang/canonical
    const seo = r.seo.details as unknown as SeoDetails;
    const rule = (id: string) => seo.rules.find((x) => x.id === id)?.status;
    expect(r.seo.status).toBe('fail');
    expect(rule('robotsMeta')).toBe('fail');
    expect(rule('description')).toBe('warn');
    expect(rule('lang')).toBe('warn');
    expect(rule('robotsTxt')).toBe('pass');
    expect(rule('sitemap')).toBe('pass');
    expect(seo.sitemap?.urls).toBe(1);

    // Overview: the same results become a severity-ranked issue list
    const issues = classifyIssues(results);
    const titles = issues.filter((i) => i.severity === 'error').map((i) => i.title);
    expect(titles).toEqual(expect.arrayContaining(['Broken image', 'Uncaught JavaScript exception', 'Failed API request', 'Site is not served over HTTPS']));
    expect(issues[0].severity).toBe('error');
    expect(countBySeverity(issues).error).toBeGreaterThanOrEqual(6);

    // Remediation: every issue says how to fix it; specific ones come with a copy-paste example / docs
    for (const i of issues) expect(i.fix.tip.length, i.title).toBeGreaterThan(20);
    const csp = issues.find((i) => i.title.includes('Content-Security-Policy'));
    expect(csp?.fix.snippet).toMatch(/^Content-Security-Policy: /);
    const alt = issues.find((i) => i.checkId === 'accessibility' && i.fix.docs?.includes('image-alt'));
    expect(alt?.example).toMatch(/<img/);
    expect(issues.find((i) => i.title === 'Broken image')?.example).toMatch(/^http/);
  }, 180_000);

  it('passes the good fixture on links, console, responsive and accessibility', async () => {
    const { results } = await runAuditEngine({
      auditId: 'good',
      url: `${server.baseUrl}/good.html`,
      checks: ['smoke', 'links', 'consoleNetwork', 'responsive', 'accessibility', 'seo'],
      artifactsDir,
    });
    const r = byId(results);
    expect(r.smoke.status).toBe('pass');
    expect(r.links.status).toBe('pass');
    expect(r.consoleNetwork.status).toBe('pass');
    expect(r.responsive.status).toBe('pass');
    expect(r.accessibility.status).toBe('pass');
    expect(r.accessibility.screenshots).toHaveLength(0); // nothing to highlight
    const seo = r.seo.details as unknown as SeoDetails;
    expect(r.seo.status, JSON.stringify(seo.rules.filter((x) => x.status !== 'pass'))).toBe('pass');
    expect(seo.jsonLdTypes).toContain('WebPage');
    expect(countBySeverity(classifyIssues(results)).error).toBe(0);
  }, 180_000);

  it('visual regression: first run becomes the baseline, then changes are diffed against it', async () => {
    const run = (auditId: string, v: number, baseline: { auditId: string; approvedAt: string } | null) =>
      runAuditEngine({ auditId, url: `${server.baseUrl}/visual.html?v=${v}`, checks: ['visual'], artifactsDir, baseline }).then((x) => x.results[0]);
    const approved = { auditId: 'vis-base', approvedAt: new Date().toISOString() };

    const first = await run('vis-base', 1, null);
    expect(first.status).toBe('pass');
    expect((first.summary as unknown as VisualSummary).baselineCreated).toBe(true);
    await fs.access(path.join(artifactsDir, 'vis-base', 'visual-desktop.png'));

    const same = await run('vis-same', 1, approved);
    const sameD = same.details as unknown as VisualDetails;
    expect(same.status).toBe('pass');
    expect(sameD.viewports.every((v) => v.diffPercent === 0)).toBe(true);

    const changed = await run('vis-changed', 2, approved);
    const d = changed.details as unknown as VisualDetails;
    expect(['warn', 'fail']).toContain(changed.status);
    expect(d.viewports[0].diffPercent).toBeGreaterThan(VISUAL_THRESHOLDS.warn);
    expect(d.viewports[0].baseline).toMatch(/vis-base\/visual-desktop\.png$/);
    await fs.access(path.join(artifactsDir, 'vis-changed', 'visual-diff-desktop.png'));
    expect(classifyIssues([changed]).some((i) => i.checkId === 'visual')).toBe(true);
  }, 120_000);

  it('cross-browser: reports an error that only happens in Firefox', async () => {
    const { results } = await runAuditEngine({ auditId: 'xb', url: `${server.baseUrl}/xb.html`, checks: ['crossBrowser'], artifactsDir });
    const r = results[0];
    const d = r.details as unknown as CrossBrowserDetails;
    expect(d.runs.map((x) => x.browser)).toEqual(['chromium', 'firefox', 'webkit']);
    expect(d.runs.every((x) => x.loaded), JSON.stringify(d.runs.map((x) => x.error))).toBe(true);
    expect(r.status).toBe('warn');
    expect(d.browserOnlyErrors).toEqual([expect.objectContaining({ browsers: ['firefox'] })]);
    expect(d.browserOnlyErrors[0].message).toMatch(/firefox-only failure/);
    expect(r.screenshots).toHaveLength(3);
    expect(classifyIssues(results).some((i) => i.checkId === 'crossBrowser' && i.severity === 'warning')).toBe(true);
  }, 150_000);

  it('treats errors from another site as third-party (warn, not fail)', async () => {
    const { results } = await runAuditEngine({
      auditId: 'thirdparty',
      url: `${server.baseUrl}/thirdparty.html`,
      checks: ['consoleNetwork'],
      artifactsDir,
    });
    const r = byId(results);
    const s = r.consoleNetwork.summary as unknown as ConsoleNetworkSummary;
    expect(r.consoleNetwork.status).toBe('warn');
    expect(s.uncaughtExceptions).toBe(0);
    expect(s.consoleErrors).toBe(0);
    expect(s.thirdPartyIssues).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it('fails smoke and skips the rest when the host is unreachable', async () => {
    const { results } = await runAuditEngine({
      auditId: 'down',
      url: 'http://127.0.0.1:1/',
      checks: ['smoke', 'links', 'security'],
      artifactsDir,
    });
    const r = byId(results);
    expect(r.smoke.status).toBe('fail');
    expect(r.links.status).toBe('skipped');
    expect(r.security.status).toBe('skipped');
  }, 60_000);

  it('blocks private-network targets when allowPrivateHosts is false (SSRF guard)', async () => {
    const { results } = await runAuditEngine({
      auditId: 'ssrf',
      url: `${server.baseUrl}/good.html`,
      checks: ['smoke', 'links'],
      artifactsDir,
      allowPrivateHosts: false,
    });
    const r = byId(results);
    expect(r.smoke.status).toBe('fail');
    expect(String(r.smoke.error)).toMatch(/private network/);
    expect(r.links.status).toBe('skipped');
  }, 60_000);

  it('stops quickly when cancelled and marks the remaining checks skipped', async () => {
    const controller = new AbortController();
    const started = Date.now();
    const run = runAuditEngine({
      auditId: 'cancel',
      url: `${server.baseUrl}/slow.html`, // never finishes loading
      checks: ['smoke', 'links', 'accessibility'],
      artifactsDir,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(new DOMException('Cancelled by user', 'AbortError')), 1_500);
    const { results, aborted } = await run;
    expect(aborted).toBe('cancelled');
    expect(Date.now() - started).toBeLessThan(15_000);
    expect(results.every((x) => x.status === 'skipped' || x.status === 'fail')).toBe(true);
  }, 60_000);

  it('enforces the overall time limit', async () => {
    const { aborted } = await runAuditEngine({
      auditId: 'timeout',
      url: `${server.baseUrl}/slow.html`,
      checks: ['smoke'],
      artifactsDir,
      timeoutMs: 2_000,
    });
    expect(aborted).toBe('timeout');
  }, 60_000);
});
