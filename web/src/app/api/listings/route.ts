import { NextResponse, type NextRequest } from "next/server";
import { getListings, getMapListings } from "@/db/queries/listings";
import { parseFilters } from "@/lib/filters";

/**
 * JSON listings endpoint. Used by the map's client-side fetch and available for
 * future clients (mobile, saved-search alerts). Shares the exact same filter
 * parsing + query builder as the server-rendered feed.
 *
 *   ?<any feed filter>&view=map|full&limit=<=500
 */
export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filters = parseFilters(params);
  const view = request.nextUrl.searchParams.get("view") ?? "full";

  if (view === "map") {
    const { rows, total } = await getMapListings(filters);
    return NextResponse.json({ listings: rows, total });
  }

  const { rows, total, page, pageSize } = await getListings(filters);
  return NextResponse.json({ listings: rows, total, page, pageSize });
}
