// Helpers shared by the audit dashboard tabs.
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { CHECK_META, type CheckId, type CheckResult, type CheckStatus, type Issue, type IssueSeverity } from '@pulseqa/shared';
import { cn, formatMs } from '../../lib/format';
import { FixPanel } from '../FixPanel';

export type TabId = 'overview' | 'issues' | 'checks' | 'screenshots' | 'log';
export const TAB_IDS: TabId[] = ['overview', 'issues', 'checks', 'screenshots', 'log'];

export const SEVERITY: Record<IssueSeverity, { label: string; one: string; dot: string; bar: string; text: string; chip: string }> = {
  error: { label: 'Errors', one: 'Error', dot: 'bg-bad', bar: 'bg-bad', text: 'text-bad', chip: 'bg-bad/10 text-bad ring-bad/25' },
  warning: { label: 'Warnings', one: 'Warning', dot: 'bg-warn', bar: 'bg-warn', text: 'text-warn', chip: 'bg-warn/10 text-warn ring-warn/25' },
  notice: { label: 'Notices', one: 'Notice', dot: 'bg-info', bar: 'bg-info', text: 'text-info', chip: 'bg-info/10 text-info ring-info/25' },
};

export const SHORT: Record<CheckId, string> = {
  smoke: 'Smoke',
  links: 'Links',
  consoleNetwork: 'Console',
  responsive: 'Responsive',
  accessibility: 'A11y',
  performance: 'Perf',
  security: 'Security',
  seo: 'SEO',
  visual: 'Visual',
  crossBrowser: 'Browsers',
  crawl: 'Crawl',
};

export const STATUS_VALUE: Partial<Record<CheckStatus, number>> = { pass: 100, warn: 50, fail: 0, error: 0 };
export const STATUS_TONE: Partial<Record<CheckStatus, string>> = { pass: 'text-ok', warn: 'text-warn', fail: 'text-bad', error: 'text-bad' };
export const STATUS_DOT: Partial<Record<CheckStatus, string>> = { pass: 'bg-ok', warn: 'bg-warn', fail: 'bg-bad', error: 'bg-bad' };

export function scoreLabel(score: number | null) {
  if (score === null) return 'No score';
  return score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 50 ? 'Needs work' : 'Poor';
}

/** ▲/▼ change. `goodWhen` says which direction is an improvement (score: up, issues: down). */
export function Delta({ value, goodWhen, format = String }: { value: number | null; goodWhen: 'up' | 'down'; format?: (n: number) => string }) {
  if (value === null || Number.isNaN(value)) return null;
  if (value === 0) return <span className="text-xs font-medium text-faint">no change</span>;
  const good = goodWhen === 'up' ? value > 0 : value < 0;
  return (
    <span
      className={cn('inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums', good ? 'bg-ok/10 text-ok' : 'bg-bad/10 text-bad')}
    >
      {value > 0 ? '▲' : '▼'} {format(Math.abs(value))}
    </span>
  );
}

/** Mono uppercase micro-label used across the dashboard. */
export function MicroLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted', className)}>{children}</div>;
}

// ── metrics readable from both a full result and a history summary ──
export type Summaries = Partial<Record<CheckId, Record<string, unknown>>>;
const num = (v: unknown) => (typeof v === 'number' ? v : null);

export const KPIS: {
  id: string;
  check: CheckId;
  label: string;
  read: (s: Summaries) => number | null;
  format: (n: number) => string;
  goodWhen: 'up' | 'down';
}[] = [
  { id: 'lcp', check: 'performance', label: 'LCP · desktop', read: (s) => num(s.performance?.lcp), format: (n) => formatMs(n), goodWhen: 'down' },
  { id: 'a11y', check: 'accessibility', label: 'A11y violations', read: (s) => num(s.accessibility?.violations), format: String, goodWhen: 'down' },
  {
    id: 'broken',
    check: 'links',
    label: 'Broken links & images',
    read: (s) => {
      const l = num(s.links?.brokenLinks);
      const i = num(s.links?.brokenImages);
      return l === null && i === null ? null : (l ?? 0) + (i ?? 0);
    },
    format: String,
    goodWhen: 'down',
  },
];

export const summariesOf = (checks: Pick<CheckResult, 'checkId' | 'status' | 'summary'>[]): Summaries =>
  Object.fromEntries(checks.filter((c) => c.status !== 'skipped' && c.status !== 'error').map((c) => [c.checkId, c.summary]));

export const issueId = (i: Issue) => `${i.checkId}:${i.title}`;

/** One expandable issue row with its "how to fix" panel. */
export function IssueRow({
  issue,
  isNew,
  open,
  onToggle,
  onOpenReport,
  dense,
}: {
  issue: Issue;
  isNew: boolean;
  open: boolean;
  onToggle: () => void;
  onOpenReport: () => void;
  dense?: boolean;
}) {
  const sev = SEVERITY[issue.severity];
  return (
    <li className={cn('transition-colors', open && 'bg-raised/40')}>
      <button onClick={onToggle} aria-expanded={open} className={cn('group flex w-full items-center gap-3 px-5 text-left transition hover:bg-raised/60', dense ? 'py-2.5' : 'py-3')}>
        <span className={cn('size-2 shrink-0 rounded-full', sev.dot)} title={sev.one} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{issue.title}</span>
          <span className="block truncate text-xs text-muted">{CHECK_META[issue.checkId].name}</span>
        </span>
        {isNew && <span className="rounded bg-bad/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-bad">New</span>}
        <span className="w-10 text-right text-sm font-semibold tabular-nums text-fg" title={`${issue.count} affected`}>
          {issue.count}
        </span>
        <ChevronRight className={cn('size-4 shrink-0 text-faint transition group-hover:text-fg', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="pb-1 pl-2">
          <FixPanel issue={issue} onOpenReport={onOpenReport} />
        </div>
      )}
    </li>
  );
}
