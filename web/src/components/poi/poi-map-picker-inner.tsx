"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

/** Fires the picker's onPick when the user taps anywhere on the map. */
function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/**
 * Recenters when the selected point changes (e.g. from search or geolocation)
 * and fixes Leaflet's sizing after the dialog has finished animating open —
 * without invalidateSize the tiles render into a collapsed container.
 */
function Controller({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    const id = window.setTimeout(() => map.invalidateSize(), 60);
    return () => window.clearTimeout(id);
  }, [map]);
  useEffect(() => {
    map.setView([lat, lng]);
  }, [lat, lng, map]);
  return null;
}

export default function PoiMapPickerInner({
  lat,
  lng,
  showMarker,
  onPick,
}: {
  lat: number;
  lng: number;
  showMarker: boolean;
  onPick: (lat: number, lng: number) => void;
}) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={13}
      scrollWheelZoom
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onPick={onPick} />
      <Controller lat={lat} lng={lng} />
      {showMarker && (
        <CircleMarker
          center={[lat, lng]}
          radius={9}
          pathOptions={{
            color: "oklch(0.62 0.24 293)",
            fillColor: "oklch(0.62 0.24 293)",
            fillOpacity: 0.7,
            weight: 2,
          }}
        />
      )}
    </MapContainer>
  );
}
