import type { ListingRow } from "@/db/queries/listings";
import { ListingCard } from "@/components/listing-card";
import { EmptyState } from "@/components/empty-state";

export function ListingGrid({ listings }: { listings: ListingRow[] }) {
  if (listings.length === 0) return <EmptyState />;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((l) => (
        <ListingCard key={l.id} listing={l} />
      ))}
    </div>
  );
}
