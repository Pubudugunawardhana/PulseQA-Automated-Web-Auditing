import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { AuditDetailDTO, AuditEvent, CheckId } from '@pulseqa/shared';
import { auditKey } from './api';

/**
 * Subscribes to the audit's SSE stream and merges events into the TanStack Query cache.
 * Returns the id of the check currently running (for the spinner).
 */
export function useAuditEvents(id: string, enabled: boolean) {
  const qc = useQueryClient();
  const [running, setRunning] = useState<CheckId | null>(null);
  const [runningSince, setRunningSince] = useState<Date | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource(`/api/audits/${id}/events`, { withCredentials: true });
    const update = (fn: (a: AuditDetailDTO) => AuditDetailDTO) =>
      qc.setQueryData<AuditDetailDTO>(auditKey(id), (old) => (old ? fn(old) : old));

    es.onopen = () => setConnected(true);
    es.onmessage = (msg) => {
      const e = JSON.parse(msg.data) as AuditEvent;
      switch (e.type) {
        case 'snapshot':
          qc.setQueryData(auditKey(id), e.audit);
          break;
        case 'audit:started':
          update((a) => ({ ...a, status: 'running', startedAt: e.startedAt }));
          break;
        case 'check:started':
          setRunning(e.checkId);
          setRunningSince(new Date());
          break;
        case 'check:completed':
          setRunning(null);
          update((a) => ({
            ...a,
            results: [...a.results.filter((r) => r.checkId !== e.result.checkId), e.result],
          }));
          break;
        case 'audit:completed':
          setRunning(null);
          update((a) => ({ ...a, ...e.audit }));
          es.close();
          void qc.invalidateQueries({ queryKey: ['audits'] });
          void qc.invalidateQueries({ queryKey: ['health'] }); // status bar queue count
          void qc.invalidateQueries({ queryKey: ['previous', id] });
          break;
        case 'audit:failed':
          setRunning(null);
          update((a) => ({ ...a, status: 'failed', error: e.error }));
          es.close();
          void qc.invalidateQueries({ queryKey: ['health'] });
          void qc.invalidateQueries({ queryKey: auditKey(id) });
          break;
      }
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [id, enabled, qc]);

  return { running, runningSince, connected };
}
