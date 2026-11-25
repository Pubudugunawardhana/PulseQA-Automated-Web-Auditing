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
const app = createApp();

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

describe('POST /api/audits', () => {
  it('rejects bad input with 400', async () => {
    await request(app).post('/api/audits').send({}).expect(400);
    const res = await request(app).post('/api/audits').send({ url: 'ftp://x.com' }).expect(400);
    expect(res.body.error).toMatch(/http/);
    await request(app).post('/api/audits').send({ url: 'example.com', checks: ['nope'] }).expect(400);
    expect(runner.scheduleAudit).not.toHaveBeenCalled();
  });

  it('normalizes the url, creates and schedules the audit (202)', async () => {
    repo.findActiveDuplicate.mockResolvedValue(null);
    repo.createAudit.mockResolvedValue(audit());
    const res = await request(app).post('/api/audits').send({ url: 'example.com', checks: ['smoke', 'smoke'] }).expect(202);
    expect(res.body.id).toBe(ID);
    expect(repo.createAudit).toHaveBeenCalledWith('https://example.com/', ['smoke']);
    expect(runner.scheduleAudit).toHaveBeenCalledWith(ID, 'https://example.com/', ['smoke']);
  });

  it('returns the running duplicate instead of starting a second one', async () => {
    repo.findActiveDuplicate.mockResolvedValue(audit({ status: 'running' }));
    queue.isTracked.mockReturnValue(true);
    const res = await request(app).post('/api/audits').send({ url: 'https://example.com', checks: ['smoke'] }).expect(200);
    expect(res.body).toMatchObject({ id: ID, deduplicated: true });
    expect(repo.createAudit).not.toHaveBeenCalled();
  });
});

describe('GET /api/audits', () => {
  it('passes paging and the url filter through', async () => {
    repo.listAudits.mockResolvedValue({ items: [], total: 0, page: 2, limit: 5 });
    await request(app).get('/api/audits?page=2&limit=5&q=github').expect(200);
    expect(repo.listAudits).toHaveBeenCalledWith(2, 5, 'github');
  });

  it('404s on unknown or malformed ids', async () => {
    await request(app).get('/api/audits/not-a-uuid').expect(404);
    repo.getAuditDetail.mockResolvedValue(null);
    await request(app).get(`/api/audits/${ID}`).expect(404);
  });

  it('204s when there is no previous run to compare with', async () => {
    repo.getPreviousAudit.mockResolvedValue(null);
    await request(app).get(`/api/audits/${ID}/previous`).expect(204);
  });
});

describe('cancel & delete', () => {
  it('cancels a running audit, 409 otherwise', async () => {
    queue.cancel.mockReturnValueOnce(true).mockReturnValueOnce(false);
    await request(app).post(`/api/audits/${ID}/cancel`).expect(202);
    await request(app).post(`/api/audits/${ID}/cancel`).expect(409);
  });

  it('refuses to delete a running audit', async () => {
    queue.isTracked.mockReturnValue(true);
    await request(app).delete(`/api/audits/${ID}`).expect(409);
    expect(repo.deleteAudit).not.toHaveBeenCalled();
  });
});

describe('rate limiting', () => {
  it('limits audit creation per client', async () => {
    repo.findActiveDuplicate.mockResolvedValue(null);
    repo.createAudit.mockResolvedValue(audit());
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await request(app).post('/api/audits').send({ url: 'example.com' })).status);
    }
    expect(statuses).toContain(429);
  });
});
