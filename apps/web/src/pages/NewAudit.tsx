import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Check, Clock, Globe, Loader2 } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CHECK_IDS, CHECK_META, type CheckId } from '@pulseqa/shared';
import { CHECK_ICON } from '../components/checkIcons';
import { Button, Card } from '../components/ui';
import { api } from '../lib/api';
import { cn, hostOf } from '../lib/format';

const HISTORY_KEY = 'pulseqa-url-history';
const HISTORY_MAX = 20;

function loadHistory(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

function saveHistory(url: string) {
  try {
    const next = [url, ...loadHistory().filter((u) => u !== url)].slice(0, HISTORY_MAX);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — history is a convenience only */
  }
}

function looksLikeUrl(v: string) {
  try {
    const u = new URL(/^[a-z]+:\/\//i.test(v) ? v : `https://${v}`);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname && (u.hostname.includes('.') || u.hostname === 'localhost' || !!u.port);
  } catch {
    return false;
  }
}

export function NewAudit() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [url, setUrl] = useState(() => params.get('url') ?? ''); // prefilled from the landing page
  const [checks, setChecks] = useState<Set<CheckId>>(new Set(CHECK_IDS));
  const [error, setError] = useState<string | null>(null);
  const [history] = useState<string[]>(loadHistory);
  const [histIndex, setHistIndex] = useState(-1);
  const [draft, setDraft] = useState('');

  const create = useMutation({
    mutationFn: api.createAudit,
    onSuccess: (audit) => navigate(`/audits/${audit.id}`),
    onError: (e) => setError((e as Error).message),
  });

  const toggle = (id: CheckId) =>
    setChecks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = (value: string) => {
    const v = value.trim();
    if (!v) return setError('Enter the URL of the website you want to audit.');
    if (!looksLikeUrl(v)) return setError(`"${v}" doesn't look like a valid URL — try something like https://example.com`);
    if (checks.size === 0) return setError('Select at least one check to run.');
    setError(null);
    saveHistory(v);
    create.mutate({ url: v, checks: CHECK_IDS.filter((c) => checks.has(c)) });
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    run(url);
  };

  // ↑ / ↓ recall previously audited URLs, like a shell
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' && history.length) {
      e.preventDefault();
      if (histIndex === -1) setDraft(url);
      const next = Math.min(histIndex + 1, history.length - 1);
      setHistIndex(next);
      setUrl(history[next]);
    } else if (e.key === 'ArrowDown' && histIndex >= 0) {
      e.preventDefault();
      const next = histIndex - 1;
      setHistIndex(next);
      setUrl(next === -1 ? draft : history[next]);
    }
  };

  const all = checks.size === CHECK_IDS.length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-xs text-muted">
          <span className="size-1.5 rounded-full bg-brand" /> Playwright · axe-core · Core Web Vitals
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Audit any website in one click</h1>
        <p className="mx-auto mt-3 max-w-xl text-muted">
          Paste a URL and PulseQA checks availability, broken links, console errors, responsive layout, accessibility, performance and
          security headers — no test scripts needed.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <Card className="p-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Website URL</span>
              <Globe className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-faint" />
              <input
                type="text"
                inputMode="url"
                autoFocus
                spellCheck={false}
                autoComplete="off"
                aria-label="URL to audit"
                placeholder="https://your-app.vercel.app"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setHistIndex(-1);
                  setError(null);
                }}
                onKeyDown={onKeyDown}
                disabled={create.isPending}
                className="h-12 w-full rounded-lg bg-transparent pl-10 pr-3 text-base outline-none placeholder:text-faint"
              />
            </label>
            <Button type="submit" variant="primary" disabled={create.isPending} className="h-12 px-6 text-base">
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              Run audit
            </Button>
          </div>
        </Card>
        {error && <p className="px-1 text-sm text-bad">{error}</p>}

        {history.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-1 text-sm">
            <span className="inline-flex items-center gap-1 text-muted">
              <Clock className="size-3.5" /> Recent:
            </span>
            {history.slice(0, 5).map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setUrl(h)}
                className="rounded-full border border-line bg-panel px-2.5 py-0.5 text-xs text-muted transition hover:border-brand hover:text-fg"
                title={h}
              >
                {hostOf(h)}
              </button>
            ))}
          </div>
        )}
      </form>

      <div className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">
            Checks to run <span className="font-normal text-muted">({checks.size}/{CHECK_IDS.length})</span>
          </h2>
          <button
            type="button"
            onClick={() => setChecks(all ? new Set() : new Set(CHECK_IDS))}
            className="text-sm font-medium text-brand-strong hover:underline"
          >
            {all ? 'Clear all' : 'Select all'}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {CHECK_IDS.map((id) => {
            const on = checks.has(id);
            const Icon = CHECK_ICON[id];
            return (
              <button
                key={id}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(id)}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-3 text-left transition',
                  on ? 'border-brand/60 bg-brand/5' : 'border-line bg-panel hover:border-faint',
                )}
              >
                <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', on ? 'bg-brand/15 text-brand-strong' : 'bg-raised text-muted')}>
                  <Icon className="size-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{CHECK_META[id].name}</span>
                  <span className="block text-xs text-muted">{CHECK_META[id].description}</span>
                </span>
                <span
                  className={cn(
                    'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border',
                    on ? 'border-brand-strong bg-brand-strong text-white' : 'border-line',
                  )}
                >
                  {on && <Check className="size-3.5" />}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-6 text-center text-xs text-faint">Tip: localhost and staging URLs work too · press ↑ in the URL box to reuse a previous URL</p>
      </div>
    </div>
  );
}
