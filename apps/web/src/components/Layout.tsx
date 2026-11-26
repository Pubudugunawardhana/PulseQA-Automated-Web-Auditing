import { useQuery } from '@tanstack/react-query';
import { Activity, History, Menu, Moon, Plus, Sun, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { cn } from '../lib/format';
import { GitHubMark, REPO_URL } from './brand';
import { ChecksMenu, MobileChecksMenu } from './ChecksMenu';
import { Footer } from './Footer';


function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const r = await fetch('/api/health');
      return (await r.json()) as { ok: boolean; db: boolean; queue: { active: number; pending: number } };
    },
    refetchInterval: 10_000,
    retry: false,
  });
}

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('pulseqa-theme', dark ? 'dark' : 'light');
    } catch {
      /* storage unavailable */
    }
  }, [dark]);
  return { dark, toggle: () => setDark((d) => !d) };
}

function useScrolled(offset = 8) {
  const [scrolled, setScrolled] = useState(() => window.scrollY > offset);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > offset);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [offset]);
  return scrolled;
}

/** Scroll to `#section` after navigation (React Router doesn't), or to the top on page change. */
function useHashScroll() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0 });
      return;
    }
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    return () => clearTimeout(t);
  }, [pathname, hash]);
}


function StatusPill({ className }: { className?: string }) {
  const health = useHealth();
  const loading = health.isLoading;
  const ok = health.data?.ok;
  const running = health.data?.queue.active ?? 0;
  const label = loading ? 'Connecting…' : !ok ? 'API offline' : running ? `${running} audit${running > 1 ? 's' : ''} running` : 'All systems ready';
  return (
    <span
      className={cn('items-center gap-2 rounded-full border border-line bg-panel/60 px-2.5 py-1 text-xs text-muted', className)}
      title={health.data ? `API ${ok ? 'online' : 'offline'} · database ${health.data.db ? 'connected' : 'unreachable'}` : undefined}
      role="status"
    >
      <span className="relative flex size-2">
        {ok && <span className={cn('absolute inline-flex size-full rounded-full bg-ok opacity-60', running > 0 ? 'animate-ping' : 'hidden')} />}
        <span className={cn('relative inline-flex size-2 rounded-full', loading ? 'bg-faint' : ok ? 'bg-ok' : 'bg-bad')} />
      </span>
      {label}
    </span>
  );
}

/** Product sections live on the landing page; app pages are real routes. */
const SECTION_LINKS = [
  { to: '/#how', label: 'How it works' },
  { to: '/#features', label: 'Features' },
];

function IconButton({ onClick, label, children, className }: { onClick?: () => void; label: string; children: ReactNode; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn('grid size-9 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-fg', className)}
    >
      {children}
    </button>
  );
}

export function Layout() {
  const { dark, toggle } = useTheme();
  const scrolled = useScrolled();
  const { pathname, search, hash } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const onLanding = pathname === '/';
  useHashScroll();

  // Close the mobile menu on navigation, Escape, or a click outside
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname, search, hash]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    const onClick = (e: MouseEvent) => !menuRef.current?.contains(e.target as Node) && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [menuOpen]);

  // Landing: transparent until you scroll. App pages: always solid.
  const solid = scrolled || !onLanding || menuOpen;

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-panel focus:px-3 focus:py-2 focus:text-sm focus:shadow-lg"
      >
        Skip to content
      </a>

      <header
        ref={menuRef}
        className={cn(
          'sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-300',
          solid ? 'border-line bg-panel/80 shadow-[0_1px_12px_-6px_rgb(0_0_0/0.15)] backdrop-blur-lg' : 'border-transparent bg-transparent',
        )}
      >
        <div className="relative mx-auto flex h-16 max-w-6xl items-center gap-2 px-4">
          {/* brand */}
          <Link to="/" className="group mr-4 flex items-center gap-2.5 font-semibold" aria-label="PulseQA home">
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-brand to-brand-strong text-white shadow-sm shadow-brand/30 transition group-hover:scale-105">
              <Activity className="size-4" />
            </span>
            <span className="text-[17px] tracking-tight">
              Pulse<span className="text-brand-strong">QA</span>
            </span>
          </Link>

          {/* desktop links */}
          <nav aria-label="Main" className="hidden items-center md:flex">
            <ChecksMenu />
            {SECTION_LINKS.map((l) => (
              <Link key={l.to} to={l.to} className="rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-fg">
                {l.label}
              </Link>
            ))}
          </nav>

          {/* right side */}
          <div className="ml-auto flex items-center gap-1">
            <StatusPill className="mr-2 hidden lg:inline-flex" />
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Source code on GitHub"
              title="Source code on GitHub"
              className="hidden size-9 place-items-center rounded-lg text-muted transition hover:bg-raised hover:text-fg sm:grid"
            >
              <GitHubMark className="size-[18px]" />
            </a>
            <NavLink
              to="/audits"
              aria-label="Audit history"
              title="Audit history"
              className={({ isActive }) =>
                cn(
                  'hidden h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition md:inline-flex',
                  isActive ? 'bg-raised text-fg' : 'text-muted hover:bg-raised hover:text-fg',
                )
              }
            >
              <History className="size-[18px]" /> <span className="hidden lg:inline">History</span>
            </NavLink>
            <IconButton onClick={toggle} label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
              {dark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </IconButton>
            <NavLink
              to="/new"
              className={({ isActive }) =>
                cn(
                  'ml-1 hidden h-9 items-center gap-1.5 rounded-lg bg-brand-strong px-3.5 text-sm font-medium text-white shadow-sm shadow-brand/30 transition hover:brightness-110 sm:inline-flex',
                  isActive && 'ring-2 ring-brand/40 ring-offset-2 ring-offset-bg',
                )
              }
            >
              <Plus className="size-4" /> New audit
            </NavLink>
            <IconButton onClick={() => setMenuOpen((o) => !o)} label={menuOpen ? 'Close menu' : 'Open menu'} className="md:hidden">
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </IconButton>
          </div>
        </div>

        {/* mobile menu */}
        <div
          id="mobile-menu"
          className={cn(
            'grid border-line transition-[grid-template-rows,opacity] duration-300 md:hidden',
            menuOpen ? 'grid-rows-[1fr] border-t opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0',
          )}
          aria-hidden={!menuOpen}
        >
          <div className="overflow-hidden">
            <nav aria-label="Mobile" className="mx-auto max-w-6xl space-y-1 px-4 py-4">
              <MobileChecksMenu tabbable={menuOpen} />
              {SECTION_LINKS.map((l) => (
                <Link key={l.to} to={l.to} tabIndex={menuOpen ? 0 : -1} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-muted hover:bg-raised hover:text-fg">
                  {l.label}
                </Link>
              ))}
              <NavLink
                to="/audits"
                tabIndex={menuOpen ? 0 : -1}
                className={({ isActive }) =>
                  cn('flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-raised', isActive ? 'bg-raised text-fg' : 'text-muted hover:text-fg')
                }
              >
                <History className="size-4" /> History
              </NavLink>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                tabIndex={menuOpen ? 0 : -1}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-muted hover:bg-raised hover:text-fg"
              >
                <GitHubMark className="size-4" /> GitHub
              </a>
              <div className="flex items-center justify-between gap-3 border-t border-line px-1 pt-4">
                <StatusPill className="inline-flex" />
                <Link
                  to="/new"
                  tabIndex={menuOpen ? 0 : -1}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand-strong px-4 text-sm font-medium text-white shadow-sm"
                >
                  <Plus className="size-4" /> New audit
                </Link>
              </div>
            </nav>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
