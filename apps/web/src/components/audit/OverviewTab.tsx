// Overview tab: KPI tiles, top issues, per-check breakdown, trends and run-to-run changes.
import { ArrowRight, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  CHECK_META,
  classifyIssues,
  countBySeverity,
  type AuditDetailDTO,
  type AuditHistoryPoint,
  type CheckId,
  type Issue,
  type IssueSeverity,
} from '@pulseqa/shared';
import { EXECUTION_ORDER, headline } from '../../lib/checks';
import { cn, formatMs } from '../../lib/format';
import { MiniRing, PolarChart, Sparkline, StackedBar, TrendChart } from '../charts';
import { CHECK_ICON } from '../checkIcons';
import { Card, scoreTone, SectionCard } from '../ui';
import { CompareCard } from './CompareCard';
import { Delta, IssueRow, issueId, KPIS, MicroLabel, scoreLabel, SEVERITY, SHORT, STATUS_DOT, STATUS_TONE, STATUS_VALUE, summariesOf } from './shared';

const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const fullDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function OverviewTab({
  audit,
  issues,
  history,
  compare,
  previousKeys,
  onOpenCheck,
  onViewIssues,
}: {
  audit: AuditDetailDTO;
  issues: Issue[];
  /** Completed runs of this URL, oldest first, including this one (owner only; empty otherwise). */
  history: AuditHistoryPoint[];
  compare: AuditDetailDTO | null;
  previousKeys: Set<string> | null;
  onOpenCheck: (id: CheckId) => void;
  onViewIssues: (severity?: IssueSeverity) => void;
}) {
  const [openIssue, setOpenIssue] = useState<string | null>(null);
  const counts = countBySeverity(issues);
  const before = useMemo(() => (compare ? countBySeverity(classifyIssues(compare.results)) : null), [compare]);
  const total = counts.error + counts.warning + counts.notice;

  const scoreDelta = compare && audit.score !== null && compare.score !== null ? audit.score - compare.score : null;
  const nowSummaries = summariesOf(audit.results);
  const thenSummaries = compare ? summariesOf(compare.results) : null;
  const hasTrend = history.filter((h) => h.score !== null).length >= 2;

  const checks = EXECUTION_ORDER.filter((c) => audit.checks.includes(c));
  const results = new Map(audit.results.map((r) => [r.checkId, r]));
  const slices = checks.map((c) => {
    const r = results.get(c);
    return { label: SHORT[c], value: r ? (STATUS_VALUE[r.status] ?? null) : null, toneClass: (r && STATUS_TONE[r.status]) ?? 'text-faint' };
  });
  const passed = slices.filter((s) => s.value === 100).length;

  // which check contributes most to each severity
  const topSource = (sev: IssueSeverity) => {
    const by = new Map<CheckId, number>();
    for (const i of issues) if (i.severity === sev) by.set(i.checkId, (by.get(i.checkId) ?? 0) + i.count);
    const best = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
    return best ? CHECK_META[best[0]].name : null;
  };

  return (
    <div className="space-y-5">
      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="flex items-center gap-4 p-5">
          <MiniRing value={audit.score} toneClass={scoreTone(audit.score)} size={64} />
          <div className="min-w-0 flex-1">
            <MicroLabel className="whitespace-nowrap">Health score</MicroLabel>
            <div className={cn('mt-1 text-lg font-semibold', scoreTone(audit.score))}>{scoreLabel(audit.score)}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <Delta value={scoreDelta} goodWhen="up" />
              <span>Target 90+</span>
            </div>
          </div>
        </Card>
        {(['error', 'warning', 'notice'] as const).map((sev) => {
          const src = topSource(sev);
          return (
            <button key={sev} onClick={() => onViewIssues(sev)} className="text-left">
              <Card className="h-full p-5 transition hover:border-faint hover:shadow-md">
                <div className="flex items-center justify-between">
                  <MicroLabel className="flex items-center gap-2">
                    <span className={cn('size-2 rounded-full', SEVERITY[sev].dot)} /> {SEVERITY[sev].label}
                  </MicroLabel>
                  <ArrowRight className="size-4 text-faint" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold tabular-nums">{counts[sev]}</span>
                  <Delta value={before ? counts[sev] - before[sev] : null} goodWhen="down" />
                </div>
                <div className="mt-1 truncate text-xs text-muted">{counts[sev] === 0 ? 'None found' : src ? `Mostly from ${src}` : ''}</div>
              </Card>
            </button>
          );
        })}
      </div>

      {/* ── top issues + check breakdown ── */}
      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="Top issues"
          subtitle={total ? `${issues.length} issue types · ${total} affected items · click one to see how to fix it` : 'Nothing to fix on this page'}
          action={
            issues.length > 0 && (
              <button onClick={() => onViewIssues()} className="inline-flex items-center gap-1 font-medium text-brand-strong hover:underline">
                View all <ArrowRight className="size-3.5" />
              </button>
            )
          }
          bodyClassName="p-0"
        >
          <div className="px-5 pb-1 pt-4">
            <StackedBar
              parts={(['error', 'warning', 'notice'] as const).map((k) => ({ value: counts[k], className: SEVERITY[k].bar, label: SEVERITY[k].label }))}
            />
          </div>
          {issues.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ok">No issues found — nice work.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {issues.slice(0, 8).map((i) => {
                const key = issueId(i);
                return (
                  <IssueRow
                    key={key}
                    issue={i}
                    isNew={previousKeys ? i.keys.some((k) => !previousKeys.has(k)) : false}
                    open={openIssue === key}
                    onToggle={() => setOpenIssue(openIssue === key ? null : key)}
                    onOpenReport={() => onOpenCheck(i.checkId)}
                    dense
                  />
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Check breakdown" subtitle={`${passed} of ${checks.length} checks passed`} bodyClassName="p-0">
          <div className="px-5 pt-3">
            <PolarChart slices={slices} center={audit.score ?? '—'} centerClass={scoreTone(audit.score)} />
          </div>
          <ul className="mt-1 divide-y divide-line border-t border-line">
            {checks.map((c) => {
              const r = results.get(c);
              const Icon = CHECK_ICON[c];
              return (
                <li key={c}>
                  <button
                    onClick={() => r && onOpenCheck(c)}
                    disabled={!r}
                    className="group flex w-full items-center gap-3 px-5 py-2.5 text-left transition hover:bg-raised/60 disabled:pointer-events-none"
                    title={r ? headline(r) : undefined}
                  >
                    <Icon className="size-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate text-sm">{CHECK_META[c].name}</span>
                    <span className="text-xs tabular-nums text-faint">{r ? formatMs(r.durationMs) : ''}</span>
                    <span className={cn('size-2 shrink-0 rounded-full', (r && STATUS_DOT[r.status]) ?? 'bg-faint')} title={r?.status} />
                    <ChevronRight className="size-4 shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-fg" />
                  </button>
                </li>
              );
            })}
          </ul>
        </SectionCard>
      </div>

      {/* ── trends ── */}
      {hasTrend && (
        <div className="grid gap-5 lg:grid-cols-3">
          <SectionCard className="lg:col-span-2" title="Score trend" subtitle={`Last ${history.length} runs of this URL`}>
            <div className="-mx-1 overflow-x-auto px-1">
              <div className="min-w-[480px]">
                <TrendChart points={history.map((h) => ({ label: shortDate(h.createdAt), title: fullDate(h.createdAt), value: h.score }))} />
              </div>
            </div>
          </SectionCard>
          <SectionCard title="Key metrics" subtitle={compare ? 'Change vs the compared run' : 'Latest value and trend'} bodyClassName="p-0">
            <ul className="divide-y divide-line">
              {KPIS.map((k) => {
                const now = audit.checks.includes(k.check) ? k.read(nowSummaries) : null;
                const then = thenSummaries ? k.read(thenSummaries) : null;
                const series = history.map((h) => k.read(summariesOf(h.checks)));
                return (
                  <li key={k.id}>
                    <button onClick={() => onOpenCheck(k.check)} className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-raised/60">
                      <div className="min-w-0 flex-1">
                        <MicroLabel>{k.label}</MicroLabel>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className="text-2xl font-bold tabular-nums">{now === null ? '—' : k.format(now)}</span>
                          <Delta value={now !== null && then !== null ? now - then : null} goodWhen={k.goodWhen} format={k.format} />
                        </div>
                      </div>
                      <div className="w-24 shrink-0">
                        <Sparkline values={series} toneClass="text-info" height={36} title={`${k.label} trend`} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        </div>
      )}

      {compare && <CompareCard audit={audit} previous={compare} />}

      {!hasTrend && audit.isOwner !== false && (
        <p className="text-center text-xs text-faint">Re-run this audit later to see score trends and what changed between runs.</p>
      )}
    </div>
  );
}
