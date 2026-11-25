import { and, asc, count, desc, eq, ilike, inArray, lt } from 'drizzle-orm';
import { ACTIVE_STATUSES, type AuditDetailDTO, type AuditDTO, type CheckId, type CheckResult } from '@pulseqa/shared';
import { db } from '../db/client.js';
import { auditArtifacts, auditChecks, audits, type AuditRow } from '../db/schema.js';

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

export async function createAudit(url: string, checks: CheckId[]): Promise<AuditDTO> {
  const [row] = await db.insert(audits).values({ url, checks }).returning();
  return toAuditDTO(row);
}

/** An audit of the same URL with the same checks that is still queued/running, if any. */
export async function findActiveDuplicate(url: string, checks: CheckId[]): Promise<AuditDTO | null> {
  const rows = await db
    .select()
    .from(audits)
    .where(and(eq(audits.url, url), inArray(audits.status, ACTIVE_STATUSES)))
    .orderBy(desc(audits.createdAt))
    .limit(5);
  const key = [...checks].sort().join(',');
  const match = rows.find((r) => [...(r.checks as string[])].sort().join(',') === key);
  return match ? toAuditDTO(match) : null;
}

/** Paginated history; `q` filters by URL substring (case-insensitive). */
export async function listAudits(page: number, limit: number, q?: string) {
  const where = q ? ilike(audits.url, `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db.select().from(audits).where(where).orderBy(desc(audits.createdAt)).limit(limit).offset((page - 1) * limit),
    db.select({ total: count() }).from(audits).where(where),
  ]);
  return { items: rows.map(toAuditDTO), total, page, limit };
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

/** The most recent COMPLETED audit of the same URL created before `id` (for run-to-run comparison). */
export async function getPreviousAudit(id: string): Promise<AuditDetailDTO | null> {
  const [current] = await db.select().from(audits).where(eq(audits.id, id));
  if (!current) return null;
  const [prev] = await db
    .select()
    .from(audits)
    .where(and(eq(audits.url, current.url), eq(audits.status, 'completed'), lt(audits.createdAt, current.createdAt)))
    .orderBy(desc(audits.createdAt))
    .limit(1);
  return prev ? detailFromRow(prev) : null;
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
