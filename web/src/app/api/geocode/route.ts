import { NextResponse } from "next/server";

/**
 * Thin proxy over OpenStreetMap Nominatim for place search (forward) and
 * label lookup (reverse). Proxied server-side so we can set the User-Agent
 * Nominatim's usage policy requires and cache repeated lookups, rather than
 * hammering it from every browser.
 *
 * GET /api/geocode?q=<place>        -> { results: [{ label, display, lat, lng }] }
 * GET /api/geocode?lat=<>&lng=<>    -> { label, display }
 */

const NOMINATIM = "https://nominatim.openstreetmap.org";
const UA = "Basera/1.0 (rental listings aggregator)";
const HEADERS = { "User-Agent": UA, "Accept-Language": "en" };
// Cache lookups for a day; place coordinates are effectively static.
const REVALIDATE = 86_400;

type NominatimItem = {
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
};

function shortLabel(item: NominatimItem): string {
  if (item.name) return item.name;
  const parts = (item.display_name ?? "").split(",");
  return parts.slice(0, 2).join(", ").trim() || "Selected point";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  try {
    if (q) {
      const url = `${NOMINATIM}/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, {
        headers: HEADERS,
        next: { revalidate: REVALIDATE },
      });
      if (!res.ok) {
        return NextResponse.json({ error: "geocoding failed" }, { status: 502 });
      }
      const data = (await res.json()) as NominatimItem[];
      const results = data
        .map((d) => ({
          label: shortLabel(d),
          display: d.display_name ?? "",
          lat: Number(d.lat),
          lng: Number(d.lon),
        }))
        .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
      return NextResponse.json({ results });
    }

    if (lat && lng) {
      const url = `${NOMINATIM}/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
      const res = await fetch(url, {
        headers: HEADERS,
        next: { revalidate: REVALIDATE },
      });
      if (!res.ok) {
        return NextResponse.json({ error: "geocoding failed" }, { status: 502 });
      }
      const d = (await res.json()) as NominatimItem;
      return NextResponse.json({
        label: shortLabel(d),
        display: d.display_name ?? "",
      });
    }

    return NextResponse.json(
      { error: "provide a q, or lat and lng" },
      { status: 400 },
    );
  } catch {
    return NextResponse.json({ error: "geocoding unavailable" }, { status: 502 });
  }
}
