import { ChevronDown, Download, FileCode2, FileJson, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/format';
import { Button } from '../ui';

/** "Export ▾" dropdown: self-contained HTML report or raw JSON. */
export function ExportMenu({ onExport, busy }: { onExport: (kind: 'html' | 'json') => void; busy: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const item = (kind: 'html' | 'json', icon: ReactNode, title: string, text: string) => (
    <button
      role="menuitem"
      onClick={() => {
        setOpen(false);
        onExport(kind);
      }}
      className="flex w-full items-start gap-3 rounded-md px-3 py-2 text-left hover:bg-raised"
    >
      <span className="mt-0.5 text-muted">{icon}</span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted">{text}</span>
      </span>
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <Button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} disabled={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Export
        <ChevronDown className={cn('size-4 text-muted transition', open && 'rotate-180')} />
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1.5 w-64 rounded-xl border border-line bg-panel p-1.5 shadow-xl">
          {item('html', <FileCode2 className="size-4" />, 'HTML report', 'Self-contained, screenshots embedded')}
          {item('json', <FileJson className="size-4" />, 'JSON', 'Raw results for scripts and CI')}
        </div>
      )}
    </div>
  );
}
