import { AxeBuilder } from '@axe-core/playwright';
import type { BrowserContext } from 'playwright';
import type { CrawlDetails, CrawlPage, CrawlSummary } from '@pulseqa/shared';
import { fetchText, parseRobots } from '../../lib/safeFetch.js';
import { firstUrlIn, siteOf, siteOfUrl } from '../../lib/site.js';
import { newAuditContext, userAgentFor } from '../browser.js';
import { autoScroll } from '../scroll.js';
import { outcome, type Check } from '../types.js';

/** Read at run time (not import time) so a value from .env always applies. */
const maxPages = () => Math.max(1, Math.min(200, Number(process.env.CRAWL_MAX_PAGES) || 20));
const MAX_DEPTH = 3;
const CONCURRENCY = 3;
const PAGE_TIMEOUT = 15_000;
export const SLOW_MS = 3_000;
/** The crawl's own time budget (the check timeout is a bit higher so partial results are returned). */
const BUDGET_MS = 140_000;

const SKIP_EXT = /\.(pdf|jpe?g|png|gif|svg|webp|avif|ico|zip|rar|7z|gz|tgz|mp4|webm|mov|mp3|wav|docx?|xlsx?|pptx?|csv|exe|dmg|apk|iso|xml|json|txt)$/i;
const TRACKING = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|_ga|ref)$/i;

/** Absolute, crawlable http(s) URL without hash or tracking params — or null if it should be skipped. */
export function normalizeCrawlUrl(href: string, base: string): string | null {
  let u: URL;
  try {
    u = new URL(href, base);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (SKIP_EXT.test(u.pathname)) return null;
  u.hash = '';
  // "/dir/index.html" is the same page as "/dir/" — don't crawl (and report) it twice
  u.pathname = u.pathname.replace(/\/index\.(html?|php)$/i, '/');
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  return u.toString();
}

/** robots.txt prefix match (supports the common `*` wildcard and `$` end anchor). */
export function isDisallowed(url: string, rules: string[]): boolean {
  const { pathname, search } = new URL(url);
  const target = pathname + search;
  return rules.some((rule) => {
    const re = new RegExp('^' + rule.replace(/[.+?^${}()|[\]\\]/g, (c) => (c === '$' ? '$' : `\\${c}`)).replace(/\*/g, '.*'));
    return re.test(target);
  });
}

interface Visit {
  page: CrawlPage;
  links: string[];
}

async function visit(context: BrowserContext, url: string, depth: number, site: string, signal: AbortSignal): Promise<Visit> {
  const result: CrawlPage = {
    url,
    finalUrl: null,
    depth,
    status: null,
    loaded: false,
    loadMs: null,
    title: null,
    description: null,
    h1Count: 0,
    jsErrors: 0,
    failedRequests: 0,
    brokenImages: 0,
    a11yIssues: null,
    linksFound: 0,
  };
  const firstParty = (u: string | null) => {
    const s = siteOfUrl(u);
    return s === null || s === site;
  };
  const page = await context.newPage();
  page.on('pageerror', (e) => {
    if (!firstParty(firstUrlIn(e.stack))) return;
    result.jsErrors++;
    result.firstJsError ??= e.message.split('\n')[0].slice(0, 200);
  });
  page.on('requestfailed', (r) => {
    if (!/ERR_ABORTED|ERR_BLOCKED_BY_CLIENT/.test(r.failure()?.errorText ?? '')) result.failedRequests++;
  });
  page.on('response', (r) => {
    if (r.status() >= 400 && r.request().resourceType() !== 'document') result.failedRequests++;
  });
  const close = () => void page.close().catch(() => {});
  signal.addEventListener('abort', close, { once: true });
  try {
    const started = Date.now();
    const res = await page.goto(url, { waitUntil: 'load', timeout: PAGE_TIMEOUT }).catch(async (err: Error) => {
      // a page that never fires "load" but has rendered still counts (as slow)
      if (/Timeout/i.test(err.message) && (await page.evaluate(() => !!document.body).catch(() => false))) return null;
      throw err;
    });
    result.loadMs = Date.now() - started;
    result.status = res?.status() ?? null;
    result.finalUrl = page.url();
    result.loaded = res ? res.status() < 400 : result.loadMs >= PAGE_TIMEOUT;
    const isHtml = /html/i.test(res?.headers()['content-type'] ?? 'text/html');
    if (!result.loaded || !isHtml) return { page: result, links: [] };

    await autoScroll(page, { maxMs: 3_000, stepDelayMs: 100, signal });
    const info = await page.evaluate(() => ({
      title: document.title?.trim() || null,
      description: document.querySelector('meta[name="description" i]')?.getAttribute('content')?.trim() || null,
      h1Count: document.querySelectorAll('h1').length,
      brokenImages: Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0 && !!i.currentSrc).length,
      links: Array.from(document.querySelectorAll('a[href]'), (a) => (a as HTMLAnchorElement).href),
    }));
    Object.assign(result, { title: info.title, description: info.description, h1Count: info.h1Count, brokenImages: info.brokenImages, linksFound: info.links.length });
    try {
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      result.a11yIssues = axe.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').length;
    } catch {
      /* a11y count stays null */
    }
    return { page: result, links: info.links };
  } catch (err) {
    result.error = (err as Error).message.split('\n')[0];
    return { page: result, links: [] };
  } finally {
    signal.removeEventListener('abort', close);
    close();
  }
}

export const crawlCheck: Check = {
  id: 'crawl',
  timeoutMs: BUDGET_MS + 15_000,
  requiresPage: true,
  async run(ctx) {
    const start = normalizeCrawlUrl(ctx.page.url() || ctx.url, ctx.url) ?? ctx.url;
    const site = siteOf(new URL(start).hostname);
    const deadline = Date.now() + BUDGET_MS;
    const MAX_PAGES = maxPages();

    // robots.txt rules for every crawler (*)
    const robots = await fetchText(`${new URL(start).origin}/robots.txt`, {
      allowPrivateHosts: ctx.allowPrivateHosts,
      signal: ctx.signal,
      userAgent: userAgentFor(ctx.browser, 'desktop'),
    });
    const disallow = robots.status === 200 && robots.text && !/text\/html/i.test(robots.contentType ?? '') ? parseRobots(robots.text).disallow : [];

    const context = await newAuditContext(ctx.browser, { viewport: { width: 1366, height: 768 } }, { allowPrivateHosts: ctx.allowPrivateHosts });
    const closeCtx = () => void context.close().catch(() => {});
    ctx.signal.addEventListener('abort', closeCtx, { once: true });

    const queue: { url: string; depth: number }[] = [{ url: start, depth: 0 }];
    const seen = new Set([start]);
    const pages: CrawlPage[] = [];
    let skippedByRobots = 0;
    let inFlight = 0;
    let partial = false;

    const worker = async () => {
      for (;;) {
        if (ctx.signal.aborted || Date.now() > deadline) {
          partial = queue.length > 0 || inFlight > 0;
          return;
        }
        if (pages.length + inFlight >= MAX_PAGES) return;
        const next = queue.shift();
        if (!next) {
          if (inFlight === 0) return;
          await new Promise((r) => setTimeout(r, 100));
          continue;
        }
        inFlight++;
        const { page, links } = await visit(context, next.url, next.depth, site, ctx.signal);
        inFlight--;
        pages.push(page);
        if (next.depth >= MAX_DEPTH) continue;
        for (const href of links) {
          const u = normalizeCrawlUrl(href, page.finalUrl ?? next.url);
          if (!u || seen.has(u) || siteOfUrl(u) !== site) continue;
          seen.add(u);
          if (disallow.length && isDisallowed(u, disallow)) {
            skippedByRobots++;
            continue;
          }
          queue.push({ url: u, depth: next.depth + 1 });
        }
      }
    };
    try {
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    } finally {
      ctx.signal.removeEventListener('abort', closeCtx);
      closeCtx();
    }

    // ── site-level findings ──
    pages.sort((a, b) => a.depth - b.depth || a.url.localeCompare(b.url));
    const loaded = pages.filter((p) => p.loaded);
    const groupBy = (key: 'title' | 'description') => {
      const m = new Map<string, string[]>();
      for (const p of loaded) if (p[key]) m.set(p[key]!, [...(m.get(p[key]!) ?? []), p.url]);
      return [...m.entries()].filter(([, urls]) => urls.length > 1);
    };
    const duplicateTitles = groupBy('title').map(([title, urls]) => ({ title, urls }));
    const duplicateDescriptions = groupBy('description').map(([description, urls]) => ({ description, urls }));
    const broken = pages.filter((p) => !p.loaded).length;
    const slow = loaded.filter((p) => (p.loadMs ?? 0) > SLOW_MS).length;
    const withJsErrors = pages.filter((p) => p.jsErrors > 0).length;
    const withA11yIssues = pages.filter((p) => (p.a11yIssues ?? 0) > 0).length;
    const missingTitles = loaded.filter((p) => !p.title).length;
    const loads = loaded.map((p) => p.loadMs ?? 0);

    const status = broken
      ? 'fail'
      : slow || withJsErrors || withA11yIssues || duplicateTitles.length || missingTitles || pages.some((p) => p.brokenImages)
        ? 'warn'
        : 'pass';
    return outcome(
      status,
      {
        pagesCrawled: pages.length,
        broken,
        slow,
        withJsErrors,
        withA11yIssues,
        avgLoadMs: loads.length ? Math.round(loads.reduce((a, b) => a + b, 0) / loads.length) : null,
        notCrawled: queue.length,
        partial,
      } satisfies CrawlSummary,
      { pages, duplicateTitles, duplicateDescriptions, skippedByRobots, limits: { maxPages: MAX_PAGES, maxDepth: MAX_DEPTH, slowMs: SLOW_MS } } satisfies CrawlDetails,
    );
  },
};
