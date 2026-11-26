import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Lock, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AuditDTO } from '@pulseqa/shared';
import { Button, Card, Empty, scoreTone, StatusBadge } from '../components/ui';
import { api } from '../lib/api';
import { cn, formatDate, formatMs, hostOf } from '../lib/format';

const LIMIT = 20;

function Row({ a, onDelete, deleting }: { a: AuditDTO; onDelete: () => void; deleting: boolean }) {
  const busy = a.status === 'running' || a.status === 'queued';
  return (
    <tr className="group hover:bg-raised/60">
      <td className="px-4 py-3">
        <span className={cn('text-lg font-bold tabular-nums', scoreTone(a.score))}>{a.score ?? '—'}</span>
      </td>
      <td className="max-w-0 w-full px-4 py-3">
        <Link to={`/audits/${a.id}`} className="block min-w-0">
          <span className="block truncate font-medium group-hover:text-brand-strong">{hostOf(a.url)}</span>
          <span className="block truncate text-xs text-muted">{a.url}</span>
        </Link>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={a.status === 'completed' && a.overallStatus ? a.overallStatus : a.status} />
      </td>
      <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-muted md:table-cell">{formatDate(a.createdAt)}</td>
      <td className="hidden whitespace-nowrap px-4 py-3 text-right text-sm tabular-nums text-muted sm:table-cell">{formatMs(a.durationMs)}</td>
      <td className="px-2 py-3 text-right">
        <button
          onClick={() => confirm(`Delete the audit of ${a.url}? This also removes its screenshots.`) && onDelete()}
          disabled={busy || deleting}
          className="rounded-lg p-2 text-faint transition hover:bg-bad/10 hover:text-bad disabled:pointer-events-none disabled:opacity-30"
          aria-label={`Delete audit of ${a.url}`}
          title={busy ? 'Running audits can’t be deleted' : 'Delete'}
        >
          <Trash2 className="size-4" />
        </button>
      </td>
    </tr>
  );
}

export function History() {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(filter.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [filter]);

  const qc = useQueryClient();
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['audits', page, q],
    queryFn: () => api.listAudits(page, LIMIT, q),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (query.state.data?.items.some((a) => a.status === 'running' || a.status === 'queued') ? 3000 : false),
  });
  const del = useMutation({
    mutationFn: api.deleteAudit,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['audits'] }),
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit history</h1>
          <p className="text-sm text-muted">
            {data ? `${data.total} audit${data.total === 1 ? '' : 's'}${q ? ` matching “${q}”` : ''}` : ' '}
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-faint" title="No login needed: audits are tied to this browser. Share an audit's link to show it to others (read-only).">
              <Lock className="size-3" /> Private to this browser
            </span>
            {data?.historyLimit && (
              <span className="ml-2 text-xs text-faint" title="When you start a new audit, the oldest one is removed automatically.">
                · Keeps your latest {data.historyLimit}
              </span>
            )}
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <label className="relative flex-1 sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search by URL…"
              aria-label="Filter audits by URL"
              className="h-10 w-full rounded-lg border border-line bg-panel pl-9 pr-3 text-sm outline-none transition placeholder:text-faint focus:border-brand"
            />
            {isFetching && !isLoading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-faint" />}
          </label>
          <Link to="/new">
            <Button variant="primary" className="h-10">
              <Plus className="size-4" /> <span className="hidden sm:inline">New audit</span>
            </Button>
          </Link>
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted" />
        </div>
      )}
      {error && <p className="text-bad">{(error as Error).message}</p>}
      {del.isError && <p className="text-sm text-bad">{(del.error as Error).message}</p>}

      {data && data.items.length === 0 && (
        <Empty>
          {q ? (
            <>No audits match “{q}”.</>
          ) : (
            <>
              No audits yet.{' '}
              <Link to="/new" className="font-medium text-brand-strong hover:underline">
                Run your first one
              </Link>
            </>
          )}
        </Empty>
      )}

      {data && data.items.length > 0 && (
        <Card className="overflow-hidden">
          <table className="w-full text-left">
            <thead className="border-b border-line bg-raised text-xs text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Score</th>
                <th className="px-4 py-2 font-medium">Website</th>
                <th className="px-4 py-2 font-medium">Result</th>
                <th className="hidden px-4 py-2 font-medium md:table-cell">Date</th>
                <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Duration</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.items.map((a) => (
                <Row key={a.id} a={a} onDelete={() => del.mutate(a.id)} deleting={del.isPending} />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <Button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="text-muted">
            Page {page} of {pages}
          </span>
          <Button disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
