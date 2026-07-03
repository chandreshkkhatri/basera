import { z } from "zod";
import type { Source } from "@/db/schema";
import { SOURCE_KEYS } from "@/lib/sources";

/**
 * URL searchParams are the single source of truth for the listings feed, map,
 * and API. This module is the ONE place that parses them, so filter semantics
 * live in exactly one spot. Everything optional; unknown/garbage values are
 * dropped rather than erroring, so a hand-edited URL never 500s.
 */

export const PAGE_SIZE = 24;
export const MAP_LIMIT = 500;

export const SORTS = ["newest", "rent_asc", "rent_desc", "distance"] as const;
export type Sort = (typeof SORTS)[number];

export const POSTED_WITHIN = ["1d", "3d", "7d", "30d"] as const;
export type PostedWithin = (typeof POSTED_WITHIN)[number];

// Canonical BHK buckets exposed in the UI; mapped to regexes over the free-text
// `bhk` column in the query builder.
export const BHK_BUCKETS = ["1rk", "1", "2", "3", "4+"] as const;
export type BhkBucket = (typeof BHK_BUCKETS)[number];

export const BHK_LABELS: Record<BhkBucket, string> = {
  "1rk": "1 RK",
  "1": "1 BHK",
  "2": "2 BHK",
  "3": "3 BHK",
  "4+": "4+ BHK",
};

export const FURNISHINGS = [
  "fully furnished",
  "semi furnished",
  "unfurnished",
] as const;

export const GENDERS = ["male", "female", "family", "bachelor", "any"] as const;

/** Split a comma list param and keep only members of `allowed`. */
function csv<T extends string>(allowed: readonly T[]) {
  const set = new Set<string>(allowed);
  return z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => set.has(s)),
    )
    .pipe(z.array(z.custom<T>()));
}

const numeric = z
  .string()
  .optional()
  .transform((v) => {
    if (v == null || v.trim() === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  });

export const filtersSchema = z.object({
  city: z
    .string()
    .optional()
    .transform((v) => (v && v.trim() !== "" ? v.trim() : undefined)),
  rentMin: numeric,
  rentMax: numeric,
  bhk: csv(BHK_BUCKETS),
  gender: csv(GENDERS),
  furnishing: csv(FURNISHINGS),
  source: csv(SOURCE_KEYS),
  postedWithin: z.enum(POSTED_WITHIN).optional().catch(undefined),
  sort: z.enum(SORTS).optional().catch(undefined),
  page: numeric.transform((n) => (n && n >= 1 ? Math.floor(n) : 1)),
  poiLat: numeric,
  poiLng: numeric,
});

export type Filters = z.infer<typeof filtersSchema>;

type RawParams = Record<string, string | string[] | undefined>;

function firstValue(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Parse Next.js searchParams (values may be arrays) into typed Filters. */
export function parseFilters(params: RawParams): Filters {
  const flat: Record<string, string | undefined> = {};
  for (const key of [
    "city",
    "rentMin",
    "rentMax",
    "bhk",
    "gender",
    "furnishing",
    "source",
    "postedWithin",
    "sort",
    "page",
    "poiLat",
    "poiLng",
  ]) {
    flat[key] = firstValue(params[key]);
  }
  return filtersSchema.parse(flat);
}

/** True when a distance sort is actually usable (POI present). */
export function hasPoi(f: Filters): f is Filters & { poiLat: number; poiLng: number } {
  return f.poiLat != null && f.poiLng != null;
}

export function resolveSort(f: Filters): Sort {
  if (f.sort === "distance" && !hasPoi(f)) return "newest";
  return f.sort ?? "newest";
}

/** Serialize filters back to a query string (used by FilterBar & links). */
export function filtersToQuery(f: Partial<Filters>): string {
  const q = new URLSearchParams();
  if (f.city) q.set("city", f.city);
  if (f.rentMin != null) q.set("rentMin", String(f.rentMin));
  if (f.rentMax != null) q.set("rentMax", String(f.rentMax));
  if (f.bhk?.length) q.set("bhk", f.bhk.join(","));
  if (f.gender?.length) q.set("gender", f.gender.join(","));
  if (f.furnishing?.length) q.set("furnishing", f.furnishing.join(","));
  if (f.source?.length) q.set("source", f.source.join(","));
  if (f.postedWithin) q.set("postedWithin", f.postedWithin);
  if (f.sort && f.sort !== "newest") q.set("sort", f.sort);
  if (f.page && f.page > 1) q.set("page", String(f.page));
  if (f.poiLat != null) q.set("poiLat", String(f.poiLat));
  if (f.poiLng != null) q.set("poiLng", String(f.poiLng));
  return q.toString();
}

export const POSTED_WITHIN_HOURS: Record<PostedWithin, number> = {
  "1d": 24,
  "3d": 72,
  "7d": 168,
  "30d": 720,
};

export type { Source };
