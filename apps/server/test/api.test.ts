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
  getUrlHistory: vi.fn(),
  deleteAudit: vi.fn(),
  findOverflowAudits: vi.fn(async (): Promise<string[]> => []),
  deleteAudits: vi.fn(async (ids: string[]) => ids),
  getVisualBaseline: vi.fn(async () => null),
  findExpiredAudits: vi.fn(async (): Promise<string[]> => []),
  setVisualBaseline: vi.fn(async (_o: string, _u: string, auditId: string) => ({ auditId, approvedAt: new Date().toISOString() })),
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
const { pruneExpiredAudits } = await import('../src/audit/retention.js');

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

  it('only gives score history (trends) to the owner', async () => {
    repo.getAuditOwner.mockResolvedValue(ALICE_HASH);
    repo.getUrlHistory.mockResolvedValue([{ id: ID, createdAt: new Date().toISOString(), score: 80, overallStatus: 'pass', checks: [] }]);
    expect((await request(app).get(`/api/audits/${ID}/history`).set('Cookie', asBob).expect(200)).body).toEqual([]);
    expect(repo.getUrlHistory).not.toHaveBeenCalled();
    const res = await request(app).get(`/api/audits/${ID}/history`).set('Cookie', asAlice).expect(200);
    expect(res.body).toHaveLength(1);
    expect(repo.getUrlHistory).toHaveBeenCalledWith(ID);
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

describe('history limit', () => {
  it('keeps only the newest audits per browser and never prunes running ones', async () => {
    const OLD = '11111111-1111-4111-8111-111111111111';
    const RUNNING = '22222222-2222-4222-8222-222222222222';
    repo.findActiveDuplicate.mockResolvedValue(null);
    repo.createAudit.mockResolvedValue(audit());
    repo.findOverflowAudits.mockResolvedValueOnce([OLD, RUNNING]);
    queue.isTracked.mockImplementation((id: string) => id === RUNNING);
    await request(app).post('/api/audits').set('Cookie', asBob).send({ url: 'example.com' }).expect(202);
    await vi.waitFor(() => expect(repo.deleteAudits).toHaveBeenCalledWith([OLD]));
    expect(repo.findOverflowAudits).toHaveBeenCalledWith(hashOwner(BOB), 10);
    queue.isTracked.mockReset();
  });

  it('tells the UI how many audits are kept, and for how long', async () => {
    repo.listAudits.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    const body = (await request(app).get('/api/audits').set('Cookie', asAlice).expect(200)).body;
    expect(body.historyLimit).toBe(10);
    expect(body.historyMaxAgeDays).toBe(10);
  });

  it('deletes audits older than 10 days, but never a running one', async () => {
    const OLD = '33333333-3333-4333-8333-333333333333';
    const RUNNING = '44444444-4444-4444-8444-444444444444';
    repo.findExpiredAudits.mockResolvedValueOnce([OLD, RUNNING]);
    queue.isTracked.mockImplementation((id: string) => id === RUNNING);
    const now = new Date('2026-11-26T12:00:00Z');
    expect(await pruneExpiredAudits(now)).toBe(1);
    expect(repo.findExpiredAudits).toHaveBeenCalledWith(new Date('2026-11-16T12:00:00Z'));
    expect(repo.deleteAudits).toHaveBeenCalledWith([OLD]);
    queue.isTracked.mockReset();
  });
});

describe('visual baseline', () => {
  const withVisual = (screenshots: { label: string; url: string }[]) => ({
    ...audit({ status: 'completed', checks: ['visual'] }),
    results: [{ checkId: 'visual', status: 'pass', durationMs: 1, summary: {}, details: {}, error: null, screenshots }],
  });

  it('only the owner can approve a run as the baseline', async () => {
    repo.getAuditDetail.mockResolvedValue(withVisual([{ label: 'desktop', url: '/a.png' }]));
    repo.getAuditOwner.mockResolvedValue(ALICE_HASH);
    await request(app).post(`/api/audits/${ID}/baseline`).set('Cookie', asBob).expect(403);
    expect(repo.setVisualBaseline).not.toHaveBeenCalled();
    const res = await request(app).post(`/api/audits/${ID}/baseline`).set('Cookie', asAlice).expect(200);
    expect(res.body.auditId).toBe(ID);
    expect(repo.setVisualBaseline).toHaveBeenCalledWith(ALICE_HASH, 'https://example.com/', ID);
  });

  it('refuses audits without visual screenshots', async () => {
    repo.getAuditDetail.mockResolvedValue(withVisual([]));
    repo.getAuditOwner.mockResolvedValue(ALICE_HASH);
    await request(app).post(`/api/audits/${ID}/baseline`).set('Cookie', asAlice).expect(409);
  });

  it('tells only the owner which run is the baseline', async () => {
    repo.getAuditDetail.mockResolvedValue(withVisual([{ label: 'desktop', url: '/a.png' }]));
    repo.getAuditOwner.mockResolvedValue(ALICE_HASH);
    repo.getVisualBaseline.mockResolvedValue({ auditId: ID, approvedAt: new Date().toISOString() } as never);
    expect((await request(app).get(`/api/audits/${ID}`).set('Cookie', asAlice).expect(200)).body.isVisualBaseline).toBe(true);
    const other = (await request(app).get(`/api/audits/${ID}`).set('Cookie', asBob).expect(200)).body;
    expect(other.visualBaseline).toBeNull();
    expect(other.isVisualBaseline).toBe(false);
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
