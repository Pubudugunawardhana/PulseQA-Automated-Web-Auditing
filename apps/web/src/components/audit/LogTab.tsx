// Log tab: the terminal-style execution log.
import type { AuditDetailDTO, CheckId, CheckResult } from '@pulseqa/shared';
import { CHECK_FLAG } from '../../lib/checks';
import { cn, formatMs } from '../../lib/format';
import { Spinner, StatusBadge } from '../ui';

export function TerminalLog({
  audit,
  selected,
  results,
  current,
  times,
}: {
  audit: AuditDetailDTO;
  selected: CheckId[];
  results: Map<CheckId, CheckResult>;
  current: CheckId | null;
  times: Map<CheckId, string>;
}) {
  const aborted = audit.status === 'failed' || audit.status === 'cancelled';
  return (
    <div className="terminal overflow-hidden rounded-xl border border-line text-[12.5px] leading-relaxed shadow-sm">
      <div className="flex items-center gap-2 border-b border-line bg-raised px-3 py-1.5 text-[11px] text-muted">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="ml-2">live log — job {audit.id.slice(0, 8)}</span>
      </div>
      <div className="space-y-0.5 overflow-x-auto px-4 py-3">
        <div className="whitespace-nowrap">
          <span className="text-ok">qa@pulseqa</span>
          <span className="text-muted">:~$</span> <span className="text-accent">audit</span> {audit.url}
        </div>
        {selected.map((c) => {
          const r = results.get(c);
          const running = current === c;
          return (
            <div key={c} className={cn('flex items-baseline gap-2 whitespace-nowrap', r ? 'line-in' : running ? '' : 'text-faint')}>
              <span className="w-[72px] shrink-0 text-muted">{r || running ? `[${times.get(c) ?? '--:--:--'}]` : ''}</span>
              <span className="shrink-0">{r ? '✓' : running ? '▶' : '·'}</span>
              <span className="w-20 shrink-0">{CHECK_FLAG[c]}</span>
              <span className="min-w-6 flex-1 overflow-hidden text-faint">{'.'.repeat(80)}</span>
              {r ? (
                <>
                  <span className="w-12 shrink-0 text-right">
                    <StatusBadge status={r.status} bare />
                  </span>
                  <span className="w-14 shrink-0 text-right text-muted">{formatMs(r.durationMs)}</span>
                </>
              ) : running ? (
                <Spinner className="text-info" label="running" />
              ) : (
                <span>{aborted ? 'aborted' : 'waiting'}</span>
              )}
            </div>
          );
        })}
        {audit.status === 'queued' && (
          <div className="text-warn">
            <Spinner /> waiting in queue…
          </div>
        )}
        {audit.status === 'completed' && (
          <div className="pt-1 text-muted">
            → done in {formatMs(audit.durationMs)} · score <span className="font-bold text-fg">{audit.score}/100</span>
          </div>
        )}
        {audit.status === 'cancelled' && <div className="pt-1 text-warn">^C cancelled</div>}
        {audit.status === 'failed' && <div className="pt-1 text-bad">✗ {audit.error ?? 'audit failed'}</div>}
      </div>
    </div>
  );
}
