"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, TileLayer } from "react-leaflet";
import { BRAND_MARKER } from "@/lib/sources";

/** Single-marker map for the listing detail page. */
export default function MiniMapInner({
  lat,
  lng,
}: {
  lat: number;
  lng: number;
}) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={14}
      scrollWheelZoom={false}
      style={{ height: "100%", width: "100%" }}
      className="rounded-xl"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CircleMarker
        center={[lat, lng]}
        radius={9}
        pathOptions={{
          color: BRAND_MARKER,
          fillColor: BRAND_MARKER,
          fillOpacity: 0.7,
        }}
      />
    </MapContainer>
  );
}
