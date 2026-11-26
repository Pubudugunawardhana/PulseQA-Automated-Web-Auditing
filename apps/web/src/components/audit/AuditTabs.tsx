// Sticky tab bar under the navbar, with optional "Compare to" on the right.
import { FileWarning, Image, LayoutDashboard, ListChecks, SquareTerminal, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/format';
import type { TabId } from './shared';

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'issues', label: 'Issues', icon: FileWarning },
  { id: 'checks', label: 'Checks', icon: ListChecks },
  { id: 'screenshots', label: 'Screenshots', icon: Image },
  { id: 'log', label: 'Log', icon: SquareTerminal },
];

export function AuditTabs({
  active,
  onChange,
  counts,
  live,
  aside,
}: {
  active: TabId;
  onChange: (t: TabId) => void;
  counts: Partial<Record<TabId, number>>;
  live: boolean;
  aside?: ReactNode;
}) {
  return (
    <div className="sticky top-16 z-30 -mx-4 border-b border-line bg-bg/85 px-4 backdrop-blur-lg">
      <div className="flex items-center gap-4">
        <div role="tablist" aria-label="Audit sections" className="-mb-px flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
          {TABS.map(({ id, label, icon: Icon }) => {
            const selected = active === id;
            return (
              <button
                key={id}
                role="tab"
                id={`tab-${id}`}
                aria-selected={selected}
                aria-controls="audit-tabpanel"
                onClick={() => onChange(id)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors',
                  selected ? 'border-brand-strong text-fg' : 'border-transparent text-muted hover:border-line hover:text-fg',
                )}
              >
                <Icon className={cn('size-4', selected ? 'text-brand-strong' : 'text-faint')} />
                {label}
                {id === 'log' && live ? (
                  <span className="size-1.5 animate-pulse rounded-full bg-info" />
                ) : counts[id] !== undefined ? (
                  <span className={cn('rounded-full px-1.5 text-xs tabular-nums', selected ? 'bg-brand/15 text-brand-strong' : 'bg-raised text-muted')}>
                    {counts[id]}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {aside && <div className="hidden shrink-0 md:block">{aside}</div>}
      </div>
    </div>
  );
}
