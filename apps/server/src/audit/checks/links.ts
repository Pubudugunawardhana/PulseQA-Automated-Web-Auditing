import pLimit, { type LimitFunction } from 'p-limit';
import type { LinkProbe, LinksDetails, LinksSummary } from '@pulseqa/shared';
import { resolvesToPrivate } from '../../lib/urlGuard.js';
import { userAgentFor } from '../browser.js';
import { outcome, type Check } from '../types.js';

const MAX_LINKS = 150;
const MAX_IMAGES = 100;
const REQUEST_TIMEOUT = 10_000;
const MAX_REDIRECTS = 10;
const TOTAL_CONCURRENCY = 12;
/** Per-host cap so we don't trip rate limits (429) on the audited site or a CDN. */
const PER_HOST_CONCURRENCY = 4;
/** Statuses that usually mean "bot blocked / auth needed", not "broken". */
const RESTRICTED = new Set([401, 403, 429, 999]);
/** HTTP-client limitations (huge headers, odd framing): the link may well work in a browser. */
const UNVERIFIABLE = /Header overflow|HEADERS_OVERFLOW|Parse Error|HPE_|UND_ERR_INFO/i;

type Target = Pick<LinkProbe, 'url' | 'text' | 'kind'>;
type ProbeResult = Pick<LinkProbe, 'status' | 'error' | 'unverified' | 'blocked'>;

interface ProbeOptions {
  headers: Record<string, string>;
  allowPrivateHosts: boolean;
  signal: AbortSignal;
}

/**
 * Sends one request and follows redirects MANUALLY so every hop can be checked against the
 * private-network guard. The response body is cancelled as soon as headers arrive (we only need
 * the status), which keeps GET fallbacks fast even for large pages and images.
 */
async function request(method: 'HEAD' | 'GET', url: string, opts: ProbeOptions): Promise<ProbeResult> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = new URL(current);
    if (!opts.allowPrivateHosts && (await resolvesToPrivate(u.hostname))) {
      return { status: null, blocked: true, error: `Not checked: ${hop ? 'redirects' : 'points'} to a private network` };
    }
    const res = await fetch(current, {
      method,
      redirect: 'manual',
      headers: opts.headers,
      signal: AbortSignal.any([opts.signal, AbortSignal.timeout(REQUEST_TIMEOUT)]),
    });
    await res.body?.cancel().catch(() => {}); // headers are all we need
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) return { status: res.status };
    current = new URL(location, current).toString();
  }
  return { status: null, error: `More than ${MAX_REDIRECTS} redirects` };
}

function describeError(err: unknown): string {
  const e = err as Error & { cause?: { code?: string; message?: string } };
  if (e.name === 'TimeoutError') return `Timed out after ${REQUEST_TIMEOUT / 1000}s`;
  const cause = e.cause?.code ?? e.cause?.message;
  return (cause ? `${e.message} (${cause})` : e.message).split('\n')[0];
}

async function probe(url: string, opts: ProbeOptions): Promise<ProbeResult> {
  // Many servers mishandle HEAD (400/404/405/...), so any HEAD failure is re-checked with GET.
  try {
    const head = await request('HEAD', url, opts);
    if (head.blocked || (head.status !== null && head.status < 400)) return head;
  } catch {
    /* fall through to GET */
  }
  try {
    return await request('GET', url, opts);
  } catch (err) {
    const message = describeError(err);
    if (UNVERIFIABLE.test(message)) return { status: null, error: message, unverified: true };
    return { status: null, error: message };
  }
}

export const linksCheck: Check = {
  id: 'links',
  timeoutMs: 90_000,
  requiresPage: true,
  async run(ctx) {
    const pageUrl = ctx.page.url();
    const origin = new URL(pageUrl).origin;

    const raw = await ctx.page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]')).map((a) => ({
        href: (a as HTMLAnchorElement).getAttribute('href') ?? '',
        abs: (a as HTMLAnchorElement).href,
        text: ((a as HTMLElement).innerText || a.getAttribute('aria-label') || '').trim().slice(0, 80),
      }));
      const images = Array.from(document.images).map((img) => ({
        abs: img.currentSrc || img.src,
        alt: img.alt,
        // complete + naturalWidth 0 => the browser failed to decode/load it
        brokenInPage: img.complete && img.naturalWidth === 0 && !!(img.currentSrc || img.src),
      }));
      return { links, images };
    });

    const skip = /^(mailto:|tel:|javascript:|data:|blob:|sms:|#)/i;
    const seen = new Set<string>();
    const targets: Target[] = [];
    let skipped = 0;

    for (const l of raw.links) {
      if (!l.href || skip.test(l.href.trim())) {
        skipped++;
        continue;
      }
      let u: URL;
      try {
        u = new URL(l.abs);
      } catch {
        targets.push({ url: l.href, text: l.text, kind: 'link' });
        continue;
      }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        skipped++;
        continue;
      }
      u.hash = '';
      const key = u.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      targets.push({ url: key, text: l.text, kind: 'link' });
    }
    const linkTargets = targets.slice(0, MAX_LINKS);

    const imageTargets: Target[] = [];
    const brokenInPage = new Set<string>();
    for (const img of raw.images) {
      if (!img.abs || img.abs.startsWith('data:')) continue;
      if (img.brokenInPage) brokenInPage.add(img.abs);
      if (seen.has(img.abs)) continue;
      seen.add(img.abs);
      imageTargets.push({ url: img.abs, text: img.alt || '(no alt)', kind: 'image' });
    }
    const imgs = imageTargets.slice(0, MAX_IMAGES);

    // Look like a real browser on EVERY request (HEAD and GET), or WAFs like Cloudflare answer 403.
    const opts: ProbeOptions = {
      allowPrivateHosts: ctx.allowPrivateHosts,
      signal: ctx.signal,
      headers: {
        'User-Agent': userAgentFor(ctx.browser, 'desktop'),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    };

    const total = pLimit(TOTAL_CONCURRENCY);
    const perHost = new Map<string, LimitFunction>();
    const hostLimit = (host: string) => {
      let l = perHost.get(host);
      if (!l) perHost.set(host, (l = pLimit(PER_HOST_CONCURRENCY)));
      return l;
    };

    const probes: LinkProbe[] = await Promise.all(
      [...linkTargets, ...imgs].map(async (t): Promise<LinkProbe> => {
        let u: URL;
        try {
          u = new URL(t.url);
        } catch {
          return { ...t, status: null, error: 'Invalid URL', internal: true };
        }
        const internal = u.origin === origin;
        const r = await hostLimit(u.host)(() => total(() => probe(t.url, opts)));
        return { ...t, ...r, internal };
      }),
    );

    const isBroken = (p: LinkProbe) =>
      !p.blocked &&
      ((p.kind === 'image' && brokenInPage.has(p.url)) ||
        (p.status === null && !p.unverified) ||
        (p.status !== null && p.status >= 400 && !RESTRICTED.has(p.status)));
    const broken = probes.filter(isBroken);
    const restricted = probes.filter(
      (p) => !isBroken(p) && (p.blocked || p.unverified || (p.status !== null && RESTRICTED.has(p.status))),
    );

    const brokenLinks = broken.filter((p) => p.kind === 'link');
    const brokenImages = broken.filter((p) => p.kind === 'image');
    const internalBroken = broken.filter((p) => p.internal);

    let status: 'pass' | 'warn' | 'fail' = 'pass';
    if (internalBroken.length > 0 || brokenImages.length > 0) status = 'fail';
    else if (broken.length > 0 || restricted.length > 0) status = 'warn';

    return outcome(
      status,
      {
        linksChecked: linkTargets.length,
        imagesChecked: imgs.length,
        brokenLinks: brokenLinks.length,
        brokenImages: brokenImages.length,
        restricted: restricted.length,
      } satisfies LinksSummary,
      {
        brokenLinks,
        brokenImages,
        restricted,
        skipped,
        truncated: targets.length > MAX_LINKS || imageTargets.length > MAX_IMAGES,
        totalLinksFound: raw.links.length,
        totalImagesFound: raw.images.length,
      } satisfies LinksDetails,
    );
  },
};
