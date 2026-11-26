// Issues tab: every issue, filterable by severity / check / text, each expandable to its fix.
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CHECK_META, countBySeverity, type CheckId, type Issue, type IssueSeverity } from '@pulseqa/shared';
import { EXECUTION_ORDER } from '../../lib/checks';
import { cn } from '../../lib/format';
import { Card } from '../ui';
import { IssueRow, issueId, SEVERITY } from './shared';

export type SeverityFilter = IssueSeverity | 'all';

export function IssuesTab({
  issues,
  previousKeys,
  severity,
  onSeverityChange,
  onOpenCheck,
}: {
  issues: Issue[];
  previousKeys: Set<string> | null;
  severity: SeverityFilter;
  onSeverityChange: (s: SeverityFilter) => void;
  onOpenCheck: (id: CheckId) => void;
}) {
  const [check, setCheck] = useState<CheckId | 'all'>('all');
  const [q, setQ] = useState('');
  const [onlyNew, setOnlyNew] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const counts = countBySeverity(issues);
  const kinds = { error: 0, warning: 0, notice: 0 } as Record<IssueSeverity, number>;
  for (const i of issues) kinds[i.severity]++;
  const checksWithIssues = EXECUTION_ORDER.filter((c) => issues.some((i) => i.checkId === c));
  const isNew = (i: Issue) => (previousKeys ? i.keys.some((k) => !previousKeys.has(k)) : false);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return issues.filter(
      (i) =>
        (severity === 'all' || i.severity === severity) &&
        (check === 'all' || i.checkId === check) &&
        (!onlyNew || isNew(i)) &&
        (!needle || i.title.toLowerCase().includes(needle) || i.keys.some((k) => k.toLowerCase().includes(needle))),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issues, severity, check, q, onlyNew, previousKeys]);

  const segments: { id: SeverityFilter; label: string; n: number; dot?: string }[] = [
    { id: 'all', label: 'All', n: issues.length },
    ...(['error', 'warning', 'notice'] as const).map((s) => ({ id: s, label: SEVERITY[s].label, n: kinds[s], dot: SEVERITY[s].dot })),
  ];

  return (
    <Card className="overflow-hidden">
      {/* toolbar */}
      <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
        <div role="radiogroup" aria-label="Severity" className="flex shrink-0 overflow-x-auto rounded-lg bg-raised p-1">
          {segments.map((s) => (
            <button
              key={s.id}
              role="radio"
              aria-checked={severity === s.id}
              onClick={() => onSeverityChange(s.id)}
              className={cn(
                'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition',
                severity === s.id ? 'bg-panel text-fg shadow-sm' : 'text-muted hover:text-fg',
              )}
            >
              {s.dot && <span className={cn('size-2 rounded-full', s.dot)} />}
              {s.label}
              <span className="rounded-full bg-raised px-1.5 text-xs tabular-nums text-muted">{s.n}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-wrap gap-2 lg:justify-end">
          <select
            value={check}
            onChange={(e) => setCheck(e.target.value as CheckId | 'all')}
            aria-label="Filter by check"
            className="h-9 rounded-lg border border-line bg-panel px-2.5 text-sm outline-none focus:border-brand"
          >
            <option value="all">All checks</option>
            {checksWithIssues.map((c) => (
              <option key={c} value={c}>
                {CHECK_META[c].name}
              </option>
            ))}
          </select>
          {previousKeys && (
            <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm text-muted">
              <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} className="accent-[var(--brand-strong)]" />
              New only
            </label>
          )}
          <label className="relative min-w-0 flex-1 sm:max-w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search issues, URLs…"
              aria-label="Search issues"
              className="h-9 w-full rounded-lg border border-line bg-panel pl-9 pr-3 text-sm outline-none placeholder:text-faint focus:border-brand"
            />
          </label>
        </div>
      </div>

      {/* header */}
      <div className="hidden items-center gap-3 border-b border-line bg-raised/50 px-5 py-2 text-xs font-medium text-muted sm:flex">
        <span className="w-2" />
        <span className="flex-1">Issue</span>
        <span className="w-10 text-right">Items</span>
        <span className="w-4" />
      </div>

      {shown.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-muted">{issues.length === 0 ? 'No issues found on this page — nice work.' : 'No issues match these filters.'}</p>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((i) => {
            const key = issueId(i);
            return (
              <IssueRow
                key={key}
                issue={i}
                isNew={isNew(i)}
                open={open === key}
                onToggle={() => setOpen(open === key ? null : key)}
                onOpenReport={() => onOpenCheck(i.checkId)}
              />
            );
          })}
        </ul>
      )}
      <div className="border-t border-line px-5 py-2.5 text-xs text-muted">
        Showing {shown.length} of {issues.length} issue types · {counts.error + counts.warning + counts.notice} affected items in total
      </div>
    </Card>
  );
}
