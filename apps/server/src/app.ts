import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import { queueStats } from './audit/queue.js';
import { pool } from './db/client.js';
import { ownerMiddleware } from './lib/owner.js';
import { auditsRouter } from './routes/audits.js';

/** Builds the Express app (no listening) so tests can drive it with supertest. */
export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // correct client IPs + req.secure behind a reverse proxy
  app.disable('x-powered-by');
  // credentials: true so the anonymous owner cookie works when the web app is on another origin
  app.use(cors({ origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (_req, res) => {
    const dbOk = await pool
      .query('select 1')
      .then(() => true)
      .catch(() => false);
    res.json({ ok: dbOk, db: dbOk, queue: queueStats() });
  });

  app.use('/api/audits', ownerMiddleware, auditsRouter);
  app.use('/artifacts', express.static(config.ARTIFACTS_DIR, { maxAge: '7d', fallthrough: false }));

  // Single-service deploy: serve the built React app (apps/web/dist) with an SPA fallback.
  const indexHtml = path.join(config.WEB_DIST_DIR, 'index.html');
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.WEB_DIST_DIR, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/|artifacts\/).*/, (_req, res) => res.sendFile(indexHtml));
  }

  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
    console.error('[api]', err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
