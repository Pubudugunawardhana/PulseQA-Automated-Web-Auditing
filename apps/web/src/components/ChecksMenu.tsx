// "Checks" mega menu in the navbar: the 11 checks grouped by category.
import { ArrowRight, ChevronDown, Gauge, HeartPulse, Users } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FocusEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CHECK_IDS, CHECK_META } from '@pulseqa/shared';
import { CHECK_CATEGORIES } from '../lib/checks';
import { cn } from '../lib/format';
import { CHECK_ICON } from './checkIcons';

const CATEGORY_ICON = { reliability: HeartPulse, experience: Users, trust: Gauge } as Record<string, typeof Gauge>;

/** Desktop dropdown. The panel is positioned against the navbar's (relative) container, so it spans its width. */
export function ChecksMenu() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [pathname, search, hash]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  // hover intent: open after a short pause, close with a grace period so the pointer can reach the panel
  const hover = (next: boolean) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setOpen(next), next ? 80 : 180);
  };
  const onBlur = (e: FocusEvent) => {
    if (!wrapRef.current?.contains(e.relatedTarget as Node)) setOpen(false);
  };

  return (
    <div ref={wrapRef} onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)} onBlur={onBlur}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={cn('inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:text-fg', open ? 'text-fg' : 'text-muted')}
      >
        Checks
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="pqa-pop absolute inset-x-4 top-full z-50 mt-1 overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl"
      >
        <div className="grid gap-px bg-line md:grid-cols-3">
          {CHECK_CATEGORIES.map((cat) => {
            const CatIcon = CATEGORY_ICON[cat.id];
            return (
              <div key={cat.id} className="bg-panel p-5">
                <div className="flex items-center gap-2">
                  <CatIcon className="size-4 text-brand-strong" />
                  <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{cat.label}</h3>
                </div>
                <p className="mt-1 text-xs text-faint">{cat.blurb}</p>
                <ul className="mt-4 space-y-1">
                  {cat.checks.map((c) => {
                    const Icon = CHECK_ICON[c];
                    return (
                      <li key={c}>
                        <Link to={`/new?checks=${c}`} className="group flex gap-3 rounded-lg p-2 -mx-2 transition hover:bg-raised focus-visible:bg-raised">
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand-strong transition group-hover:bg-brand group-hover:text-white">
                            <Icon className="size-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-fg">{CHECK_META[c].name}</span>
                            <span className="line-clamp-1 block text-xs text-muted">{CHECK_META[c].description}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-3 border-t border-line bg-raised/50 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">
            <span className="font-semibold text-fg">{CHECK_IDS.length} automated checks</span> — pick one to run it on its own, or run them all.
          </p>
          <div className="flex items-center gap-4 text-sm font-medium">
            <Link to="/#how" className="text-muted hover:text-fg">
              How scoring works
            </Link>
            <Link to="/new" className="inline-flex items-center gap-1 text-brand-strong hover:underline">
              Run all checks <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Mobile menu version: a disclosure with the grouped list. */
export function MobileChecksMenu({ tabbable }: { tabbable: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        tabIndex={tabbable ? 0 : -1}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-muted hover:bg-raised hover:text-fg"
      >
        Checks
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-3 px-3 pb-2 pt-1">
          {CHECK_CATEGORIES.map((cat) => (
            <div key={cat.id}>
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{cat.label}</div>
              <ul className="mt-1.5 grid grid-cols-1 gap-0.5 min-[480px]:grid-cols-2">
                {cat.checks.map((c) => {
                  const Icon = CHECK_ICON[c];
                  return (
                    <li key={c}>
                      <Link
                        to={`/new?checks=${c}`}
                        tabIndex={tabbable ? 0 : -1}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted hover:bg-raised hover:text-fg"
                      >
                        <Icon className="size-3.5 shrink-0 text-brand-strong" />
                        <span className="truncate">{CHECK_META[c].name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
