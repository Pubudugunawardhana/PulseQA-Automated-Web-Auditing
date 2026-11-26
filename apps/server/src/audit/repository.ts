import { and, asc, count, desc, eq, ilike, inArray, isNull, lt, or } from 'drizzle-orm';
import { ACTIVE_STATUSES, type AuditDetailDTO, type AuditDTO, type AuditHistoryPoint, type CheckId, type CheckResult } from '@pulseqa/shared';
import { db } from '../db/client.js';
import { auditArtifacts, auditChecks, audits, visualBaselines, type AuditRow } from '../db/schema.js';

export function toAuditDTO(row: AuditRow): AuditDTO {
  return {
    id: row.id,
    url: row.url,
    finalUrl: row.finalUrl,
    status: row.status as AuditDTO['status'],
    overallStatus: (row.overallStatus as AuditDTO['overallStatus']) ?? null,
    score: row.score,
    checks: row.checks as CheckId[],
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
    error: row.error,
  };
}

export async function createAudit(url: string, checks: CheckId[], ownerHash: string): Promise<AuditDTO> {
  const [row] = await db.insert(audits).values({ url, checks, ownerHash }).returning();
  return toAuditDTO(row);
}

/** The same owner's audit of the same URL with the same checks that is still queued/running, if any. */
export async function findActiveDuplicate(url: string, checks: CheckId[], ownerHash: string): Promise<AuditDTO | null> {
  const rows = await db
    .select()
    .from(audits)
    .where(and(eq(audits.ownerHash, ownerHash), eq(audits.url, url), inArray(audits.status, ACTIVE_STATUSES)))
    .orderBy(desc(audits.createdAt))
    .limit(5);
  const key = [...checks].sort().join(',');
  const match = rows.find((r) => [...(r.checks as string[])].sort().join(',') === key);
  return match ? toAuditDTO(match) : null;
}

/** One owner's paginated history; `q` filters by URL substring (case-insensitive). */
export async function listAudits(ownerHash: string, page: number, limit: number, q?: string) {
  const byOwner = eq(audits.ownerHash, ownerHash);
  const where = q ? and(byOwner, ilike(audits.url, `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)) : byOwner;
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(audits).where(where).orderBy(desc(audits.createdAt)).limit(limit).offset((page - 1) * limit),
    db.select({ total: count() }).from(audits).where(where),
  ]);
  const ids = rows.map((r) => r.id);
  const baselines = ids.length
    ? new Set(
        (await db.select({ id: visualBaselines.auditId }).from(visualBaselines).where(and(eq(visualBaselines.ownerHash, ownerHash), inArray(visualBaselines.auditId, ids)))).map(
          (b) => b.id,
        ),
      )
    : new Set<string>();
  return { items: rows.map((r) => ({ ...toAuditDTO(r), isVisualBaseline: baselines.has(r.id) })), total, page, limit };
}

async function detailFromRow(row: AuditRow): Promise<AuditDetailDTO> {
  const [checks, artifacts] = await Promise.all([
    db.select().from(auditChecks).where(eq(auditChecks.auditId, row.id)).orderBy(asc(auditChecks.createdAt)),
    db.select().from(auditArtifacts).where(eq(auditArtifacts.auditId, row.id)).orderBy(asc(auditArtifacts.createdAt)),
  ]);
  const results: CheckResult[] = checks.map((c) => ({
    checkId: c.checkId as CheckId,
    status: c.status as CheckResult['status'],
    durationMs: c.durationMs,
    summary: c.summary,
    details: c.details,
    error: c.error,
    startedAt: c.startedAt?.toISOString() ?? null,
    screenshots: artifacts
      .filter((a) => a.checkId === c.checkId)
      .map((a) => ({ label: a.label, url: `/artifacts/${a.filePath}` })),
  }));
  return { ...toAuditDTO(row), results };
}

export async function getAuditDetail(id: string): Promise<AuditDetailDTO | null> {
  const [row] = await db.select().from(audits).where(eq(audits.id, id));
  return row ? detailFromRow(row) : null;
}

/** Owner hash of an audit (null = legacy/unowned), or undefined if the audit doesn't exist. */
export async function getAuditOwner(id: string): Promise<string | null | undefined> {
  const [row] = await db.select({ ownerHash: audits.ownerHash }).from(audits).where(eq(audits.id, id));
  return row ? row.ownerHash : undefined;
}

/** The same owner's most recent COMPLETED audit of the same URL before `id` (for run-to-run comparison). */
export async function getPreviousAudit(id: string): Promise<AuditDetailDTO | null> {
  const [current] = await db.select().from(audits).where(eq(audits.id, id));
  if (!current) return null;
  const [prev] = await db
    .select()
    .from(audits)
    .where(
      and(
        eq(audits.url, current.url),
        current.ownerHash ? eq(audits.ownerHash, current.ownerHash) : isNull(audits.ownerHash),
        eq(audits.status, 'completed'),
        lt(audits.createdAt, current.createdAt),
      ),
    )
    .orderBy(desc(audits.createdAt))
    .limit(1);
  return prev ? detailFromRow(prev) : null;
}

/** The same owner's completed runs of the same URL up to and including `id`, oldest first (summaries only). */
export async function getUrlHistory(id: string, limit = 20): Promise<AuditHistoryPoint[]> {
  const [current] = await db.select().from(audits).where(eq(audits.id, id));
  if (!current) return [];
  const rows = await db
    .select()
    .from(audits)
    .where(
      and(
        eq(audits.url, current.url),
        current.ownerHash ? eq(audits.ownerHash, current.ownerHash) : isNull(audits.ownerHash),
        eq(audits.status, 'completed'),
        // by id for the current run: JS Dates drop Postgres' microseconds, so `<=` could miss it
        or(eq(audits.id, current.id), lt(audits.createdAt, current.createdAt)),
      ),
    )
    .orderBy(desc(audits.createdAt))
    .limit(limit);
  if (rows.length === 0) return [];
  const checks = await db
    .select({ auditId: auditChecks.auditId, checkId: auditChecks.checkId, status: auditChecks.status, summary: auditChecks.summary })
    .from(auditChecks)
    .where(inArray(auditChecks.auditId, rows.map((r) => r.id)));
  return rows.reverse().map((r) => ({
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    score: r.score,
    overallStatus: (r.overallStatus as AuditHistoryPoint['overallStatus']) ?? null,
    checks: checks
      .filter((c) => c.auditId === r.id)
      .map((c) => ({ checkId: c.checkId as CheckId, status: c.status as CheckResult['status'], summary: c.summary })),
  }));
}

export async function markStarted(id: string, startedAt: Date) {
  await db.update(audits).set({ status: 'running', startedAt }).where(eq(audits.id, id));
}

export async function saveCheckResult(auditId: string, r: CheckResult) {
  await db.insert(auditChecks).values({
    auditId,
    checkId: r.checkId,
    status: r.status,
    durationMs: r.durationMs,
    summary: r.summary,
    details: r.details,
    error: r.error ?? null,
    startedAt: r.startedAt ? new Date(r.startedAt) : null,
  });
  if (r.screenshots.length) {
    await db.insert(auditArtifacts).values(
      r.screenshots.map((s) => ({
        auditId,
        checkId: r.checkId,
        label: s.label,
        // stored relative to ARTIFACTS_DIR: "<auditId>/<file>.png"
        filePath: s.url.replace(/^\/artifacts\//, ''),
      })),
    );
  }
}

export async function finishAudit(
  id: string,
  patch: Partial<Pick<AuditRow, 'status' | 'overallStatus' | 'score' | 'finalUrl' | 'finishedAt' | 'durationMs' | 'error'>>,
): Promise<AuditDTO> {
  const [row] = await db.update(audits).set(patch).where(eq(audits.id, id)).returning();
  return toAuditDTO(row);
}

/** Ids of this owner's audits beyond the newest `keep` (finished ones only — running/queued are never pruned). */
export async function findOverflowAudits(ownerHash: string, keep: number): Promise<string[]> {
  const rows = await db
    .select({ id: audits.id, status: audits.status })
    .from(audits)
    .where(eq(audits.ownerHash, ownerHash))
    .orderBy(desc(audits.createdAt))
    .offset(keep);
  if (rows.length === 0) return [];
  // never prune an approved visual baseline — new runs still need its screenshots
  const pinned = new Set(
    (await db.select({ id: visualBaselines.auditId }).from(visualBaselines).where(eq(visualBaselines.ownerHash, ownerHash))).map((r) => r.id),
  );
  return rows.filter((r) => !(ACTIVE_STATUSES as readonly string[]).includes(r.status) && !pinned.has(r.id)).map((r) => r.id);
}

/** The approved visual-regression baseline for this browser (owner) and URL. */
export async function getVisualBaseline(ownerHash: string | null, url: string): Promise<{ auditId: string; approvedAt: string } | null> {
  if (!ownerHash) return null;
  const [row] = await db
    .select()
    .from(visualBaselines)
    .where(and(eq(visualBaselines.ownerHash, ownerHash), eq(visualBaselines.url, url)));
  return row ? { auditId: row.auditId, approvedAt: row.approvedAt.toISOString() } : null;
}

/** Approve an audit as the visual baseline for its owner + URL (replaces the previous one). */
export async function setVisualBaseline(ownerHash: string, url: string, auditId: string): Promise<{ auditId: string; approvedAt: string }> {
  const approvedAt = new Date();
  await db
    .insert(visualBaselines)
    .values({ ownerHash, url, auditId, approvedAt })
    .onConflictDoUpdate({ target: [visualBaselines.ownerHash, visualBaselines.url], set: { auditId, approvedAt } });
  return { auditId, approvedAt: approvedAt.toISOString() };
}

/** Owner + URL of an audit (for baseline lookups). */
export async function getAuditKey(id: string): Promise<{ ownerHash: string | null; url: string } | null> {
  const [row] = await db.select({ ownerHash: audits.ownerHash, url: audits.url }).from(audits).where(eq(audits.id, id));
  return row ?? null;
}

export async function deleteAudits(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db.delete(audits).where(inArray(audits.id, ids)).returning({ id: audits.id });
  return rows.map((r) => r.id);
}

export async function deleteAudit(id: string): Promise<boolean> {
  const rows = await db.delete(audits).where(eq(audits.id, id)).returning({ id: audits.id });
  return rows.length > 0;
}

/**
 * On boot, anything left "running"/"queued" from BEFORE this process started was interrupted by a restart.
 * The createdAt bound avoids failing audits that were just created (e.g. by another instance during boot).
 */
export async function failInterruptedAudits(bootTime: Date) {
  await db
    .update(audits)
    .set({ status: 'failed', error: 'Interrupted by server restart', finishedAt: new Date() })
    .where(and(inArray(audits.status, ACTIVE_STATUSES), lt(audits.createdAt, bootTime)));
}
