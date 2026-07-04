import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cities, type City } from "@/db/schema";

/** Enabled cities, in display order — what the city selector shows. */
export async function getEnabledCities(): Promise<City[]> {
  return db
    .select()
    .from(cities)
    .where(eq(cities.enabled, true))
    .orderBy(asc(cities.displayOrder), asc(cities.name));
}

/** All cities including disabled — for the admin page. */
export async function getAllCities(): Promise<City[]> {
  return db
    .select()
    .from(cities)
    .orderBy(asc(cities.displayOrder), asc(cities.name));
}

export async function getCityBySlug(slug: string): Promise<City | null> {
  const rows = await db
    .select()
    .from(cities)
    .where(eq(cities.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Resolve the effective city for a request. Falls back to the first enabled
 * city when the requested slug is missing, unknown, or disabled — so a link to
 * a disabled city never leaks its listings.
 */
export async function resolveCity(
  slug: string | undefined,
  enabled: City[],
): Promise<City | null> {
  if (slug) {
    const match = enabled.find((c) => c.slug === slug);
    if (match) return match;
  }
  return enabled[0] ?? null;
}
