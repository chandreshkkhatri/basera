DROP INDEX "listings_feed_idx";--> statement-breakpoint
ALTER TABLE "listings" ADD COLUMN "is_offer" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "listings_feed_idx" ON "listings" USING btree ("status","is_rental","is_offer","posted_at" DESC NULLS LAST);