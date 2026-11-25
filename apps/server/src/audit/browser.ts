import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type CDPSession, type Page } from 'playwright';
import { resolvesToPrivate } from '../lib/urlGuard.js';

let browserPromise: Promise<Browser> | null = null;

/** Lazily launches a single shared Chromium instance; relaunches if it crashed. */
export async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    if (b?.isConnected()) return b;
  }
  browserPromise = chromium.launch({ headless: true });
  const browser = await browserPromise;
  browser.on('disconnected', () => {
    browserPromise = null;
  });
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const b = await browserPromise.catch(() => null);
  browserPromise = null;
  await b?.close().catch(() => {});
}

export type DeviceProfile = 'desktop' | 'tablet' | 'mobile';

/**
 * Real-browser User-Agent strings. The default "HeadlessChrome" UA gets bot-blocked or served
 * a different page by many sites, and a desktop UA on a phone viewport gets the desktop layout.
 * NOTE: never add custom headers via setExtraHTTPHeaders — they apply to every subresource and
 * trigger CORS preflights that CDNs reject (CSS/JS silently fail to load).
 */
export function userAgentFor(browser: Browser, profile: DeviceProfile): string {
  const v = browser.version();
  switch (profile) {
    case 'mobile':
      return `Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Mobile Safari/537.36`;
    case 'tablet':
      return `Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`;
    default:
      return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`;
  }
}

/**
 * tsx/esbuild (keepNames) wraps functions in `__name(fn, "name")`. Functions passed to
 * page.evaluate are serialized into the browser, where that helper doesn't exist.
 */
const NAME_SHIM = 'globalThis.__name = globalThis.__name || function (fn) { return fn; };';

export interface AuditContextOptions {
  profile?: DeviceProfile;
  /** When false, every request to a private/loopback host is aborted (SSRF guard). */
  allowPrivateHosts?: boolean;
}

/**
 * Creates a context inside the SHARED browser (no extra browser process — keeps RAM low)
 * with a realistic UA, the evaluate shim and, if required, the private-network guard.
 */
export async function newAuditContext(
  browser: Browser,
  options: BrowserContextOptions = {},
  { profile = 'desktop', allowPrivateHosts = true }: AuditContextOptions = {},
): Promise<BrowserContext> {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    userAgent: userAgentFor(browser, profile),
    locale: 'en-US',
    ...options,
  });
  await context.addInitScript(NAME_SHIM);
  if (!allowPrivateHosts) {
    await context.route('**/*', async (route) => {
      let host: string;
      try {
        const u = new URL(route.request().url());
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return route.continue();
        host = u.hostname;
      } catch {
        return route.continue();
      }
      if (await resolvesToPrivate(host)) return route.abort('blockedbyclient');
      return route.continue();
    });
  }
  return context;
}

/** Lighthouse-style mobile conditions: ~1.6 Mbps down, 750 Kbps up, 150 ms RTT, 4× CPU slowdown. */
export const MOBILE_THROTTLING = {
  label: 'mobile · 4G (1.6 Mbps, 150 ms RTT) · 4× CPU',
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  cpuRate: 4,
};

export async function applyMobileThrottling(context: BrowserContext, page: Page): Promise<CDPSession> {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: MOBILE_THROTTLING.latency,
    downloadThroughput: MOBILE_THROTTLING.downloadThroughput,
    uploadThroughput: MOBILE_THROTTLING.uploadThroughput,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: MOBILE_THROTTLING.cpuRate });
  return cdp;
}
