CREATE TABLE "listings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"source_url" text,
	"source_group" text,
	"posted_at" timestamp with time zone NOT NULL,
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL,
	"location" text,
	"city" text,
	"rent" integer,
	"bhk" text,
	"gender_preference" text DEFAULT 'any' NOT NULL,
	"furnishing_status" text,
	"additional_details" text,
	"latitude" double precision,
	"longitude" double precision,
	"original_text" text NOT NULL,
	"contact_name" text,
	"contact_url" text,
	"is_rental" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "listings_source_chk" CHECK ("listings"."source" in ('telegram','whatsapp','facebook')),
	CONSTRAINT "listings_status_chk" CHECK ("listings"."status" in ('active','stale','hidden'))
);
--> statement-breakpoint
CREATE TABLE "raw_posts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"source_group" text,
	"source_url" text,
	"text" text NOT NULL,
	"posted_at" timestamp with time zone,
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL,
	"author_name" text,
	"author_url" text,
	"meta" jsonb,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"target" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"posts_seen" integer DEFAULT 0 NOT NULL,
	"posts_new" integer DEFAULT 0 NOT NULL,
	"listings_upserted" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "listings_source_source_id_uq" ON "listings" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "listings_posted_at_idx" ON "listings" USING btree ("posted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "listings_city_lower_idx" ON "listings" USING btree (lower("city"));--> statement-breakpoint
CREATE INDEX "listings_rent_idx" ON "listings" USING btree ("rent");--> statement-breakpoint
CREATE INDEX "listings_lat_lon_idx" ON "listings" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "listings_feed_idx" ON "listings" USING btree ("status","is_rental","posted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "raw_posts_source_source_id_uq" ON "raw_posts" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "raw_posts_unprocessed_idx" ON "raw_posts" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "scrape_runs_source_started_idx" ON "scrape_runs" USING btree ("source","started_at" DESC NULLS LAST);