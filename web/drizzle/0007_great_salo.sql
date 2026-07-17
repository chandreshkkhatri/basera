CREATE TABLE "listings_archive" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"source_url" text,
	"source_group" text,
	"posted_at" timestamp with time zone NOT NULL,
	"scraped_at" timestamp with time zone NOT NULL,
	"location" text,
	"city" text,
	"city_id" bigint,
	"rent" integer,
	"bhk" text,
	"gender_preference" text NOT NULL,
	"furnishing_status" text,
	"additional_details" text,
	"latitude" double precision,
	"longitude" double precision,
	"original_text" text NOT NULL,
	"contact_name" text,
	"contact_url" text,
	"is_rental" boolean NOT NULL,
	"is_offer" boolean NOT NULL,
	"status" text NOT NULL,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listings" DROP CONSTRAINT "listings_status_chk";--> statement-breakpoint
CREATE UNIQUE INDEX "listings_archive_source_source_id_uq" ON "listings_archive" USING btree ("source","source_id");--> statement-breakpoint
ALTER TABLE "listings" ADD CONSTRAINT "listings_status_chk" CHECK ("listings"."status" in ('active','archived','stale','hidden'));