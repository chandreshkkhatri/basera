import { NextResponse, type NextRequest } from "next/server";
import { getEnabledCities, resolveCity } from "@/db/queries/cities";
import { suggestLocations } from "@/db/queries/listings";

/**
 * Locality autocomplete for the feed search box.
 * GET /api/locations?q=khar&city=pune -> { suggestions: [{ location, count }] }
 * Suggestions come from the listings themselves, so every one yields results.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ suggestions: [] });
  try {
    const enabled = await getEnabledCities();
    const city = await resolveCity(sp.get("city") ?? undefined, enabled);
    if (!city) return NextResponse.json({ suggestions: [] });
    return NextResponse.json({ suggestions: await suggestLocations(q, city.id) });
  } catch {
    // Suggestions are progressive enhancement — a DB hiccup returns none.
    return NextResponse.json({ suggestions: [] });
  }
}
