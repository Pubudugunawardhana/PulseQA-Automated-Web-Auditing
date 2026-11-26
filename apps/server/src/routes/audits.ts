import fs from 'node:fs/promises';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { CHECK_IDS, type AuditEvent } from '@pulseqa/shared';
import { config } from '../config.js';
import { subscribe } from '../audit/events.js';
import {
  createAudit,
  deleteAudit,
  deleteAudits,
  findActiveDuplicate,
  findOverflowAudits,
  getAuditDetail,
  getAuditOwner,
  getPreviousAudit,
  getUrlHistory,
  getVisualBaseline,
  setVisualBaseline,
  listAudits,
} from '../audit/repository.js';
import { scheduleAudit } from '../audit/runner.js';
import { cancel, isTracked } from '../audit/queue.js';
import { normalizeAuditUrl, UrlValidationError } from '../lib/urlGuard.js';

export const auditsRouter = Router();

const createSchema = z.object({
  url: z.string().min(1).max(2048),
  checks: z.array(z.enum(CHECK_IDS)).min(1).optional(),
});

const uuid = z.string().uuid();

/** Each audit launches a real browser — keep one client from flooding the queue. */
const createLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many audits started — please wait a minute and try again' },
});

auditsRouter.post('/', createLimiter, async (req, res) => {
  const body = createSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.issues[0]?.message ?? 'Invalid request' });

  let url: string;
  try {
    url = await normalizeAuditUrl(body.data.url, config.ALLOW_PRIVATE_HOSTS);
  } catch (err) {
    if (err instanceof UrlValidationError) return res.status(400).json({ error: err.message });
    throw err;
  }

  const checks = body.data.checks ? [...new Set(body.data.checks)] : [...CHECK_IDS];

  // This browser already has the same URL + checks queued/running → return that one instead of a duplicate.
  const existing = await findActiveDuplicate(url, checks, req.ownerHash);
  if (existing && isTracked(existing.id)) return res.status(200).json({ ...existing, deduplicated: true });

  const audit = await createAudit(url, checks, req.ownerHash);
  scheduleAudit(audit.id, url, checks);
  res.status(202).json(audit);
  void pruneHistory(req.ownerHash);
});

/** Keep only the newest HISTORY_LIMIT audits per browser; remove older ones and their screenshots. */
async function pruneHistory(ownerHash: string) {
  try {
    const ids = (await findOverflowAudits(ownerHash, config.HISTORY_LIMIT)).filter((id) => !isTracked(id));
    const deleted = await deleteAudits(ids);
    await Promise.all(deleted.map((id) => fs.rm(path.join(config.ARTIFACTS_DIR, id), { recursive: true, force: true })));
  } catch (err) {
    console.error('History pruning failed:', err);
  }
}

/** History: only the audits created by THIS browser. */
auditsRouter.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim().slice(0, 200) : undefined;
  res.json({ ...(await listAudits(req.ownerHash, page, limit, q)), historyLimit: config.HISTORY_LIMIT, historyMaxAgeDays: config.HISTORY_MAX_AGE_DAYS });
});

/** Anyone with the (unguessable) link can VIEW an audit; `isOwner` tells the UI whether to offer cancel/delete. */
auditsRouter.get('/:id', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'Audit not found' });
  const [audit, owner] = await Promise.all([getAuditDetail(req.params.id), getAuditOwner(req.params.id)]);
  if (!audit) return res.status(404).json({ error: 'Audit not found' });
  const isOwner = owner === req.ownerHash;
  // Baselines are per browser — only the owner learns which run is theirs
  const visualBaseline = isOwner && audit.checks.includes('visual') ? await getVisualBaseline(req.ownerHash, audit.url) : null;
  res.json({ ...audit, isOwner, visualBaseline, isVisualBaseline: visualBaseline?.auditId === audit.id });
});

/** Approve this run's visual screenshots as the baseline future runs of the URL are compared with. Owner only. */
auditsRouter.post('/:id/baseline', async (req, res) => {
  const id = String(req.params.id);
  if (!uuid.safeParse(id).success) return res.status(404).json({ error: 'Audit not found' });
  const [audit, owner] = await Promise.all([getAuditDetail(id), getAuditOwner(id)]);
  if (!audit) return res.status(404).json({ error: 'Audit not found' });
  if (owner !== req.ownerHash) return res.status(403).json({ error: 'Only the person who ran this audit can approve it as a baseline' });
  const visual = audit.results.find((r) => r.checkId === 'visual');
  if (audit.status !== 'completed' || !visual || visual.status === 'error' || visual.status === 'skipped' || visual.screenshots.length === 0)
    return res.status(409).json({ error: 'This audit has no visual screenshots to use as a baseline' });
  res.json(await setVisualBaseline(req.ownerHash, audit.url, id));
});

/** Previous completed run of the same URL by the same owner (compare view). Owner only; 204 when none. */
auditsRouter.get('/:id/previous', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'Audit not found' });
  if ((await getAuditOwner(req.params.id)) !== req.ownerHash) return res.status(204).end();
  const prev = await getPreviousAudit(req.params.id);
  if (!prev) return res.status(204).end();
  res.json(prev);
});

auditsRouter.get('/:id/history', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'Audit not found' });
  // Trends reveal the owner's other runs, so only the owner gets them
  if ((await getAuditOwner(req.params.id)) !== req.ownerHash) return res.json([]);
  res.json(await getUrlHistory(req.params.id));
});

auditsRouter.post('/:id/cancel', async (req, res) => {
  const id = String(req.params.id);
  if (!uuid.safeParse(id).success) return res.status(404).json({ error: 'Audit not found' });
  const owner = await getAuditOwner(id);
  if (owner === undefined) return res.status(404).json({ error: 'Audit not found' });
  if (owner !== req.ownerHash) return res.status(403).json({ error: 'Only the person who started this audit can cancel it' });
  if (!cancel(id)) return res.status(409).json({ error: 'Audit is not running' });
  res.status(202).json({ ok: true });
});

auditsRouter.get('/:id/events', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  if (!uuid.safeParse(id).success) return res.status(404).end();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (e: AuditEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`);

  // Subscribe first so nothing is missed between snapshot and live events.
  const unsubscribe = subscribe(id, (e) => {
    send(e);
    if (e.type === 'audit:completed' || e.type === 'audit:failed') close();
  });
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  }
  req.on('close', close);

  const snapshot = await getAuditDetail(id).catch(() => null);
  if (!snapshot) {
    send({ type: 'audit:failed', auditId: id, error: 'Audit not found' });
    return close();
  }
  const owner = await getAuditOwner(id).catch(() => undefined);
  send({ type: 'snapshot', audit: { ...snapshot, isOwner: owner === req.ownerHash } });
  if (!['queued', 'running'].includes(snapshot.status)) close();
  else if (!isTracked(id)) {
    // DB says running but this process doesn't own it (e.g. after a restart)
    send({ type: 'audit:failed', auditId: id, error: 'Audit is no longer running' });
    close();
  }
});

auditsRouter.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  if (!uuid.safeParse(id).success) return res.status(404).json({ error: 'Audit not found' });
  const owner = await getAuditOwner(id);
  if (owner === undefined) return res.status(404).json({ error: 'Audit not found' });
  if (owner !== req.ownerHash) return res.status(403).json({ error: 'Only the person who started this audit can delete it' });
  if (isTracked(id)) return res.status(409).json({ error: 'Audit is still running' });
  const ok = await deleteAudit(id);
  if (!ok) return res.status(404).json({ error: 'Audit not found' });
  await fs.rm(path.join(config.ARTIFACTS_DIR, id), { recursive: true, force: true });
  res.status(204).end();
});
