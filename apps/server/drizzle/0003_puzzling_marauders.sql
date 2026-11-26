CREATE TABLE "visual_baselines" (
	"owner_hash" text NOT NULL,
	"url" text NOT NULL,
	"audit_id" uuid NOT NULL,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visual_baselines_owner_hash_url_pk" PRIMARY KEY("owner_hash","url")
);
--> statement-breakpoint
ALTER TABLE "visual_baselines" ADD CONSTRAINT "visual_baselines_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "visual_baselines_audit_id_idx" ON "visual_baselines" USING btree ("audit_id");