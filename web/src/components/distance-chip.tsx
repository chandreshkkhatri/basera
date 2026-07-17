"use client";

import { MapPin } from "lucide-react";
import { usePoi } from "@/components/poi/poi-provider";
import { haversineKm } from "@/lib/distance";
import { formatDistanceKm } from "@/lib/format";
import { cn } from "@/lib/utils";

// Google location_type values precise enough to show without a "~".
const PRECISE = new Set(["ROOFTOP", "RANGE_INTERPOLATED"]);

/**
 * Distance from the user's saved POI to a listing. The CURRENT saved point is
 * the source of truth — a server-computed `distanceKm` (derived from poiLat/
 * poiLng URL params) is only a fallback for viewers with no saved point, since
 * URL params can go stale when the user moves their point. Renders nothing
 * until the POI context is ready (avoids hydration mismatch) or when no
 * distance can be computed at all.
 *
 * `precision` is the geocoder's location_type for the listing's coordinates;
 * area-level pins (locality centroids) get a "~" prefix. Null/unknown counts
 * as approximate — most listings geocode from an area name, not an address.
 */
export function DistanceChip({
  lat,
  lng,
  distanceKm,
  precision,
  className,
}: {
  lat: number | null;
  lng: number | null;
  distanceKm?: number | null;
  precision?: string | null;
  className?: string;
}) {
  const { poi, ready } = usePoi();

  if (!ready) return null;

  let km: number | null = null;
  if (poi && lat != null && lng != null) {
    km = haversineKm(poi.lat, poi.lng, lat, lng);
  }
  if (km == null) km = distanceKm ?? null;

  const label = formatDistanceKm(km);
  if (!label) return null;

  const approx = !PRECISE.has(precision ?? "");

  return (
    <span
      title={poi ? `Distance from ${poi.label}` : undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <MapPin className="size-3" />
      {approx ? `~${label}` : label}
    </span>
  );
}
