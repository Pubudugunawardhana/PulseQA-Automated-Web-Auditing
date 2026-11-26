// Page header: breadcrumb, site identity, meta chips and actions (+ progress while running).
import { Ban, Calendar, Check, ChevronRight, Clock, ExternalLink, Eye, Layers, Link2, Loader2, RotateCcw, Stamp } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CHECK_META, type AuditDetailDTO, type CheckId } from '@pulseqa/shared';
import { cn, formatDate, formatMs, hostOf } from '../../lib/format';
import { Button, ProgressBar, StatusBadge } from '../ui';
import { ExportMenu } from './ExportMenu';

function Chip({ icon, children, title }: { icon?: ReactNode; children: ReactNode; title?: string }) {
  return (
    <span title={title} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1 text-xs text-muted">
      {icon}
      {children}
    </span>
  );
}

export function AuditHeader({
  audit,
  live,
  isOwner,
  done,
  total,
  current,
  onRerun,
  rerunPending,
  onCancel,
  cancelling,
  onExport,
  exporting,
  notice,
}: {
  audit: AuditDetailDTO;
  live: boolean;
  isOwner: boolean;
  done: number;
  total: number;
  current: CheckId | null;
  onRerun: () => void;
  rerunPending: boolean;
  onCancel: () => void;
  cancelling: boolean;
  onExport: (kind: 'html' | 'json') => void;
  exporting: boolean;
  notice: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const url = audit.finalUrl ?? audit.url;
  const host = hostOf(url);
  const status = audit.status === 'completed' && audit.overallStatus ? audit.overallStatus : audit.status;

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split('?')[0]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <header className="space-y-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-muted">
        <Link to="/audits" className="hover:text-fg">
          History
        </Link>
        <ChevronRight className="size-3.5 text-faint" />
        <span className="truncate text-fg">{host}</span>
      </nav>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand to-info text-lg font-bold uppercase text-white shadow-sm">
            {host.replace(/^www\./, '').charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <span className="truncate">{host}</span>
              <a href={url} target="_blank" rel="noreferrer" className="shrink-0 text-faint hover:text-fg" aria-label={`Open ${url} in a new tab`}>
                <ExternalLink className="size-4" />
              </a>
            </h1>
            <p className="truncate text-sm text-muted">{url}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <StatusBadge status={status} />
              <Chip icon={<Calendar className="size-3.5" />}>{formatDate(audit.createdAt)}</Chip>
              <Chip icon={<Clock className="size-3.5" />}>{audit.durationMs ? formatMs(audit.durationMs) : live ? 'In progress' : '—'}</Chip>
              <Chip icon={<Layers className="size-3.5" />}>
                {audit.checks.length} check{audit.checks.length === 1 ? '' : 's'}
              </Chip>
              {audit.isVisualBaseline && (
                <Chip icon={<Stamp className="size-3.5 text-brand-strong" />} title="Future runs of this URL are compared with this run's screenshots">
                  Visual baseline
                </Chip>
              )}
              {!isOwner && (
                <Chip icon={<Eye className="size-3.5 text-info" />} title="This audit was run by someone else. Re-run it to get your own copy in your history.">
                  Shared report · read-only
                </Chip>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {live ? (
            isOwner && (
              <Button variant="danger" onClick={onCancel} disabled={cancelling}>
                {cancelling ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
                {cancelling ? 'Cancelling…' : 'Cancel audit'}
              </Button>
            )
          ) : (
            <>
              <Button onClick={share} title="Copy a read-only link to this report">
                {copied ? <Check className="size-4 text-ok" /> : <Link2 className="size-4" />} {copied ? 'Copied' : 'Share'}
              </Button>
              <ExportMenu onExport={onExport} busy={exporting} />
              <Button variant="primary" onClick={onRerun} disabled={rerunPending}>
                <RotateCcw className={cn('size-4', rerunPending && 'animate-spin')} /> Re-run
              </Button>
            </>
          )}
        </div>
      </div>

      {live && (
        <div className="rounded-xl border border-line bg-panel px-4 py-3">
          <div className="mb-2 flex justify-between text-xs">
            <span className="flex items-center gap-2 text-muted">
              <span className="size-1.5 animate-pulse rounded-full bg-info" />
              {audit.status === 'queued' ? 'Waiting in queue…' : `Running ${current ? CHECK_META[current].name : 'checks'}…`}
            </span>
            <span className="tabular-nums text-muted">
              {done}/{total} checks
            </span>
          </div>
          <ProgressBar value={done} total={total} />
        </div>
      )}
      {audit.error && <p className={cn('text-sm', audit.status === 'completed' ? 'text-warn' : 'text-bad')}>{audit.error}</p>}
      {notice && <p className="text-sm text-muted">{notice}</p>}
    </header>
  );
}
