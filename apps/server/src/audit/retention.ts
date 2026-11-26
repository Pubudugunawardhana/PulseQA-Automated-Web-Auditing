import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { isTracked } from './queue.js';
import { deleteAudits, findExpiredAudits } from './repository.js';

const DAY = 24 * 60 * 60_000;
const SWEEP_EVERY = 60 * 60_000; // hourly

/** Deletes every finished audit older than HISTORY_MAX_AGE_DAYS, with its screenshots and video. */
export async function pruneExpiredAudits(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - config.HISTORY_MAX_AGE_DAYS * DAY);
  const ids = (await findExpiredAudits(cutoff)).filter((id) => !isTracked(id));
  const deleted = await deleteAudits(ids);
  await Promise.all(deleted.map((id) => fs.rm(path.join(config.ARTIFACTS_DIR, id), { recursive: true, force: true }).catch(() => {})));
  return deleted.length;
}

/** Runs the sweep now and then every hour (never keeps the process alive on its own). */
export function startRetentionSweeper(): void {
  const sweep = () =>
    pruneExpiredAudits()
      .then((n) => n && console.log(`[retention] deleted ${n} audit(s) older than ${config.HISTORY_MAX_AGE_DAYS} days`))
      .catch((err) => console.error('[retention] sweep failed:', (err as Error).message));
  void sweep();
  setInterval(sweep, SWEEP_EVERY).unref();
}
