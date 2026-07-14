import { cache } from "react";
import { and, desc, eq, gte, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { listings, type Listing } from "@/db/schema";
import { haversineKmSql } from "@/lib/distance";
import {
  DISTANCE_SORT_AGE_PENALTY_KM_PER_DAY,
  MAP_LIMIT,
  PAGE_SIZE,
  POSTED_WITHIN_HOURS,
  hasPoi,
  resolveSort,
  type BhkBucket,
  type Filters,
} from "@/lib/filters";

export type ListingRow = Listing & { distanceKm: number | null };

// Regex fragments matching the canonical BHK buckets against the free-text
// `bhk` column. Postgres `~*` = case-insensitive POSIX match.
const BHK_REGEX: Record<BhkBucket, string> = {
  "1rk": String.raw`1\s*R\.?\s*K`,
  "1": String.raw`\y1\s*BHK`,
  "2": String.raw`\y2\s*BHK`,
  "3": String.raw`\y3\s*BHK`,
  "4+": String.raw`\y([4-9]|\d{2,})\s*BHK`,
};

function buildWhere(f: Filters, cityId: number): SQL {
  const conds: (SQL | undefined)[] = [
    // Base predicate: only live rental OFFERS for the selected city in the
    // feed. isOffer excludes seeker/buyer posts ("looking for a flat").
    eq(listings.cityId, cityId),
    eq(listings.isRental, true),
    eq(listings.isOffer, true),
    eq(listings.status, "active"),
  ];

  if (f.q) {
    // Locality search over the extracted location and the raw post text.
    // Escape LIKE metacharacters so "100%_furnished" searches literally.
    const escaped = f.q.replace(/[\\%_]/g, (m) => `\\${m}`);
    const pattern = `%${escaped}%`;
    conds.push(
      or(
        sql`${listings.location} ilike ${pattern}`,
        sql`${listings.originalText} ilike ${pattern}`,
      ),
    );
  }

  // Rent filters exclude rows without a rent value only when a bound is set.
  if (f.rentMin != null) conds.push(gte(listings.rent, f.rentMin));
  if (f.rentMax != null) conds.push(lte(listings.rent, f.rentMax));

  if (f.bhk.length) {
    const parts = f.bhk.map(
      (b) => sql`${listings.bhk} ~* ${BHK_REGEX[b]}`,
    );
    conds.push(or(...parts));
  }

  if (f.gender.length) {
    // Inclusive semantics: picking "female" also surfaces "any".
    const wanted = new Set(f.gender);
    wanted.add("any");
    conds.push(
      sql`${listings.genderPreference} in ${sql`(${sql.join(
        [...wanted].map((g) => sql`${g}`),
        sql`, `,
      )})`}`,
    );
  }

  if (f.furnishing.length) {
    conds.push(
      sql`${listings.furnishingStatus} in ${sql`(${sql.join(
        f.furnishing.map((v) => sql`${v}`),
        sql`, `,
      )})`}`,
    );
  }

  if (f.postedWithin) {
    const hours = POSTED_WITHIN_HOURS[f.postedWithin];
    conds.push(
      sql`${listings.postedAt} > now() - ${`${hours} hours`}::interval`,
    );
  }

  return and(...conds.filter(Boolean as unknown as (x: SQL | undefined) => x is SQL))!;
}

function distanceExpr(f: Filters): SQL<number> | null {
  return hasPoi(f) ? haversineKmSql(f.poiLat, f.poiLng) : null;
}

function orderBy(f: Filters, dist: SQL<number> | null) {
  switch (resolveSort(f)) {
    case "rent_asc":
      return [sql`${listings.rent} asc nulls last`, desc(listings.postedAt)];
    case "rent_desc":
      return [sql`${listings.rent} desc nulls last`, desc(listings.postedAt)];
    case "distance": {
      // dist is guaranteed non-null here because resolveSort downgrades to
      // "newest" when no POI is present. Age penalty: each day since posting
      // ranks like K extra km, so stale posts sink instead of being filtered
      // out. Rows without coordinates yield a NULL score and stay last.
      // Clamped at 0: scraped postedAt can sit slightly in the future, which
      // must not turn into a ranking boost.
      const ageDays = sql`greatest(extract(epoch from now() - ${listings.postedAt}) / 86400.0, 0)`;
      const score = sql`${dist} + ${ageDays} * ${DISTANCE_SORT_AGE_PENALTY_KM_PER_DAY}`;
      return [sql`${score} asc nulls last`, desc(listings.postedAt)];
    }
    case "newest":
    default:
      return [desc(listings.postedAt)];
  }
}

export type FeedResult = {
  rows: ListingRow[];
  total: number;
  page: number;
  pageSize: number;
};

export async function getListings(
  f: Filters,
  cityId: number,
): Promise<FeedResult> {
  const where = buildWhere(f, cityId);
  const dist = distanceExpr(f);
  const offset = (f.page - 1) * PAGE_SIZE;

  const rowsPromise = db
    .select({
      listing: listings,
      distanceKm: dist ? dist.as("distance_km") : sql<number | null>`null`,
    })
    .from(listings)
    .where(where)
    .orderBy(...orderBy(f, dist))
    .limit(PAGE_SIZE)
    .offset(offset);

  const countPromise = db
    .select({ count: sql<number>`count(*)::int` })
    .from(listings)
    .where(where);

  const [rows, countResult] = await Promise.all([rowsPromise, countPromise]);

  return {
    rows: rows.map((r) => ({ ...r.listing, distanceKm: r.distanceKm })),
    total: countResult[0]?.count ?? 0,
    page: f.page,
    pageSize: PAGE_SIZE,
  };
}

/** Trimmed rows for the map (no original_text; bounded count). */
export type MapRow = Pick<
  Listing,
  | "id"
  | "source"
  | "latitude"
  | "longitude"
  | "rent"
  | "bhk"
  | "location"
  | "city"
  | "postedAt"
>;

export async function getMapListings(
  f: Filters,
  cityId: number,
): Promise<{ rows: MapRow[]; total: number }> {
  const where = and(buildWhere(f, cityId), sql`${listings.latitude} is not null`)!;

  const rows = await db
    .select({
      id: listings.id,
      source: listings.source,
      latitude: listings.latitude,
      longitude: listings.longitude,
      rent: listings.rent,
      bhk: listings.bhk,
      location: listings.location,
      city: listings.city,
      postedAt: listings.postedAt,
    })
    .from(listings)
    .where(where)
    .orderBy(desc(listings.postedAt))
    .limit(MAP_LIMIT);

  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(listings)
    .where(where);

  return { rows, total: countResult[0]?.count ?? 0 };
}

/** cache(): the detail page and its generateMetadata both fetch the row. */
export const getListingById = cache(
  async (id: number): Promise<Listing | null> => {
    const rows = await db
      .select()
      .from(listings)
      .where(eq(listings.id, id))
      .limit(1);
    return rows[0] ?? null;
  },
);
