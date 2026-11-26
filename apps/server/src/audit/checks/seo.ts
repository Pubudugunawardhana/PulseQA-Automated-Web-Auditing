import type { Rating, SeoDetails, SeoRule, SeoSummary } from '@pulseqa/shared';
import { fetchText, parseRobots } from '../../lib/safeFetch.js';
import { siteOfUrl } from '../../lib/site.js';
import { userAgentFor } from '../browser.js';
import { outcome, type Check } from '../types.js';

export const TITLE_RANGE = [30, 60] as const;
export const DESCRIPTION_RANGE = [70, 160] as const;

/** Rates a text length against a recommended [min, max] range. */
export function rateLength(text: string | null, [min, max]: readonly [number, number]): Rating {
  if (!text) return 'fail';
  return text.length >= min && text.length <= max ? 'pass' : 'warn';
}

interface PageSeo {
  title: string | null;
  description: string | null;
  canonical: string | null;
  robotsMeta: string | null;
  lang: string | null;
  headings: { level: number; text: string }[];
  imagesWithoutAlt: number;
  images: number;
  og: SeoDetails['og'];
  twitterCard: string | null;
  jsonLd: { ok: boolean; types: string[] }[];
  hreflang: number;
}

export const seoCheck: Check = {
  id: 'seo',
  timeoutMs: 30_000,
  requiresPage: true,
  async run(ctx) {
    const pageUrl = ctx.page.url() || ctx.url;
    const p: PageSeo = await ctx.page.evaluate(() => {
      const meta = (sel: string) => document.querySelector(sel)?.getAttribute('content')?.trim() || null;
      const typesOf = (v: unknown): string[] => {
        if (Array.isArray(v)) return v.flatMap(typesOf);
        if (v && typeof v === 'object') {
          const o = v as Record<string, unknown>;
          const t = o['@type'];
          return [...(Array.isArray(t) ? t.map(String) : t ? [String(t)] : []), ...(o['@graph'] ? typesOf(o['@graph']) : [])];
        }
        return [];
      };
      const imgs = Array.from(document.images);
      return {
        title: document.title?.trim() || null,
        description: meta('meta[name="description" i]'),
        canonical: document.querySelector('link[rel="canonical" i]')?.getAttribute('href')?.trim() || null,
        robotsMeta: meta('meta[name="robots" i]') ?? meta('meta[name="googlebot" i]'),
        lang: document.documentElement.getAttribute('lang'),
        headings: Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
          .slice(0, 60)
          .map((h) => ({ level: Number(h.tagName[1]), text: (h.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) })),
        imagesWithoutAlt: imgs.filter((i) => !i.hasAttribute('alt')).length,
        images: imgs.length,
        og: {
          title: meta('meta[property="og:title" i]') ?? undefined,
          description: meta('meta[property="og:description" i]') ?? undefined,
          image: meta('meta[property="og:image" i]') ?? undefined,
          url: meta('meta[property="og:url" i]') ?? undefined,
          siteName: meta('meta[property="og:site_name" i]') ?? undefined,
        },
        twitterCard: meta('meta[name="twitter:card" i]'),
        jsonLd: Array.from(document.querySelectorAll('script[type="application/ld+json" i]')).map((s) => {
          try {
            return { ok: true, types: typesOf(JSON.parse(s.textContent ?? '')) };
          } catch {
            return { ok: false, types: [] as string[] };
          }
        }),
        hreflang: document.querySelectorAll('link[rel="alternate" i][hreflang]').length,
      };
    });

    const rules: SeoRule[] = [];
    const rule = (id: SeoRule['id'], label: string, status: Rating, value: string, message: string) => rules.push({ id, label, status, value, message });

    // ── on-page ──
    rule(
      'title',
      'Title tag',
      rateLength(p.title, TITLE_RANGE),
      p.title ? `“${p.title}” (${p.title.length} chars)` : 'missing',
      p.title ? `Recommended ${TITLE_RANGE[0]}–${TITLE_RANGE[1]} characters` : 'Every page needs a unique <title>',
    );
    rule(
      'description',
      'Meta description',
      p.description ? rateLength(p.description, DESCRIPTION_RANGE) : 'warn',
      p.description ? `${p.description.length} chars` : 'missing',
      `Recommended ${DESCRIPTION_RANGE[0]}–${DESCRIPTION_RANGE[1]} characters; used as the search-result snippet`,
    );

    let canonicalStatus: Rating = 'warn';
    let canonicalMsg = 'No canonical URL — duplicate URLs (tracking params, http/https) may compete in search';
    let canonical: string | null = null;
    if (p.canonical) {
      try {
        canonical = new URL(p.canonical, pageUrl).toString();
        const sameSite = siteOfUrl(canonical) === siteOfUrl(pageUrl);
        canonicalStatus = sameSite ? 'pass' : 'warn';
        canonicalMsg = sameSite ? 'Points to this site' : 'Points to a different site — make sure that is intended';
      } catch {
        canonicalMsg = 'Canonical href is not a valid URL';
      }
    }
    rule('canonical', 'Canonical URL', canonicalStatus, canonical ?? 'missing', canonicalMsg);

    const headerRobots = ctx.mainResponse ? ((await ctx.mainResponse.allHeaders().catch(() => ({}) as Record<string, string>))['x-robots-tag'] ?? null) : null;
    const robotsValue = [p.robotsMeta, headerRobots].filter(Boolean).join(', ');
    const noindex = /noindex|none/i.test(robotsValue);
    rule(
      'robotsMeta',
      'Indexing (meta robots)',
      noindex ? 'fail' : /nofollow/i.test(robotsValue) ? 'warn' : 'pass',
      robotsValue || 'index, follow (default)',
      noindex ? 'This page asks search engines NOT to index it' : 'Search engines may index this page',
    );
    rule('lang', 'Language (html lang)', p.lang ? 'pass' : 'warn', p.lang ?? 'missing', 'Helps search engines serve the right language');

    const h1s = p.headings.filter((h) => h.level === 1);
    rule(
      'h1',
      'Main heading (h1)',
      h1s.length === 1 ? 'pass' : 'warn',
      h1s.length ? `${h1s.length} × h1${h1s[0] ? ` — “${h1s[0].text}”` : ''}` : 'none',
      'Use exactly one h1 describing the page',
    );
    // a page that starts at h3+ (no h1/h2 above it) also skips levels
    const skipped = p.headings.some((h, i) => h.level > (i > 0 ? p.headings[i - 1].level : 1) + 1);
    rule('headingOrder', 'Heading structure', skipped ? 'warn' : 'pass', `${p.headings.length} headings`, skipped ? 'A heading level is skipped (e.g. h2 → h4)' : 'Levels are in order');
    rule(
      'imageAlt',
      'Image alt text',
      p.imagesWithoutAlt ? 'warn' : 'pass',
      `${p.images - p.imagesWithoutAlt}/${p.images} images have alt`,
      p.imagesWithoutAlt ? `${p.imagesWithoutAlt} image(s) without an alt attribute` : 'All images have alt text',
    );
    const ogMissing = (['title', 'description', 'image'] as const).filter((k) => !p.og[k]);
    rule(
      'openGraph',
      'Open Graph (social sharing)',
      ogMissing.length === 0 ? 'pass' : 'warn',
      ogMissing.length ? `missing og:${ogMissing.join(', og:')}` : 'og:title, og:description, og:image',
      'Controls the preview on Facebook, LinkedIn, WhatsApp and Slack',
    );
    rule('twitterCard', 'Twitter / X card', p.twitterCard ? 'pass' : 'warn', p.twitterCard ?? 'missing', 'twitter:card enables a rich preview on X');
    const badJson = p.jsonLd.filter((j) => !j.ok).length;
    const types = [...new Set(p.jsonLd.flatMap((j) => j.types))];
    rule(
      'structuredData',
      'Structured data (JSON-LD)',
      badJson ? 'warn' : p.jsonLd.length ? 'pass' : 'warn',
      p.jsonLd.length ? (types.join(', ') || `${p.jsonLd.length} block(s)`) : 'none',
      badJson ? `${badJson} JSON-LD block(s) contain invalid JSON` : p.jsonLd.length ? 'Valid JSON-LD found' : 'No schema.org data — rich results (ratings, FAQ, breadcrumbs) need it',
    );

    // ── robots.txt + sitemap ──
    const origin = new URL(pageUrl).origin;
    const fetchOpts = { allowPrivateHosts: ctx.allowPrivateHosts, signal: ctx.signal, userAgent: userAgentFor(ctx.browser, 'desktop') };
    const robotsRes = await fetchText(`${origin}/robots.txt`, fetchOpts);
    let robotsTxt: SeoDetails['robotsTxt'] = { url: robotsRes.url, status: robotsRes.status, blocksAll: false, sitemaps: [] };
    if (robotsRes.status === 200 && robotsRes.text !== null && !/text\/html/i.test(robotsRes.contentType ?? '')) {
      const { blocksAll, sitemaps } = parseRobots(robotsRes.text);
      robotsTxt = { ...robotsTxt, blocksAll, sitemaps };
      rule(
        'robotsTxt',
        'robots.txt',
        robotsTxt.blocksAll ? 'fail' : 'pass',
        `${robotsTxt.url} (${robotsTxt.sitemaps.length} sitemap${robotsTxt.sitemaps.length === 1 ? '' : 's'} listed)`,
        robotsTxt.blocksAll ? '“Disallow: /” blocks all crawlers from the whole site' : 'Crawlers are allowed',
      );
    } else {
      rule('robotsTxt', 'robots.txt', 'warn', robotsRes.status ? `HTTP ${robotsRes.status}` : (robotsRes.error ?? 'not found'), 'No robots.txt — add one to guide crawlers and list your sitemap');
    }

    const sitemapUrl = robotsTxt.sitemaps[0] ?? `${origin}/sitemap.xml`;
    const smRes = await fetchText(sitemapUrl, fetchOpts);
    let sitemap: SeoDetails['sitemap'] = { url: smRes.url, status: smRes.status, urls: null, valid: false };
    if (smRes.status === 200 && smRes.text) {
      const valid = /<(urlset|sitemapindex)[\s>]/i.test(smRes.text);
      const urls = (smRes.text.match(/<loc>/gi) ?? []).length;
      sitemap = { ...sitemap, valid, urls };
      rule('sitemap', 'XML sitemap', valid ? 'pass' : 'warn', valid ? `${urls} URL${urls === 1 ? '' : 's'}` : 'not a valid sitemap', valid ? smRes.url : 'The file is not a <urlset> / <sitemapindex> XML document');
    } else {
      rule('sitemap', 'XML sitemap', 'warn', smRes.status ? `HTTP ${smRes.status}` : (smRes.error ?? 'not found'), 'No sitemap.xml — it helps search engines find all your pages');
    }

    const failed = rules.filter((r) => r.status === 'fail').length;
    const warnings = rules.filter((r) => r.status === 'warn').length;
    const status = failed ? 'fail' : warnings ? 'warn' : 'pass';
    return outcome(
      status,
      { passed: rules.length - failed - warnings, warnings, failed, indexable: !noindex && !robotsTxt.blocksAll } satisfies SeoSummary,
      {
        rules,
        title: p.title,
        description: p.description,
        canonical,
        og: p.og,
        twitterCard: p.twitterCard,
        jsonLdTypes: types,
        hreflang: p.hreflang,
        headings: p.headings.slice(0, 30),
        robotsTxt,
        sitemap,
      } satisfies SeoDetails,
    );
  },
};
