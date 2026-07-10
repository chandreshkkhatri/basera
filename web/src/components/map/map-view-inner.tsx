"use client";

import "leaflet/dist/leaflet.css";
import type { LatLngBoundsExpression } from "leaflet";
import Link from "next/link";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
} from "react-leaflet";
import type { MapRow } from "@/db/queries/listings";
import { sourceMeta } from "@/lib/sources";
import { formatRent } from "@/lib/format";

// Pune fallback center when the selected city has no coordinates set.
const DEFAULT_CENTER: [number, number] = [18.5204, 73.8567];

export default function MapViewInner({
  rows,
  fallbackCenter,
}: {
  rows: MapRow[];
  fallbackCenter?: [number, number] | null;
}) {
  const points = rows.filter(
    (r) => r.latitude != null && r.longitude != null,
  ) as (MapRow & { latitude: number; longitude: number })[];

  const bounds: LatLngBoundsExpression | undefined =
    points.length > 0
      ? points.map((p) => [p.latitude, p.longitude] as [number, number])
      : undefined;

  return (
    <MapContainer
      center={fallbackCenter ?? DEFAULT_CENTER}
      zoom={11}
      bounds={bounds}
      scrollWheelZoom
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.latitude, p.longitude]}
          radius={7}
          pathOptions={{
            color: sourceMeta(p.source).accent,
            fillColor: sourceMeta(p.source).accent,
            fillOpacity: 0.7,
            weight: 1.5,
          }}
        >
          <Popup>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold">
                {formatRent(p.rent)}
                {p.bhk ? ` · ${p.bhk}` : ""}
              </span>
              <span className="text-xs text-neutral-500">
                {[p.location, p.city].filter(Boolean).join(", ")} ·{" "}
                {sourceMeta(p.source).label}
              </span>
              <Link
                href={`/listings/${p.id}`}
                className="text-xs font-medium text-primary underline"
              >
                View details
              </Link>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
