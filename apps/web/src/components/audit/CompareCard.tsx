import { ArrowDownRight, ArrowUpRight, Minus, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CHECK_META, type AuditDetailDTO } from '@pulseqa/shared';
import { diffAudits, type CheckDiff } from '../../lib/compare';
import { cn, formatDate } from '../../lib/format';
import { SectionCard, StatusBadge } from '../ui';
import { Delta } from './shared';

const CHANGE_STYLE: Record<CheckDiff['change'], { icon: ReactNode; cls: string; label: string }> = {
  improved: { icon: <ArrowUpRight className="size-4" />, cls: 'text-ok', label: 'Improved' },
  regressed: { icon: <ArrowDownRight className="size-4" />, cls: 'text-bad', label: 'Regressed' },
  same: { icon: <Minus className="size-4" />, cls: 'text-muted', label: 'No change' },
  new: { icon: <Plus className="size-4" />, cls: 'text-info', label: 'New check' },
};

/** What changed between this run and the compared one: per-check status and new / fixed issues. */
export function CompareCard({ audit, previous }: { audit: AuditDetailDTO; previous: AuditDetailDTO }) {
  const diff = diffAudits(audit, previous);
  const [showAll, setShowAll] = useState(false);
  const changed = diff.checks.filter((c) => c.change !== 'same' || c.newIssues.length || c.fixedIssues.length);
  const rows = showAll ? diff.checks : changed;
  const newCount = diff.checks.reduce((s, c) => s + c.newIssues.length, 0);
  const fixedCount = diff.checks.reduce((s, c) => s + c.fixedIssues.length, 0);

  return (
    <SectionCard
      title="Changes since the compared run"
      subtitle={
        <>
          Compared with{' '}
          <Link to={`/audits/${diff.previousId}`} className="font-medium text-brand-strong hover:underline">
            {formatDate(diff.previousAt)}
          </Link>
        </>
      }
      action={
        <div className="flex items-center gap-2 text-sm">
          <span className="tabular-nums text-muted">
            {diff.scoreBefore ?? '—'} → <span className="font-semibold text-fg">{audit.score ?? '—'}</span>
          </span>
          <Delta value={diff.scoreDelta} goodWhen="up" />
        </div>
      }
      bodyClassName="p-0"
    >
      <div className="grid grid-cols-3 divide-x divide-line border-b border-line text-center">
        {[
          ['New issues', newCount, newCount ? 'text-bad' : 'text-fg'],
          ['Fixed issues', fixedCount, fixedCount ? 'text-ok' : 'text-fg'],
          ['Checks changed', diff.checks.filter((c) => c.change !== 'same').length, 'text-fg'],
        ].map(([label, value, cls]) => (
          <div key={label as string} className="px-3 py-3">
            <div className={cn('text-xl font-bold tabular-nums', cls as string)}>{value as number}</div>
            <div className="text-xs text-muted">{label as string}</div>
          </div>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted">Nothing changed since the compared run.</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((c) => {
            const st = CHANGE_STYLE[c.change];
            return (
              <li key={c.checkId} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={cn('inline-flex w-28 items-center gap-1 font-medium', st.cls)}>
                    {st.icon} {st.label}
                  </span>
                  <span className="font-medium">{CHECK_META[c.checkId].name}</span>
                  <span className="ml-auto flex items-center gap-1.5">
                    {c.before ? <StatusBadge status={c.before} /> : null}
                    <span className="text-faint">→</span>
                    <StatusBadge status={c.after} />
                  </span>
                </div>
                {(c.newIssues.length > 0 || c.fixedIssues.length > 0) && (
                  <ul className="mt-1.5 space-y-0.5 pl-[7.5rem] text-xs max-sm:pl-0">
                    {c.newIssues.slice(0, 4).map((i) => (
                      <li key={`n${i}`} className="break-all text-bad">
                        + new: {i}
                      </li>
                    ))}
                    {c.newIssues.length > 4 && <li className="text-faint">+ {c.newIssues.length - 4} more new</li>}
                    {c.fixedIssues.slice(0, 4).map((i) => (
                      <li key={`f${i}`} className="break-all text-ok">
                        ✓ fixed: {i}
                      </li>
                    ))}
                    {c.fixedIssues.length > 4 && <li className="text-faint">✓ {c.fixedIssues.length - 4} more fixed</li>}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {changed.length !== diff.checks.length && (
        <div className="border-t border-line px-5 py-2.5">
          <button onClick={() => setShowAll((s) => !s)} className="text-sm font-medium text-brand-strong hover:underline">
            {showAll ? 'Show only changes' : `Show all checks (${diff.checks.length - changed.length} unchanged)`}
          </button>
        </div>
      )}
    </SectionCard>
  );
}
