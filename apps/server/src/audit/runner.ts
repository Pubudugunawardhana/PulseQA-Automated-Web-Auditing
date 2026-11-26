import { computeOverall, computeScore, type CheckId, type CheckResult } from '@pulseqa/shared';
import { config } from '../config.js';
import { AUDIT_TIMEOUT_MS, runAuditEngine } from './engine.js';
import { publish } from './events.js';
import { enqueue } from './queue.js';
import { finishAudit, getAuditKey, getVisualBaseline, markStarted, saveCheckResult, setVisualBaseline } from './repository.js';

export function scheduleAudit(auditId: string, url: string, checks: CheckId[]): void {
  enqueue(auditId, (signal) => executeAudit(auditId, url, checks, signal));
}

async function executeAudit(auditId: string, url: string, checks: CheckId[], signal: AbortSignal): Promise<void> {
  // Cancelled while still waiting in the queue: never start a browser
  if (signal.aborted) {
    const audit = await finishAudit(auditId, { status: 'cancelled', error: 'Cancelled before it started', finishedAt: new Date() });
    publish(auditId, { type: 'audit:completed', audit });
    return;
  }

  const startedAt = new Date();
  await markStarted(auditId, startedAt);
  publish(auditId, { type: 'audit:started', auditId, startedAt: startedAt.toISOString() });

  const saved = new Set<CheckId>();
  try {
    // Visual regression compares against the owner's approved baseline for this URL
    const key = checks.includes('visual') ? await getAuditKey(auditId) : null;
    const baseline = key ? await getVisualBaseline(key.ownerHash, key.url) : null;

    const { finalUrl, results, aborted } = await runAuditEngine({
      auditId,
      url,
      checks,
      signal,
      artifactsDir: config.ARTIFACTS_DIR,
      allowPrivateHosts: config.ALLOW_PRIVATE_HOSTS,
      baseline,
      onCheckStarted: (checkId) => publish(auditId, { type: 'check:started', auditId, checkId }),
      onCheckCompleted: async (result) => {
        await saveCheckResult(auditId, result);
        saved.add(result.checkId);
        publish(auditId, { type: 'check:completed', auditId, result });
      },
    });

    // Checks skipped because of cancel/timeout weren't emitted by the engine — persist them too.
    const unsaved = results.filter((r) => !saved.has(r.checkId));
    for (const r of unsaved) {
      await saveCheckResult(auditId, r);
      publish(auditId, { type: 'check:completed', auditId, result: r });
    }

    // First visual run for this owner + URL becomes the approved baseline automatically (like Percy)
    const visual = results.find((r) => r.checkId === 'visual');
    if (key?.ownerHash && !baseline && !aborted && visual && visual.status !== 'error' && visual.status !== 'skipped' && visual.screenshots.length) {
      await setVisualBaseline(key.ownerHash, key.url, auditId).catch((err) => console.error('Could not save visual baseline:', err));
    }

    const finishedAt = new Date();
    const ran: CheckResult[] = results.filter((r) => r.status !== 'skipped' || !aborted);
    const base = { finalUrl, finishedAt, durationMs: finishedAt.getTime() - startedAt.getTime() };

    const audit =
      aborted === 'cancelled'
        ? await finishAudit(auditId, { ...base, status: 'cancelled', error: 'Cancelled by user' })
        : await finishAudit(auditId, {
            ...base,
            status: 'completed',
            score: computeScore(ran),
            overallStatus: computeOverall(ran),
            error:
              aborted === 'timeout'
                ? `Stopped at the ${AUDIT_TIMEOUT_MS / 60_000}-minute limit; ${unsaved.length} check(s) skipped`
                : ran.length > 0 && ran.every((r) => r.status === 'skipped')
                  ? (ran[0].error ?? 'No check could run') // e.g. "Skipped: page could not be loaded (…)"
                  : null,
          });
    publish(auditId, { type: 'audit:completed', audit });
  } catch (err) {
    const message = (err as Error).message.split('\n')[0];
    const finishedAt = new Date();
    await finishAudit(auditId, {
      status: 'failed',
      error: message,
      finishedAt,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    }).catch(() => {});
    publish(auditId, { type: 'audit:failed', auditId, error: message });
  }
}
