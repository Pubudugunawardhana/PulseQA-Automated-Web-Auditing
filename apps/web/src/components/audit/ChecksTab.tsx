// Checks tab: one card per check; the selected check's full report opens below.
import { Clock, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { CHECK_META, type AuditDetailDTO, type CheckId, type CheckResult } from '@pulseqa/shared';
import { headline } from '../../lib/checks';
import { cn, formatMs } from '../../lib/format';
import { CheckDetails } from '../CheckDetails';
import { CHECK_ICON } from '../checkIcons';
import { Button, Card, StatusBadge } from '../ui';

const STATUS_BORDER: Record<string, string> = {
  pass: 'border-l-ok',
  warn: 'border-l-warn',
  fail: 'border-l-bad',
  error: 'border-l-bad',
  skipped: 'border-l-faint',
};

function CheckCard({
  id,
  result,
  running,
  aborted,
  selected,
  onSelect,
}: {
  id: CheckId;
  result?: CheckResult;
  running: boolean;
  aborted: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = CHECK_ICON[id];
  const status = result?.status ?? (running ? 'running' : aborted ? 'skipped' : 'pending');
  return (
    <button
      onClick={onSelect}
      disabled={!result}
      aria-pressed={selected}
      className={cn(
        'group flex w-full flex-col gap-2 rounded-xl border border-l-4 border-line bg-panel p-4 text-left shadow-sm transition',
        result ? STATUS_BORDER[result.status] : 'border-l-line',
        result && 'hover:-translate-y-0.5 hover:shadow-md',
        selected && 'ring-2 ring-brand/60',
        running && 'ring-2 ring-info/40',
        !result && !running && 'opacity-70',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-raised text-muted">
          <Icon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{CHECK_META[id].name}</span>
        <StatusBadge status={status} />
      </div>
      <p className="line-clamp-2 min-h-[2.5em] text-sm text-muted">
        {result ? headline(result) : running ? 'Running…' : aborted ? 'Not run' : CHECK_META[id].description}
      </p>
      <div className="flex items-center justify-between text-xs text-faint">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" /> {result ? formatMs(result.durationMs) : '—'}
        </span>
        {result && <span className="font-medium text-brand-strong opacity-0 transition group-hover:opacity-100">{selected ? 'Hide' : 'View report'} →</span>}
      </div>
    </button>
  );
}

export function ChecksTab({
  audit,
  checks,
  results,
  current,
  aborted,
  selected,
  onSelect,
}: {
  audit: AuditDetailDTO;
  checks: CheckId[];
  results: Map<CheckId, CheckResult>;
  current: CheckId | null;
  aborted: boolean;
  selected: CheckId | null;
  onSelect: (id: CheckId | null) => void;
}) {
  const reportRef = useRef<HTMLDivElement>(null);
  const selectedResult = selected ? results.get(selected) : undefined;
  useEffect(() => {
    if (selected) reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selected]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {checks.map((c) => (
          <CheckCard
            key={c}
            id={c}
            result={results.get(c)}
            running={current === c}
            aborted={aborted}
            selected={selected === c}
            onSelect={() => onSelect(selected === c ? null : c)}
          />
        ))}
      </div>

      {selectedResult ? (
        <div ref={reportRef} className="scroll-mt-32">
          <Card className="overflow-hidden">
            <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
              {(() => {
                const Icon = CHECK_ICON[selectedResult.checkId];
                return (
                  <span className="grid size-9 place-items-center rounded-lg bg-raised text-muted">
                    <Icon className="size-4.5" />
                  </span>
                );
              })()}
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{CHECK_META[selectedResult.checkId].name}</h2>
                <p className="truncate text-xs text-muted">{headline(selectedResult)}</p>
              </div>
              <span className="hidden text-xs tabular-nums text-faint sm:inline">{formatMs(selectedResult.durationMs)}</span>
              <StatusBadge status={selectedResult.status} />
              <Button variant="ghost" onClick={() => onSelect(null)} aria-label="Close report" className="px-2">
                <X className="size-4" />
              </Button>
            </div>
            <div className="p-5">
              <CheckDetails result={selectedResult} audit={audit} />
            </div>
          </Card>
        </div>
      ) : (
        results.size > 0 && <p className="text-center text-sm text-muted">Select a check to open its full report.</p>
      )}
    </div>
  );
}
