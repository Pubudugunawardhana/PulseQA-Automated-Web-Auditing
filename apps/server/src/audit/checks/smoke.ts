import type { Request } from 'playwright';
import type { SmokeDetails, SmokeSummary } from '@pulseqa/shared';
import { outcome, type Check } from '../types.js';

export const smokeCheck: Check = {
  id: 'smoke',
  timeoutMs: 30_000,
  requiresPage: false,
  async run(ctx) {
    const res = ctx.mainResponse;
    if (!res) {
      return outcome('fail', { reachable: false } satisfies SmokeSummary, { issues: ['No response received for the main document'] } satisfies SmokeDetails);
    }

    // Redirect chain (oldest first)
    const chain: { url: string; status: number | null }[] = [];
    let req: Request | null = res.request();
    while (req) {
      const r = await req.response().catch(() => null);
      chain.unshift({ url: req.url(), status: r?.status() ?? null });
      req = req.redirectedFrom();
    }

    const status = res.status();
    const title = (await ctx.page.title().catch(() => '')).trim();
    const body = await ctx.page
      .evaluate(() => ({
        textLength: (document.body?.innerText ?? '').trim().length,
        elementCount: document.body ? document.body.querySelectorAll('*').length : 0,
        lang: document.documentElement.getAttribute('lang'),
        hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
        metaDescription: document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || null,
        hasFaviconLink: !!document.querySelector('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'),
        h1Count: document.querySelectorAll('h1').length,
      }))
      .catch(() => ({ textLength: 0, elementCount: 0, lang: null, hasViewportMeta: false, metaDescription: null, hasFaviconLink: false, h1Count: 0 }));

    // No <link rel=icon>? Browsers fall back to /favicon.ico — check that it exists.
    let hasFavicon = body.hasFaviconLink;
    if (!hasFavicon) {
      const fav = await ctx.context.request
        .get(new URL('/favicon.ico', ctx.page.url()).toString(), { timeout: 5_000, failOnStatusCode: false })
        .catch(() => null);
      hasFavicon = !!fav && fav.status() < 400;
      await fav?.dispose();
    }

    const shot = await ctx.page.screenshot({ fullPage: false }).catch(() => null);
    const screenshots = shot ? [await ctx.saveScreenshot('desktop-above-fold', shot)] : [];

    const issues: string[] = [];
    const notes: string[] = [];
    let state: 'pass' | 'warn' | 'fail' = 'pass';
    if (status >= 500) {
      issues.push(`Server error: HTTP ${status}`);
      state = 'fail';
    } else if (status === 404) {
      issues.push('Page not found: HTTP 404');
      state = 'fail';
    } else if (status >= 400) {
      issues.push(`Client error: HTTP ${status}`);
      state = 'fail';
    }
    if (!title) {
      issues.push('Page title is empty');
      if (state === 'pass') state = 'warn';
    }
    if (body.textLength === 0 && body.elementCount < 3) {
      issues.push('Page body appears blank (nothing rendered)');
      state = 'fail';
    }
    if (!body.hasViewportMeta) {
      issues.push('Missing <meta name="viewport"> tag (page will not scale on mobile)');
      if (state === 'pass') state = 'warn';
    }

    // Informational hygiene / SEO notes — never change the status
    if (!body.metaDescription) notes.push('No <meta name="description"> (search engines will pick a snippet themselves)');
    if (!hasFavicon) notes.push('No favicon found (<link rel="icon"> or /favicon.ico)');
    if (!body.lang) notes.push('<html> has no lang attribute');
    if (body.h1Count === 0) notes.push('No <h1> heading on the page');
    else if (body.h1Count > 1) notes.push(`${body.h1Count} <h1> headings (one main heading is recommended)`);

    const { hasFaviconLink: _ignored, ...bodyInfo } = body;
    return outcome(
      state,
      { httpStatus: status, title: title || null, redirects: chain.length - 1, finalUrl: ctx.page.url() } satisfies SmokeSummary,
      { issues, notes, redirectChain: chain, statusText: res.statusText(), ...bodyInfo, hasFavicon } satisfies SmokeDetails,
      screenshots,
    );
  },
};
