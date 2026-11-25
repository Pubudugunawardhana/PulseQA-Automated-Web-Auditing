import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  ChevronDown,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileJson,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CHECK_META, type AuditDetailDTO, type CheckId, type CheckResult } from '@pulseqa/shared';
import { CheckDetails } from '../components/CheckDetails';
import { CHECK_ICON } from '../components/checkIcons';
import { Button, Card, ProgressBar, ScoreRing, Spinner, StatusBadge } from '../components/ui';
import { api, auditKey } from '../lib/api';
import { CHECK_FLAG, EXECUTION_ORDER, headline } from '../lib/checks';
import { diffAudits, type CheckDiff } from '../lib/compare';
import { exportHtml, exportJson } from '../lib/exportReport';
import { cn, formatDate, formatMs } from '../lib/format';
import { useAuditEvents } from '../lib/useAuditEvents';

const clock = (d: Date) => d.toLocaleTimeString(undefined, { hour12: false });

// ───────────────────────── live terminal log ─────────────────────────

function TerminalLog({
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

// ───────────────────────── check card grid ─────────────────────────

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

// ───────────────────────── compare with previous run ─────────────────────────

const CHANGE_STYLE: Record<CheckDiff['change'], { icon: React.ReactNode; cls: string; label: string }> = {
  improved: { icon: <ArrowUpRight className="size-4" />, cls: 'text-ok', label: 'Improved' },
  regressed: { icon: <ArrowDownRight className="size-4" />, cls: 'text-bad', label: 'Regressed' },
  same: { icon: <Minus className="size-4" />, cls: 'text-muted', label: 'No change' },
  new: { icon: <Plus className="size-4" />, cls: 'text-info', label: 'New check' },
};

function CompareCard({ audit, previous }: { audit: AuditDetailDTO; previous: AuditDetailDTO }) {
  const diff = diffAudits(audit, previous);
  const [showAll, setShowAll] = useState(false);
  const changed = diff.checks.filter((c) => c.change !== 'same' || c.newIssues.length || c.fixedIssues.length);
  const rows = showAll ? diff.checks : changed;
  const delta = diff.scoreDelta;
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Changes since the previous run</h2>
          <p className="text-xs text-muted">
            Compared with{' '}
            <Link to={`/audits/${diff.previousId}`} className="font-medium text-brand-strong hover:underline">
              {formatDate(diff.previousAt)}
            </Link>
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">Score</div>
          <div className="text-lg font-semibold tabular-nums">
            {diff.scoreBefore ?? '—'} → {audit.score ?? '—'}{' '}
            {delta !== null && (
              <span className={cn('text-sm', delta > 0 ? 'text-ok' : delta < 0 ? 'text-bad' : 'text-muted')}>
                ({delta > 0 ? `+${delta}` : delta})
              </span>
            )}
          </div>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Nothing changed since the previous run.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {rows.map((c) => {
            const st = CHANGE_STYLE[c.change];
            return (
              <li key={c.checkId} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={cn('inline-flex items-center gap-1 font-medium', st.cls)}>
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
                  <ul className="mt-1.5 space-y-0.5 pl-6 text-xs">
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
        <button onClick={() => setShowAll((s) => !s)} className="mt-2 text-sm font-medium text-brand-strong hover:underline">
          {showAll ? 'Show only changes' : `Show all checks (${diff.checks.length - changed.length} unchanged)`}
        </button>
      )}
    </Card>
  );
}

// ───────────────────────── page ─────────────────────────

export function AuditDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: audit, isLoading, error } = useQuery({ queryKey: auditKey(id), queryFn: () => api.getAudit(id) });
  const live = !!audit && (audit.status === 'queued' || audit.status === 'running');
  const { running } = useAuditEvents(id, live);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedCheck, setSelectedCheck] = useState<CheckId | null>(null);
  const [logOpen, setLogOpen] = useState<boolean | null>(null); // null = automatic (open while running)
  const detailRef = useRef<HTMLDivElement>(null);

  const finished = !!audit && !live;
  const previous = useQuery({
    queryKey: ['previous', id],
    queryFn: () => api.getPrevious(id),
    enabled: finished && audit?.status === 'completed',
  });

  const rerun = useMutation({
    mutationFn: () => api.createAudit({ url: audit!.url, checks: audit!.checks }),
    onSuccess: (a) => navigate(`/audits/${a.id}`),
  });
  const cancel = useMutation({ mutationFn: () => api.cancelAudit(id), onError: (e) => setNotice(`Couldn't cancel: ${(e as Error).message}`) });
  const exporting = useMutation({
    mutationFn: (kind: 'json' | 'html') => (kind === 'json' ? Promise.resolve(exportJson(audit!)) : exportHtml(audit!)),
    onSuccess: (_d, kind) => setNotice(`${kind.toUpperCase()} report downloaded`),
    onError: (e) => setNotice(`Export failed: ${(e as Error).message}`),
  });

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (selectedCheck) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedCheck]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice('Link copied to clipboard');
    } catch {
      setNotice(window.location.href);
    }
  };

  if (isLoading)
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted" />
      </div>
    );
  if (error || !audit)
    return (
      <div className="py-24 text-center">
        <p className="text-muted">{(error as Error)?.message ?? 'Audit not found'}</p>
        <Link to="/" className="mt-3 inline-block font-medium text-brand-strong hover:underline">
          Start a new audit
        </Link>
      </div>
    );

  const results = new Map(audit.results.map((r) => [r.checkId, r]));
  const selected = EXECUTION_ORDER.filter((c) => audit.checks.includes(c));
  const aborted = audit.status === 'failed' || audit.status === 'cancelled';

  // Real per-check start times when recorded; otherwise estimated from durations (older audits)
  const start = audit.startedAt ? new Date(audit.startedAt).getTime() : null;
  let elapsed = 0;
  const times = new Map<CheckId, string>();
  for (const c of selected) {
    const r = results.get(c);
    if (r?.startedAt) times.set(c, clock(new Date(r.startedAt)));
    else if (start !== null) times.set(c, clock(new Date(start + elapsed)));
    if (!r) break;
    elapsed += r.durationMs;
  }

  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const r of audit.results) {
    if (r.status === 'pass') counts.pass++;
    else if (r.status === 'warn') counts.warn++;
    else if (r.status === 'fail' || r.status === 'error') counts.fail++;
  }
  const done = audit.results.length;
  const current = running ?? (audit.status === 'running' ? (selected.find((c) => !results.has(c)) ?? null) : null);
  const showLog = logOpen ?? live;
  const isOwner = audit.isOwner !== false; // undefined (older API) behaves like owner
  const selectedResult = selectedCheck ? results.get(selectedCheck) : undefined;

  return (
    <div className="space-y-6">
      {!isOwner && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-info/30 bg-info/5 px-4 py-3 text-sm">
          <Eye className="size-4 shrink-0 text-info" />
          <span className="flex-1">
            <span className="font-medium">Shared report — read-only.</span>{' '}
            <span className="text-muted">This audit was run by someone else. Re-run it to get your own copy in your history.</span>
          </span>
        </div>
      )}

      {/* header */}
      <Card className="p-5">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <ScoreRing score={audit.status === 'completed' ? audit.score : null} />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={audit.status === 'completed' && audit.overallStatus ? audit.overallStatus : audit.status} />
              <span className="text-xs text-muted">{formatDate(audit.createdAt)}</span>
            </div>
            <a href={audit.finalUrl ?? audit.url} target="_blank" rel="noreferrer" className="group flex items-center gap-1.5 text-lg font-semibold hover:underline">
              <span className="truncate">{audit.finalUrl ?? audit.url}</span>
              <ExternalLink className="size-4 shrink-0 text-faint group-hover:text-fg" />
            </a>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1 text-muted">
                <Clock className="size-3.5" /> {audit.durationMs ? formatMs(audit.durationMs) : live ? 'In progress…' : '—'}
              </span>
              <span className="text-ok">{counts.pass} passed</span>
              <span className="text-warn">{counts.warn} warnings</span>
              <span className="text-bad">{counts.fail} failed</span>
            </div>
            {audit.error && <p className={cn('text-sm', audit.status === 'completed' ? 'text-warn' : 'text-bad')}>{audit.error}</p>}
          </div>
          <div className="flex flex-wrap gap-2 md:flex-col md:items-stretch">
            {live ? (
              isOwner && <Button variant="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending || cancel.isSuccess}>
                {cancel.isPending || cancel.isSuccess ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
                {cancel.isSuccess ? 'Cancelling…' : 'Cancel audit'}
              </Button>
            ) : (
              <>
                <Button variant="primary" onClick={() => rerun.mutate()} disabled={rerun.isPending}>
                  <RotateCcw className={cn('size-4', rerun.isPending && 'animate-spin')} /> Re-run
                </Button>
                <div className="flex gap-2">
                  <Button onClick={() => exporting.mutate('html')} disabled={exporting.isPending} title="Download a self-contained HTML report">
                    {exporting.isPending && exporting.variables === 'html' ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Report
                  </Button>
                  <Button onClick={() => exporting.mutate('json')} title="Download raw results as JSON" aria-label="Export JSON">
                    <FileJson className="size-4" />
                  </Button>
                  <Button onClick={copyLink} title="Copy link to this audit" aria-label="Copy link">
                    <Copy className="size-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
        {live && (
          <div className="mt-5">
            <div className="mb-1.5 flex justify-between text-xs text-muted">
              <span>{audit.status === 'queued' ? 'Waiting in queue…' : `Running ${current ? CHECK_META[current].name : 'checks'}…`}</span>
              <span>
                {done}/{selected.length} checks
              </span>
            </div>
            <ProgressBar value={done} total={selected.length} />
          </div>
        )}
        {notice && <p className="mt-3 text-sm text-muted">{notice}</p>}
        {rerun.isError && <p className="mt-3 text-sm text-bad">Re-run failed: {(rerun.error as Error).message}</p>}
      </Card>

      {/* live log (terminal) */}
      <div>
        <button onClick={() => setLogOpen(!showLog)} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-fg">
          <ChevronDown className={cn('size-4 transition', !showLog && '-rotate-90')} />
          {live ? 'Live log' : 'Execution log'}
          {live && <span className="ml-1 size-1.5 animate-pulse rounded-full bg-info" />}
        </button>
        {showLog && <TerminalLog audit={audit} selected={selected} results={results} current={current} times={times} />}
      </div>

      {/* check cards */}
      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">Checks</h2>
          {finished && done > 0 && <span className="text-xs text-muted">Click a check to see its full report</span>}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {selected.map((c) => (
            <CheckCard
              key={c}
              id={c}
              result={results.get(c)}
              running={current === c}
              aborted={aborted}
              selected={selectedCheck === c}
              onSelect={() => setSelectedCheck((s) => (s === c ? null : c))}
            />
          ))}
        </div>
      </div>

      {/* selected check report */}
      {selectedResult && (
        <div ref={detailRef} className="scroll-mt-20">
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-3">
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
              <StatusBadge status={selectedResult.status} />
              <Button variant="ghost" onClick={() => setSelectedCheck(null)} aria-label="Close report" className="px-2">
                <X className="size-4" />
              </Button>
            </div>
            <CheckDetails result={selectedResult} />
          </Card>
        </div>
      )}

      {previous.data && <CompareCard audit={audit} previous={previous.data} />}
    </div>
  );
}
