// Tiny dependency-free SVG charts. Colors come from the theme tokens (text-ok, stroke-bad…),
// so every chart follows light/dark mode automatically.
import { useId } from 'react';
import { cn } from '../lib/format';

/** Semicircle gauge (0–100) with the value in the middle. */
export function Gauge({ value, toneClass, label, size = 220 }: { value: number | null; toneClass: string; label?: string; size?: number }) {
  const stroke = 18;
  const r = 90;
  const arc = `M ${100 - r} 100 A ${r} ${r} 0 0 1 ${100 + r} 100`;
  const v = Math.max(0, Math.min(100, value ?? 0));
  // end-of-value marker
  const a = Math.PI * (1 - v / 100);
  const mx = 100 + r * Math.cos(a);
  const my = 100 - r * Math.sin(a);
  return (
    <div className="relative mx-auto" style={{ width: size, maxWidth: '100%' }}>
      <svg viewBox={`0 0 200 ${100 + stroke / 2 + 2}`} className="block w-full" aria-hidden>
        <path d={arc} pathLength={100} strokeWidth={stroke} className="fill-none stroke-raised" strokeLinecap="round" />
        <path
          d={arc}
          pathLength={100}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${v} 100`}
          className={cn('fill-none stroke-current transition-[stroke-dasharray] duration-700', toneClass)}
        />
        {value !== null && <circle cx={mx} cy={my} r={4.5} className={cn('fill-current stroke-panel', toneClass)} strokeWidth={2.5} />}
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className="text-4xl font-bold tabular-nums leading-none">{value ?? '—'}</span>
        {label && <span className="mt-1 text-sm text-muted">{label}</span>}
      </div>
    </div>
  );
}

/** Line + soft area sparkline. `null` values are skipped. */
export function Sparkline({
  values,
  className,
  toneClass = 'text-info',
  height = 44,
  title,
}: {
  values: (number | null)[];
  className?: string;
  toneClass?: string;
  height?: number;
  title?: string;
}) {
  const gid = useId();
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (pts.length < 2) return null;
  const W = 240;
  const H = height;
  const pad = 4;
  const ys = pts.map((p) => p[1]);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min;
  const n = values.length - 1 || 1;
  // a flat series sits in the middle instead of on the floor
  const yOf = (v: number) => (span === 0 ? H / 2 : H - pad - ((v - min) / span) * (H - pad * 2));
  const xy = pts.map(([i, v]) => [pad + (i / n) * (W - pad * 2), yOf(v)] as const);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)},${H} L${xy[0][0].toFixed(1)},${H} Z`;
  const [ex, ey] = xy[xy.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={cn('block w-full', toneClass, className)} role="img" aria-label={title ?? 'trend'}>
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
          <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} className="fill-none stroke-current" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={ex} cy={ey} r={3.5} className="fill-current stroke-panel" strokeWidth={2} />
    </svg>
  );
}

/** Horizontal segmented bar (e.g. errors / warnings / notices). */
export function StackedBar({ parts }: { parts: { value: number; className: string; label: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total === 0) return <div className="h-3 rounded-full bg-ok/25" title="No issues" />;
  return (
    <div className="flex h-3 gap-1">
      {parts
        .filter((p) => p.value > 0)
        .map((p) => (
          <div
            key={p.label}
            className={cn('h-full rounded-full transition-all duration-500', p.className)}
            style={{ flexGrow: p.value, flexBasis: 0, minWidth: 8 }}
            title={`${p.label}: ${p.value}`}
          />
        ))}
    </div>
  );
}

export interface PolarSlice {
  label: string;
  /** 0–100, or null when the slice wasn't measured. */
  value: number | null;
  toneClass: string;
}

/** Polar-area chart: one wedge per slice, radius ∝ value, overall score in the middle. */
export function PolarChart({ slices, center, centerClass }: { slices: PolarSlice[]; center: string | number; centerClass?: string }) {
  const C = 150;
  const R = 92;
  const r0 = 26;
  const step = (Math.PI * 2) / slices.length;
  const gap = 0.035;
  const pt = (a: number, r: number) => `${(C + r * Math.sin(a)).toFixed(1)},${(C - r * Math.cos(a)).toFixed(1)}`;
  return (
    <svg viewBox="-44 -4 388 308" className="mx-auto block w-full max-w-[340px]" role="img" aria-label="Score per check">
      {[0.5, 1].map((f) => (
        <circle key={f} cx={C} cy={C} r={r0 + (R - r0) * f} className="fill-none stroke-line" strokeDasharray={f < 1 ? '3 4' : undefined} />
      ))}
      {slices.map((s, i) => {
        const a0 = i * step - step / 2 + gap;
        const a1 = (i + 1) * step - step / 2 - gap;
        const rr = s.value === null ? r0 + 6 : r0 + 8 + (R - r0 - 8) * (s.value / 100);
        const d = `M${pt(a0, r0)} L${pt(a0, rr)} A${rr},${rr} 0 0 1 ${pt(a1, rr)} L${pt(a1, r0)} A${r0},${r0} 0 0 0 ${pt(a0, r0)} Z`;
        const mid = i * step;
        const lx = C + (R + 24) * Math.sin(mid);
        const ly = C - (R + 24) * Math.cos(mid);
        return (
          <g key={s.label}>
            <path d={d} className={cn('fill-current opacity-85 transition-opacity hover:opacity-100', s.toneClass)}>
              <title>{`${s.label}: ${s.value === null ? 'not run' : s.value}`}</title>
            </path>
            <text
              x={lx}
              y={ly}
              textAnchor={Math.abs(Math.sin(mid)) < 0.2 ? 'middle' : Math.sin(mid) > 0 ? 'start' : 'end'}
              dominantBaseline="middle"
              className="fill-muted text-[11px]"
            >
              {s.label}
            </text>
          </g>
        );
      })}
      <circle cx={C} cy={C} r={r0 - 2} className="fill-panel" />
      <text x={C} y={C} textAnchor="middle" dominantBaseline="central" className={cn('fill-current text-[20px] font-bold', centerClass)}>
        {center}
      </text>
    </svg>
  );
}
