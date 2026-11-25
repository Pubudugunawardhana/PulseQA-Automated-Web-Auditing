import { ArrowRight, Check, Copy, ExternalLink, Wrench } from 'lucide-react';
import { useState } from 'react';
import { CHECK_META, type Issue } from '@pulseqa/shared';

/** "How to fix" guidance for one issue: tip, where it happens, copy-paste snippet and docs link. */
export function FixPanel({ issue, onOpenReport }: { issue: Issue; onOpenReport: () => void }) {
  const [copied, setCopied] = useState(false);
  const { tip, snippet, docs } = issue.fix;

  const copy = async () => {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="mb-3 ml-5 mr-2 space-y-3 rounded-lg border border-line bg-raised/50 p-4 text-sm">
      <div className="flex gap-2.5">
        <Wrench className="mt-0.5 size-4 shrink-0 text-brand-strong" />
        <div className="min-w-0">
          <div className="font-semibold">How to fix</div>
          <p className="mt-0.5 leading-relaxed text-muted">{tip}</p>
        </div>
      </div>

      {issue.example && (
        <div className="pl-6.5">
          <div className="mb-1 text-xs font-medium text-faint">{issue.count > 1 ? `Example (1 of ${issue.count})` : 'Found at'}</div>
          <code className="block break-all rounded-md bg-panel px-2.5 py-1.5 font-mono text-xs text-fg ring-1 ring-line">{issue.example}</code>
        </div>
      )}

      {snippet && (
        <div className="pl-6.5">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-faint">Example fix</span>
            <button onClick={copy} className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-fg">
              {copied ? <Check className="size-3.5 text-ok" /> : <Copy className="size-3.5" />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md bg-[#0a0e0b] px-3 py-2 font-mono text-xs text-[#a7f3d0]">{snippet}</pre>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 pl-6.5 text-xs font-medium">
        {docs && (
          <a href={docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-strong hover:underline">
            Learn more <ExternalLink className="size-3" />
          </a>
        )}
        <button onClick={onOpenReport} className="inline-flex items-center gap-1 text-brand-strong hover:underline">
          Open {CHECK_META[issue.checkId].name} report <ArrowRight className="size-3" />
        </button>
      </div>
    </div>
  );
}
