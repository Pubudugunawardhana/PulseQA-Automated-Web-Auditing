import pLimit from 'p-limit';
import { config } from '../config.js';

const limit = pLimit(config.MAX_CONCURRENT_AUDITS);
/** Audits this process owns (queued or running), each with its cancel switch. */
const active = new Map<string, AbortController>();

export function enqueue(auditId: string, job: (signal: AbortSignal) => Promise<void>): void {
  const controller = new AbortController();
  active.set(auditId, controller);
  void limit(async () => {
    try {
      await job(controller.signal);
    } catch (err) {
      console.error(`[queue] audit ${auditId} crashed`, err);
    } finally {
      active.delete(auditId);
    }
  });
}

/** Requests cancellation. Returns false if this process isn't running/queuing that audit. */
export function cancel(auditId: string): boolean {
  const controller = active.get(auditId);
  if (!controller) return false;
  controller.abort(new DOMException('Cancelled by user', 'AbortError'));
  return true;
}

export function queueStats() {
  return { active: limit.activeCount, pending: limit.pendingCount };
}

export function isTracked(auditId: string): boolean {
  return active.has(auditId);
}
