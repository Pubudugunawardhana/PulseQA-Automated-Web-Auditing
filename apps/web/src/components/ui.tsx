import { AlertTriangle, Ban, CheckCircle2, CircleDashed, Clock, Loader2, MinusCircle, XCircle } from 'lucide-react';
import { useEffect, useState, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from 'react';
import type { AuditStatus, CheckStatus, OverallStatus } from '@pulseqa/shared';
import { cn } from '../lib/format';

type AnyStatus = CheckStatus | OverallStatus | AuditStatus;

const STATUS: Record<string, { label: string; tag: string; text: string; pill: string; icon: ReactNode }> = {
  pass: { label: 'Pass', tag: 'PASS', text: 'text-ok', pill: 'bg-ok/10 text-ok ring-ok/25', icon: <CheckCircle2 className="size-3.5" /> },
  warn: { label: 'Warning', tag: 'WARN', text: 'text-warn', pill: 'bg-warn/10 text-warn ring-warn/25', icon: <AlertTriangle className="size-3.5" /> },
  fail: { label: 'Fail', tag: 'FAIL', text: 'text-bad', pill: 'bg-bad/10 text-bad ring-bad/25', icon: <XCircle className="size-3.5" /> },
  error: { label: 'Error', tag: 'ERR!', text: 'text-bad', pill: 'bg-bad/10 text-bad ring-bad/25', icon: <XCircle className="size-3.5" /> },
  failed: { label: 'Failed', tag: 'FAIL', text: 'text-bad', pill: 'bg-bad/10 text-bad ring-bad/25', icon: <XCircle className="size-3.5" /> },
  skipped: { label: 'Skipped', tag: 'SKIP', text: 'text-muted', pill: 'bg-raised text-muted ring-line', icon: <MinusCircle className="size-3.5" /> },
  pending: { label: 'Waiting', tag: 'WAIT', text: 'text-faint', pill: 'bg-raised text-muted ring-line', icon: <CircleDashed className="size-3.5" /> },
  queued: { label: 'Queued', tag: 'QUEUED', text: 'text-muted', pill: 'bg-raised text-muted ring-line', icon: <Clock className="size-3.5" /> },
  running: { label: 'Running', tag: 'RUN', text: 'text-info', pill: 'bg-info/10 text-info ring-info/25', icon: <Loader2 className="size-3.5 animate-spin" /> },
  completed: { label: 'Completed', tag: 'DONE', text: 'text-ok', pill: 'bg-ok/10 text-ok ring-ok/25', icon: <CheckCircle2 className="size-3.5" /> },
  cancelled: { label: 'Cancelled', tag: 'CANCELLED', text: 'text-warn', pill: 'bg-warn/10 text-warn ring-warn/25', icon: <Ban className="size-3.5" /> },
};

export const toneCls = (tone?: string) =>
  tone === 'pass' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'fail' ? 'text-bad' : 'text-fg';

/** Pill badge (default) or bare colored text like `PASS` (used inside the terminal log). */
export function StatusBadge({ status, bare }: { status: AnyStatus; bare?: boolean }) {
  const s = STATUS[status] ?? STATUS.pending;
  if (bare) {
    if (status === 'running') return <Spinner className="text-info" label="RUN" />;
    return <span className={cn('font-bold', s.text)}>{s.tag}</span>;
  }
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', s.pill)}>
      {s.icon}
      {s.label}
    </span>
  );
}

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
/** Braille spinner (terminal style). */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % FRAMES.length), 80);
    return () => clearInterval(t);
  }, []);
  return (
    <span className={cn('font-mono font-bold', className)}>
      {FRAMES[i]}
      {label && ` ${label}`}
    </span>
  );
}

export function Caret() {
  return <span className="caret ml-px inline-block h-[1.1em] w-[0.55em] translate-y-[0.15em] bg-ok" aria-hidden />;
}

/** Smooth progress bar. */
export function ProgressBar({ value, total, className }: { value: number; total: number; className?: string }) {
  const pct = total ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className={cn('h-2 overflow-hidden rounded-full bg-raised', className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function scoreTone(score: number | null) {
  if (score === null) return 'text-muted';
  return score >= 90 ? 'text-ok' : score >= 50 ? 'text-warn' : 'text-bad';
}

export function ScoreRing({ score, size = 96 }: { score: number | null; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const value = score ?? 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={8} className="fill-none stroke-raised" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (value / 100) * c}
          className={cn('fill-none stroke-current transition-all duration-700', scoreTone(score))}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums">{score ?? '—'}</span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted">score</span>
      </div>
    </div>
  );
}

export function Card({ children, className, ...props }: ComponentProps<'div'>) {
  return (
    <div {...props} className={cn('rounded-xl border border-line bg-panel shadow-sm', className)}>
      {children}
    </div>
  );
}

/** Metric tile: small label above a bold value. */
export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'pass' | 'warn' | 'fail' | 'unknown' }) {
  return (
    <div className="rounded-lg bg-raised px-3 py-2">
      <div className="truncate text-[11px] font-medium uppercase tracking-wide text-muted">{label.replace(/_/g, ' ')}</div>
      <div className={cn('mt-0.5 text-base font-semibold tabular-nums', toneCls(tone))}>{value}</div>
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line px-3 py-3 text-center text-sm text-muted">{children}</p>;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-fg">{title.charAt(0).toUpperCase() + title.slice(1)}</h4>
      <div>{children}</div>
    </div>
  );
}

export function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-raised text-xs text-muted">
          <tr>{head.map((h) => <th key={h} className="whitespace-nowrap px-3 py-2 font-medium capitalize">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i} className="align-top hover:bg-raised/50">
              {/* first column holds long URLs/selectors; short columns must not break mid-word */}
              {r.map((c, j) => <td key={j} className={cn('px-3 py-2', j === 0 ? 'break-all' : 'whitespace-nowrap')}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerSolid';
const BUTTON: Record<ButtonVariant, string> = {
  primary: 'bg-brand-strong text-white hover:brightness-110 shadow-sm',
  secondary: 'border border-line bg-panel text-fg hover:bg-raised',
  ghost: 'text-muted hover:bg-raised hover:text-fg',
  danger: 'border border-bad/30 bg-bad/10 text-bad hover:bg-bad/15',
  dangerSolid: 'bg-bad text-white hover:brightness-110 shadow-sm',
};

export function Button({ variant = 'secondary', className, children, ...props }: ComponentProps<'button'> & { variant?: ButtonVariant }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-50',
        BUTTON[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Kept for compatibility: secondary button. */
export const TermButton = (props: ButtonHTMLAttributes<HTMLButtonElement>) => <Button variant="secondary" {...props} />;

/** Card with a header row (title · subtitle · action) and a body — the building block of the audit dashboard. */
export function SectionCard({
  title,
  subtitle,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={cn('flex min-w-0 flex-col', className)}>
      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0 text-sm">{action}</div>}
      </div>
      <div className={cn('min-w-0 flex-1', bodyClassName ?? 'p-5')}>{children}</div>
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-raised', className)} />;
}
