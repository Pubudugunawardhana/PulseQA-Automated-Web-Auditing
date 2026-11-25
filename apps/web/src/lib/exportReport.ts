import { CHECK_META, classifyIssues, countBySeverity, type AuditDetailDTO, type CheckResult } from '@pulseqa/shared';
import { EXECUTION_ORDER, headline, shape } from './checks';
import { formatMs, hostOf } from './format';

function download(filename: string, content: Blob) {
  const url = URL.createObjectURL(content);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const baseName = (a: AuditDetailDTO) => `pulseqa-${hostOf(a.url).replace(/[^a-z0-9.-]/gi, '_')}-${a.createdAt.slice(0, 10)}-${a.id.slice(0, 8)}`;

export function exportJson(audit: AuditDetailDTO) {
  download(`${baseName(audit)}.json`, new Blob([JSON.stringify(audit, null, 2)], { type: 'application/json' }));
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

async function toDataUrl(src: string): Promise<string | null> {
  try {
    const blob = await (await fetch(src)).blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const COLOR: Record<string, string> = { pass: '#4ade80', warn: '#fbbf24', fail: '#f87171', error: '#f87171', skipped: '#6b7a6f' };

function list(title: string, items: string[]) {
  if (!items.length) return '';
  return `<h4>${esc(title)}</h4><ul>${items.slice(0, 50).map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
}

/** Check-specific findings as HTML lists. */
function findings(r: CheckResult): string {
  if (r.status === 'skipped' || r.status === 'error') return `<p class="dim">${esc(r.error)}</p>`;
  switch (r.checkId) {
    case 'smoke': {
      const d = shape(r, 'smoke').details;
      return list('Issues', d.issues ?? []) + list('Notes', d.notes ?? []);
    }
    case 'links': {
      const d = shape(r, 'links').details;
      return list('Broken links & images', [...d.brokenLinks, ...d.brokenImages].map((p) => `${p.status ?? p.error ?? 'no response'} — ${p.url}`)) +
        list('Restricted / unverified', d.restricted.map((p) => `${p.status ?? p.error} — ${p.url}`));
    }
    case 'consoleNetwork': {
      const d = shape(r, 'consoleNetwork').details;
      const tag = (p?: string) => (p === 'third' ? '[3rd-party] ' : '');
      return list('Uncaught exceptions', d.pageErrors.map((e) => tag(e.party) + e.message)) +
        list('Console errors', d.consoleErrors.map((c) => tag(c.party) + c.text)) +
        list('Failed API requests', d.apiFailures.map((n) => `${tag(n.party)}${n.method} ${n.status ?? n.failure} — ${n.url}`)) +
        list('Other failed requests', d.otherFailures.map((n) => `${tag(n.party)}${n.status ?? n.failure} — ${n.url}`));
    }
    case 'responsive': {
      const d = shape(r, 'responsive').details;
      return list('Viewports', d.viewports.map((v) => `${v.label} ${v.width}×${v.height}: ${v.error ? `error ${v.error}` : v.horizontalOverflow ? `overflow ${v.overflowPx}px` : 'ok'}`));
    }
    case 'accessibility': {
      const d = shape(r, 'accessibility').details;
      return list('WCAG violations', d.violations.map((v) => `[${v.impact}] ${v.help} (${v.id}) ×${v.nodeCount}`));
    }
    case 'performance': {
      const { summary: s, details: d } = shape(r, 'performance');
      const row = (k: 'ttfb' | 'fcp' | 'lcp' | 'cls' | 'load') =>
        `<tr><td>${k.toUpperCase()}</td><td>${k === 'cls' ? esc(s.cls) : formatMs(s[k])}</td><td>${s.mobile ? (k === 'cls' ? esc(s.mobile.cls) : formatMs(s.mobile[k])) : '—'}</td></tr>`;
      return `<table><tr><th>metric</th><th>${esc(d.conditions?.desktop ?? 'desktop')}</th><th>${esc(d.conditions?.mobile ?? 'mobile')}</th></tr>${(['ttfb', 'fcp', 'lcp', 'cls', 'load'] as const).map(row).join('')}</table>`;
    }
    case 'security': {
      const d = shape(r, 'security').details;
      return list('Headers', (d.headers ?? []).map((h) => `${h.ok ? '✓' : '✗'} ${h.header}${h.value ? `: ${h.value.slice(0, 120)}` : ''}`)) + list('Issues', d.issues ?? []);
    }
  }
}

/** Self-contained HTML report (screenshots embedded as data URLs), styled like the terminal UI. */
export async function exportHtml(audit: AuditDetailDTO) {
  const results = EXECUTION_ORDER.map((id) => audit.results.find((r) => r.checkId === id)).filter((r): r is CheckResult => !!r);
  const sections = await Promise.all(
    results.map(async (r) => {
      const shots = await Promise.all(
        r.screenshots.map(async (s) => {
          const data = await toDataUrl(s.url);
          return data ? `<figure><img src="${data}" alt="${esc(s.label)}"><figcaption>${esc(s.label)}</figcaption></figure>` : '';
        }),
      );
      return `<section>
        <h3><span style="color:${COLOR[r.status] ?? '#c8d3c9'}">[${esc(r.status.toUpperCase())}]</span> ${esc(CHECK_META[r.checkId].name)} <span class="dim">${formatMs(r.durationMs)}</span></h3>
        <p class="dim">└ ${esc(headline(r))}</p>
        ${findings(r)}
        ${shots.length ? `<div class="shots">${shots.join('')}</div>` : ''}
      </section>`;
    }),
  );

  const issues = classifyIssues(audit.results);
  const counts = countBySeverity(issues);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>PulseQA report — ${esc(hostOf(audit.url))}</title>
<style>
body{margin:0;background:#0a0e0b;color:#c8d3c9;font:13px/1.6 'JetBrains Mono',ui-monospace,Consolas,monospace}
main{max-width:1000px;margin:0 auto;padding:32px 20px}
h1{color:#4ade80;font-size:18px;margin:0 0 4px} h3{font-size:14px;margin:0 0 2px} h4{color:#67e8f9;font-size:12px;margin:12px 0 4px}
.dim{color:#6b7a6f} section{border-top:1px dashed #1f2a23;padding:16px 0}
ul{margin:0;padding-left:18px} li{word-break:break-all}
table{border-collapse:collapse;margin-top:8px} td,th{border:1px solid #1f2a23;padding:4px 10px;text-align:left} th{color:#6b7a6f;font-weight:400}
.shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-top:10px}
figure{margin:0;border:1px solid #1f2a23} figure img{width:100%;display:block} figcaption{padding:2px 6px;color:#6b7a6f;font-size:11px}
.score{font-size:28px;font-weight:700}
</style></head><body><main>
<h1>$ pulseqa audit ${esc(audit.url)}</h1>
<p class="dim">job ${esc(audit.id)} · ${esc(new Date(audit.createdAt).toLocaleString())} · duration ${formatMs(audit.durationMs)}</p>
<p><span class="score" style="color:${audit.score === null ? '#6b7a6f' : audit.score >= 90 ? '#4ade80' : audit.score >= 50 ? '#fbbf24' : '#f87171'}">${audit.score ?? '--'}/100</span>
 &nbsp;<span style="color:${COLOR[audit.overallStatus ?? ''] ?? '#c8d3c9'}">[${esc((audit.overallStatus ?? audit.status).toUpperCase())}]</span></p>
<p>issues: <span style="color:#f87171">${counts.error} errors</span> · <span style="color:#fbbf24">${counts.warning} warnings</span> · <span style="color:#67e8f9">${counts.notice} notices</span></p>
${issues.length ? `<h4>top issues</h4><ul>${issues.slice(0, 10).map((i) => `<li>${i.severity.toUpperCase()} · ${esc(i.title)} <span class="dim">(${esc(CHECK_META[i.checkId].name)} · ${i.count})</span></li>`).join('')}</ul>` : ''}
${audit.error ? `<p style="color:#fbbf24">${esc(audit.error)}</p>` : ''}
${sections.join('')}
<p class="dim">Generated by PulseQA · Playwright · axe-core</p>
</main></body></html>`;
  download(`${baseName(audit)}.html`, new Blob([html], { type: 'text/html' }));
}
