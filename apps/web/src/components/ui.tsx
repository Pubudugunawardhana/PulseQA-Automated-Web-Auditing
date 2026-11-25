import { useEffect, useState, type ReactNode } from 'react';
import type { AuditStatus, CheckStatus, OverallStatus } from '@pulseqa/shared';
import { cn } from '../lib/format';

type AnyStatus = CheckStatus | OverallStatus | AuditStatus;

export const STATUS_TEXT: Record<string, { tag: string; cls: string }> = {
  pass: { tag: 'PASS', cls: 'text-term-green' },
  warn: { tag: 'WARN', cls: 'text-term-amber' },
  fail: { tag: 'FAIL', cls: 'text-term-red' },
  error: { tag: 'ERR!', cls: 'text-term-red' },
  failed: { tag: 'FAIL', cls: 'text-term-red' },
  skipped: { tag: 'SKIP', cls: 'text-term-dim' },
  pending: { tag: 'WAIT', cls: 'text-term-faint' },
  queued: { tag: 'QUEUED', cls: 'text-term-dim' },
  running: { tag: 'RUN', cls: 'text-term-cyan' },
  completed: { tag: 'DONE', cls: 'text-term-green' },
  cancelled: { tag: 'CANCELLED', cls: 'text-term-amber' },
};

export const toneCls = (tone?: string) =>
  tone === 'pass' ? 'text-term-green' : tone === 'warn' ? 'text-term-amber' : tone === 'fail' ? 'text-term-red' : 'text-term-fg';

/** `[PASS]` style tag. */
export function StatusBadge({ status, bare }: { status: AnyStatus; bare?: boolean }) {
  const s = STATUS_TEXT[status] ?? STATUS_TEXT.pending;
  if (status === 'running') return <Spinner className="text-term-cyan" label="RUN" />;
  return <span className={cn('font-bold', s.cls)}>{bare ? s.tag : `[${s.tag}]`}</span>;
}

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
export function Spinner({ className, label }: { className?: string; label?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % FRAMES.length), 80);
    return () => clearInterval(t);
  }, []);
  return (
    <span className={cn('font-bold', className)}>
      {FRAMES[i]}
      {label && ` ${label}`}
    </span>
  );
}

export function Caret() {
  return <span className="caret ml-px inline-block h-[1.1em] w-[0.6em] translate-y-[0.15em] bg-term-green" aria-hidden />;
}

/** ASCII progress bar: ████████░░░░ */
export function ProgressBar({ value, total, width = 28 }: { value: number; total: number; width?: number }) {
  const filled = total ? Math.round((value / total) * width) : 0;
  return (
    <span aria-label={`${value} of ${total}`} className="whitespace-pre">
      <span className="text-term-green">{'█'.repeat(filled)}</span>
      <span className="text-term-faint">{'░'.repeat(width - filled)}</span>
    </span>
  );
}

export function scoreTone(score: number | null) {
  if (score === null) return 'text-term-dim';
  return score >= 90 ? 'text-term-green' : score >= 50 ? 'text-term-amber' : 'text-term-red';
}

/** Key/value metric: `fcp ........ 1324ms` */
export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'pass' | 'warn' | 'fail' | 'unknown' }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="shrink-0 text-term-dim">{label}</span>
      <span className="min-w-4 flex-1 overflow-hidden whitespace-nowrap text-term-faint">{'.'.repeat(80)}</span>
      <span className={cn('shrink-0 font-bold tabular-nums', toneCls(tone))}>{value}</span>
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-8 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-term-dim"># {children}</p>;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-term-cyan">
        <span className="text-term-faint">## </span>
        {title}
      </h4>
      <div className="pl-3">{children}</div>
    </div>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto border border-term-line">
      <table className="w-full text-left text-[12px]">
        <thead className="border-b border-term-line bg-term-raised text-term-dim">
          <tr>{head.map((h) => <th key={h} className="whitespace-nowrap px-2 py-1 font-medium uppercase">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-term-line/60 align-top last:border-0 hover:bg-term-raised/60">
              {/* first column holds long URLs/selectors; short columns must not break mid-word */}
              {r.map((c, j) => <td key={j} className={cn('px-2 py-1', j === 0 ? 'break-all' : 'whitespace-nowrap')}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Terminal-style button: `[ re-run ]` */
export function TermButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        'whitespace-nowrap border border-term-line px-2 py-0.5 text-term-fg transition hover:border-term-green hover:text-term-green focus-visible:border-term-green focus-visible:outline-none disabled:opacity-40 disabled:hover:border-term-line disabled:hover:text-term-fg',
        className,
      )}
    >
      {children}
    </button>
  );
}
