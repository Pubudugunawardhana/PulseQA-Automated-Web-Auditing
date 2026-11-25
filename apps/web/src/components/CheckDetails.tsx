import { useEffect, useState, type JSX, type ReactNode } from 'react';
import type { CheckId, CheckResult, ConsoleEntry, LinkProbe, NetworkEntry, Party, PerfMetricKey, Rating, Screenshot } from '@pulseqa/shared';
import { shape } from '../lib/checks';
import { cn, formatMs } from '../lib/format';
import { Empty, Section, Stat, StatGrid, StatusBadge, Table, toneCls } from './ui';

function Lines({ items, tone, mark }: { items?: string[]; tone: string; mark: string }) {
  if (!items?.length) return null;
  return (
    <ul>
      {items.map((i) => (
        <li key={i} className={tone}>
          <span className="text-term-faint">{mark} </span>
          {i}
        </li>
      ))}
    </ul>
  );
}

function Url({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-term-cyan hover:underline">
      {href}
    </a>
  );
}

const Code = ({ children }: { children: ReactNode }) => <code className="text-term-fg">{children}</code>;

function PartyTag({ party }: { party?: Party }) {
  return party === 'third' ? <span className="mr-1 border border-term-line px-1 text-[10px] text-term-dim">3RD-PARTY</span> : null;
}

export function ScreenshotGallery({ shots }: { shots: Screenshot[] }) {
  const [open, setOpen] = useState<Screenshot | null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!shots.length) return null;
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {shots.map((s) => (
          <button key={s.url} onClick={() => setOpen(s)} className="group border border-term-line text-left hover:border-term-green">
            <div className="flex items-center justify-between border-b border-term-line bg-term-raised px-2 py-0.5 text-[11px]">
              <span className="truncate text-term-dim">{s.label}.png</span>
              <span className="shrink-0 text-term-faint group-hover:text-term-green">open ↗</span>
            </div>
            <div className="h-44 overflow-hidden bg-black">
              <img src={s.url} alt={`${s.label} screenshot`} loading="lazy" className="w-full object-cover object-top opacity-90 transition group-hover:opacity-100" />
            </div>
          </button>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 overflow-auto bg-black/90 p-4 sm:p-8" onClick={() => setOpen(null)}>
          <div className="mx-auto max-w-6xl">
            <div className="mb-2 flex justify-between text-term-dim">
              <span>$ open {open.label}.png</span>
              <button className="text-term-fg hover:text-term-red">[esc] close</button>
            </div>
            <img src={open.url} alt={open.label} className="mx-auto max-w-full border border-term-line" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      )}
    </>
  );
}

function Smoke({ r }: { r: CheckResult }) {
  const { summary: s, details: d } = shape(r, 'smoke');
  return (
    <div className="space-y-3">
      <StatGrid>
        <Stat label="http_status" value={s.httpStatus ?? '—'} tone={!s.httpStatus || s.httpStatus >= 400 ? 'fail' : 'pass'} />
        <Stat label="redirects" value={s.redirects ?? 0} />
        <Stat label="title" value={s.title ? 'ok' : 'empty'} tone={s.title ? 'pass' : 'warn'} />
        <Stat label="elements" value={d.elementCount ?? '—'} />
        <Stat label="text_chars" value={d.textLength ?? '—'} />
        <Stat label="viewport_meta" value={d.hasViewportMeta ? 'yes' : 'no'} tone={d.hasViewportMeta ? 'pass' : 'warn'} />
        {d.h1Count !== undefined && <Stat label="h1_headings" value={d.h1Count} tone={d.h1Count === 1 ? 'pass' : 'warn'} />}
        {d.hasFavicon !== undefined && <Stat label="favicon" value={d.hasFavicon ? 'yes' : 'no'} tone={d.hasFavicon ? 'pass' : 'warn'} />}
        <Stat label="lang" value={d.lang || 'none'} tone={d.lang ? 'pass' : 'warn'} />
      </StatGrid>
      {s.title && (
        <p>
          <span className="text-term-dim">title: </span>"{s.title}"
        </p>
      )}
      {d.metaDescription && (
        <p className="text-term-dim">
          description: <span className="text-term-fg">"{d.metaDescription}"</span>
        </p>
      )}
      <Lines items={d.issues} tone="text-term-amber" mark="!" />
      {d.notes?.length ? (
        <Section title="notes (informational — don't affect the result)">
          <Lines items={d.notes} tone="text-term-dim" mark="i" />
        </Section>
      ) : null}
      {(d.redirectChain?.length ?? 0) > 1 && (
        <Section title="redirect chain">
          {d.redirectChain!.map((c, i) => (
            <div key={i} className="text-term-dim">
              {i > 0 && '→ '}
              <span className="text-term-fg">{c.status ?? '---'}</span> {c.url}
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function Links({ r }: { r: CheckResult }) {
  const { summary: s, details: d } = shape(r, 'links');
  const row = (p: LinkProbe) => [
    <Url href={p.url} />,
    p.text || <span className="text-term-faint">—</span>,
    p.status ? (
      <span className={p.status >= 400 ? 'text-term-red' : ''}>{p.status}</span>
    ) : (
      <span className={p.blocked ? 'text-term-dim' : 'text-term-red'}>{p.error ?? 'no response'}</span>
    ),
    <span className="text-term-dim">{p.internal ? 'int' : 'ext'}</span>,
  ];
  return (
    <div className="space-y-3">
      <StatGrid>
        <Stat label="links_checked" value={s.linksChecked} />
        <Stat label="images_checked" value={s.imagesChecked} />
        <Stat label="restricted" value={s.restricted} tone={s.restricted ? 'warn' : undefined} />
        <Stat label="broken_links" value={s.brokenLinks} tone={s.brokenLinks ? 'fail' : 'pass'} />
        <Stat label="broken_images" value={s.brokenImages} tone={s.brokenImages ? 'fail' : 'pass'} />
      </StatGrid>
      {d.truncated && <p className="text-term-dim"># large page: only the first 150 links / 100 images were checked</p>}
      <Section title="broken links">
        {d.brokenLinks.length ? <Table head={['url', 'text', 'status', 'scope']} rows={d.brokenLinks.map(row)} /> : <Empty>no broken links</Empty>}
      </Section>
      <Section title="broken images">
        {d.brokenImages.length ? <Table head={['url', 'alt', 'status', 'scope']} rows={d.brokenImages.map(row)} /> : <Empty>all images loaded</Empty>}
      </Section>
      {d.restricted.length > 0 && (
        <Section title="restricted / unverified (401 · 403 · 429 · bot protection · private network)">
          <Table head={['url', 'text', 'status', 'scope']} rows={d.restricted.map(row)} />
        </Section>
      )}
    </div>
  );
}

function ConsoleNetwork({ r }: { r: CheckResult }) {
  const { summary: s, details: d } = shape(r, 'consoleNetwork');
  const net = (n: NetworkEntry) => [
    n.method,
    <>
      <PartyTag party={n.party} />
      <Url href={n.url} />
    </>,
    n.resourceType,
    <span className="text-term-red">{n.status ?? n.failure}</span>,
  ];
  const logRows = (list: ConsoleEntry[], tone: string) =>
    list.map((c, i) => (
      <div key={i} className="border-b border-term-line/50 py-1 last:border-0">
        <PartyTag party={c.party} />
        <span className={c.party === 'third' ? 'text-term-dim' : tone}>{c.text}</span>
        {c.location && <div className="text-[11px] text-term-faint">  at {c.location}</div>}
      </div>
    ));
  return (
    <div className="space-y-3">
      <StatGrid>
        <Stat label="exceptions" value={s.uncaughtExceptions} tone={s.uncaughtExceptions ? 'fail' : 'pass'} />
        <Stat label="console_errors" value={s.consoleErrors} tone={s.consoleErrors ? 'warn' : 'pass'} />
        <Stat label="console_warnings" value={s.consoleWarnings} />
        <Stat label="api_failures" value={s.apiFailures} tone={s.apiFailures ? 'fail' : 'pass'} />
        <Stat label="other_failed" value={s.otherFailedRequests} tone={s.otherFailedRequests ? 'warn' : 'pass'} />
        <Stat label="third_party_issues" value={s.thirdPartyIssues ?? 0} tone={s.thirdPartyIssues ? 'warn' : undefined} />
      </StatGrid>
      <p className="text-[11px] text-term-faint">
        # counts above are first-party ({d.site ?? 'this site'}) only — third-party scripts (ads, analytics, widgets) are listed but can never fail this check
      </p>
      {d.pageErrors.length > 0 && (
        <Section title="uncaught exceptions">
          {d.pageErrors.map((e, i) => (
            <pre
              key={i}
              className={cn(
                'overflow-x-auto whitespace-pre-wrap border-l-2 p-2 text-[12px]',
                e.party === 'third' ? 'border-term-line text-term-dim' : 'border-term-red bg-term-red/5 text-term-red',
              )}
            >
              <PartyTag party={e.party} />
              {e.stack || e.message}
            </pre>
          ))}
        </Section>
      )}
      <Section title="console errors">{d.consoleErrors.length ? logRows(d.consoleErrors, 'text-term-red') : <Empty>console is clean</Empty>}</Section>
      <Section title="failed api requests (xhr / fetch)">
        {d.apiFailures.length ? <Table head={['method', 'url', 'type', 'status']} rows={d.apiFailures.map(net)} /> : <Empty>no failed api calls</Empty>}
      </Section>
      {d.otherFailures.length > 0 && (
        <Section title="other failed requests">
          <Table head={['method', 'url', 'type', 'status']} rows={d.otherFailures.map(net)} />
        </Section>
      )}
      {d.consoleWarnings.length > 0 && <Section title="console warnings">{logRows(d.consoleWarnings, 'text-term-amber')}</Section>}
    </div>
  );
}

function Responsive({ r }: { r: CheckResult }) {
  const { details: d } = shape(r, 'responsive');
  return (
    <div className="space-y-3">
      <div>
        {d.viewports.map((v) => (
          <div key={v.label} className="flex flex-wrap items-baseline gap-x-3">
            <span className="w-20 text-term-fg">{v.label}</span>
            <span className="w-24 text-term-dim">
              {v.width}×{v.height}
            </span>
            {v.error ? (
              <span className="text-term-amber">error: {v.error}</span>
            ) : v.horizontalOverflow ? (
              <span className="text-term-red">✗ horizontal overflow {v.overflowPx}px</span>
            ) : (
              <span className="text-term-green">✓ no horizontal overflow</span>
            )}
            {v.partial && <span className="text-term-faint">(page still loading — measured what had rendered)</span>}
          </div>
        ))}
      </div>
      <ScreenshotGallery shots={r.screenshots} />
      {d.viewports
        .filter((v) => v.horizontalOverflow && v.offenders?.length)
        .map((v) => (
          <Section key={v.label} title={`elements overflowing on ${v.label} (${v.offenderCount})`}>
            <Table head={['element', 'right edge', 'width']} rows={v.offenders!.map((o) => [<Code>{o.selector}</Code>, `${o.right}px`, `${o.width}px`])} />
          </Section>
        ))}
    </div>
  );
}

const IMPACT_CLS: Record<string, string> = {
  critical: 'bg-term-red text-term-bg',
  serious: 'text-term-red',
  moderate: 'text-term-amber',
  minor: 'text-term-dim',
};

function Accessibility({ r }: { r: CheckResult }) {
  const { summary: s, details: d } = shape(r, 'accessibility');
  return (
    <div className="space-y-3">
      <StatGrid>
        <Stat label="critical" value={s.critical} tone={s.critical ? 'fail' : 'pass'} />
        <Stat label="serious" value={s.serious} tone={s.serious ? 'fail' : 'pass'} />
        <Stat label="moderate" value={s.moderate} tone={s.moderate ? 'warn' : 'pass'} />
        <Stat label="minor" value={s.minor} tone={s.minor ? 'warn' : 'pass'} />
        <Stat label="rules_passed" value={s.passes} />
        <Stat label="needs_review" value={s.incomplete} />
      </StatGrid>
      {d.highlighted ? (
        <p className="text-[11px] text-term-faint">
          # screenshot outlines {d.highlighted} failing element{d.highlighted === 1 ? '' : 's'} — <span style={{ color: '#ff2d55' }}>critical</span> ·{' '}
          <span style={{ color: '#ff6b3d' }}>serious</span> · <span style={{ color: '#f5b400' }}>moderate</span> · <span style={{ color: '#4aa8ff' }}>minor</span>
        </p>
      ) : null}
      {d.violations.length ? (
        <div className="space-y-1">
          {d.violations.map((v) => (
            <details key={v.id} className="group">
              <summary className="flex cursor-pointer list-none items-baseline gap-2 px-1 hover:bg-term-raised">
                <span className="text-term-faint group-open:hidden">▸</span>
                <span className="hidden text-term-faint group-open:inline">▾</span>
                <span className={cn('w-20 shrink-0 px-1 text-center text-[11px] font-bold uppercase', IMPACT_CLS[v.impact])}>{v.impact}</span>
                <span className="flex-1">{v.help}</span>
                <span className="shrink-0 text-term-dim">×{v.nodeCount}</span>
              </summary>
              <div className="ml-6 space-y-1.5 border-l border-term-line py-2 pl-3">
                <p className="text-term-dim">{v.description}</p>
                <a href={v.helpUrl} target="_blank" rel="noreferrer" className="text-term-cyan hover:underline">
                  → how to fix: {v.id}
                </a>
                {v.nodes.map((n, i) => (
                  <div key={i} className="text-[12px]">
                    <div className="text-term-violet">{n.target}</div>
                    <div className="break-all text-term-dim">{n.html}</div>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <Empty>no WCAG 2.1 A/AA violations detected by axe-core</Empty>
      )}
      <p className="text-[11px] text-term-faint"># automated testing finds ~30–40% of accessibility issues — manual review still recommended</p>
    </div>
  );
}

const PERF: [key: PerfMetricKey | 'domContentLoaded', label: string][] = [
  ['ttfb', 'ttfb'],
  ['fcp', 'first_contentful_paint'],
  ['lcp', 'largest_contentful_paint'],
  ['cls', 'cumulative_layout_shift'],
  ['load', 'page_load'],
  ['domContentLoaded', 'dom_content_loaded'],
];

function Performance({ r }: { r: CheckResult }) {
  const { summary: s, details: d } = shape(r, 'performance');
  const fmt = (k: string, v: number | null | undefined) => (v === null || v === undefined ? '—' : k === 'cls' ? String(v) : formatMs(v));
  const rating = (ratings: Record<PerfMetricKey, Rating> | null | undefined, k: string): Rating | undefined =>
    ratings && k in ratings ? ratings[k as PerfMetricKey] : undefined;
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left">
          <thead className="text-[11px] uppercase text-term-faint">
            <tr className="border-b border-term-line">
              <th className="py-1 pr-4 font-normal">metric</th>
              <th className="py-1 pr-4 text-right font-normal">desktop</th>
              <th className="py-1 text-right font-normal">mobile · 4G · 4× cpu</th>
            </tr>
          </thead>
          <tbody>
            {PERF.map(([k, label]) => (
              <tr key={k} className="border-b border-term-line/40">
                <td className="py-0.5 pr-4 text-term-dim">{label}</td>
                <td className={cn('py-0.5 pr-4 text-right font-bold tabular-nums', toneCls(rating(d.ratings, k)))}>{fmt(k, s[k])}</td>
                <td className={cn('py-0.5 text-right font-bold tabular-nums', toneCls(rating(d.mobileRatings, k)))}>
                  {s.mobile ? fmt(k, s.mobile[k]) : <span className="font-normal text-term-faint">n/a</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {d.mobileError && <p className="text-term-amber">! mobile run failed: {d.mobileError}</p>}
      <StatGrid>
        <Stat label="requests" value={s.requestCount} />
        <Stat label="transferred" value={`${s.transferKb} KB`} />
        <Stat label="dom_nodes" value={d.domNodes} />
      </StatGrid>
      <p className="text-[11px] text-term-faint">
        # thresholds good/poor: fcp 1.8s/3s · lcp 2.5s/4s · cls 0.1/0.25 · load 3s/6s · ttfb 0.8s/1.8s
        <br /># {d.conditions?.desktop ?? 'desktop'} | {d.conditions?.mobile ?? 'mobile'} — result is based on desktop; a weak mobile profile lowers pass → warn
      </p>
      {d.slowestResources.length > 0 && (
        <Section title="slowest resources (desktop)">
          <Table
            head={['resource', 'type', 'time', 'size']}
            rows={d.slowestResources.map((x) => [
              <span className="text-[11px]">{x.url}</span>,
              x.type,
              formatMs(x.durationMs),
              x.bytes ? `${Math.round(x.bytes / 1024)} KB` : <span className="text-term-faint">cached</span>,
            ])}
          />
        </Section>
      )}
    </div>
  );
}

function Security({ r }: { r: CheckResult }) {
  const { summary: s, details: d } = shape(r, 'security');
  return (
    <div className="space-y-3">
      <StatGrid>
        <Stat label="https" value={s.https ? 'yes' : 'no'} tone={s.https ? 'pass' : 'fail'} />
        <Stat label="headers" value={`${s.headersPassed ?? 0}/${s.headersTotal ?? 0}`} tone={s.headersPassed === s.headersTotal ? 'pass' : 'warn'} />
        <Stat
          label="http→https"
          value={d.httpRedirectsToHttps == null ? 'n/a' : d.httpRedirectsToHttps ? 'yes' : 'no'}
          tone={d.httpRedirectsToHttps === false ? 'warn' : undefined}
        />
        <Stat label="mixed_content" value={s.mixedContent ?? 0} tone={s.mixedContent ? 'fail' : 'pass'} />
      </StatGrid>
      <div>
        {d.headers?.map((h) => (
          <div key={h.header} className="flex gap-2 py-0.5">
            <span className={h.ok ? 'text-term-green' : 'text-term-amber'}>{h.ok ? '✓' : '✗'}</span>
            <div className="min-w-0 flex-1">
              <span className="text-term-fg">{h.header}</span>
              {h.value ? (
                <span className="break-all text-term-dim">: {h.value.length > 140 ? `${h.value.slice(0, 140)}…` : h.value}</span>
              ) : (
                <div className="text-term-dim"># {h.recommendation}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <Lines items={d.issues} tone="text-term-amber" mark="!" />
      {(d.mixedContent?.length ?? 0) > 0 && (
        <Section title="insecure resources">
          {d.mixedContent!.map((u) => (
            <div key={u} className="break-all text-term-red">
              {u}
            </div>
          ))}
        </Section>
      )}
      {(d.insecureCookies?.length ?? 0) > 0 && (
        <Section title="cookies missing Secure / HttpOnly">
          <Table head={['name', 'secure', 'httpOnly', 'sameSite']} rows={d.insecureCookies!.map((c) => [c.name, String(c.secure), String(c.httpOnly), c.sameSite])} />
        </Section>
      )}
    </div>
  );
}

const PANELS: Record<CheckId, (p: { r: CheckResult }) => JSX.Element> = {
  smoke: Smoke,
  links: Links,
  consoleNetwork: ConsoleNetwork,
  responsive: Responsive,
  accessibility: Accessibility,
  performance: Performance,
  security: Security,
};

export function CheckDetails({ result }: { result: CheckResult }) {
  if (result.status === 'skipped' || result.status === 'error') {
    return (
      <p>
        <StatusBadge status={result.status} /> <span className="text-term-dim">{result.error}</span>
      </p>
    );
  }
  const Panel = PANELS[result.checkId];
  return (
    <div className="space-y-3">
      {result.checkId !== 'responsive' && <ScreenshotGallery shots={result.screenshots} />}
      <Panel r={result} />
    </div>
  );
}
