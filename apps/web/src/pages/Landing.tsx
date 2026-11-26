import { useMutation } from '@tanstack/react-query';
import {
  ArrowRight,
  BarChart3,
  FileDown,
  GitCompareArrows,
  Globe,
  Loader2,
  Lock,
  MonitorSmartphone,
  Radio,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CHECK_IDS, CHECK_META } from '@pulseqa/shared';
import { Gauge, PolarChart, Sparkline, StackedBar } from '../components/charts';
import { SHORT } from '../components/audit/shared';
import { CHECK_ICON } from '../components/checkIcons';
import { Button, Card } from '../components/ui';
import { api } from '../lib/api';
import { EXECUTION_ORDER } from '../lib/checks';
import { cn } from '../lib/format';

function normalize(v: string) {
  const s = v.trim();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
    return (u.protocol === 'http:' || u.protocol === 'https:') && (u.hostname.includes('.') || u.hostname === 'localhost') ? s : null;
  } catch {
    return null;
  }
}

/** Hero URL box: starts a full audit straight away (or opens the advanced form). */
function QuickAudit({ size = 'lg' }: { size?: 'lg' | 'md' }) {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: api.createAudit,
    onSuccess: (a) => navigate(`/audits/${a.id}`),
    onError: (e) => setError((e as Error).message),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = normalize(url);
    if (!v) return setError(url.trim() ? `"${url.trim()}" doesn't look like a website address` : 'Paste the URL of a website to audit');
    setError(null);
    create.mutate({ url: v, checks: [...CHECK_IDS] });
  };
  return (
    <form onSubmit={submit} className="w-full">
      <div
        className={cn(
          'flex flex-col gap-2 rounded-2xl border border-line bg-panel p-2 shadow-lg shadow-brand/5 sm:flex-row sm:items-center',
          size === 'lg' && 'sm:p-2.5',
        )}
      >
        <label className="flex min-w-0 flex-1 items-center gap-2.5 px-3">
          <Globe className="size-5 shrink-0 text-faint" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-website.com"
            aria-label="Website URL to audit"
            inputMode="url"
            autoComplete="url"
            className={cn('h-11 w-full min-w-0 bg-transparent outline-none placeholder:text-faint', size === 'lg' ? 'text-base' : 'text-sm')}
          />
        </label>
        <Button variant="primary" type="submit" disabled={create.isPending} className="h-11 justify-center px-5 text-sm">
          {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
          {create.isPending ? 'Starting…' : 'Run free audit'}
        </Button>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
        {error ? <span className="text-bad">{error}</span> : <span className="text-muted">All 10 checks · no sign-up · results in about a minute</span>}
        <Link to={url.trim() ? `/new?url=${encodeURIComponent(url.trim())}` : '/new'} className="inline-flex items-center gap-1 font-medium text-brand-strong hover:underline">
          <SlidersHorizontal className="size-3.5" /> Choose checks
        </Link>
      </div>
    </form>
  );
}

/** Static sample report built from the real dashboard components. */
function HeroPreview() {
  const sample = [100, 100, 50, 100, 100, 50, 100, 100, 100, 50];
  const slices = EXECUTION_ORDER.map((c, i) => ({
    label: SHORT[c],
    value: sample[i] ?? 100,
    toneClass: (sample[i] ?? 100) === 100 ? 'text-ok' : 'text-warn',
  }));
  return (
    <div className="relative" aria-hidden>
      <div className="absolute -inset-2 -z-10 rounded-[2rem] sm:-inset-6 bg-gradient-to-br from-brand/20 via-info/10 to-accent/15 blur-2xl" />
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line bg-raised/60 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-bad/70" />
          <span className="size-2.5 rounded-full bg-warn/70" />
          <span className="size-2.5 rounded-full bg-ok/70" />
          <span className="ml-3 truncate font-mono text-xs text-muted">pulseqa · audit · shop.example.com</span>
        </div>
        <div className="grid grid-cols-2 gap-4 p-4">
          <div className="rounded-xl border border-line p-3">
            <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Health score</div>
            <Gauge value={87} toneClass="text-ok" label="Excellent" size={180} />
            <div className="mt-3">
              <Sparkline values={[61, 68, 66, 74, 79, 87]} toneClass="text-info" height={36} />
            </div>
          </div>
          <div className="rounded-xl border border-line p-3">
            <div className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Check quality</div>
            <PolarChart slices={slices} center={87} centerClass="text-ok" />
          </div>
          <div className="col-span-2 rounded-xl border border-line p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Issues by type</span>
              <span className="text-xs font-semibold text-ok">▼ 9 since last run</span>
            </div>
            <StackedBar
              parts={[
                { value: 1, className: 'bg-bad', label: 'Errors' },
                { value: 6, className: 'bg-warn', label: 'Warnings' },
                { value: 3, className: 'bg-info', label: 'Notices' },
              ]}
            />
            <div className="mt-3 flex items-center gap-2 overflow-hidden rounded-lg bg-raised/70 px-3 py-2 text-xs">
              <Wrench className="size-3.5 shrink-0 text-brand-strong" />
              <span className="min-w-0 truncate">
                <span className="font-medium">Missing Content-Security-Policy</span>
                <span className="text-muted"> — add </span>
                <code className="font-mono text-brand-strong">default-src 'self'</code>
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function SectionHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center">
      <div className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-brand-strong">{eyebrow}</div>
      <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
      {children && <p className="mt-3 text-muted">{children}</p>}
    </div>
  );
}

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Radio, title: 'Live progress', text: 'Watch each check finish in real time, with a terminal-style log streamed over Server-Sent Events.' },
  { icon: BarChart3, title: 'Overview dashboard', text: 'Health-score gauge, issues by type, a per-check quality chart and trends across runs.' },
  { icon: Wrench, title: 'How-to-fix tips', text: 'Every issue explains what to change, where it was found, and gives a copy-paste example.' },
  { icon: GitCompareArrows, title: 'Regression tracking', text: 'Compare with any earlier run of the same URL — see what regressed, what got fixed, and what is new.' },
  { icon: MonitorSmartphone, title: 'Desktop + mobile', text: 'Three viewports, a throttled mobile performance profile and accessibility scanned on both.' },
  { icon: FileDown, title: 'Export & share', text: 'Download a self-contained HTML report or raw JSON, or share a read-only link.' },
  { icon: Lock, title: 'Private by default', text: 'No account needed. Your history is tied to your browser and only you can see it.' },
  { icon: ShieldCheck, title: 'Safe to host', text: 'SSRF protection on every request, rate limiting and hard time limits per audit.' },
];

const LOG: [time: string, tag: string, tone: string, text: string][] = [
  ['14:02:11', 'RUN ', 'text-info', 'smoke ........... GET https://shop.example.com'],
  ['14:02:13', 'PASS', 'text-ok', 'smoke ........... HTTP 200 · "Example Shop"'],
  ['14:02:15', 'WARN', 'text-warn', 'console ......... 1 console error · 2 third-party'],
  ['14:02:21', 'PASS', 'text-ok', 'perf ............ lcp 1.4 s · mobile lcp 2.9 s'],
  ['14:02:34', 'FAIL', 'text-bad', 'links ........... 1 broken image'],
  ['14:02:41', 'PASS', 'text-ok', 'a11y ............ 0 violations · mobile 0'],
  ['14:02:49', 'DONE', 'text-ok', 'score 87/100 · 10 checks · 61.4 s'],
];

export function Landing() {
  return (
    <div className="-mt-8 space-y-24 pb-8 sm:space-y-28">
      {/* hero */}
      <section className="relative pt-12 sm:pt-16">
        <div
          className="pointer-events-none absolute inset-x-0 -top-8 -z-10 h-[520px] opacity-60 [background-image:radial-gradient(var(--line)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
          aria-hidden
        />
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-xs font-medium text-muted">
              <span className="size-1.5 animate-pulse rounded-full bg-brand" /> Automated web auditing · Playwright + axe-core
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              Check your website's <span className="bg-gradient-to-r from-brand-strong to-info bg-clip-text text-transparent">pulse</span> before your users do.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              Paste any URL and get a full quality report in about a minute — broken links, console errors, responsive layout, accessibility, performance and
              security. No test scripts required.
            </p>
            <div className="mt-8 max-w-xl">
              <QuickAudit />
            </div>
          </div>
          <HeroPreview />
        </div>
      </section>

      {/* stats strip */}
      <section className="grid grid-cols-2 divide-line rounded-2xl border border-line bg-panel sm:grid-cols-4 sm:divide-x">
        {[
          ['10', 'automated checks'],
          ['3', 'viewports tested'],
          ['WCAG 2.1', 'AA accessibility rules'],
          ['~1 min', 'for a full audit'],
        ].map(([v, l]) => (
          <div key={l} className="px-5 py-6 text-center">
            <div className="text-2xl font-bold tabular-nums sm:text-3xl">{v}</div>
            <div className="mt-1 text-xs text-muted sm:text-sm">{l}</div>
          </div>
        ))}
      </section>

      {/* checks */}
      <section id="checks" className="scroll-mt-24">
        <SectionHead eyebrow="What we check" title="Ten checks, one click">
          Real Chromium, Firefox and WebKit browsers load your page — most checks reuse a single page load, so a full audit stays fast and close to what your users experience.
        </SectionHead>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {EXECUTION_ORDER.map((c) => {
            const Icon = CHECK_ICON[c];
            return (
              <Card key={c} className="group p-5 transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md">
                <span className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand-strong transition group-hover:bg-brand group-hover:text-white">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 font-semibold">{CHECK_META[c].name}</h3>
                <p className="mt-1 text-sm text-muted">{CHECK_META[c].description}</p>
              </Card>
            );
          })}
          <Card className="flex flex-col justify-between border-dashed bg-raised/40 p-5">
            <p className="text-sm text-muted">Scored 0–100, compared with your previous runs, and every issue comes with a fix.</p>
            <Link to="/new" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-strong hover:underline">
              Pick your checks <ArrowRight className="size-4" />
            </Link>
          </Card>
        </div>
      </section>

      {/* how it works */}
      <section id="how" className="scroll-mt-24">
        <SectionHead eyebrow="How it works" title="From URL to fix list in three steps" />
        <div className="grid items-start gap-8 lg:grid-cols-2">
          <ol className="space-y-6">
            {[
              ['Paste a URL', 'Any public website — or localhost while you develop. Run all ten checks or choose your own.'],
              ['Watch it run live', 'Each check streams in as it finishes. Cancel any time; every audit has a hard time limit.'],
              ['Fix what matters first', 'Issues are ranked as errors, warnings and notices, each with a clear tip and copy-paste example. Re-run to confirm the fix.'],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-strong font-mono text-sm font-bold text-white">{i + 1}</span>
                <div>
                  <h3 className="font-semibold">{t}</h3>
                  <p className="mt-1 text-sm text-muted">{d}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="terminal overflow-hidden rounded-xl border border-line shadow-lg" aria-label="Example live log">
            <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs text-muted">
              <span className="size-2 animate-pulse rounded-full bg-ok" /> live log
            </div>
            <div className="space-y-1 overflow-x-auto px-4 py-3 text-[12px] leading-relaxed sm:text-[13px]">
              <div className="text-muted">$ pulseqa audit https://shop.example.com --all</div>
              {LOG.map(([t, tag, tone, text]) => (
                <div key={t + tag} className="whitespace-nowrap">
                  <span className="text-faint">{t}</span> <span className={cn('font-bold', tone)}>{tag}</span> {text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* features */}
      <section id="features" className="scroll-mt-24">
        <SectionHead eyebrow="Built for QA" title="Everything you need to ship with confidence" />
        <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title}>
              <Icon className="size-5 text-brand-strong" />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* final CTA */}
      <section className="relative overflow-hidden rounded-3xl border border-line bg-panel px-6 py-14 text-center sm:px-12">
        <div className="pointer-events-none absolute inset-0 -z-0 bg-gradient-to-br from-brand/10 via-transparent to-info/10" aria-hidden />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Run your first audit now</h2>
          <p className="mt-3 text-muted">Free, private to your browser, and no account required.</p>
          <div className="mt-8 text-left">
            <QuickAudit size="md" />
          </div>
        </div>
      </section>

      <footer className="flex flex-col items-center justify-between gap-3 border-t border-line pt-6 text-sm text-muted sm:flex-row">
        <span>
          Pulse<span className="text-brand-strong">QA</span> · Automated Web Auditing &amp; E2E Test Execution Platform
        </span>
        <span className="flex gap-4">
          <Link to="/new" className="hover:text-fg">
            New audit
          </Link>
          <Link to="/audits" className="hover:text-fg">
            History
          </Link>
        </span>
      </footer>
    </div>
  );
}
