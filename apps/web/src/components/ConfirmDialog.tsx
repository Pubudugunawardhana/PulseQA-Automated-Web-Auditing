// In-app confirmation dialog (replaces the browser's confirm() popup).
// Usage: const confirm = useConfirm(); if (await confirm({ title, message, tone: 'danger' })) { ... }
import { AlertTriangle, BadgeCheck, Loader2 } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/format';
import { Button } from './ui';

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = red destructive action (delete), default = brand action (approve). */
  tone?: 'danger' | 'default';
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return fn;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const confirm = useCallback<ConfirmFn>((opts) => new Promise<boolean>((resolve) => setState({ ...opts, resolve })), []);
  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && <Dialog opts={state} onClose={close} />}
    </ConfirmContext.Provider>
  );
}

function Dialog({ opts, onClose }: { opts: ConfirmOptions; onClose: (ok: boolean) => void }) {
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const danger = opts.tone === 'danger';

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // destructive actions start on "Cancel" so a stray Enter can't delete anything
    (danger ? cancelRef : confirmRef).current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose(false);
      }
      if (e.key === 'Tab') {
        // keep focus inside the dialog
        const els = [cancelRef.current, confirmRef.current].filter(Boolean) as HTMLElement[];
        const i = els.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        els[(i + (e.shiftKey ? -1 : 1) + els.length) % els.length]?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [danger, onClose]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 sm:items-center">
      <div className="pqa-fade absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => onClose(false)} aria-hidden />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={opts.message ? descId : undefined}
        className="pqa-pop relative w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-2xl"
      >
        <div className="flex gap-4">
          <span className={cn('grid size-11 shrink-0 place-items-center rounded-full', danger ? 'bg-bad/10 text-bad' : 'bg-brand/10 text-brand-strong')}>
            {danger ? <AlertTriangle className="size-5" /> : <BadgeCheck className="size-5" />}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id={titleId} className="text-base font-semibold text-fg">
              {opts.title}
            </h2>
            {opts.message && (
              <div id={descId} className="mt-1.5 text-sm leading-relaxed text-muted">
                {opts.message}
              </div>
            )}
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} onClick={() => onClose(false)} disabled={busy}>
            {opts.cancelLabel ?? 'Cancel'}
          </Button>
          <Button
            ref={confirmRef}
            variant={danger ? 'dangerSolid' : 'primary'}
            onClick={() => {
              setBusy(true);
              onClose(true);
            }}
            disabled={busy}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            {opts.confirmLabel ?? 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}
