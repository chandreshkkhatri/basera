import { sql, type SQL } from "drizzle-orm";
import { listings } from "@/db/schema";

/**
 * Haversine great-circle distance in km, as a SQL expression over a listing's
 * lat/lon and a fixed point-of-interest. Used for `ORDER BY distance` and an
 * optional distance filter. Rows without coordinates yield NULL and sink to the
 * end of an `ASC NULLS LAST` ordering.
 *
 * Upgrade path (documented, not needed for v1): add a PostGIS
 * `geography(Point)` generated column + GiST index and swap this expression for
 * `ST_Distance`. Only this function and one migration change — call sites are
 * untouched because they consume the returned SQL fragment.
 */
export function haversineKmSql(poiLat: number, poiLng: number): SQL<number> {
  return sql<number>`
    6371 * 2 * asin(sqrt(
      pow(sin(radians((${listings.latitude} - ${poiLat}) / 2)), 2) +
      cos(radians(${poiLat})) * cos(radians(${listings.latitude})) *
      pow(sin(radians((${listings.longitude} - ${poiLng}) / 2)), 2)
    ))
  `;
}

/** TS twin of the SQL expression, for the client-side DistanceChip. */
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}
