// Report panels for the SEO, Visual Regression and Cross-browser checks.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, CheckCircle2, ExternalLink, ImageOff, Loader2, Stamp, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BROWSER_NAME, type AuditDetailDTO, type CheckResult, type CrawlPage, type Rating, type VisualViewport } from '@pulseqa/shared';
import { api, auditKey } from '../lib/api';
import { shape } from '../lib/checks';
import { cn, formatDate, formatMs, hostOf } from '../lib/format';
import { useConfirm } from './ConfirmDialog';
import { Button, Empty, Section, Stat, StatGrid } from './ui';

const RATING_ICON: Record<Rating, { cls: string; mark: string }> = {
  pass: { cls: 'text-ok', mark: '✓' },
  warn: { cls: 'text-warn', mark: '!' },
  fail: { cls: 'text-bad', mark: '✗' },
  unknown: { cls: 'text-muted', mark: '?' },
};

const toneOf = (r: Rating) => (r === 'pass' ? 'pass' : r === 'warn' ? 'warn' : r === 'fail' ? 'fail' : undefined);

// ───────────────────────── SEO ─────────────────────────

export function Seo({ r, audit }: { r: CheckResult; audit?: AuditDetailDTO }) {
  const { summary: s, details: d } = shape(r, 'seo');
  const base = audit?.finalUrl ?? audit?.url ?? undefined;
  const abs = (u?: string) => {
    if (!u) return undefined;
    try {
      return new URL(u, base).toString();
    } catch {
      return undefined;
    }
  };
  const image = abs(d.og.image);
  const shareTitle = d.og.title ?? d.title ?? '(no title)';
  const shareText = d.og.description ?? d.description ?? '';
  return (
    <div className="space-y-4">
      <StatGrid>
        <Stat label="passed" value={s.passed} tone="pass" />
        <Stat label="warnings" value={s.warnings} tone={s.warnings ? 'warn' : 'pass'} />
        <Stat label="failed" value={s.failed} tone={s.failed ? 'fail' : 'pass'} />
        <Stat label="indexable" value={s.indexable ? 'yes' : 'no'} tone={s.indexable ? 'pass' : 'fail'} />
        <Stat label="json_ld" value={d.jsonLdTypes.length ? d.jsonLdTypes.slice(0, 2).join(', ') : 'none'} />
        <Stat label="sitemap_urls" value={d.sitemap?.urls ?? '—'} />
      </StatGrid>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-raised text-xs text-muted">
              <tr>
                <th className="w-8 px-3 py-2" />
                <th className="px-3 py-2 font-medium">Rule</th>
                <th className="px-3 py-2 font-medium">Found</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {d.rules.map((rule) => (
                <tr key={rule.id} className="align-top">
                  <td className={cn('px-3 py-2 text-center font-bold', RATING_ICON[rule.status].cls)}>{RATING_ICON[rule.status].mark}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-fg">{rule.label}</div>
                    <div className="text-xs text-muted">{rule.message}</div>
                  </td>
                  <td className="break-all px-3 py-2 text-muted">{rule.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Section title="share preview">
          <div className="overflow-hidden rounded-lg border border-line bg-panel">
            {image ? (
              <img src={image} alt="" className="aspect-[1.91/1] w-full bg-raised object-cover" loading="lazy" referrerPolicy="no-referrer" />
            ) : (
              <div className="grid aspect-[1.91/1] place-items-center bg-raised text-xs text-faint">
                <span className="flex flex-col items-center gap-1">
                  <ImageOff className="size-5" /> no og:image
                </span>
              </div>
            )}
            <div className="space-y-0.5 border-t border-line px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-wide text-faint">{base ? hostOf(base) : ''}</div>
              <div className="line-clamp-2 text-sm font-semibold text-fg">{shareTitle}</div>
              {shareText && <div className="line-clamp-2 text-xs text-muted">{shareText}</div>}
            </div>
          </div>
          <p className="mt-1.5 text-[11px] text-faint">How a link to this page looks on Facebook, LinkedIn, WhatsApp and Slack.</p>
        </Section>
      </div>

      {d.headings.length > 0 && (
        <Section title="heading outline">
          <ul className="space-y-0.5 text-[13px]">
            {d.headings.slice(0, 15).map((h, i) => (
              <li key={i} style={{ paddingLeft: (h.level - 1) * 14 }} className="truncate text-muted">
                <span className="mr-1.5 font-mono text-[11px] text-accent">h{h.level}</span>
                {h.text || <em className="text-faint">(empty)</em>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

// ───────────────────────── Visual regression ─────────────────────────

function Shot({ title, src, tone }: { title: string; src: string | null; tone?: string }) {
  return (
    <figure className="min-w-0 overflow-hidden rounded-lg border border-line bg-raised">
      <figcaption className="flex items-center justify-between border-b border-line px-2.5 py-1 text-[11px] text-muted">
        <span className={cn('font-medium', tone)}>{title}</span>
        {src && (
          <a href={src} target="_blank" rel="noreferrer" className="hover:text-fg" aria-label={`Open ${title} full size`}>
            <ExternalLink className="size-3.5" />
          </a>
        )}
      </figcaption>
      {src ? (
        <a href={src} target="_blank" rel="noreferrer">
          <img src={src} alt={`${title} screenshot`} loading="lazy" className="h-64 w-full bg-white object-cover object-top" />
        </a>
      ) : (
        <div className="grid h-64 place-items-center text-xs text-faint">—</div>
      )}
    </figure>
  );
}

function ViewportDiff({ v }: { v: VisualViewport }) {
  const tone = v.status === 'fail' ? 'text-bad' : v.status === 'warn' ? 'text-warn' : 'text-ok';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold capitalize text-fg">{v.label}</span>
        <span className="text-xs text-faint">
          {v.width}×{v.height}
        </span>
        {v.diffPercent !== null && (
          <span className={cn('rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums', tone, v.status === 'pass' ? 'bg-ok/10' : v.status === 'warn' ? 'bg-warn/10' : 'bg-bad/10')}>
            {v.diffPercent}% changed
          </span>
        )}
        {v.heightChangePercent ? (
          <span className="text-xs text-muted">
            page height {v.heightChangePercent > 0 ? '+' : ''}
            {v.heightChangePercent}%
          </span>
        ) : null}
        {v.error && <span className="text-xs text-warn">{v.error}</span>}
      </div>
      <div className={cn('grid gap-3', v.baseline ? 'sm:grid-cols-3' : 'sm:grid-cols-1 sm:max-w-sm')}>
        {v.baseline && <Shot title="Baseline" src={v.baseline} />}
        <Shot title="Current" src={v.current || null} />
        {v.baseline && <Shot title="Diff" src={v.diff} tone={tone} />}
      </div>
    </div>
  );
}

export function Visual({ r, audit }: { r: CheckResult; audit?: AuditDetailDTO }) {
  const { summary: s, details: d } = shape(r, 'visual');
  const qc = useQueryClient();
  const confirm = useConfirm();
  const approve = useMutation({
    mutationFn: () => api.approveBaseline(audit!.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: auditKey(audit!.id) });
      void qc.invalidateQueries({ queryKey: ['audits'] });
    },
  });
  const isOwner = audit?.isOwner !== false;
  const isBaseline = audit?.isVisualBaseline || approve.isSuccess;
  const current = audit?.visualBaseline;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-raised/50 px-4 py-3 text-sm sm:flex-row sm:items-center">
        <Stamp className="size-5 shrink-0 text-brand-strong" />
        <div className="min-w-0 flex-1">
          {isBaseline ? (
            <>
              <span className="font-medium text-fg">This run is the approved baseline.</span>{' '}
              <span className="text-muted">Future runs of this URL are compared with these screenshots.</span>
            </>
          ) : s.baselineCreated ? (
            <>
              <span className="font-medium text-fg">First visual run — saved as the baseline.</span>{' '}
              <span className="text-muted">Re-run the audit to compare against it.</span>
            </>
          ) : d.baseline ? (
            <>
              <span className="text-muted">Compared with the approved baseline from </span>
              <Link to={`/audits/${d.baseline.auditId}?tab=checks&check=visual`} className="font-medium text-brand-strong hover:underline">
                {formatDate(d.baseline.approvedAt)}
              </Link>
              {current && current.auditId !== d.baseline.auditId && <span className="text-muted"> (a newer baseline has been approved since)</span>}
            </>
          ) : (
            <span className="text-muted">No baseline yet.</span>
          )}
        </div>
        {isOwner && audit && !isBaseline && audit.status === 'completed' && r.screenshots.length > 0 && (
          <Button
            variant="primary"
            onClick={async () => {
              const ok = await confirm({
                title: 'Approve as the new baseline?',
                message: 'This run’s desktop and mobile screenshots become the reference for this URL. Future runs will be compared with them instead of the current baseline.',
                confirmLabel: 'Approve baseline',
              });
              if (ok) approve.mutate();
            }}
            disabled={approve.isPending}
          >
            {approve.isPending ? <Loader2 className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />} Approve as new baseline
          </Button>
        )}
      </div>
      {approve.isError && <p className="text-sm text-bad">{(approve.error as Error).message}</p>}

      <StatGrid>
        {d.viewports.map((v) => (
          <Stat key={v.label} label={`${v.label}_diff`} value={v.diffPercent === null ? '—' : `${v.diffPercent}%`} tone={v.diffPercent === null ? undefined : toneOf(v.status)} />
        ))}
        <Stat label="warn_above" value={`${d.thresholds.warn}%`} />
        <Stat label="fail_above" value={`${d.thresholds.fail}%`} />
      </StatGrid>

      {d.viewports.map((v) => (
        <ViewportDiff key={v.label} v={v} />
      ))}
      <p className="text-xs text-faint">
        Red pixels in the diff changed since the baseline. Animations are frozen and pages are captured up to 3000px tall. Dynamic content (ads, dates,
        carousels) can cause small differences.
      </p>
    </div>
  );
}

// ───────────────────────── Cross-browser ─────────────────────────

export function CrossBrowser({ r }: { r: CheckResult }) {
  const { summary: s, details: d } = shape(r, 'crossBrowser');
  return (
    <div className="space-y-4">
      <StatGrid>
        <Stat label="browsers" value={s.browsersTested} />
        <Stat label="loaded_in" value={`${s.loadedIn}/${s.browsersTested}`} tone={s.loadedIn === s.browsersTested ? 'pass' : 'fail'} />
        <Stat label="browser_only_errors" value={s.browserSpecificErrors} tone={s.browserSpecificErrors ? 'warn' : 'pass'} />
        <Stat label="layout_consistent" value={s.inconsistentLayout ? 'no' : 'yes'} tone={s.inconsistentLayout ? 'warn' : 'pass'} />
        <Stat label="viewport" value={d.viewport} />
      </StatGrid>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-raised text-xs text-muted">
            <tr>
              {['Browser', 'Loaded', 'Load time', 'JS errors', 'Console errors', 'Failed requests', 'Overflow'].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {d.runs.map((run) => (
              <tr key={run.browser} className="align-top">
                <td className="whitespace-nowrap px-3 py-2">
                  <div className="font-medium text-fg">{BROWSER_NAME[run.browser]}</div>
                  <div className="text-xs text-faint">{run.version ? `v${run.version}` : ''}</div>
                </td>
                <td className="px-3 py-2">
                  {run.loaded ? (
                    <span className="inline-flex items-center gap-1 text-ok">
                      <CheckCircle2 className="size-4" /> {run.httpStatus}
                    </span>
                  ) : (
                    <span className="inline-flex items-start gap-1 text-bad">
                      <XCircle className="mt-0.5 size-4 shrink-0" /> <span className="text-xs">{run.error ?? `HTTP ${run.httpStatus}`}</span>
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted">{formatMs(run.loadMs)}</td>
                <td className={cn('px-3 py-2 tabular-nums', run.jsErrors.length ? 'text-bad' : 'text-muted')}>{run.loaded ? run.jsErrors.length : '—'}</td>
                <td className={cn('px-3 py-2 tabular-nums', run.consoleErrors.length ? 'text-warn' : 'text-muted')}>{run.loaded ? run.consoleErrors.length : '—'}</td>
                <td className="px-3 py-2 tabular-nums text-muted">{run.loaded ? run.failedRequests : '—'}</td>
                <td className={cn('whitespace-nowrap px-3 py-2', run.horizontalOverflow ? 'text-warn' : 'text-muted')}>
                  {!run.loaded ? '—' : run.horizontalOverflow ? `${run.overflowPx}px` : 'none'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {d.browserOnlyErrors.length > 0 && (
        <Section title="errors in only some browsers">
          <ul className="space-y-1 text-[13px]">
            {d.browserOnlyErrors.map((e) => (
              <li key={e.message} className="flex flex-wrap gap-2">
                {e.browsers.map((b) => (
                  <span key={b} className="rounded bg-bad/10 px-1.5 py-px text-[11px] font-medium text-bad">
                    {BROWSER_NAME[b]}
                  </span>
                ))}
                <span className="break-all text-fg">{e.message}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {d.runs.some((x) => x.screenshot) ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {d.runs.map((run) => (
            <Shot key={run.browser} title={BROWSER_NAME[run.browser]} src={run.screenshot} tone={run.loaded ? undefined : 'text-bad'} />
          ))}
        </div>
      ) : (
        <Empty>no screenshots</Empty>
      )}
    </div>
  );
}

// ───────────────────────── Site crawl ─────────────────────────

type CrawlFilter = 'all' | 'broken' | 'slow' | 'errors' | 'a11y' | 'seo';

/** Higher = worse; used to sort the table worst-first. */
function crawlSeverity(p: CrawlPage, slowMs: number) {
  if (!p.loaded) return 100;
  return (p.jsErrors ? 20 : 0) + ((p.a11yIssues ?? 0) ? 10 : 0) + ((p.loadMs ?? 0) > slowMs ? 15 : 0) + (p.brokenImages ? 8 : 0) + (!p.title ? 5 : 0) + (!p.description ? 1 : 0);
}

export function Crawl({ r }: { r: CheckResult }) {
  const { summary: s, details: d } = shape(r, 'crawl');
  const [filter, setFilter] = useState<CrawlFilter>('all');
  const slowMs = d.limits.slowMs;
  const dupTitle = new Set(d.duplicateTitles.flatMap((t) => t.urls));
  const match: Record<CrawlFilter, (p: CrawlPage) => boolean> = {
    all: () => true,
    broken: (p) => !p.loaded,
    slow: (p) => p.loaded && (p.loadMs ?? 0) > slowMs,
    errors: (p) => p.jsErrors > 0 || p.brokenImages > 0,
    a11y: (p) => (p.a11yIssues ?? 0) > 0,
    seo: (p) => p.loaded && (!p.title || !p.description || dupTitle.has(p.url)),
  };
  const rows = d.pages.filter(match[filter]).sort((a, b) => crawlSeverity(b, slowMs) - crawlSeverity(a, slowMs));
  const chips: { id: CrawlFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'broken', label: 'Broken' },
    { id: 'slow', label: 'Slow' },
    { id: 'errors', label: 'Errors' },
    { id: 'a11y', label: 'Accessibility' },
    { id: 'seo', label: 'SEO' },
  ];
  const path = (u: string) => {
    try {
      const x = new URL(u);
      return (x.pathname + x.search) || '/';
    } catch {
      return u;
    }
  };

  return (
    <div className="space-y-4">
      <StatGrid>
        <Stat label="pages_crawled" value={s.pagesCrawled} />
        <Stat label="broken" value={s.broken} tone={s.broken ? 'fail' : 'pass'} />
        <Stat label="slow" value={s.slow} tone={s.slow ? 'warn' : 'pass'} />
        <Stat label="with_js_errors" value={s.withJsErrors} tone={s.withJsErrors ? 'warn' : 'pass'} />
        <Stat label="with_a11y_issues" value={s.withA11yIssues} tone={s.withA11yIssues ? 'warn' : 'pass'} />
        <Stat label="avg_load" value={formatMs(s.avgLoadMs)} />
      </StatGrid>
      <p className="text-xs text-muted">
        Followed internal links from this page — up to {d.limits.maxPages} pages, {d.limits.maxDepth} clicks deep, 3 at a time
        {s.notCrawled ? ` · ${s.notCrawled} more found but not crawled` : ''}
        {d.skippedByRobots ? ` · ${d.skippedByRobots} skipped (robots.txt)` : ''}
        {s.partial ? ' · stopped early at the time limit' : ''}. Load times are measured with 3 pages loading in parallel.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => {
          const n = d.pages.filter(match[c.id]).length;
          return (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
                filter === c.id ? 'border-brand bg-brand/10 text-brand-strong' : 'border-line text-muted hover:text-fg',
              )}
            >
              {c.label} <span className="tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-raised text-xs text-muted">
            <tr>
              {['Page', 'Status', 'Load', 'JS errors', 'Broken img', 'A11y', 'SEO'].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted">
                  No pages match this filter.
                </td>
              </tr>
            ) : (
              rows.map((p) => {
                const seo = [!p.title && 'no title', !p.description && 'no description', dupTitle.has(p.url) && 'duplicate title', p.h1Count !== 1 && p.loaded && `${p.h1Count} h1`].filter(Boolean);
                return (
                  <tr key={p.url} className="align-top">
                    <td className="max-w-[340px] px-3 py-2">
                      <a href={p.url} target="_blank" rel="noreferrer" className="block truncate font-medium text-info hover:underline" title={p.url}>
                        {path(p.url)}
                      </a>
                      <div className="truncate text-xs text-muted">{p.error ?? p.title ?? ''}</div>
                    </td>
                    <td className={cn('whitespace-nowrap px-3 py-2 tabular-nums', p.loaded ? 'text-ok' : 'text-bad')}>{p.status ?? (p.loaded ? '—' : 'failed')}</td>
                    <td className={cn('whitespace-nowrap px-3 py-2 tabular-nums', (p.loadMs ?? 0) > slowMs ? 'text-warn' : 'text-muted')}>{formatMs(p.loadMs)}</td>
                    <td className={cn('px-3 py-2 tabular-nums', p.jsErrors ? 'text-bad' : 'text-muted')} title={p.firstJsError}>
                      {p.loaded ? p.jsErrors : '—'}
                    </td>
                    <td className={cn('px-3 py-2 tabular-nums', p.brokenImages ? 'text-bad' : 'text-muted')}>{p.loaded ? p.brokenImages : '—'}</td>
                    <td className={cn('px-3 py-2 tabular-nums', (p.a11yIssues ?? 0) ? 'text-warn' : 'text-muted')}>{p.a11yIssues ?? '—'}</td>
                    <td className="px-3 py-2 text-xs">{seo.length ? <span className="text-warn">{seo.join(' · ')}</span> : <span className="text-ok">✓</span>}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {d.duplicateTitles.length > 0 && (
        <Section title="duplicate titles">
          <ul className="space-y-1.5 text-[13px]">
            {d.duplicateTitles.map((t) => (
              <li key={t.title}>
                <span className="font-medium text-fg">“{t.title}”</span> <span className="text-muted">on {t.urls.length} pages: </span>
                <span className="break-all text-muted">{t.urls.map(path).join(', ')}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
