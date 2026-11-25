import { issueKeys, type AuditDetailDTO, type CheckId, type CheckStatus } from '@pulseqa/shared';

export type Change = 'improved' | 'regressed' | 'same' | 'new';

export interface CheckDiff {
  checkId: CheckId;
  before: CheckStatus | null;
  after: CheckStatus;
  change: Change;
  newIssues: string[];
  fixedIssues: string[];
}

export interface AuditDiff {
  previousId: string;
  previousAt: string;
  scoreBefore: number | null;
  scoreDelta: number | null;
  checks: CheckDiff[];
}

const RANK: Partial<Record<CheckStatus, number>> = { pass: 3, warn: 2, fail: 1, error: 1 };

export function diffAudits(current: AuditDetailDTO, previous: AuditDetailDTO): AuditDiff {
  const prev = new Map(previous.results.map((r) => [r.checkId, r]));
  const checks: CheckDiff[] = current.results
    .filter((r) => r.status !== 'skipped')
    .map((r) => {
      const p = prev.get(r.checkId);
      const before = p?.status ?? null;
      const a = RANK[r.status] ?? 0;
      const b = before ? (RANK[before] ?? 0) : null;
      const change: Change = b === null ? 'new' : a > b ? 'improved' : a < b ? 'regressed' : 'same';
      const now = new Set(issueKeys(r));
      const then = new Set(p ? issueKeys(p) : []);
      return {
        checkId: r.checkId,
        before,
        after: r.status,
        change,
        newIssues: p ? [...now].filter((k) => !then.has(k)) : [],
        fixedIssues: [...then].filter((k) => !now.has(k)),
      };
    });
  return {
    previousId: previous.id,
    previousAt: previous.createdAt,
    scoreBefore: previous.score,
    scoreDelta: current.score !== null && previous.score !== null ? current.score - previous.score : null,
    checks,
  };
}
