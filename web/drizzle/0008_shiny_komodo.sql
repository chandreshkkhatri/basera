ALTER TABLE "geocode_cache" ADD COLUMN "precision" text;--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "geo_precision" text;--> statement-breakpoint
ALTER TABLE "listings_archive" ADD COLUMN "geo_precision" text;