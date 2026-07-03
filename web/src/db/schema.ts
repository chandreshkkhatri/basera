import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * The DB is a contract shared with the Python ingestion engine.
 *
 * - The web app (Drizzle) OWNS the schema. Migrations are generated into
 *   `web/drizzle/*.sql` and are the authoritative DDL that the Python side
 *   reads directly. Never use `drizzle-kit push` (it skips the SQL history).
 * - Python only runs `INSERT ... ON CONFLICT` — it never migrates.
 * - LLM-extracted enums (gender_preference, furnishing_status, bhk) are plain
 *   `text` with a TS-only union type. No DB CHECK on them: a drifted LLM string
 *   must never fail a Python insert. Render-time code (lib/normalize.ts) guards.
 * - CHECK constraints only on the closed sets we control: `source`, `status`.
 */

export type Source = "telegram" | "whatsapp" | "facebook";
export type GenderPreference = "male" | "female" | "family" | "bachelor" | "any";
export type FurnishingStatus = "fully furnished" | "semi furnished" | "unfurnished";
export type ListingStatus = "active" | "stale" | "hidden";
export type RunStatus = "running" | "success" | "error" | "quota_exceeded";

export const listings = pgTable(
  "listings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").$type<Source>().notNull(),
    // text (not int): Facebook uses "fb_hash_..." / "fb_post_...",
    // Telegram uses "<chatId>:<msgId>".
    sourceId: text("source_id").notNull(),
    sourceUrl: text("source_url"),
    sourceGroup: text("source_group"),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull(),
    scrapedAt: timestamp("scraped_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    location: text("location"),
    city: text("city"),
    // rupees/month; NULL = not specified (ingestion maps 0 -> NULL).
    rent: integer("rent"),
    bhk: text("bhk"), // free text: "2 BHK", "1 RK"
    genderPreference: text("gender_preference")
      .$type<GenderPreference>()
      .notNull()
      .default("any"),
    furnishingStatus: text("furnishing_status").$type<FurnishingStatus>(),
    additionalDetails: text("additional_details"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    originalText: text("original_text").notNull(),
    contactName: text("contact_name"),
    contactUrl: text("contact_url"),
    isRental: boolean("is_rental").notNull().default(true),
    status: text("status").$type<ListingStatus>().notNull().default("active"),
  },
  (t) => [
    uniqueIndex("listings_source_source_id_uq").on(t.source, t.sourceId),
    index("listings_posted_at_idx").on(t.postedAt.desc()),
    index("listings_city_lower_idx").on(sql`lower(${t.city})`),
    index("listings_rent_idx").on(t.rent),
    index("listings_lat_lon_idx").on(t.latitude, t.longitude),
    // covers the default feed predicate + ordering
    index("listings_feed_idx").on(t.status, t.isRental, t.postedAt.desc()),
    check(
      "listings_source_chk",
      sql`${t.source} in ('telegram','whatsapp','facebook')`,
    ),
    check(
      "listings_status_chk",
      sql`${t.status} in ('active','stale','hidden')`,
    ),
  ],
);

/**
 * Raw scraped posts, written and read ONLY by the Python ingestion engine.
 * Lives in this schema so all DDL history is in one place. Generalizes
 * Facebook's scrape-only / offline-analyze split to every source: capture is
 * universal, LLM analysis is a separable phase keyed off `processed_at IS NULL`.
 * Large HTML snapshots stay on disk under ingestion/state/html/, path in `meta`.
 */
export const rawPosts = pgTable(
  "raw_posts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").$type<Source>().notNull(),
    sourceId: text("source_id").notNull(),
    sourceGroup: text("source_group"),
    sourceUrl: text("source_url"),
    text: text("text").notNull(),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    scrapedAt: timestamp("scraped_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    authorName: text("author_name"),
    authorUrl: text("author_url"),
    meta: jsonb("meta"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("raw_posts_source_source_id_uq").on(t.source, t.sourceId),
    index("raw_posts_unprocessed_idx").on(t.processedAt),
  ],
);

export const scrapeRuns = pgTable(
  "scrape_runs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    source: text("source").notNull(),
    target: text("target").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    postsSeen: integer("posts_seen").notNull().default(0),
    postsNew: integer("posts_new").notNull().default(0),
    listingsUpserted: integer("listings_upserted").notNull().default(0),
    status: text("status").$type<RunStatus>().notNull().default("running"),
    error: text("error"),
  },
  (t) => [index("scrape_runs_source_started_idx").on(t.source, t.startedAt.desc())],
);

export type Listing = typeof listings.$inferSelect;
export type NewListing = typeof listings.$inferInsert;
export type ScrapeRun = typeof scrapeRuns.$inferSelect;
