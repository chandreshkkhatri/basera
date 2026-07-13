import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  alertCategories,
  cities,
  groups,
  listings,
  type City,
} from "@/db/schema";
import { slugify } from "@/lib/slug";

export type GroupWithCity = {
  id: number;
  url: string;
  name: string | null;
  fbGroupId: string | null;
  enabled: boolean;
  cityId: number;
  cityName: string;
  listingCount: number;
};

export type CityWithCounts = City & { groupCount: number; listingCount: number };

export async function getCitiesWithCounts(): Promise<CityWithCounts[]> {
  const rows = await db
    .select({
      city: cities,
      groupCount: sql<number>`(select count(*)::int from ${groups} g where g.city_id = ${cities.id})`,
      listingCount: sql<number>`(select count(*)::int from ${listings} l where l.city_id = ${cities.id})`,
    })
    .from(cities)
    .orderBy(asc(cities.displayOrder), asc(cities.name));
  return rows.map((r) => ({
    ...r.city,
    groupCount: r.groupCount,
    listingCount: r.listingCount,
  }));
}

export async function getGroupsWithCity(): Promise<GroupWithCity[]> {
  const rows = await db
    .select({
      id: groups.id,
      url: groups.url,
      name: groups.name,
      fbGroupId: groups.fbGroupId,
      enabled: groups.enabled,
      cityId: groups.cityId,
      cityName: cities.name,
      listingCount: sql<number>`(select count(*)::int from ${listings} l where l.source_group = ${groups.url})`,
    })
    .from(groups)
    .innerJoin(cities, eq(groups.cityId, cities.id))
    .orderBy(asc(cities.name), desc(groups.createdAt));
  return rows;
}

// -- mutations (called only from guarded /api/admin routes) ----------------

export async function createCity(name: string): Promise<void> {
  const slug = slugify(name);
  if (!slug) throw new Error("Invalid city name");
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${cities.displayOrder}), 0)::int` })
    .from(cities);
  await db
    .insert(cities)
    .values({ name: name.trim(), slug, displayOrder: max + 1 })
    .onConflictDoNothing({ target: cities.slug });
}

export async function setCityEnabled(id: number, enabled: boolean): Promise<void> {
  await db.update(cities).set({ enabled }).where(eq(cities.id, id));
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export async function createGroup(
  url: string,
  cityId: number,
  name?: string,
  fbGroupId?: string,
): Promise<void> {
  const clean = normalizeUrl(url);
  if (!clean) throw new Error("Invalid group URL");
  await db
    .insert(groups)
    .values({
      url: clean,
      cityId,
      name: name?.trim() || null,
      fbGroupId: fbGroupId?.trim() || null,
    })
    .onConflictDoUpdate({
      target: groups.url,
      set: { cityId, name: name?.trim() || null, fbGroupId: fbGroupId?.trim() || null },
    });
}

export async function setGroupEnabled(id: number, enabled: boolean): Promise<void> {
  await db.update(groups).set({ enabled }).where(eq(groups.id, id));
}

export async function deleteGroup(id: number): Promise<void> {
  await db.delete(groups).where(eq(groups.id, id));
}

/**
 * Known alert categories, mirroring ingestion/alerts.py CATEGORY_SEVERITY
 * (minus "test", which is always delivered). The table only stores overrides;
 * an absent row means enabled.
 */
export const ALERT_CATEGORY_META = [
  { category: "run_failure", label: "Run failure", hint: "A scrape run errored" },
  { category: "login_expiry", label: "Login expiry", hint: "Facebook session expired; re-login needed" },
  { category: "quota_exceeded", label: "Quota exceeded", hint: "LLM API quota exhausted" },
  { category: "stale_data", label: "Stale data", hint: "No successful scrapes / new posts in the watch window" },
  { category: "processing_failed", label: "Processing failed", hint: "A post exhausted its AI-processing retries" },
  { category: "db_unavailable", label: "DB unavailable", hint: "The runner can't reach Postgres" },
] as const;

export type AlertCategoryToggle = {
  category: string;
  label: string;
  hint: string;
  enabled: boolean;
};

export async function getAlertCategoryToggles(): Promise<AlertCategoryToggle[]> {
  const rows = await db.select().from(alertCategories);
  const overrides = new Map(rows.map((r) => [r.category, r.enabled]));
  return ALERT_CATEGORY_META.map((meta) => ({
    ...meta,
    enabled: overrides.get(meta.category) ?? true,
  }));
}

export function isKnownAlertCategory(category: string): boolean {
  return ALERT_CATEGORY_META.some((m) => m.category === category);
}

export async function setAlertCategoryEnabled(
  category: string,
  enabled: boolean,
): Promise<void> {
  await db
    .insert(alertCategories)
    .values({ category, enabled, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: alertCategories.category,
      set: { enabled, updatedAt: new Date() },
    });
}

/** Guard: a city must exist and (optionally) be checked before assigning. */
export async function cityExists(id: number): Promise<boolean> {
  const rows = await db
    .select({ id: cities.id })
    .from(cities)
    .where(and(eq(cities.id, id)))
    .limit(1);
  return rows.length > 0;
}
