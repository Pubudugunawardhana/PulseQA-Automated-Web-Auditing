import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import { queueStats } from './audit/queue.js';
import { pool } from './db/client.js';
import { auditsRouter } from './routes/audits.js';

/** Builds the Express app (no listening) so tests can drive it with supertest. */
export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // correct client IPs behind a reverse proxy (rate limiting)
  app.use(cors({ origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()) }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', async (_req, res) => {
    const dbOk = await pool
      .query('select 1')
      .then(() => true)
      .catch(() => false);
    res.json({ ok: dbOk, db: dbOk, queue: queueStats() });
  });

  app.use('/api/audits', auditsRouter);
  app.use('/artifacts', express.static(config.ARTIFACTS_DIR, { maxAge: '7d', fallthrough: false }));

  app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
    console.error('[api]', err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
