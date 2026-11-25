import path from 'node:path';
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === undefined || v === '' ? undefined : ['1', 'true', 'yes'].includes(v.toLowerCase()));

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (Neon pooled connection string)'),
  PORT: z.coerce.number().int().positive().default(4000),
  MAX_CONCURRENT_AUDITS: z.coerce.number().int().min(1).max(10).default(2),
  /** Audits kept per browser; older ones (and their screenshots) are removed automatically. */
  HISTORY_LIMIT: z.coerce.number().int().min(1).max(1000).default(10),
  ALLOW_PRIVATE_HOSTS: bool.default(true),
  ARTIFACTS_DIR: z.string().default('./artifacts'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  /** Only when the web app and API are on DIFFERENT sites: owner cookie becomes SameSite=None; Secure. */
  CROSS_SITE_COOKIES: bool,
  /** Built web app to serve from the API (single-service deploy). Ignored if the folder doesn't exist. */
  WEB_DIST_DIR: z.string().default('../web/dist'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  console.error('Copy .env.example to .env (project root) and fill it in.');
  process.exit(1);
}

export const config = {
  ...parsed.data,
  ALLOW_PRIVATE_HOSTS: parsed.data.ALLOW_PRIVATE_HOSTS ?? true,
  CROSS_SITE_COOKIES: parsed.data.CROSS_SITE_COOKIES ?? false,
  ARTIFACTS_DIR: path.resolve(process.cwd(), parsed.data.ARTIFACTS_DIR),
  WEB_DIST_DIR: path.resolve(process.cwd(), parsed.data.WEB_DIST_DIR),
};
