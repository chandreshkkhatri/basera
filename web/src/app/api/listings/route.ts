import { NextResponse, type NextRequest } from "next/server";
import {
  getListings,
  getListingsByIds,
  getMapListings,
} from "@/db/queries/listings";
import { getEnabledCities, resolveCity } from "@/db/queries/cities";
import { parseFilters } from "@/lib/filters";

/**
 * JSON listings endpoint. Used by the map's client-side fetch, the saved-
 * listings page, and available for future clients. Shares the exact same
 * filter parsing + query builder as the server-rendered feed, and is scoped
 * to the selected (enabled) city.
 *
 *   ?city=<slug>&<any feed filter>&view=map|full&limit=<=500
 *   ?ids=1,2,3   (saved page: fetch by id, ignores filters/city, cap 100)
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;

  const idsParam = sp.get("ids");
  if (idsParam !== null) {
    const ids = idsParam
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, 100);
    const rows = ids.length ? await getListingsByIds(ids) : [];
    return NextResponse.json({ listings: rows, total: rows.length });
  }

  const params = Object.fromEntries(sp.entries());
  const filters = parseFilters(params);
  const view = sp.get("view") ?? "full";

  const enabled = await getEnabledCities();
  const city = await resolveCity(sp.get("city") ?? undefined, enabled);
  if (!city) {
    return NextResponse.json({ listings: [], total: 0 });
  }

  if (view === "map") {
    const { rows, total } = await getMapListings(filters, city.id);
    return NextResponse.json({ listings: rows, total });
  }

  const { rows, total, page, pageSize } = await getListings(filters, city.id);
  return NextResponse.json({ listings: rows, total, page, pageSize });
}
