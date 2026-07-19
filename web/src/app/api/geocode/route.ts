import { NextResponse } from "next/server";

/**
 * Place search proxy. Prefers Google Places (New) — far better India coverage
 * and true prefix autocomplete — when GOOGLE_MAPS_API_KEY is set, and falls
 * back to OpenStreetMap Nominatim otherwise (or if a Google call fails). The
 * key stays server-side; the browser only talks to this route.
 *
 *  GET /api/geocode?q=<text>[&sessionToken=<t>]
 *      -> { results: [{ label, display, lat?, lng?, placeId? }] }
 *      Google predictions carry a placeId (no coords); Nominatim carries coords
 *      (no placeId).
 *  GET /api/geocode?placeId=<id>[&sessionToken=<t>]   (Google only)
 *      -> { lat, lng, label, display }
 *  GET /api/geocode?lat=<>&lng=<>                      -> { label, display }
 */

const NOMINATIM = "https://nominatim.openstreetmap.org";
const NOMINATIM_HEADERS = {
  "User-Agent": "Basera/1.0 (rental listings aggregator)",
  "Accept-Language": "en",
};
const GOOGLE = "https://places.googleapis.com/v1";
// Cache static lookups (coords, reverse) for a day. Autocomplete is not cached.
const REVALIDATE = 86_400;

export type GeocodeResult = {
  label: string;
  display: string;
  lat?: number;
  lng?: number;
  placeId?: string;
};

// -- Nominatim (fallback) --------------------------------------------------

type NominatimItem = {
  name?: string;
  display_name?: string;
  lat?: string;
  lon?: string;
};

function nominatimLabel(item: NominatimItem): string {
  if (item.name) return item.name;
  const parts = (item.display_name ?? "").split(",");
  return parts.slice(0, 2).join(", ").trim() || "Selected point";
}

async function nominatimSearch(q: string): Promise<GeocodeResult[]> {
  const url = `${NOMINATIM}/search?format=jsonv2&limit=5&countrycodes=in&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: NOMINATIM_HEADERS,
    next: { revalidate: REVALIDATE },
  });
  if (!res.ok) throw new Error(`nominatim ${res.status}`);
  const data = (await res.json()) as NominatimItem[];
  return data
    .map((d) => ({
      label: nominatimLabel(d),
      display: d.display_name ?? "",
      lat: Number(d.lat),
      lng: Number(d.lon),
    }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

// -- Google Places (New) ---------------------------------------------------

type GooglePrediction = {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
    structuredFormat?: {
      mainText?: { text?: string };
      secondaryText?: { text?: string };
    };
  };
};

async function googleAutocomplete(
  q: string,
  key: string,
  sessionToken?: string,
): Promise<GeocodeResult[]> {
  const res = await fetch(`${GOOGLE}/places:autocomplete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    cache: "no-store",
    body: JSON.stringify({
      input: q,
      includedRegionCodes: ["in"],
      languageCode: "en",
      ...(sessionToken ? { sessionToken } : {}),
    }),
  });
  if (!res.ok) throw new Error(`google autocomplete ${res.status}`);
  const data = (await res.json()) as { suggestions?: GooglePrediction[] };
  return (data.suggestions ?? [])
    .map((s) => s.placePrediction)
    .filter((p): p is NonNullable<GooglePrediction["placePrediction"]> =>
      Boolean(p?.placeId),
    )
    .map((p) => ({
      label: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      display: p.text?.text ?? p.structuredFormat?.secondaryText?.text ?? "",
      placeId: p.placeId,
    }));
}

async function googleDetails(
  placeId: string,
  key: string,
  sessionToken?: string,
): Promise<GeocodeResult | null> {
  const url = new URL(`${GOOGLE}/places/${encodeURIComponent(placeId)}`);
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
  const res = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "location,displayName,formattedAddress",
    },
    next: { revalidate: REVALIDATE },
  });
  if (!res.ok) throw new Error(`google details ${res.status}`);
  const d = (await res.json()) as {
    location?: { latitude?: number; longitude?: number };
    displayName?: { text?: string };
    formattedAddress?: string;
  };
  const lat = d.location?.latitude;
  const lng = d.location?.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    label: d.displayName?.text ?? d.formattedAddress ?? "Selected point",
    display: d.formattedAddress ?? "",
    lat,
    lng,
  };
}

// -- Route -----------------------------------------------------------------

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const placeId = searchParams.get("placeId");
  const sessionToken = searchParams.get("sessionToken") ?? undefined;
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const key = process.env.GOOGLE_MAPS_API_KEY;

  try {
    if (q) {
      if (key) {
        try {
          return NextResponse.json({
            results: await googleAutocomplete(q, key, sessionToken),
          });
        } catch {
          // Places API not enabled / quota / transient — fall back below.
        }
      }
      return NextResponse.json({ results: await nominatimSearch(q) });
    }

    if (placeId) {
      if (!key) {
        return NextResponse.json({ error: "place lookup unavailable" }, { status: 400 });
      }
      const details = await googleDetails(placeId, key, sessionToken);
      if (!details) {
        return NextResponse.json({ error: "no coordinates" }, { status: 404 });
      }
      return NextResponse.json(details);
    }

    if (lat && lng) {
      const url = `${NOMINATIM}/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
      const res = await fetch(url, {
        headers: NOMINATIM_HEADERS,
        next: { revalidate: REVALIDATE },
      });
      if (!res.ok) {
        return NextResponse.json({ error: "geocoding failed" }, { status: 502 });
      }
      const d = (await res.json()) as NominatimItem;
      return NextResponse.json({
        label: nominatimLabel(d),
        display: d.display_name ?? "",
      });
    }

    return NextResponse.json(
      { error: "provide q, placeId, or lat and lng" },
      { status: 400 },
    );
  } catch {
    return NextResponse.json({ error: "geocoding unavailable" }, { status: 502 });
  }
}
