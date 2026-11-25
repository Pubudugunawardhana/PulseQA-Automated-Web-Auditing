// Shared types used by both the server and the web dashboard.

export const CHECK_IDS = [
  'smoke',
  'links',
  'consoleNetwork',
  'responsive',
  'accessibility',
  'performance',
  'security',
] as const;

export type CheckId = (typeof CHECK_IDS)[number];

export const CHECK_META: Record<CheckId, { name: string; description: string; weight: number }> = {
  smoke: { name: 'Smoke & Availability', description: 'HTTP status, redirects, page title and content render', weight: 3 },
  links: { name: 'Broken Links & Images', description: 'Scans every <a> and <img> for broken targets', weight: 2 },
  consoleNetwork: { name: 'Console & Network Errors', description: 'JS errors, uncaught exceptions and failed requests', weight: 2 },
  responsive: { name: 'Responsive UI', description: 'Desktop, tablet and mobile overflow + screenshots', weight: 2 },
  accessibility: { name: 'Accessibility (WCAG)', description: 'axe-core WCAG 2.1 A/AA rules', weight: 2 },
  performance: { name: 'Performance', description: 'TTFB, FCP, LCP, CLS and load time', weight: 2 },
  security: { name: 'Security Headers', description: 'HTTPS, CSP, HSTS, X-Frame-Options and more', weight: 1 },
};

export type CheckStatus = 'pending' | 'running' | 'pass' | 'warn' | 'fail' | 'error' | 'skipped';
export type AuditStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export const ACTIVE_STATUSES: AuditStatus[] = ['queued', 'running'];
export type OverallStatus = 'pass' | 'warn' | 'fail';

export interface Screenshot {
  label: string;
  /** Public path served by the API, e.g. /artifacts/<auditId>/mobile.png */
  url: string;
}

export interface CheckResult {
  checkId: CheckId;
  status: CheckStatus;
  durationMs: number;
  /** Small key metrics shown on the card. */
  summary: Record<string, unknown>;
  /** Detailed findings (shape depends on the check). */
  details: Record<string, unknown>;
  screenshots: Screenshot[];
  error?: string | null;
  /** When the check started (null for rows created before this was tracked). */
  startedAt?: string | null;
}

export interface AuditDTO {
  id: string;
  url: string;
  finalUrl: string | null;
  status: AuditStatus;
  overallStatus: OverallStatus | null;
  score: number | null;
  checks: CheckId[];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
}

export interface AuditDetailDTO extends AuditDTO {
  results: CheckResult[];
  /** True when the requesting browser created this audit (can cancel/delete). Others get a read-only view. */
  isOwner?: boolean;
}

export interface AuditListDTO {
  items: AuditDTO[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateAuditRequest {
  url: string;
  checks?: CheckId[];
}

/** POST /api/audits response. `deduplicated` = an identical audit was already running and is returned instead. */
export type CreateAuditResponse = AuditDTO & { deduplicated?: boolean };

export * from './details';

export type AuditEvent =
  | { type: 'snapshot'; audit: AuditDetailDTO }
  | { type: 'audit:started'; auditId: string; startedAt: string }
  | { type: 'check:started'; auditId: string; checkId: CheckId }
  | { type: 'check:completed'; auditId: string; result: CheckResult }
  | { type: 'audit:completed'; audit: AuditDTO }
  | { type: 'audit:failed'; auditId: string; error: string };

// ---- Scoring helpers (shared so UI and server agree) ----

const STATUS_POINTS: Partial<Record<CheckStatus, number>> = { pass: 1, warn: 0.5, fail: 0, error: 0 };

export function computeScore(results: Pick<CheckResult, 'checkId' | 'status'>[]): number {
  let total = 0;
  let earned = 0;
  for (const r of results) {
    const pts = STATUS_POINTS[r.status];
    if (pts === undefined) continue;
    const w = CHECK_META[r.checkId].weight;
    total += w;
    earned += w * pts;
  }
  return total === 0 ? 0 : Math.round((earned / total) * 100);
}

export function computeOverall(results: Pick<CheckResult, 'status'>[]): OverallStatus {
  if (results.some((r) => r.status === 'fail' || r.status === 'error')) return 'fail';
  if (results.some((r) => r.status === 'warn')) return 'warn';
  return 'pass';
}
