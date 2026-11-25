import type { AuditDetailDTO, CheckId, CheckResult, CheckStatus } from '@pulseqa/shared';
import { shape } from './checks';

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

/** Stable identifiers of the problems a check found, so two runs can be diffed. */
function issueKeys(r: CheckResult): string[] {
  if (r.status === 'skipped' || r.status === 'error') return [];
  switch (r.checkId) {
    case 'smoke':
      return shape(r, 'smoke').details.issues ?? [];
    case 'links': {
      const d = shape(r, 'links').details;
      return [...(d.brokenLinks ?? []), ...(d.brokenImages ?? [])].map((p) => `broken ${p.kind}: ${p.url}`);
    }
    case 'consoleNetwork': {
      const d = shape(r, 'consoleNetwork').details;
      const first = <T extends { party?: string }>(xs: T[] = []) => xs.filter((x) => x.party !== 'third');
      return [
        ...first(d.pageErrors).map((e) => `exception: ${e.message}`),
        ...first(d.apiFailures).map((n) => `api ${n.status ?? n.failure}: ${n.url.split('?')[0]}`),
        ...first(d.consoleErrors).map((c) => `console: ${c.text.slice(0, 120)}`),
      ];
    }
    case 'responsive':
      return (shape(r, 'responsive').summary.overflowing ?? []).map((v) => `overflow on ${v}`);
    case 'accessibility':
      return (shape(r, 'accessibility').details.violations ?? []).map((v) => `${v.id} (${v.impact})`);
    case 'performance': {
      const ratings = shape(r, 'performance').details.ratings ?? {};
      return Object.entries(ratings)
        .filter(([, v]) => v === 'fail' || v === 'warn')
        .map(([k, v]) => `${k} ${v}`);
    }
    case 'security': {
      const { summary: s, details: d } = shape(r, 'security');
      return (d.headers ?? []).filter((h) => !h.ok).map((h) => `missing ${h.header}`).concat(s.https === false ? ['no https'] : []);
    }
  }
}

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
