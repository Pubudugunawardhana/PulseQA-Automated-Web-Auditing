import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '../lib/format';

const TABS = [
  { to: '/', key: '1', label: 'new-audit', end: true },
  { to: '/audits', key: '2', label: 'history', end: false },
];

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

export function Layout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const health = useHealth();

  // Alt+1 / Alt+2 switch tabs like a terminal multiplexer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      const tab = TABS.find((t) => t.key === e.key);
      if (tab) {
        e.preventDefault();
        navigate(tab.to);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const online = health.data?.ok;
  const cwd = pathname === '/' ? '~' : pathname.startsWith('/audits/') ? `~/audits/${pathname.split('/')[2]?.slice(0, 8)}` : '~/audits';

  return (
    <div className="min-h-screen px-0 py-0 sm:px-6 sm:py-8">
      <div className="scanlines mx-auto flex min-h-screen max-w-6xl flex-col overflow-hidden border-term-line bg-term-panel shadow-[0_0_0_1px_#1f2a23,0_30px_80px_-20px_#000] sm:min-h-[calc(100vh-4rem)] sm:rounded-lg sm:border">
        {/* title bar */}
        <div className="flex items-center gap-3 border-b border-term-line bg-term-raised px-3 py-2">
          <div className="flex gap-1.5" aria-hidden>
            <span className="size-3 rounded-full bg-[#ff5f57]" />
            <span className="size-3 rounded-full bg-[#febc2e]" />
            <span className="size-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex-1 truncate text-center text-xs text-term-dim">
            qa@pulseqa: {cwd}
          </div>
          <div className="w-[52px]" />
        </div>

        {/* tab bar */}
        <nav className="flex items-center gap-0 overflow-x-auto border-b border-term-line text-xs">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  'whitespace-nowrap border-r border-term-line px-4 py-1.5 transition',
                  isActive ? 'bg-term-bg text-term-green' : 'text-term-dim hover:text-term-fg',
                )
              }
            >
              <span className="text-term-faint">{t.key}:</span>
              {t.label}
            </NavLink>
          ))}
          <span className="ml-auto hidden whitespace-nowrap px-4 text-term-faint sm:block">alt+1 / alt+2 to switch</span>
        </nav>

        <main className="flex-1 overflow-x-hidden bg-term-bg px-4 py-5 sm:px-6">
          <Outlet />
        </main>

        {/* status line */}
        <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-term-line bg-term-raised px-3 py-1 text-[11px] text-term-dim">
          <span className="bg-term-green px-1.5 font-bold text-term-bg">PULSEQA</span>
          <span>
            api{' '}
            <span className={online ? 'text-term-green' : health.isLoading ? 'text-term-dim' : 'text-term-red'}>
              {health.isLoading ? '…' : online ? '● online' : '● offline'}
            </span>
          </span>
          <span>
            db{' '}
            {health.isLoading ? (
              <span>…</span>
            ) : (
              <span className={health.data?.db ? 'text-term-green' : 'text-term-red'}>{health.data?.db ? 'neon ✓' : '✗'}</span>
            )}
          </span>
          {health.data && (
            <span>
              queue <span className="text-term-fg">{health.data.queue.active} running</span> · {health.data.queue.pending} pending
            </span>
          )}
          <span className="ml-auto">chromium · playwright · axe-core</span>
        </footer>
      </div>
    </div>
  );
}
