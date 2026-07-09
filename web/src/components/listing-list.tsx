import Link from "next/link";
import { MapPin } from "lucide-react";
import type { ListingRow } from "@/db/queries/listings";
import { SourceBadge } from "@/components/source-badge";
import { PostedAgo } from "@/components/posted-ago";
import { DistanceChip } from "@/components/distance-chip";
import { ListingMedia } from "@/components/listing-media";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatRentAmount } from "@/lib/format";
import { furnishingLabel, genderLabel } from "@/lib/normalize";

/** Compact, scannable list — the default feed layout. */
export function ListingList({ listings }: { listings: ListingRow[] }) {
  if (listings.length === 0) return <EmptyState />;
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {listings.map((l) => (
        <li key={l.id}>
          <ListingRow listing={l} />
        </li>
      ))}
    </ul>
  );
}

function ListingRow({ listing }: { listing: ListingRow }) {
  const furnishing = furnishingLabel(listing.furnishingStatus);
  const rent = formatRentAmount(listing.rent);
  const place =
    [listing.location, listing.city].filter(Boolean).join(", ") ||
    "Location unknown";

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group flex gap-3 p-3 transition-colors hover:bg-accent/40 sm:gap-4 sm:p-4"
    >
      <div className="relative size-16 shrink-0 overflow-hidden rounded-lg sm:size-20">
        <ListingMedia source={listing.source} glyphClassName="text-2xl" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          {rent ? (
            <p className="font-display text-lg font-bold tracking-tight">
              {rent}
              <span className="ml-0.5 text-xs font-medium text-muted-foreground">
                /mo
              </span>
            </p>
          ) : (
            <p className="font-display text-sm font-semibold text-muted-foreground">
              Rent not specified
            </p>
          )}
          <SourceBadge
            source={listing.source}
            className="hidden shrink-0 sm:inline-flex"
          />
        </div>

        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="size-3.5 shrink-0" />
          <span className="truncate">{place}</span>
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          {listing.bhk && <Badge variant="secondary">{listing.bhk}</Badge>}
          <Badge variant="secondary">
            {genderLabel(listing.genderPreference)}
          </Badge>
          {furnishing && (
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {furnishing}
            </Badge>
          )}
          <DistanceChip
            lat={listing.latitude}
            lng={listing.longitude}
            distanceKm={listing.distanceKm}
          />
          <span className="ml-auto text-xs text-muted-foreground">
            <PostedAgo date={listing.postedAt} />
          </span>
        </div>
      </div>
    </Link>
  );
}
