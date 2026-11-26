import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const audits = pgTable(
  'audits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    url: text('url').notNull(),
    finalUrl: text('final_url'),
    status: text('status').notNull().default('queued'), // queued | running | completed | failed | cancelled
    overallStatus: text('overall_status'), // pass | warn | fail
    score: integer('score'),
    checks: jsonb('checks').$type<string[]>().notNull(),
    // SHA-256 of the creator's anonymous browser secret. Nullable: audits from before ownership existed.
    ownerHash: text('owner_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    error: text('error'),
  },
  (t) => [
    index('audits_created_at_idx').on(t.createdAt),
    index('audits_url_idx').on(t.url),
    index('audits_owner_created_idx').on(t.ownerHash, t.createdAt),
  ],
);

export const auditChecks = pgTable(
  'audit_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    auditId: uuid('audit_id')
      .notNull()
      .references(() => audits.id, { onDelete: 'cascade' }),
    checkId: text('check_id').notNull(),
    status: text('status').notNull(),
    durationMs: integer('duration_ms').notNull().default(0),
    summary: jsonb('summary').$type<Record<string, unknown>>().notNull().default({}),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    error: text('error'),
    // Nullable on purpose: rows written before this column existed have no value (UI falls back to estimates).
    startedAt: timestamp('started_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_checks_audit_id_idx').on(t.auditId)],
);

export const auditArtifacts = pgTable(
  'audit_artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    auditId: uuid('audit_id')
      .notNull()
      .references(() => audits.id, { onDelete: 'cascade' }),
    checkId: text('check_id').notNull(),
    kind: text('kind').notNull().default('screenshot'),
    label: text('label').notNull(),
    filePath: text('file_path').notNull(), // relative to ARTIFACTS_DIR
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_artifacts_audit_id_idx').on(t.auditId)],
);

/** The approved visual-regression baseline per browser (owner) and URL — new runs are diffed against it. */
export const visualBaselines = pgTable(
  'visual_baselines',
  {
    ownerHash: text('owner_hash').notNull(),
    url: text('url').notNull(),
    auditId: uuid('audit_id')
      .notNull()
      .references(() => audits.id, { onDelete: 'cascade' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.ownerHash, t.url] }), index('visual_baselines_audit_id_idx').on(t.auditId)],
);

export type AuditRow = typeof audits.$inferSelect;
export type AuditCheckRow = typeof auditChecks.$inferSelect;
export type AuditArtifactRow = typeof auditArtifacts.$inferSelect;
