/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CHECK_META, type CheckId, type CheckResult } from '@pulseqa/shared';
import { CheckDetails } from '../components/CheckDetails';
import { Caret, ProgressBar, scoreTone, Spinner, StatusBadge, TermButton } from '../components/ui';
import { api, auditKey } from '../lib/api';
import { cn, formatMs } from '../lib/format';
import { useAuditEvents } from '../lib/useAuditEvents';
import { CHECK_FLAG, EXECUTION_ORDER } from '../lib/checks';

const clock = (d: Date) => d.toLocaleTimeString(undefined, { hour12: false });

/** One-line headline per check. */
function headline(r: CheckResult): string {
  const s = r.summary as Record<string, any>;
  if (r.status === 'skipped' || r.status === 'error') return r.error ?? '';
  switch (r.checkId) {
    case 'smoke':
      return s.reachable === false ? 'site unreachable' : `HTTP ${s.httpStatus} · ${s.title ? `"${s.title}"` : 'no <title>'}`;
    case 'links':
      return `${s.brokenLinks} broken links · ${s.brokenImages} broken images · ${s.linksChecked + s.imagesChecked} checked`;
    case 'consoleNetwork':
      return `${s.uncaughtExceptions} exceptions · ${s.consoleErrors} console errors · ${s.apiFailures} api failures`;
    case 'responsive':
      return s.overflowing?.length ? `overflow on ${s.overflowing.join(', ')}` : 'desktop ✓ tablet ✓ mobile ✓';
    case 'accessibility':
      return `${s.violations} violations (${s.critical} critical, ${s.serious} serious)`;
    case 'performance':
      return `fcp ${formatMs(s.fcp)} · lcp ${formatMs(s.lcp)} · load ${formatMs(s.load)}`;
    case 'security':
      return `${s.https ? 'https' : 'NO HTTPS'} · ${s.headersPassed}/${s.headersTotal} headers`;
  }
}

function Dots({ n = 60 }: { n?: number }) {
  return <span className="min-w-3 flex-1 overflow-hidden whitespace-nowrap text-term-faint">{' ' + '.'.repeat(n)}</span>;
}

function LogLine({ id, result, running, aborted, time }: { id: CheckId; result?: CheckResult; running: boolean; aborted: boolean; time: string | null }) {
  const [open, setOpen] = useState(false);
  const name = CHECK_FLAG[id];

  if (!result) {
    return (
      <div className={cn('flex items-baseline gap-2 px-1', running ? 'text-term-fg' : 'text-term-faint')}>
        <span className="w-[76px] shrink-0">{running ? `[${time ?? '--:--:--'}]` : '          '}</span>
        <span className="shrink-0">{running ? '▶' : '·'}</span>
        <span className="shrink-0">{name}</span>
        <Dots />
        {running ? <Spinner className="text-term-cyan" label="running" /> : aborted ? <span className="text-term-red/70">aborted</span> : <span>waiting</span>}
      </div>
    );
  }

  return (
    <div className="line-in">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group flex w-full items-baseline gap-2 px-1 text-left hover:bg-term-raised focus-visible:bg-term-raised focus-visible:outline-none"
      >
        <span className="w-[76px] shrink-0 text-term-dim">[{time}]</span>
        <span className="shrink-0 text-term-dim group-hover:text-term-green">{open ? '▾' : '▸'}</span>
        <span className="shrink-0 text-term-fg">{name}</span>
        <Dots />
        <span className="w-14 shrink-0 text-right">
          <StatusBadge status={result.status} bare />
        </span>
        <span className="w-14 shrink-0 text-right tabular-nums text-term-dim">{formatMs(result.durationMs)}</span>
      </button>
      <div className="flex gap-2 px-1 text-term-dim">
        <span className="w-[76px] shrink-0" />
        <span className="shrink-0 text-term-faint">└</span>
        <span className="min-w-0 truncate">{headline(result)}</span>
      </div>
      {open && (
        <div className="my-2 ml-[92px] border-l border-term-line py-1 pl-4">
          <CheckDetails result={result} />
        </div>
      )}
    </div>
  );
}

export function AuditDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: audit, isLoading, error } = useQuery({ queryKey: auditKey(id), queryFn: () => api.getAudit(id) });
  const live = !!audit && (audit.status === 'queued' || audit.status === 'running');
  const { running } = useAuditEvents(id, live);

  const rerun = useMutation({
    mutationFn: () => api.createAudit({ url: audit!.url, checks: audit!.checks }),
    onSuccess: (a) => navigate(`/audits/${a.id}`),
  });

  if (isLoading)
    return (
      <p className="text-term-cyan">
        <Spinner /> loading audit {id.slice(0, 8)}…
      </p>
    );
  if (error || !audit)
    return (
      <div className="space-y-2">
        <p className="text-term-red">error: {(error as Error)?.message ?? 'audit not found'}</p>
        <Link to="/" className="text-term-cyan hover:underline">→ start a new audit</Link>
      </div>
    );

  const results = new Map(audit.results.map((r) => [r.checkId, r]));
  const selected = EXECUTION_ORDER.filter((c) => audit.checks.includes(c));
  const all = selected.length === EXECUTION_ORDER.length;
  const flags = all ? '--all' : selected.map((c) => `--${CHECK_FLAG[c]}`).join(' ');

  // Approximate per-line timestamps: start time + cumulative check durations
  const start = audit.startedAt ? new Date(audit.startedAt).getTime() : null;
  let elapsed = 0;
  const times = new Map<CheckId, string>();
  for (const c of selected) {
    if (start === null) break;
    times.set(c, clock(new Date(start + elapsed)));
    const r = results.get(c);
    if (!r) break;
    elapsed += r.durationMs;
  }

  const counts = { pass: 0, warn: 0, fail: 0, skip: 0 };
  for (const r of audit.results) {
    if (r.status === 'pass') counts.pass++;
    else if (r.status === 'warn') counts.warn++;
    else if (r.status === 'fail' || r.status === 'error') counts.fail++;
    else counts.skip++;
  }
  const done = audit.results.length;
  // SSE tells us which check is running; fall back to "first unfinished" (e.g. after a page refresh)
  const current = running ?? (audit.status === 'running' ? selected.find((c) => !results.has(c)) ?? null : null);
  const finished = audit.status === 'completed' || audit.status === 'failed';

  return (
    <div className="space-y-4">
      {/* command echo */}
      <div className="space-y-0.5">
        <div className="flex flex-wrap gap-x-2 text-[14px]">
          <span>
            <span className="text-term-green">qa@pulseqa</span>
            <span className="text-term-dim">:</span>
            <span className="text-term-cyan">~</span>
            <span className="text-term-dim">$</span> <span className="text-term-violet">audit</span>
          </span>
          <a href={audit.url} target="_blank" rel="noreferrer" className="break-all text-term-fg hover:text-term-cyan hover:underline">
            {audit.url}
          </a>
          <span className="text-term-dim">{flags}</span>
        </div>
        <div className="text-term-dim">
          <span className="text-term-faint">→</span> job <span className="text-term-fg">{audit.id.slice(0, 8)}</span> created{' '}
          {new Date(audit.createdAt).toLocaleString(undefined, { hour12: false })}
        </div>
        {audit.finalUrl && audit.finalUrl !== audit.url && (
          <div className="text-term-dim">
            <span className="text-term-faint">→</span> redirected to <span className="text-term-fg">{audit.finalUrl}</span>
          </div>
        )}
        {audit.status === 'queued' && (
          <div className="text-term-amber">
            <Spinner /> waiting in queue…
          </div>
        )}
        {audit.status !== 'queued' && (
          <div className="text-term-dim">
            <span className="text-term-faint">→</span> launching chromium · running {selected.length} checks
          </div>
        )}
      </div>

      {/* log */}
      <div className="space-y-1.5">
        {selected.map((c) => (
          <LogLine key={c} id={c} result={results.get(c)} running={current === c} aborted={audit.status === 'failed'} time={times.get(c) ?? null} />
        ))}
      </div>

      {/* progress while running */}
      {live && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <ProgressBar value={done} total={selected.length} />
          <span className="text-term-dim">
            {done}/{selected.length} {current ? `· ${CHECK_META[current].name}` : ''}
          </span>
        </div>
      )}

      {/* summary */}
      {finished && (
        <div className="line-in space-y-1 border-t border-dashed border-term-line pt-4">
          {audit.status === 'failed' ? (
            <p className="text-term-red">
              ✗ audit failed{audit.error ? `: ${audit.error}` : ''}
            </p>
          ) : (
            <>
              <p className="text-term-dim">── summary ──────────────────────────</p>
              <div className="grid max-w-xl grid-cols-[6.5rem_1fr] gap-y-0.5">
                <span className="text-term-dim">score</span>
                <span className="flex flex-wrap items-center gap-3">
                  <span className={cn('text-lg font-bold tabular-nums', scoreTone(audit.score))}>{audit.score}/100</span>
                  <ProgressBar value={audit.score ?? 0} total={100} width={20} />
                </span>
                <span className="text-term-dim">result</span>
                <span>{audit.overallStatus && <StatusBadge status={audit.overallStatus} />}</span>
                <span className="text-term-dim">checks</span>
                <span>
                  <span className="text-term-green">{counts.pass} passed</span>
                  <span className="text-term-faint"> · </span>
                  <span className="text-term-amber">{counts.warn} warnings</span>
                  <span className="text-term-faint"> · </span>
                  <span className="text-term-red">{counts.fail} failed</span>
                  {counts.skip > 0 && <span className="text-term-dim"> · {counts.skip} skipped</span>}
                </span>
                <span className="text-term-dim">duration</span>
                <span>{formatMs(audit.durationMs)}</span>
              </div>
            </>
          )}
          <p className="pt-2 text-term-faint"># click a line above to expand its report</p>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="text-term-dim">$</span>
            <TermButton onClick={() => rerun.mutate()} disabled={rerun.isPending}>
              {rerun.isPending ? <Spinner /> : '↻'} re-run
            </TermButton>
            <TermButton onClick={() => navigate('/')}>+ new audit</TermButton>
            <TermButton onClick={() => navigate('/audits')}>≡ history</TermButton>
            <Caret />
          </div>
        </div>
      )}
    </div>
  );
}
