import { useQuery } from '@tanstack/react-query';
import { Activity, History, Moon, Plus, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { cn } from '../lib/format';

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

const navCls = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition',
    isActive ? 'bg-raised text-fg' : 'text-muted hover:bg-raised hover:text-fg',
  );

function StatusPill() {
  const health = useHealth();
  const loading = health.isLoading;
  const ok = health.data?.ok;
  const running = health.data?.queue.active ?? 0;
  const label = loading ? 'Connecting…' : !ok ? 'API offline' : running ? `${running} audit${running > 1 ? 's' : ''} running` : 'All systems ready';
  return (
    <span
      className="hidden items-center gap-2 rounded-full border border-line px-2.5 py-1 text-xs text-muted md:inline-flex"
      title={health.data ? `API ${ok ? 'online' : 'offline'} · database ${health.data.db ? 'connected' : 'unreachable'}` : undefined}
    >
      <span className={cn('size-2 rounded-full', loading ? 'bg-faint' : ok ? 'bg-ok' : 'bg-bad', running > 0 && 'animate-pulse')} />
      {label}
    </span>
  );
}

export function Layout() {
  const { dark, toggle } = useTheme();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-panel/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <NavLink to="/" className="flex items-center gap-2 font-semibold">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-strong text-white">
              <Activity className="size-4" />
            </span>
            <span>
              Pulse<span className="text-brand-strong">QA</span>
            </span>
          </NavLink>
          <nav className="ml-auto flex items-center gap-1">
            <StatusPill />
            <NavLink to="/" end className={navCls}>
              <Plus className="size-4" /> <span className="hidden sm:inline">New audit</span>
            </NavLink>
            <NavLink to="/audits" className={navCls}>
              <History className="size-4" /> <span className="hidden sm:inline">History</span>
            </NavLink>
            <button onClick={toggle} className="rounded-lg p-2 text-muted hover:bg-raised hover:text-fg" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
