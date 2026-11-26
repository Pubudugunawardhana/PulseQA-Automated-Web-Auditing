import { resolvesToPrivate } from './urlGuard.js';

const MAX_REDIRECTS = 5;

/**
 * GET a small text resource (robots.txt, sitemap.xml) with redirects followed MANUALLY so every hop
 * passes the private-network guard. The body is capped so a huge file can't exhaust memory.
 */
export async function fetchText(
  url: string,
  opts: { allowPrivateHosts: boolean; signal: AbortSignal; userAgent: string; timeoutMs?: number; maxBytes?: number },
): Promise<{ status: number | null; url: string; text: string | null; contentType: string | null; error?: string }> {
  const maxBytes = opts.maxBytes ?? 2_000_000;
  let current = url;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const u = new URL(current);
      if (!opts.allowPrivateHosts && (await resolvesToPrivate(u.hostname))) {
        return { status: null, url: current, text: null, contentType: null, error: 'Blocked: points to a private network' };
      }
      const res = await fetch(current, {
        redirect: 'manual',
        headers: { 'User-Agent': opts.userAgent, Accept: 'text/plain,application/xml,text/xml,*/*;q=0.8' },
        signal: AbortSignal.any([opts.signal, AbortSignal.timeout(opts.timeoutMs ?? 10_000)]),
      });
      const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (location) {
        await res.body?.cancel().catch(() => {});
        current = new URL(location, current).toString();
        continue;
      }
      let text: string | null = null;
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) {
            await reader.cancel().catch(() => {});
            break;
          }
          chunks.push(value);
        }
        text = Buffer.concat(chunks).toString('utf8');
      } else {
        await res.body?.cancel().catch(() => {});
      }
      return { status: res.status, url: current, text, contentType: res.headers.get('content-type') };
    }
    return { status: null, url: current, text: null, contentType: null, error: `More than ${MAX_REDIRECTS} redirects` };
  } catch (err) {
    return { status: null, url: current, text: null, contentType: null, error: (err as Error).message.split('\n')[0] };
  }
}

/** Parses robots.txt: does the `*` group disallow the whole site, and which sitemaps are listed. */
export function parseRobots(text: string): { blocksAll: boolean; sitemaps: string[] } {
  const sitemaps: string[] = [];
  let inStar = false;
  let groupStarted = false;
  let blocksAll = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const value = line.slice(i + 1).trim();
    if (key === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === 'user-agent') {
      // consecutive user-agent lines belong to the same group
      if (groupStarted) {
        inStar = false;
        groupStarted = false;
      }
      if (value === '*') inStar = true;
      continue;
    }
    groupStarted = true;
    if (inStar && key === 'disallow' && value === '/') blocksAll = true;
    if (inStar && key === 'allow' && value === '/') blocksAll = false;
  }
  return { blocksAll, sitemaps };
}
