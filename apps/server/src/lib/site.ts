/**
 * Approximate "registrable domain" (eTLD+1) without a full public-suffix list:
 * app.example.com -> example.com, shop.example.co.uk -> example.co.uk.
 * Good enough to tell first-party from third-party origins.
 */
export function siteOf(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (/^[\d.]+$/.test(host) || host.includes(':') || !host.includes('.')) return host; // IPs, localhost
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  // co.uk, com.au, org.lk, ac.lk, gov.lk ...
  const secondLevelSuffix = tld.length === 2 && (sld.length <= 3 || ['govt', 'gouv'].includes(sld));
  return parts.slice(secondLevelSuffix ? -3 : -2).join('.');
}

/** Site of a URL string; null if it isn't an http(s) URL. */
export function siteOfUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? siteOf(u.hostname) : null;
  } catch {
    return null;
  }
}

/** First http(s) URL mentioned in a text (e.g. a stack trace or console location). */
export function firstUrlIn(text: string | undefined): string | null {
  return text?.match(/https?:\/\/[^\s)'"]+/)?.[0] ?? null;
}
