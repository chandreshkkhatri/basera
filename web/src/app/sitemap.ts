import type { MetadataRoute } from "next";
import { desc, and, eq } from "drizzle-orm";
import { db } from "@/db";
import { listings } from "@/db/schema";
import { getEnabledCities } from "@/db/queries/cities";
import { siteUrl } from "@/lib/site";

// Reads the DB on every crawl — the feed changes with each ingestion run.
export const dynamic = "force-dynamic";

// Well under the 50k sitemap limit; newest listings matter most to crawlers.
const MAX_LISTING_URLS = 10_000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const abs = (path: string) => new URL(path, base).toString();

  // Tolerate a down DB: emit at least the root URL.
  const [cities, rows] = await Promise.all([
    getEnabledCities().catch(() => []),
    db
      .select({
        id: listings.id,
        scrapedAt: listings.scrapedAt,
      })
      .from(listings)
      .where(
        and(
          eq(listings.status, "active"),
          eq(listings.isRental, true),
          eq(listings.isOffer, true),
        ),
      )
      .orderBy(desc(listings.postedAt))
      .limit(MAX_LISTING_URLS)
      .catch(() => []),
  ]);

  return [
    {
      url: abs("/"),
      changeFrequency: "hourly",
      priority: 1,
    },
    ...cities.map((c) => ({
      url: abs(`/?city=${c.slug}`),
      changeFrequency: "hourly" as const,
      priority: 0.9,
    })),
    ...rows.map((l) => ({
      url: abs(`/listings/${l.id}`),
      lastModified: l.scrapedAt ?? undefined,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
  ];
}
