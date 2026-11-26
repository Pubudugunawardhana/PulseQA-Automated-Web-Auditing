import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
// 1x1 transparent PNG
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

/** Serves test/fixtures. good.html gets security headers, everything else gets none. */
export function startFixtureServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const port = (server.address() as AddressInfo).port;
    if (url.pathname === '/pixel.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      return res.end(PIXEL);
    }
    // Page on 127.0.0.1 whose only errors come from a script on "localhost" (a different site = third-party)
    if (url.pathname === '/thirdparty.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(
        `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>3p</title></head>` +
          `<body><h1>Third-party noise</h1><script src="http://localhost:${port}/tp.js"></script></body></html>`,
      );
    }
    if (url.pathname === '/tp.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      return res.end(`console.error('third-party widget failed'); setTimeout(function tpCrash(){ throw new Error('third-party crash'); }, 0);`);
    }
    // Never-finishing response, for cancel / timeout tests
    if (url.pathname === '/slow.html') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.write('<!doctype html><title>slow</title><img src="/hang.png">');
      return; // keep the connection open
    }
    if (url.pathname === '/hang.png') return; // never responds
    if (url.pathname === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end(`User-agent: *
Allow: /

Sitemap: http://127.0.0.1:${port}/sitemap.xml
`);
    }
    if (url.pathname === '/sitemap.xml') {
      res.writeHead(200, { 'Content-Type': 'application/xml' });
      return res.end(
        `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
          `<url><loc>http://127.0.0.1:${port}/good.html</loc></url></urlset>`,
      );
    }
    // Visual regression: v=2 adds a large coloured block the baseline (v=1) doesn't have
    if (url.pathname === '/visual.html') {
      const v2 = url.searchParams.get('v') === '2';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(
        `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>visual</title>` +
          `<style>body{margin:0;font:16px sans-serif;background:#fff}main{padding:24px}.hero{height:300px;background:#e5e7eb}` +
          `.promo{height:200px;background:#ef4444}</style></head><body><main><h1>Visual fixture</h1><div class="hero"></div>` +
          `${v2 ? '<div class="promo"></div>' : ''}<p>Footer text</p></main></body></html>`,
      );
    }
    // Cross-browser: breaks only in Firefox
    if (url.pathname === '/xb.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(
        `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"><title>xb</title></head>` +
          `<body><h1>Cross-browser fixture</h1><script>if (navigator.userAgent.includes('Firefox')) { setTimeout(function () { throw new Error('firefox-only failure'); }, 0); }</script></body></html>`,
      );
    }
    const file = path.join(dir, path.basename(url.pathname));
    if (url.pathname.endsWith('.html') && fs.existsSync(file)) {
      const headers: Record<string, string> = { 'Content-Type': 'text/html; charset=utf-8' };
      if (url.pathname === '/good.html') {
        Object.assign(headers, {
          'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=()',
        });
      }
      res.writeHead(200, headers);
      return res.end(fs.readFileSync(file));
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((r) => {
            server.closeAllConnections(); // drop the hanging /slow.html sockets
            server.close(() => r());
          }),
      });
    });
  });
}
