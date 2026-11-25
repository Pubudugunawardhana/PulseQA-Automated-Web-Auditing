ALTER TABLE "audits" ADD COLUMN "owner_hash" text;--> statement-breakpoint
CREATE INDEX "audits_owner_created_idx" ON "audits" USING btree ("owner_hash","created_at");