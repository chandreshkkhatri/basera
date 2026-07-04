"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import type { MapRow } from "@/db/queries/listings";
import { MAP_LIMIT } from "@/lib/filters";
import { FilterBar } from "@/components/filter-bar";

// ssr:false is only allowed in a Client Component; MapScreen is that boundary.
const MapViewInner = dynamic(() => import("./map-view-inner"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full animate-pulse rounded-xl bg-muted" />
  ),
});

export function MapScreen({
  cityName,
  center,
}: {
  cityName: string;
  center: [number, number] | null;
}) {
  const searchParams = useSearchParams();
  const [rows, setRows] = useState<MapRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // The searchParams string is the fetch key: any filter change refetches.
  const qs = searchParams.toString();
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams(qs);
    params.set("view", "map");
    fetch(`/api/listings?${params.toString()}`)
      .then((r) => r.json())
      .then((data: { listings: MapRow[]; total: number }) => {
        if (cancelled) return;
        setRows(data.listings);
        setTotal(data.total);
        setLoading(false);
      })
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [qs]);

  const capped = total > MAP_LIMIT;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {cityName} on the map
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading
            ? "Loading map…"
            : `${rows.length.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")} listings with coordinates`}
          {capped && ` (showing the ${MAP_LIMIT} most recent)`}
        </p>
      </div>

      <Suspense>
        <FilterBar />
      </Suspense>

      <div className="h-[70vh] w-full overflow-hidden rounded-xl border">
        <MapViewInner rows={rows} fallbackCenter={center} />
      </div>
    </div>
  );
}
