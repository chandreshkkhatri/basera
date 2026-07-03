"use client";

import { MapPin } from "lucide-react";
import { usePoi } from "@/components/poi/poi-provider";
import { haversineKm } from "@/lib/distance";
import { formatDistanceKm } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Client-side distance from the user's saved POI to a listing. Renders nothing
 * until the POI context is ready (avoids hydration mismatch) or when the POI /
 * listing coordinates are missing — so browsing works with no POI in the URL.
 * Prefers a server-computed `distanceKm` (present when sorting by distance).
 */
export function DistanceChip({
  lat,
  lng,
  distanceKm,
  className,
}: {
  lat: number | null;
  lng: number | null;
  distanceKm?: number | null;
  className?: string;
}) {
  const { poi, ready } = usePoi();

  if (!ready) return null;

  let km = distanceKm ?? null;
  if (km == null && poi && lat != null && lng != null) {
    km = haversineKm(poi.lat, poi.lng, lat, lng);
  }

  const label = formatDistanceKm(km);
  if (!label) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <MapPin className="size-3" />
      {label}
    </span>
  );
}
