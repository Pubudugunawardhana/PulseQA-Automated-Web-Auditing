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
