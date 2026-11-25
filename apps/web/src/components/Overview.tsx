// At-a-glance dashboard for a finished audit: health gauge, issues by type, score per check,
// KPI trends across runs of the same URL, and the top issues to fix first.
import { ChevronRight } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import {
  CHECK_META,
  classifyIssues,
  countBySeverity,
  issueKeys,
  type AuditDetailDTO,
  type AuditHistoryPoint,
  type CheckId,
  type CheckResult,
  type CheckStatus,
  type Issue,
  type IssueSeverity,
} from '@pulseqa/shared';
import { EXECUTION_ORDER } from '../lib/checks';
import { cn, formatDate, formatMs } from '../lib/format';
import { Gauge, PolarChart, Sparkline, StackedBar } from './charts';
import { FixPanel } from './FixPanel';
import { Card, scoreTone } from './ui';

const SEVERITY: Record<IssueSeverity, { label: string; dot: string; bar: string }> = {
  error: { label: 'Errors', dot: 'bg-bad', bar: 'bg-bad' },
  warning: { label: 'Warnings', dot: 'bg-warn', bar: 'bg-warn' },
  notice: { label: 'Notices', dot: 'bg-info', bar: 'bg-info' },
};

const SHORT: Record<CheckId, string> = {
  smoke: 'Smoke',
  links: 'Links',
  consoleNetwork: 'Console',
  responsive: 'Responsive',
  accessibility: 'A11y',
  performance: 'Perf',
  security: 'Security',
};

const STATUS_VALUE: Partial<Record<CheckStatus, number>> = { pass: 100, warn: 50, fail: 0, error: 0 };
const STATUS_TONE: Partial<Record<CheckStatus, string>> = { pass: 'text-ok', warn: 'text-warn', fail: 'text-bad', error: 'text-bad' };

function scoreLabel(score: number | null) {
  if (score === null) return 'No score';
  return score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 50 ? 'Needs work' : 'Poor';
}

/** ▲/▼ change. `goodWhen` says which direction is an improvement (score: up, issues: down). */
function Delta({ value, goodWhen, format = String }: { value: number | null; goodWhen: 'up' | 'down'; format?: (n: number) => string }) {
  if (value === null || value === 0 || Number.isNaN(value)) return null;
  const good = goodWhen === 'up' ? value > 0 : value < 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums', good ? 'text-ok' : 'text-bad')}>
      {value > 0 ? '▲' : '▼'} {format(Math.abs(value))}
    </span>
  );
}

function CardTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h3 className="font-mono text-xs font-semibold uppercase tracking-[0.12em] text-muted">{children}</h3>
      {aside}
    </div>
  );
}

// ── KPI metrics that can be read from both a full result and a history summary ──
type Summaries = Partial<Record<CheckId, Record<string, unknown>>>;
const num = (v: unknown) => (typeof v === 'number' ? v : null);

const KPIS: { id: string; check: CheckId; label: string; read: (s: Summaries) => number | null; format: (n: number) => string; goodWhen: 'up' | 'down' }[] = [
  { id: 'lcp', check: 'performance', label: 'LCP · desktop', read: (s) => num(s.performance?.lcp), format: (n) => formatMs(n), goodWhen: 'down' },
  { id: 'a11y', check: 'accessibility', label: 'Accessibility violations', read: (s) => num(s.accessibility?.violations), format: String, goodWhen: 'down' },
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

const summariesOf = (checks: Pick<CheckResult, 'checkId' | 'status' | 'summary'>[]): Summaries =>
  Object.fromEntries(checks.filter((c) => c.status !== 'skipped' && c.status !== 'error').map((c) => [c.checkId, c.summary]));

export function Overview({
  audit,
  history,
  compare,
  compareId,
  onCompareChange,
  onSelectCheck,
}: {
  audit: AuditDetailDTO;
  /** Completed runs of this URL, oldest first, including this one (owner only; empty otherwise). */
  history: AuditHistoryPoint[];
  /** Run being compared against (null = none). */
  compare: AuditDetailDTO | null;
  compareId: string;
  onCompareChange: (id: string) => void;
  onSelectCheck: (id: CheckId) => void;
}) {
  const [showAllIssues, setShowAllIssues] = useState(false);
  const [openIssue, setOpenIssue] = useState<string | null>(null);
  const issues = useMemo(() => classifyIssues(audit.results), [audit.results]);
  const counts = countBySeverity(issues);
  const before = useMemo(() => (compare ? countBySeverity(classifyIssues(compare.results)) : null), [compare]);
  const previousKeys = useMemo(() => (compare ? new Set(compare.results.flatMap(issueKeys)) : null), [compare]);
  const totalIssues = counts.error + counts.warning + counts.notice;

  // Trends only up to this audit (history already ends at it)
  const scores = history.map((h) => h.score);
  const earlier = history.filter((h) => h.id !== audit.id).reverse(); // newest first, for "compare to"
  const nowSummaries = summariesOf(audit.results);
  const thenSummaries = compare ? summariesOf(compare.results) : null;
  const scoreDelta = compare && audit.score !== null && compare.score !== null ? audit.score - compare.score : null;

  const slices = EXECUTION_ORDER.filter((c) => audit.checks.includes(c)).map((c) => {
    const r = audit.results.find((x) => x.checkId === c);
    const value = r ? (STATUS_VALUE[r.status] ?? null) : null;
    return { label: SHORT[c], value, toneClass: (r && STATUS_TONE[r.status]) ?? 'text-faint' };
  });
  const passed = slices.filter((s) => s.value === 100).length;
  const measured = slices.filter((s) => s.value !== null).length;

  const shownIssues = showAllIssues ? issues : issues.slice(0, 6);

  return (
    <section aria-labelledby="overview-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="overview-title" className="text-lg font-semibold">
            Overview
          </h2>
          <p className="text-xs text-muted">
            {history.length > 1 ? `${history.length} runs of this URL` : 'First run of this URL'}
            {compare && ` · compared with ${formatDate(compare.createdAt)}`}
          </p>
        </div>
        {earlier.length > 0 && (
          <label className="flex w-full min-w-0 items-center gap-2 text-sm sm:w-auto">
            <span className="shrink-0 text-muted">Compare to</span>
            <select
              value={compareId}
              onChange={(e) => onCompareChange(e.target.value)}
              className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-panel px-2.5 text-sm outline-none transition focus:border-brand sm:flex-none"
            >
              {earlier.map((h) => (
                <option key={h.id} value={h.id}>
                  {formatDate(h.createdAt)} · score {h.score ?? '—'}
                </option>
              ))}
              <option value="none">No comparison</option>
            </select>
          </label>
        )}
      </div>

      {/* row 1 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card className="p-5">
          <CardTitle>Health score</CardTitle>
          <Gauge value={audit.score} toneClass={scoreTone(audit.score)} label={scoreLabel(audit.score)} />
          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className={cn('size-2 rounded-full bg-current', scoreTone(audit.score))} />
              <dt className="flex-1">This website</dt>
              <dd className="flex items-center gap-2 font-semibold tabular-nums">
                {audit.score ?? '—'} <Delta value={scoreDelta} goodWhen="up" />
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-ok" />
              <dt className="flex-1">Recommended</dt>
              <dd className="font-semibold tabular-nums">90+</dd>
            </div>
          </dl>
          {scores.filter((s) => s !== null).length >= 2 && (
            <div className="mt-4">
              <div className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">History</div>
              <Sparkline values={scores} toneClass="text-info" title={`Score history: ${scores.join(', ')}`} />
            </div>
          )}
        </Card>

        <Card className="p-5">
          <CardTitle>Issues by type</CardTitle>
          <div className="text-3xl font-bold tabular-nums text-info">{totalIssues}</div>
          <div className="mb-4 text-sm text-muted">Issues found</div>
          <StackedBar
            parts={(['error', 'warning', 'notice'] as const).map((k) => ({ value: counts[k], className: SEVERITY[k].bar, label: SEVERITY[k].label }))}
          />
          <ul className="mt-5 space-y-2.5 text-sm">
            {(['error', 'warning', 'notice'] as const).map((k) => (
              <li key={k} className="flex items-center gap-2">
                <span className={cn('size-2 rounded-full', SEVERITY[k].dot)} />
                <span className="flex-1">{SEVERITY[k].label}</span>
                <span className="font-semibold tabular-nums">{counts[k]}</span>
                <span className="w-12 text-right">
                  <Delta value={before ? counts[k] - before[k] : null} goodWhen="down" />
                </span>
              </li>
            ))}
          </ul>
          {totalIssues === 0 && <p className="mt-4 text-sm text-ok">Nothing to fix — nice work.</p>}
        </Card>

        <Card className="p-5 md:col-span-2 xl:col-span-1">
          <CardTitle aside={<span className="text-xs text-muted">{passed}/{measured} passed</span>}>Check quality</CardTitle>
          <PolarChart slices={slices} center={audit.score ?? '—'} centerClass={scoreTone(audit.score)} />
          <div className="mt-2 flex justify-center gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-ok" /> Pass</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-warn" /> Warning</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full bg-bad" /> Fail</span>
          </div>
        </Card>
      </div>

      {/* row 2: KPI trends */}
      <Card className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {KPIS.map((k) => {
          const now = audit.checks.includes(k.check) ? k.read(nowSummaries) : null;
          const then = thenSummaries ? k.read(thenSummaries) : null;
          const series = history.map((h) => k.read(summariesOf(h.checks)));
          return (
            <button
              key={k.id}
              onClick={() => onSelectCheck(k.check)}
              disabled={!audit.checks.includes(k.check)}
              className="p-5 text-left transition hover:bg-raised/50 disabled:pointer-events-none"
            >
              <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{k.label}</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">{now === null ? '—' : k.format(now)}</span>
                <Delta value={now !== null && then !== null ? now - then : null} goodWhen={k.goodWhen} format={k.format} />
              </div>
              <div className="mt-3 h-11">
                {series.filter((v) => v !== null).length >= 2 ? (
                  <Sparkline values={series} toneClass="text-info" title={`${k.label} over ${series.length} runs`} />
                ) : (
                  <p className="pt-3 text-xs text-faint">{now === null ? 'Check not run' : 'Trend appears after the next run'}</p>
                )}
              </div>
            </button>
          );
        })}
      </Card>

      {/* row 3: top issues */}
      <Card className="p-5">
        <CardTitle
          aside={
            issues.length > 6 && (
              <button onClick={() => setShowAllIssues((s) => !s)} className="text-sm font-medium text-brand-strong hover:underline">
                {showAllIssues ? 'Show top 6' : `View all (${issues.length})`}
              </button>
            )
          }
        >
          Top issues
        </CardTitle>
        {issues.length > 0 && <p className="-mt-2 mb-3 text-xs text-muted">Click an issue to see how to fix it.</p>}
        {issues.length === 0 ? (
          <p className="text-sm text-muted">No issues found on this page.</p>
        ) : (
          <ul className="-mx-2 divide-y divide-line">
            {shownIssues.map((i: Issue) => {
              const isNew = previousKeys ? i.keys.some((k) => !previousKeys.has(k)) : false;
              const key = `${i.checkId}:${i.title}`;
              const open = openIssue === key;
              return (
                <li key={key}>
                  <button
                    onClick={() => setOpenIssue(open ? null : key)}
                    aria-expanded={open}
                    className="group flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-raised/60"
                  >
                    <span className={cn('size-2 shrink-0 rounded-full', SEVERITY[i.severity].dot)} title={SEVERITY[i.severity].label} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{i.title}</span>
                      <span className="block text-xs text-muted">{CHECK_META[i.checkId].name}</span>
                    </span>
                    {isNew && <span className="rounded bg-bad/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-bad">New</span>}
                    <span className="hidden h-px w-16 bg-line sm:block lg:w-32" aria-hidden />
                    <span className="w-8 text-right text-sm font-semibold tabular-nums text-info">{i.count}</span>
                    <ChevronRight className={cn('size-4 text-faint transition group-hover:text-fg', open && 'rotate-90')} />
                  </button>
                  {open && <FixPanel issue={i} onOpenReport={() => onSelectCheck(i.checkId)} />}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
