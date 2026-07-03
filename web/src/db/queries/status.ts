import { desc, sql } from "drizzle-orm";
import { db } from "@/db";
import { listings, scrapeRuns, type ScrapeRun } from "@/db/schema";

export type SourceHealth = {
  source: string;
  lastRun: ScrapeRun | null;
};

/** Latest run per source (DISTINCT ON). */
export async function getSourceHealth(): Promise<ScrapeRun[]> {
  const rows = await db.execute<ScrapeRun>(sql`
    select distinct on (source) *
    from ${scrapeRuns}
    order by source, started_at desc
  `);
  return rows.rows as unknown as ScrapeRun[];
}

export async function getRecentRuns(limit = 20): Promise<ScrapeRun[]> {
  return db
    .select()
    .from(scrapeRuns)
    .orderBy(desc(scrapeRuns.startedAt))
    .limit(limit);
}

export type SourceCounts = {
  source: string;
  status: string;
  count: number;
};

export async function getListingCounts(): Promise<SourceCounts[]> {
  const rows = await db
    .select({
      source: listings.source,
      status: listings.status,
      count: sql<number>`count(*)::int`,
    })
    .from(listings)
    .groupBy(listings.source, listings.status)
    .orderBy(listings.source, listings.status);
  return rows;
}
