import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AuditDTO } from '@pulseqa/shared';
import { Caret, scoreTone, Spinner, StatusBadge, TermButton } from '../components/ui';
import { api } from '../lib/api';
import { cn, formatMs, hostOf } from '../lib/format';

const LIMIT = 20;

const stamp = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });

function Row({ a, onDelete, deleting }: { a: AuditDTO; onDelete: () => void; deleting: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const busy = a.status === 'running' || a.status === 'queued';
  return (
    <tr className="group border-b border-term-line/50 hover:bg-term-raised">
      <td className="py-1 pr-4 text-term-dim">{a.id.slice(0, 8)}</td>
      <td className="whitespace-nowrap py-1 pr-4 text-term-dim">{stamp(a.createdAt)}</td>
      <td className={cn('py-1 pr-4 text-right font-bold tabular-nums', scoreTone(a.score))}>{a.score ?? '--'}</td>
      <td className="py-1 pr-4">
        <StatusBadge status={a.status === 'completed' && a.overallStatus ? a.overallStatus : a.status} />
      </td>
      <td className="whitespace-nowrap py-1 pr-4 text-right tabular-nums text-term-dim">{formatMs(a.durationMs)}</td>
      <td className="max-w-0 w-full py-1 pr-4">
        <Link to={`/audits/${a.id}`} className="block truncate text-term-cyan hover:underline" title={a.url}>
          {hostOf(a.url)}
          <span className="text-term-dim">{a.url.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '')}</span>
        </Link>
      </td>
      <td className="whitespace-nowrap py-1 text-right">
        {confirming ? (
          <span className="space-x-2">
            <span className="text-term-amber">rm?</span>
            <button className="text-term-red hover:underline" onClick={onDelete} disabled={deleting}>y</button>
            <button className="text-term-dim hover:underline" onClick={() => setConfirming(false)}>n</button>
          </span>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            disabled={busy}
            className="text-term-faint opacity-0 transition hover:text-term-red focus-visible:opacity-100 group-hover:opacity-100 disabled:hidden"
            aria-label={`Delete audit of ${a.url}`}
          >
            rm
          </button>
        )}
      </td>
    </tr>
  );
}

export function History() {
  const [page, setPage] = useState(1);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['audits', page],
    queryFn: () => api.listAudits(page, LIMIT),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (q.state.data?.items.some((a) => a.status === 'running' || a.status === 'queued') ? 3000 : false),
  });
  const del = useMutation({
    mutationFn: api.deleteAudit,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audits'] }),
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <div className="space-y-3">
      <div className="text-[14px]">
        <span className="text-term-green">qa@pulseqa</span>
        <span className="text-term-dim">:</span>
        <span className="text-term-cyan">~</span>
        <span className="text-term-dim">$</span> <span className="text-term-violet">ls</span> -la audits/
        {page > 1 && <span className="text-term-dim"> --page {page}</span>}
      </div>

      {isLoading && (
        <p className="text-term-cyan">
          <Spinner /> reading audits…
        </p>
      )}
      {error && <p className="text-term-red">ls: {(error as Error).message}</p>}
      {del.isError && <p className="text-term-red">rm: {(del.error as Error).message}</p>}

      {data && (
        <>
          <p className="text-term-dim">total {data.total}</p>
          {data.items.length === 0 ? (
            <p className="text-term-dim">
              # no audits yet —{' '}
              <Link to="/" className="text-term-cyan hover:underline">run your first one</Link>
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead className="text-[11px] uppercase text-term-faint">
                  <tr className="border-b border-term-line">
                    <th className="py-1 pr-4 font-normal">id</th>
                    <th className="py-1 pr-4 font-normal">date</th>
                    <th className="py-1 pr-4 text-right font-normal">score</th>
                    <th className="py-1 pr-4 font-normal">result</th>
                    <th className="py-1 pr-4 text-right font-normal">time</th>
                    <th className="py-1 pr-4 font-normal">target</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((a) => (
                    <Row key={a.id} a={a} onDelete={() => del.mutate(a.id)} deleting={del.isPending} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <span className="text-term-dim">$</span>
        {pages > 1 && (
          <>
            <TermButton disabled={page === 1} onClick={() => setPage((p) => p - 1)}>← prev</TermButton>
            <span className="text-term-dim">
              {page}/{pages}
            </span>
            <TermButton disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>next →</TermButton>
          </>
        )}
        <Link to="/" className="border border-term-line px-2 py-0.5 hover:border-term-green hover:text-term-green">+ new audit</Link>
        <Caret />
      </div>
    </div>
  );
}
