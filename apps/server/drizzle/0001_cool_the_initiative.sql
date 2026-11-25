ALTER TABLE "audit_checks" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "audits_url_idx" ON "audits" USING btree ("url");