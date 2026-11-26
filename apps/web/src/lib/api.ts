import type { AuditDetailDTO, AuditHistoryPoint, AuditListDTO, CreateAuditRequest, CreateAuditResponse } from '@pulseqa/shared';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include', // anonymous owner cookie (history is per browser)
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (null as T) : res.json();
}

export const api = {
  createAudit: (body: CreateAuditRequest) => request<CreateAuditResponse>('/api/audits', { method: 'POST', body: JSON.stringify(body) }),
  listAudits: (page = 1, limit = 20, q = '') =>
    request<AuditListDTO>(`/api/audits?page=${page}&limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  getAudit: (id: string) => request<AuditDetailDTO>(`/api/audits/${id}`),
  /** Completed runs of the same URL up to this one, oldest first (empty for non-owners). */
  getHistory: (id: string) => request<AuditHistoryPoint[]>(`/api/audits/${id}/history`),
  /** Approve this run's visual screenshots as the baseline for its URL (owner only). */
  approveBaseline: (id: string) => request<{ auditId: string; approvedAt: string }>(`/api/audits/${id}/baseline`, { method: 'POST' }),
  cancelAudit: (id: string) => request<{ ok: true }>(`/api/audits/${id}/cancel`, { method: 'POST' }),
  deleteAudit: (id: string) => request<void>(`/api/audits/${id}`, { method: 'DELETE' }),
};

export const auditKey = (id: string) => ['audit', id] as const;
