import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ConfirmProvider } from './components/ConfirmDialog';
import { Layout } from './components/Layout';
import './index.css';
import { AuditDetail } from './pages/AuditDetail';
import { History } from './pages/History';
import { Landing } from './pages/Landing';
import { NewAudit } from './pages/NewAudit';

// Apply saved / system theme before first paint
(() => {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem('pulseqa-theme');
  } catch {
    /* storage unavailable */
  }
  const dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', dark);
})();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/new', element: <NewAudit /> },
      { path: '/audits', element: <History /> },
      { path: '/audits/:id', element: <AuditDetail /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <RouterProvider router={router} />
      </ConfirmProvider>
    </QueryClientProvider>
  </StrictMode>,
);
