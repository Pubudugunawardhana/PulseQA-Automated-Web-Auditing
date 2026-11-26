import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CHECK_IDS, classifyIssues, issueKeys, type CheckId, type IssueSeverity } from '@pulseqa/shared';
import { AuditHeader } from '../components/audit/AuditHeader';
import { AuditTabs } from '../components/audit/AuditTabs';
import { ChecksTab } from '../components/audit/ChecksTab';
import { IssuesTab, type SeverityFilter } from '../components/audit/IssuesTab';
import { TerminalLog } from '../components/audit/LogTab';
import { OverviewTab } from '../components/audit/OverviewTab';
import { ScreenshotsTab } from '../components/audit/ScreenshotsTab';
import { TAB_IDS, type TabId } from '../components/audit/shared';
import { Skeleton } from '../components/ui';
import { api, auditKey } from '../lib/api';
import { EXECUTION_ORDER } from '../lib/checks';
import { exportHtml, exportJson } from '../lib/exportReport';
import { formatDate } from '../lib/format';
import { useAuditEvents } from '../lib/useAuditEvents';

const clock = (d: Date) => d.toLocaleTimeString(undefined, { hour12: false });

function LoadingSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading audit">
      <Skeleton className="h-4 w-40" />
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
      </div>
      <Skeleton className="h-11 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Skeleton className="h-80 lg:col-span-2" />
        <Skeleton className="h-80" />
      </div>
    </div>
  );
}

export function AuditDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: audit, isLoading, error } = useQuery({ queryKey: auditKey(id), queryFn: () => api.getAudit(id) });
  const live = !!audit && (audit.status === 'queued' || audit.status === 'running');
  const { running, runningSince } = useAuditEvents(id, live);
  const [notice, setNotice] = useState<string | null>(null);

  const finished = !!audit && !live;
  const completed = finished && audit?.status === 'completed';
  const isOwner = audit?.isOwner !== false; // undefined (older API) behaves like owner

  // history + "compare to" (owner only; the API returns [] for others)
  const history = useQuery({ queryKey: ['history', id], queryFn: () => api.getHistory(id), enabled: completed });
  const [compareChoice, setCompareChoice] = useState<string | null>(null); // null = the run right before this one
  const earlierRuns = (history.data ?? []).filter((h) => h.id !== id);
  const compareId = compareChoice ?? earlierRuns[earlierRuns.length - 1]?.id ?? 'none';
  const compare = useQuery({
    queryKey: auditKey(compareId),
    queryFn: () => api.getAudit(compareId),
    enabled: completed && compareId !== 'none',
    staleTime: Infinity, // finished audits don't change
    placeholderData: keepPreviousData, // no flicker while switching "compare to"
  });
  const compareAudit = compareId !== 'none' ? (compare.data ?? null) : null;

  const rerun = useMutation({
    mutationFn: () => api.createAudit({ url: audit!.url, checks: audit!.checks }),
    onSuccess: (a) => navigate(`/audits/${a.id}`),
    onError: (e) => setNotice(`Re-run failed: ${(e as Error).message}`),
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

  const issues = useMemo(() => (audit ? classifyIssues(audit.results) : []), [audit]);
  const previousKeys = useMemo(() => (compareAudit ? new Set(compareAudit.results.flatMap(issueKeys)) : null), [compareAudit]);

  // ── tab state lives in the URL (?tab=…&check=…&severity=…) so it can be shared and Back works ──
  const tabParam = params.get('tab') as TabId | null;
  const tab: TabId = tabParam && TAB_IDS.includes(tabParam) ? tabParam : live ? 'log' : 'overview';
  const checkParam = params.get('check') as CheckId | null;
  const selectedCheck = checkParam && (CHECK_IDS as readonly string[]).includes(checkParam) ? checkParam : null;
  const severityParam = params.get('severity') as SeverityFilter | null;
  const severity: SeverityFilter = severityParam && ['error', 'warning', 'notice'].includes(severityParam) ? severityParam : 'all';

  const go = (next: Record<string, string | null>, replace = false) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(next)) {
          if (v === null) p.delete(k);
          else p.set(k, v);
        }
        return p;
      },
      { replace },
    );
  const setTab = (t: TabId) => {
    go({ tab: t, check: null, severity: null });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const openCheck = (c: CheckId) => go({ tab: 'checks', check: c, severity: null });
  const viewIssues = (s?: IssueSeverity) => {
    go({ tab: 'issues', check: null, severity: s ?? null });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (isLoading) return <LoadingSkeleton />;
  if (error || !audit)
    return (
      <div className="py-24 text-center">
        <p className="text-muted">{(error as Error)?.message ?? 'Audit not found'}</p>
        <Link to="/new" className="mt-3 inline-block font-medium text-brand-strong hover:underline">
          Start a new audit
        </Link>
      </div>
    );

  const results = new Map(audit.results.map((r) => [r.checkId, r]));
  const selected = EXECUTION_ORDER.filter((c) => audit.checks.includes(c));
  const aborted = audit.status === 'failed' || audit.status === 'cancelled';
  const done = audit.results.length;
  const current = running ?? (audit.status === 'running' ? (selected.find((c) => !results.has(c)) ?? null) : null);

  // Real per-check start times when recorded; otherwise estimated from durations (older audits)
  const start = audit.startedAt ? new Date(audit.startedAt).getTime() : null;
  let elapsed = 0;
  const times = new Map<CheckId, string>();
  let prevEnd: number | null = null;
  for (const c of selected) {
    const r = results.get(c);
    if (r?.startedAt) times.set(c, clock(new Date(r.startedAt)));
    else if (!r && c === running && runningSince) times.set(c, clock(runningSince)); // live: when the event arrived
    else if (!r && prevEnd !== null) times.set(c, clock(new Date(prevEnd))); // e.g. after a page refresh
    else if (start !== null) times.set(c, clock(new Date(start + elapsed)));
    if (!r) break;
    elapsed += r.durationMs;
    prevEnd = r.startedAt ? new Date(r.startedAt).getTime() + r.durationMs : null;
  }

  const shots = audit.results.reduce((n, r) => n + r.screenshots.length, 0);
  const compareSelect = completed && earlierRuns.length > 0 && (
    <label className="flex items-center gap-2 text-sm">
      <span className="shrink-0 text-muted">Compare to</span>
      <select
        value={compareId}
        onChange={(e) => setCompareChoice(e.target.value)}
        className="h-8 min-w-0 max-w-64 rounded-lg border border-line bg-panel px-2 text-sm outline-none transition focus:border-brand"
      >
        {[...earlierRuns].reverse().map((h) => (
          <option key={h.id} value={h.id}>
            {formatDate(h.createdAt)} · {h.score ?? '—'}
          </option>
        ))}
        <option value="none">No comparison</option>
      </select>
    </label>
  );

  return (
    <div className="space-y-6">
      <AuditHeader
        audit={audit}
        live={live}
        isOwner={isOwner}
        done={done}
        total={selected.length}
        current={current}
        onRerun={() => rerun.mutate()}
        rerunPending={rerun.isPending}
        onCancel={() => cancel.mutate()}
        cancelling={cancel.isPending || cancel.isSuccess}
        onExport={(k) => exporting.mutate(k)}
        exporting={exporting.isPending}
        notice={notice}
      />

      <AuditTabs
        active={tab}
        onChange={setTab}
        live={live}
        counts={{ issues: completed ? issues.length : undefined, checks: selected.length, screenshots: shots || undefined }}
        aside={compareSelect}
      />

      {compareSelect && <div className="md:hidden">{compareSelect}</div>}

      <div id="audit-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' &&
          (completed ? (
            <OverviewTab
              audit={audit}
              issues={issues}
              history={history.data ?? []}
              compare={compareAudit}
              previousKeys={previousKeys}
              onOpenCheck={openCheck}
              onViewIssues={viewIssues}
            />
          ) : (
            <NotReady live={live} onLog={() => setTab('log')} />
          ))}
        {tab === 'issues' &&
          (completed ? (
            <IssuesTab
              issues={issues}
              previousKeys={previousKeys}
              severity={severity}
              onSeverityChange={(s) => go({ severity: s === 'all' ? null : s }, true)}
              onOpenCheck={openCheck}
            />
          ) : (
            <NotReady live={live} onLog={() => setTab('log')} />
          ))}
        {tab === 'checks' && (
          <ChecksTab
            audit={audit}
            checks={selected}
            results={results}
            current={current}
            aborted={aborted}
            selected={selectedCheck}
            onSelect={(c) => go({ check: c }, true)}
          />
        )}
        {tab === 'screenshots' && <ScreenshotsTab checks={selected} results={results} />}
        {tab === 'log' && <TerminalLog audit={audit} selected={selected} results={results} current={current} times={times} />}
      </div>
    </div>
  );
}

function NotReady({ live, onLog }: { live: boolean; onLog: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-16 text-center">
      <p className="font-medium">{live ? 'The audit is still running…' : 'This audit did not complete.'}</p>
      <p className="mt-1 text-sm text-muted">{live ? 'Results appear here as soon as it finishes.' : 'See the log for what happened, or re-run it.'}</p>
      <button onClick={onLog} className="mt-4 text-sm font-medium text-brand-strong hover:underline">
        Open the live log →
      </button>
    </div>
  );
}
