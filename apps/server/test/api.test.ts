import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditDTO } from '@pulseqa/shared';

// Config is validated at import time; the pool never connects because the DB layer is mocked.
vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
  process.env.ALLOW_PRIVATE_HOSTS = 'true';
});

const repo = vi.hoisted(() => ({
  createAudit: vi.fn(),
  findActiveDuplicate: vi.fn(),
  listAudits: vi.fn(),
  getAuditDetail: vi.fn(),
  getAuditOwner: vi.fn(),
  getPreviousAudit: vi.fn(),
  deleteAudit: vi.fn(),
  failInterruptedAudits: vi.fn(),
}));
const runner = vi.hoisted(() => ({ scheduleAudit: vi.fn() }));
const queue = vi.hoisted(() => ({ cancel: vi.fn(), isTracked: vi.fn(), queueStats: vi.fn(() => ({ active: 0, pending: 0 })) }));

vi.mock('../src/audit/repository.js', () => repo);
vi.mock('../src/audit/runner.js', () => runner);
vi.mock('../src/audit/queue.js', () => queue);

const { createApp } = await import('../src/app.js');
const { hashOwner, OWNER_COOKIE } = await import('../src/lib/owner.js');
const app = createApp();

// Two different browsers
const ALICE = 'a'.repeat(43);
const BOB = 'b'.repeat(43);
const asAlice = `${OWNER_COOKIE}=${ALICE}`;
const asBob = `${OWNER_COOKIE}=${BOB}`;
const ALICE_HASH = hashOwner(ALICE);

const ID = '3f2b8c1e-4a5d-4e6f-8a9b-0c1d2e3f4a5b';
const audit = (over: Partial<AuditDTO> = {}): AuditDTO => ({
  id: ID,
  url: 'https://example.com/',
  finalUrl: null,
  status: 'queued',
  overallStatus: null,
  score: null,
  checks: ['smoke'],
  createdAt: new Date().toISOString(),
  startedAt: null,
  finishedAt: null,
  durationMs: null,
  error: null,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('anonymous ownership', () => {
  it('gives a new browser an httpOnly owner cookie and never stores the raw secret', async () => {
    repo.listAudits.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    const res = await request(app).get('/api/audits').expect(200);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(new RegExp(`^${OWNER_COOKIE}=[A-Za-z0-9_-]{43};`));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    const secret = cookie.split(';')[0].split('=')[1];
    expect(repo.listAudits).toHaveBeenCalledWith(hashOwner(secret), 1, 20, undefined);
  });

  it('keeps an existing cookie and scopes history to that browser', async () => {
    repo.listAudits.mockResolvedValue({ items: [], total: 0, page: 2, limit: 5 });
    const res = await request(app).get('/api/audits?page=2&limit=5&q=github').set('Cookie', asAlice).expect(200);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(repo.listAudits).toHaveBeenCalledWith(ALICE_HASH, 2, 5, 'github');
  });

  it('lets anyone view a shared audit link, but flags who owns it', async () => {
    repo.getAuditDetail.mockResolvedValue({ ...audit(), results: [] });
    repo.getAuditOwner.mockResolvedValue(ALICE_HASH);
    expect((await request(app).get(`/api/audits/${ID}`).set('Cookie', asAlice).expect(200)).body.isOwner).toBe(true);
    expect((await request(app).get(`/api/audits/${ID}`).set('Cookie', asBob).expect(200)).body.isOwner).toBe(false);
  });

  it('only the owner can cancel or delete', async () => {
    repo.getAuditOwner.mockResolvedValue(ALICE_HASH);
    queue.cancel.mockReturnValue(true);
    queue.isTracked.mockReturnValue(false);
    repo.deleteAudit.mockResolvedValue(true);

    await request(app).post(`/api/audits/${ID}/cancel`).set('Cookie', asBob).expect(403);
    await request(app).delete(`/api/audits/${ID}`).set('Cookie', asBob).expect(403);
    expect(queue.cancel).not.toHaveBeenCalled();
    expect(repo.deleteAudit).not.toHaveBeenCalled();

    await request(app).post(`/api/audits/${ID}/cancel`).set('Cookie', asAlice).expect(202);
    await request(app).delete(`/api/audits/${ID}`).set('Cookie', asAlice).expect(204);
  });

  it("doesn't reveal the owner's previous runs to other viewers", async () => {
    repo.getAuditOwner.mockResolvedValue(ALICE_HASH);
    repo.getPreviousAudit.mockResolvedValue({ ...audit(), results: [] });
    await request(app).get(`/api/audits/${ID}/previous`).set('Cookie', asBob).expect(204);
    expect(repo.getPreviousAudit).not.toHaveBeenCalled();
    await request(app).get(`/api/audits/${ID}/previous`).set('Cookie', asAlice).expect(200);
  });
});

describe('POST /api/audits', () => {
  it('rejects bad input with 400', async () => {
    await request(app).post('/api/audits').send({}).expect(400);
    const res = await request(app).post('/api/audits').send({ url: 'ftp://x.com' }).expect(400);
    expect(res.body.error).toMatch(/http/);
    await request(app).post('/api/audits').send({ url: 'example.com', checks: ['nope'] }).expect(400);
    expect(runner.scheduleAudit).not.toHaveBeenCalled();
  });

  it('normalizes the url, creates the audit for this browser and schedules it (202)', async () => {
    repo.findActiveDuplicate.mockResolvedValue(null);
    repo.createAudit.mockResolvedValue(audit());
    const res = await request(app)
      .post('/api/audits')
      .set('Cookie', asAlice)
      .send({ url: 'example.com', checks: ['smoke', 'smoke'] })
      .expect(202);
    expect(res.body.id).toBe(ID);
    expect(repo.createAudit).toHaveBeenCalledWith('https://example.com/', ['smoke'], ALICE_HASH);
    expect(runner.scheduleAudit).toHaveBeenCalledWith(ID, 'https://example.com/', ['smoke']);
  });

  it('returns the running duplicate instead of starting a second one', async () => {
    repo.findActiveDuplicate.mockResolvedValue(audit({ status: 'running' }));
    queue.isTracked.mockReturnValue(true);
    const res = await request(app).post('/api/audits').set('Cookie', asAlice).send({ url: 'https://example.com', checks: ['smoke'] }).expect(200);
    expect(res.body).toMatchObject({ id: ID, deduplicated: true });
    expect(repo.findActiveDuplicate).toHaveBeenCalledWith('https://example.com/', ['smoke'], ALICE_HASH);
    expect(repo.createAudit).not.toHaveBeenCalled();
  });
});

describe('GET /api/audits/:id', () => {
  it('404s on unknown or malformed ids', async () => {
    await request(app).get('/api/audits/not-a-uuid').expect(404);
    repo.getAuditDetail.mockResolvedValue(null);
    repo.getAuditOwner.mockResolvedValue(undefined);
    await request(app).get(`/api/audits/${ID}`).expect(404);
  });

  it('cancel answers 409 when the owner’s audit is not running', async () => {
    repo.getAuditOwner.mockResolvedValue(ALICE_HASH);
    queue.cancel.mockReturnValue(false);
    await request(app).post(`/api/audits/${ID}/cancel`).set('Cookie', asAlice).expect(409);
  });

  it('refuses to delete a running audit', async () => {
    repo.getAuditOwner.mockResolvedValue(ALICE_HASH);
    queue.isTracked.mockReturnValue(true);
    await request(app).delete(`/api/audits/${ID}`).set('Cookie', asAlice).expect(409);
    expect(repo.deleteAudit).not.toHaveBeenCalled();
  });
});

describe('rate limiting', () => {
  it('limits audit creation per client', async () => {
    repo.findActiveDuplicate.mockResolvedValue(null);
    repo.createAudit.mockResolvedValue(audit());
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await request(app).post('/api/audits').set('Cookie', asAlice).send({ url: 'example.com' })).status);
    }
    expect(statuses).toContain(429);
  });
});
