import { EventEmitter } from 'node:events';
import type { AuditEvent } from '@pulseqa/shared';

const bus = new EventEmitter();
bus.setMaxListeners(0);

export function publish(auditId: string, event: AuditEvent): void {
  bus.emit(auditId, event);
}

export function subscribe(auditId: string, listener: (e: AuditEvent) => void): () => void {
  bus.on(auditId, listener);
  return () => bus.off(auditId, listener);
}
