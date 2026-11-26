// Short, practical "how to fix it" guidance attached to every issue PulseQA reports.
import type { PerfMetricKey, SeoRuleId } from './details';

export interface Fix {
  /** One or two sentences: what to change. */
  tip: string;
  /** Optional copy-paste example (header, HTML, config). */
  snippet?: string;
  /** Optional reference for the details. */
  docs?: string;
}

const MDN_HEADERS = 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/';

/** Security headers, keyed by lower-case header name. */
export const HEADER_FIXES: Record<string, Fix> = {
  'content-security-policy': {
    tip: 'Send a Content-Security-Policy header that only allows scripts, styles and images from sources you trust. Start in Report-Only mode, fix what it reports, then enforce it.',
    snippet: "Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; object-src 'none'; frame-ancestors 'self'; base-uri 'self'",
    docs: `${MDN_HEADERS}Content-Security-Policy`,
  },
  'x-frame-options': {
    tip: 'Stop other sites from embedding your page in an iframe (clickjacking). Use X-Frame-Options or the CSP frame-ancestors directive.',
    snippet: "X-Frame-Options: SAMEORIGIN\n# or, in your CSP:  frame-ancestors 'self'",
    docs: `${MDN_HEADERS}X-Frame-Options`,
  },
  'strict-transport-security': {
    tip: 'Tell browsers to always use HTTPS for your domain. Only add it once HTTPS works on every subdomain.',
    snippet: 'Strict-Transport-Security: max-age=31536000; includeSubDomains',
    docs: `${MDN_HEADERS}Strict-Transport-Security`,
  },
  'x-content-type-options': {
    tip: 'Stop browsers from guessing (sniffing) file types, which can turn an uploaded file into executable script.',
    snippet: 'X-Content-Type-Options: nosniff',
    docs: `${MDN_HEADERS}X-Content-Type-Options`,
  },
  'referrer-policy': {
    tip: 'Limit how much of your URLs (which may contain tokens or IDs) is sent to other sites in the Referer header.',
    snippet: 'Referrer-Policy: strict-origin-when-cross-origin',
    docs: `${MDN_HEADERS}Referrer-Policy`,
  },
  'permissions-policy': {
    tip: 'Turn off powerful browser features your site does not use, so injected or third-party code cannot use them either.',
    snippet: 'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
    docs: `${MDN_HEADERS}Permissions-Policy`,
  },
};

/** Generic tip for any header: where to set it. */
export const HEADER_HOWTO =
  'Set headers in one place — e.g. Express: app.use(helmet()) · Nginx: add_header … always; · Netlify/Vercel: the headers config file · Cloudflare: Transform Rules.';

export const FIXES = {
  noHttps: {
    tip: 'Serve the site over HTTPS. Free certificates are available from Let’s Encrypt, and most hosts (Vercel, Netlify, Cloudflare, Render) enable it with one switch.',
    docs: 'https://letsencrypt.org/getting-started/',
  },
  noHttpsRedirect: {
    tip: 'Redirect every http:// request to https:// with a permanent (301) redirect, so visitors never stay on the insecure version.',
    snippet: 'server { listen 80; server_name example.com; return 301 https://$host$request_uri; }',
  },
  mixedContent: {
    tip: 'Load every image, script and stylesheet over https://. Update hard-coded http:// URLs, or add a CSP directive that upgrades them automatically.',
    snippet: 'Content-Security-Policy: upgrade-insecure-requests',
    docs: 'https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content',
  },
  serverDisclosure: {
    tip: 'Hide the software/version in Server and X-Powered-By headers so attackers can’t easily look up known vulnerabilities.',
    snippet: "Express: app.disable('x-powered-by')   ·   Nginx: server_tokens off;",
  },
  insecureCookie: {
    tip: 'Mark cookies Secure (HTTPS only) and HttpOnly (not readable by JavaScript), and set SameSite to limit cross-site sending.',
    snippet: 'Set-Cookie: session=…; Secure; HttpOnly; SameSite=Lax; Path=/',
    docs: `${MDN_HEADERS}Set-Cookie`,
  },
  brokenInternalLink: {
    tip: 'Update or remove links that point to pages which no longer exist on your site, or add a 301 redirect from the old URL to the new one.',
  },
  brokenExternalLink: {
    tip: 'The other site moved or removed the page. Link to its new location, an archived copy, or remove the link.',
  },
  brokenImage: {
    tip: 'Check the image path and file name (case-sensitive on most servers), make sure the file was deployed, and that it is served with an image Content-Type.',
  },
  restrictedLink: {
    tip: 'These sites block automated requests (401/403/429), so PulseQA could not verify them. Open them in a browser once to confirm they work — no change is usually needed.',
  },
  exception: {
    tip: 'Open the browser DevTools console on the page, reproduce the error and fix the code at the top of the stack trace. Guard against null/undefined values and failed fetches.',
  },
  apiFailure: {
    tip: 'A request your page makes to your own API failed. Check the endpoint’s server logs, the URL and auth/CORS settings, and show a friendly error state in the UI when it fails.',
  },
  consoleError: {
    tip: 'Read the message in the DevTools console and fix its cause (often a missing resource, a failed request or a framework warning promoted to an error).',
  },
  failedResource: {
    tip: 'A script, stylesheet, font or other file failed to load. Fix the path or remove the reference if the file is no longer needed.',
  },
  thirdParty: {
    tip: 'These come from scripts on other domains (ads, analytics, widgets). Update or remove the script, load it with async/defer, or contact the vendor — they don’t fail your audit.',
  },
  overflow: {
    tip: 'Something is wider than the screen. Common fixes: max-width: 100% on images/videos, overflow-wrap: anywhere for long words/URLs, flex-wrap on rows, and avoid fixed pixel widths. The Responsive report lists the offending elements.',
    snippet: 'img, video { max-width: 100%; height: auto; }\n.long-text { overflow-wrap: anywhere; }',
  },
} satisfies Record<string, Fix>;

/** Smoke-check findings, matched by their message. */
export function smokeFix(message: string): Fix {
  const m = message.toLowerCase();
  if (m.includes('404')) return { tip: 'The URL returns “not found”. Fix the route, or add a 301 redirect from this address to the right page.' };
  if (m.includes('server error')) return { tip: 'The server crashed while building the page. Check the server/application logs for the stack trace at the time of the audit.' };
  if (m.includes('client error')) return { tip: 'The server rejected the request. Check authentication, firewall/WAF rules and whether the page needs a login.' };
  if (m.includes('title')) return { tip: 'Give every page a unique, descriptive <title> — it is shown in tabs, bookmarks and search results.', snippet: '<title>Product name – what this page is about</title>' };
  if (m.includes('blank')) return { tip: 'Nothing visible was rendered. Check for a JavaScript error that stops your app from mounting, or content that only loads after login.' };
  if (m.includes('viewport')) return { tip: 'Add the viewport meta tag to <head> so mobile browsers use the device width instead of a zoomed-out desktop layout.', snippet: '<meta name="viewport" content="width=device-width, initial-scale=1">' };
  if (m.includes('description')) return { tip: 'Add a 1–2 sentence summary for search results.', snippet: '<meta name="description" content="What this page offers, in about 150 characters.">' };
  if (m.includes('favicon')) return { tip: 'Add an icon so the site is recognisable in tabs and bookmarks.', snippet: '<link rel="icon" href="/favicon.svg" type="image/svg+xml">' };
  if (m.includes('lang')) return { tip: 'Declare the page language so screen readers pronounce it correctly and translators work.', snippet: '<html lang="en">' };
  if (m.includes('<h1>')) return { tip: 'Use exactly one <h1> that describes the page, with <h2>–<h6> for sections below it.' };
  return { tip: 'See the Smoke & Availability report for details.' };
}

const PERF_TIPS: Record<PerfMetricKey, Fix> = {
  ttfb: { tip: 'The server is slow to respond. Cache pages (CDN or server cache), speed up database queries and host closer to your users.', docs: 'https://web.dev/articles/ttfb' },
  fcp: { tip: 'Show something sooner: inline critical CSS, defer non-critical JavaScript, preload key fonts and reduce render-blocking resources.', docs: 'https://web.dev/articles/fcp' },
  lcp: {
    tip: 'Make the biggest visible element load first: compress/resize the hero image (WebP/AVIF), preload it, don’t lazy-load it, and cut render-blocking JS/CSS.',
    snippet: '<link rel="preload" as="image" href="/hero.webp" fetchpriority="high">',
    docs: 'https://web.dev/articles/optimize-lcp',
  },
  cls: {
    tip: 'Stop content from jumping: give images/videos/ads width and height (or aspect-ratio), and don’t insert content above what the user is reading.',
    snippet: '<img src="photo.jpg" width="800" height="450" alt="…">',
    docs: 'https://web.dev/articles/optimize-cls',
  },
  load: { tip: 'The page takes long to fully load. Reduce the number and size of requests (see Slowest resources), lazy-load below-the-fold images and remove unused scripts.', docs: 'https://web.dev/articles/fast' },
};

export function perfFix(metric: PerfMetricKey, mobile = false): Fix {
  const f = PERF_TIPS[metric];
  return mobile ? { ...f, tip: `${f.tip} On mobile, also ship less JavaScript — slow CPUs spend longest parsing it.` } : f;
}

/** SEO rules (check id `seo`), keyed by rule id. */
export const SEO_FIXES: Record<SeoRuleId, Fix> = {
  title: {
    tip: 'Give every page a unique, descriptive title of about 30–60 characters, with the most important words first.',
    snippet: '<title>Running Shoes for Women – Free Delivery | ShopName</title>',
    docs: 'https://developers.google.com/search/docs/appearance/title-link',
  },
  description: {
    tip: 'Write a 70–160 character summary that makes people want to click; search engines often use it as the result snippet.',
    snippet: '<meta name="description" content="Lightweight running shoes for women. Free delivery and 30-day returns.">',
    docs: 'https://developers.google.com/search/docs/appearance/snippet',
  },
  canonical: {
    tip: 'Tell search engines which URL is the main version of this page so tracking parameters and duplicates don’t split its ranking.',
    snippet: '<link rel="canonical" href="https://example.com/products/shoes">',
    docs: 'https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls',
  },
  robotsMeta: {
    tip: 'This page tells search engines not to index it. Remove “noindex” (meta robots tag or X-Robots-Tag header) unless the page should really stay out of search.',
    snippet: '<meta name="robots" content="index, follow">',
    docs: 'https://developers.google.com/search/docs/crawling-indexing/block-indexing',
  },
  lang: { tip: 'Declare the page language so search engines show it to the right audience.', snippet: '<html lang="en">' },
  h1: { tip: 'Use exactly one <h1> that says what the page is about; use <h2>–<h6> for sections.' },
  headingOrder: { tip: 'Don’t skip heading levels (h2 → h4). A logical outline helps both search engines and screen-reader users.' },
  imageAlt: {
    tip: 'Describe every meaningful image in its alt attribute (use alt="" for decorative ones). Image search and screen readers rely on it.',
    snippet: '<img src="red-shoe.jpg" alt="Red running shoe, side view">',
  },
  openGraph: {
    tip: 'Add Open Graph tags so links shared on Facebook, LinkedIn, WhatsApp and Slack show a proper title, description and image (1200×630).',
    snippet: [
      '<meta property="og:title" content="Page title">',
      '<meta property="og:description" content="Short summary">',
      '<meta property="og:image" content="https://example.com/share.png">',
      '<meta property="og:url" content="https://example.com/page">',
    ].join('\n'),
    docs: 'https://ogp.me/',
  },
  twitterCard: { tip: 'Add a Twitter/X card tag to get a large preview when the link is shared on X.', snippet: '<meta name="twitter:card" content="summary_large_image">' },
  structuredData: {
    tip: 'Describe the page with schema.org JSON-LD (Organization, Product, Article, FAQ…) to become eligible for rich results. Validate it with Google’s Rich Results Test.',
    snippet: ['<script type="application/ld+json">', '{ "@context": "https://schema.org", "@type": "Organization", "name": "ShopName", "url": "https://example.com" }', '</script>'].join('\n'),
    docs: 'https://search.google.com/test/rich-results',
  },
  robotsTxt: {
    tip: 'Serve a /robots.txt that allows crawling and lists your sitemap. Never use “Disallow: /” for all user-agents on a live site.',
    snippet: ['User-agent: *', 'Allow: /', '', 'Sitemap: https://example.com/sitemap.xml'].join('\n'),
    docs: 'https://developers.google.com/search/docs/crawling-indexing/robots/intro',
  },
  sitemap: {
    tip: 'Publish an XML sitemap of your important URLs and reference it from robots.txt (most frameworks and CMSs can generate it).',
    snippet: [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      '  <url><loc>https://example.com/</loc></url>',
      '</urlset>',
    ].join('\n'),
    docs: 'https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap',
  },
};

export const VISUAL_FIXES = {
  changed: {
    tip: 'The page looks different from the approved baseline. Compare the Baseline, Current and Diff images: if the change is intended, approve this run as the new baseline; if not, find the CSS or content change that caused it.',
  },
  missingBaseline: { tip: 'The baseline screenshots are gone (the baseline audit was deleted). Approve this run as the new baseline.' },
} satisfies Record<string, Fix>;

export const CRAWL_FIXES = {
  broken: {
    tip: 'These pages are linked from your site but return an error (4xx/5xx) or don’t load. Fix the page, or update/remove the links pointing to it and add a 301 redirect from the old URL.',
  },
  slow: {
    tip: 'These pages took more than 3 s to load. Open them in the Performance check (audit the URL directly) to see the slowest resources; common fixes are image compression, caching and less JavaScript.',
  },
  jsErrors: { tip: 'JavaScript errors happen on these pages. Audit each URL on its own to see the full error and stack trace in the Console & Network report.' },
  brokenImages: { tip: 'Images on these pages fail to load. Check the paths and that the files were deployed.' },
  a11y: { tip: 'These pages have critical or serious accessibility violations. Audit each URL on its own for the full axe-core report with highlighted elements.' },
  duplicateTitles: {
    tip: 'Several pages share the same <title>. Give every page a unique title so search results (and browser tabs) can tell them apart.',
    docs: 'https://developers.google.com/search/docs/appearance/title-link',
  },
  missingTitles: { tip: 'Some pages have no <title>. Add a unique, descriptive title to each.' },
  missingDescriptions: { tip: 'Some pages have no meta description. Add a 70–160 character summary to each important page.' },
  notCrawled: {
    tip: 'Only the first pages were checked. Audit the most important sections (e.g. /blog, /shop) directly, or raise CRAWL_MAX_PAGES on the server.',
  },
} satisfies Record<string, Fix>;

export const CROSS_BROWSER_FIXES = {
  failsToLoad: {
    tip: 'The page loads in Chrome but not in this browser. Open it there (Firefox, or Safari/WebKit) and check the console; common causes are unsupported JavaScript syntax or APIs, or a server that rejects the browser’s requests.',
    docs: 'https://caniuse.com/',
  },
  browserOnlyError: {
    tip: 'This JavaScript error only happens in some browsers — usually an API or syntax that browser doesn’t support. Check the feature on caniuse.com and add a fallback or polyfill, or transpile for your target browsers (Browserslist).',
    docs: 'https://caniuse.com/',
  },
  layout: {
    tip: 'Horizontal scrolling appears in only some browsers — usually a CSS feature with different support or defaults (gap, aspect-ratio, scrollbar widths). Inspect the widest element in that browser.',
  },
  notInstalled: { tip: 'Install the missing browser on the server so it can be tested.', snippet: 'npx playwright install firefox webkit' },
} satisfies Record<string, Fix>;
