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
  ALLOW_PRIVATE_HOSTS: bool.default(true),
  ARTIFACTS_DIR: z.string().default('./artifacts'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
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
  ARTIFACTS_DIR: path.resolve(process.cwd(), parsed.data.ARTIFACTS_DIR),
};
