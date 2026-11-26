import fs from 'node:fs';
import { createApp } from './app.js';
import { config } from './config.js';
import { closeBrowser } from './audit/browser.js';
import { failInterruptedAudits } from './audit/repository.js';
import { startRetentionSweeper } from './audit/retention.js';
import { pool } from './db/client.js';

const bootTime = new Date();
fs.mkdirSync(config.ARTIFACTS_DIR, { recursive: true });

await failInterruptedAudits(bootTime).catch((err) => console.error('[db] could not reset interrupted audits:', err.message));

const server = createApp().listen(config.PORT, () => {
  console.log(`PulseQA API listening on http://localhost:${config.PORT}`);
  startRetentionSweeper(); // deletes audits older than HISTORY_MAX_AGE_DAYS now and every hour
});
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') console.error(`Port ${config.PORT} is already in use — is another PulseQA server running?`);
  else console.error('[server]', err);
  process.exit(1);
});

async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down...`);
  server.close();
  await closeBrowser();
  await pool.end().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
