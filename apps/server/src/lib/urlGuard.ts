import dns from 'node:dns/promises';
import net from 'node:net';

export class UrlValidationError extends Error {}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

/**
 * Normalizes user input into an absolute http(s) URL.
 * When allowPrivate is false, rejects hosts that resolve to loopback/private ranges (basic SSRF guard).
 */
export async function normalizeAuditUrl(input: string, allowPrivate: boolean): Promise<string> {
  let raw = input.trim();
  if (!raw) throw new UrlValidationError('URL is required');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UrlValidationError('Not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new UrlValidationError('Only http and https URLs are supported');
  }
  if (!url.hostname) throw new UrlValidationError('URL has no host');
  if (url.username || url.password) throw new UrlValidationError('Credentials in URLs are not allowed');

  if (!allowPrivate) {
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost')) {
      throw new UrlValidationError('Private/localhost targets are disabled on this server');
    }
    const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
    if (addrs.length === 0) throw new UrlValidationError(`Could not resolve host "${host}"`);
    if (addrs.some(isPrivateIp)) throw new UrlValidationError('Private/localhost targets are disabled on this server');
  }

  url.hash = '';
  return url.toString();
}

export { isPrivateIp };

const hostCache = new Map<string, { privateHost: boolean; at: number }>();
const HOST_CACHE_TTL = 5 * 60_000;

/**
 * True if `hostname` is localhost or resolves to any private/loopback address.
 * Unresolvable hosts return false (the request will simply fail on its own).
 */
export async function resolvesToPrivate(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (net.isIP(host)) return isPrivateIp(host);
  const cached = hostCache.get(host);
  if (cached && Date.now() - cached.at < HOST_CACHE_TTL) return cached.privateHost;
  const addrs = (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  const privateHost = addrs.some(isPrivateIp);
  hostCache.set(host, { privateHost, at: Date.now() });
  return privateHost;
}

/**
 * Follows the redirect chain of `url` manually (no request is sent to a host before it is checked)
 * and throws if any hop points into a private network. Used before navigating when private hosts
 * are disallowed, because browser-level request routing does not see redirect hops.
 */
export async function assertSafeRedirectChain(url: string, userAgent: string, maxHops = 10): Promise<void> {
  let current = url;
  for (let hop = 0; hop <= maxHops; hop++) {
    const u = new URL(current);
    if (await resolvesToPrivate(u.hostname)) {
      throw new UrlValidationError(`Blocked: ${hop === 0 ? 'target' : 'redirect'} points to a private network (${u.hostname})`);
    }
    const res = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      headers: { 'User-Agent': userAgent, Accept: 'text/html,*/*;q=0.8' },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!res) return; // network errors are reported later by the real navigation
    await res.body?.cancel().catch(() => {});
    const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!location) return;
    current = new URL(location, current).toString();
  }
}
