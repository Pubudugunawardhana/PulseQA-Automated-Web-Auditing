import { useMutation } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CHECK_IDS, CHECK_META, type CheckId } from '@pulseqa/shared';
import { Caret, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { CHECK_FLAG } from '../lib/checks';
import { cn } from '../lib/format';

const BANNER = String.raw`
 ____        _          ___    _
|  _ \ _   _| |___  ___/ _ \  / \
| |_) | | | | / __|/ _ \ | | |/ _ \
|  __/| |_| | \__ \  __/ |_| / ___ \
|_|    \__,_|_|___/\___|\__\_\_/   \_\
`;

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [focused, setFocused] = useState(true);
  const [checks, setChecks] = useState<Set<CheckId>>(new Set(CHECK_IDS));
  const [error, setError] = useState<string | null>(null);

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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = url.trim();
    if (!value) return setError('usage: audit <url>   e.g. audit https://example.com');
    if (!looksLikeUrl(value)) return setError(`audit: invalid url '${value}'`);
    if (checks.size === 0) return setError('audit: no checks selected (use --all)');
    setError(null);
    create.mutate({ url: value, checks: CHECK_IDS.filter((c) => checks.has(c)) });
  };

  const all = checks.size === CHECK_IDS.length;
  const flags = all ? '--all' : CHECK_IDS.filter((c) => checks.has(c)).map((c) => `--${CHECK_FLAG[c]}`).join(' ');

  return (
    <div className="space-y-6" onClick={() => inputRef.current?.focus()}>
      <div>
        <pre className="glow-green overflow-x-auto text-[11px] leading-tight text-term-green sm:text-xs" aria-hidden>{BANNER}</pre>
        <p className="mt-2 text-term-dim">
          Automated web auditing &amp; E2E test execution <span className="text-term-faint">v0.1.0</span>
        </p>
        <p className="text-term-dim">
          Type a URL and press <kbd className="text-term-fg">Enter</kbd> to run{' '}
          <span className="text-term-fg">{checks.size}</span> checks. No test scripts needed.
        </p>
      </div>

      {/* prompt */}
      <form onSubmit={submit} className="space-y-1">
        <div className="text-term-faint">
          # {flags}
        </div>
        <label className="flex flex-wrap items-center gap-x-2 text-[14px]">
          <span className="whitespace-nowrap">
            <span className="text-term-green">qa@pulseqa</span>
            <span className="text-term-dim">:</span>
            <span className="text-term-cyan">~</span>
            <span className="text-term-dim">$</span> <span className="text-term-violet">audit</span>
          </span>
          <span className="relative flex min-w-[12rem] flex-1 items-center">
            <input
              ref={inputRef}
              autoFocus
              type="text"
              inputMode="url"
              spellCheck={false}
              autoComplete="off"
              aria-label="URL to audit"
              placeholder={focused && !url ? '' : 'https://your-app.vercel.app'}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              disabled={create.isPending}
              className="w-full bg-transparent text-term-fg caret-transparent outline-none placeholder:text-term-faint"
              style={{ width: `${Math.max(url.length, 1) + 1}ch`, maxWidth: '100%' }}
            />
            {focused && !create.isPending && (
              <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 whitespace-pre text-transparent">
                {url}
                <Caret />
              </span>
            )}
          </span>
          <button type="submit" className="sr-only">Run audit</button>
        </label>
        {create.isPending && (
          <p className="text-term-cyan">
            <Spinner /> creating audit job…
          </p>
        )}
        {error && <p className="text-term-red">{error}</p>}
      </form>

      {/* check selection */}
      <div className="space-y-1" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 text-term-dim">
          <span># checks</span>
          <button
            type="button"
            onClick={() => setChecks(all ? new Set() : new Set(CHECK_IDS))}
            className="text-term-cyan hover:underline"
          >
            {all ? '--none' : '--all'}
          </button>
        </div>
        <ul className="space-y-px">
          {CHECK_IDS.map((id) => {
            const on = checks.has(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(id)}
                  className="group flex w-full items-baseline gap-3 px-1 py-0.5 text-left hover:bg-term-raised focus-visible:bg-term-raised focus-visible:outline-none"
                >
                  <span className={cn('shrink-0', on ? 'text-term-green' : 'text-term-faint')}>[{on ? 'x' : ' '}]</span>
                  <span className={cn('w-24 shrink-0', on ? 'text-term-fg' : 'text-term-dim')}>{CHECK_FLAG[id]}</span>
                  <span className={cn('hidden w-56 shrink-0 sm:block', on ? 'text-term-fg' : 'text-term-dim')}>{CHECK_META[id].name}</span>
                  <span className="min-w-0 truncate text-term-dim">{CHECK_META[id].description}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="border-t border-term-line pt-3 text-[11px] text-term-faint">
        tip: localhost &amp; staging URLs work too · results are saved to history · alt+2 opens history
      </div>
    </div>
  );
}
