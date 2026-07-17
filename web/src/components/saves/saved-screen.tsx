"use client";

import { useEffect, useState } from "react";
import type { ListingRow } from "@/db/queries/listings";
import { useSaves } from "@/components/saves/saves-provider";
import { ListingList } from "@/components/listing-list";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export function SavedScreen() {
  const { savedIds, ready } = useSaves();
  const [rows, setRows] = useState<ListingRow[] | null>(null);

  const ids = [...savedIds];

  useEffect(() => {
    // The empty-shortlist case renders directly from `ids` — no fetch needed.
    if (!ready || ids.length === 0) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/listings?ids=${ids.join(",")}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { listings: ListingRow[] };
        setRows(data.listings ?? []);
      } catch {
        if (!ctrl.signal.aborted) setRows([]);
      }
    })();
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ids derives from savedIds
  }, [ready, savedIds]);

  const missing =
    ready && ids.length > 0 && rows !== null ? ids.length - rows.length : 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Saved listings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your shortlist, kept on this device.
          {missing > 0 &&
            ` ${missing} saved ${missing === 1 ? "listing is" : "listings are"} no longer available.`}
        </p>
      </div>

      {ready && ids.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          hint="Tap the heart on any listing to keep it here for later."
        />
      ) : !ready || rows === null ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Saved listings unavailable"
          hint="Your saved posts are no longer live. Browse the feed to shortlist new ones."
        />
      ) : (
        <ListingList listings={rows} />
      )}
    </div>
  );
}
