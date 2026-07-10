CREATE TABLE "alerts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"severity" text DEFAULT 'error' NOT NULL,
	"source" text DEFAULT 'ingestion' NOT NULL,
	"message" text NOT NULL,
	"details" jsonb,
	"run_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"delivery_attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"delivery_error" text
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_run_id_scrape_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."scrape_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_category_created_idx" ON "alerts" USING btree ("category","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "alerts_pending_idx" ON "alerts" USING btree ("delivery_status","created_at");--> statement-breakpoint
CREATE INDEX "alerts_created_idx" ON "alerts" USING btree ("created_at" DESC NULLS LAST);