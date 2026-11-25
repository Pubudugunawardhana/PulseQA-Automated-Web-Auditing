import { outcome, type Check } from '../types.js';

interface HeaderCheck {
  header: string;
  present: boolean;
  value: string | null;
  ok: boolean;
  recommendation: string;
}

export const securityCheck: Check = {
  id: 'security',
  timeoutMs: 20_000,
  requiresPage: false,
  async run(ctx) {
    const res = ctx.mainResponse;
    if (!res) return outcome('fail', { https: false }, { issues: ['No response to inspect'] });

    const finalUrl = new URL(ctx.page.url() || res.url());
    const https = finalUrl.protocol === 'https:';
    const headers = await res.allHeaders();
    const h = (name: string) => headers[name.toLowerCase()] ?? null;

    // Does plain http:// redirect to https://?
    let httpRedirectsToHttps: boolean | null = null;
    if (https) {
      const httpUrl = new URL(finalUrl.toString());
      httpUrl.protocol = 'http:';
      try {
        const r = await ctx.context.request.get(httpUrl.toString(), { maxRedirects: 5, timeout: 8_000 });
        httpRedirectsToHttps = new URL(r.url()).protocol === 'https:';
        await r.dispose();
      } catch {
        httpRedirectsToHttps = null; // port 80 closed etc. -> not determinable
      }
    }

    const csp = h('content-security-policy');
    const xfo = h('x-frame-options');
    const hsts = h('strict-transport-security');
    const xcto = h('x-content-type-options');

    const checks: HeaderCheck[] = [
      {
        header: 'Content-Security-Policy',
        present: !!csp,
        value: csp,
        ok: !!csp,
        recommendation: 'Define a CSP to mitigate XSS and data injection attacks.',
      },
      {
        header: 'X-Frame-Options',
        present: !!xfo,
        value: xfo,
        ok: !!xfo || /frame-ancestors/i.test(csp ?? ''),
        recommendation: 'Set X-Frame-Options: DENY/SAMEORIGIN or CSP frame-ancestors to prevent clickjacking.',
      },
      {
        header: 'Strict-Transport-Security',
        present: !!hsts,
        value: hsts,
        ok: !https || !!hsts,
        recommendation: 'Enable HSTS (e.g. max-age=31536000; includeSubDomains) to force HTTPS.',
      },
      {
        header: 'X-Content-Type-Options',
        present: !!xcto,
        value: xcto,
        ok: (xcto ?? '').toLowerCase() === 'nosniff',
        recommendation: 'Set X-Content-Type-Options: nosniff to stop MIME sniffing.',
      },
      {
        header: 'Referrer-Policy',
        present: !!h('referrer-policy'),
        value: h('referrer-policy'),
        ok: !!h('referrer-policy'),
        recommendation: 'Set a Referrer-Policy such as strict-origin-when-cross-origin.',
      },
      {
        header: 'Permissions-Policy',
        present: !!h('permissions-policy'),
        value: h('permissions-policy'),
        ok: !!h('permissions-policy'),
        recommendation: 'Restrict powerful browser features with a Permissions-Policy.',
      },
    ];

    const mixedContent = https
      ? [...new Set(ctx.collected.requestUrls.filter((u) => u.startsWith('http://')))].slice(0, 50)
      : [];

    const cookies = (await ctx.context.cookies(finalUrl.toString()).catch(() => [])).map((c) => ({
      name: c.name,
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: c.sameSite,
    }));
    const insecureCookies = cookies.filter((c) => (https && !c.secure) || !c.httpOnly);

    const issues: string[] = [];
    if (!https) issues.push('Site is not served over HTTPS');
    if (httpRedirectsToHttps === false) issues.push('http:// version does not redirect to https://');
    for (const c of checks) if (!c.ok) issues.push(`Missing or weak ${c.header}`);
    if (mixedContent.length) issues.push(`${mixedContent.length} insecure (http://) resources loaded on an HTTPS page`);
    if (h('server')) issues.push(`Server header discloses software: "${h('server')}"`);
    if (h('x-powered-by')) issues.push(`X-Powered-By header discloses: "${h('x-powered-by')}"`);

    const missing = checks.filter((c) => !c.ok).length;
    let status: 'pass' | 'warn' | 'fail' = 'pass';
    if (!https || mixedContent.length > 0) status = 'fail';
    else if (missing > 0 || httpRedirectsToHttps === false || insecureCookies.length > 0) status = 'warn';

    return outcome(
      status,
      { https, headersPassed: checks.length - missing, headersTotal: checks.length, mixedContent: mixedContent.length },
      { issues, headers: checks, httpRedirectsToHttps, mixedContent, cookies, insecureCookies },
    );
  },
};
