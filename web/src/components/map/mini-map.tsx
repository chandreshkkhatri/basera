"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window`, so it can only run on the client. `ssr: false` is
// only permitted inside a Client Component — hence this thin wrapper.
const MiniMapInner = dynamic(() => import("./mini-map-inner"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full animate-pulse rounded-xl bg-muted" />
  ),
});

export function MiniMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <div className="h-56 w-full overflow-hidden rounded-xl border">
      <MiniMapInner lat={lat} lng={lng} />
    </div>
  );
}
