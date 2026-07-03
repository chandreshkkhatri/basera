import Link from "next/link";
import { Home, MapPin } from "lucide-react";
import type { ListingRow } from "@/db/queries/listings";
import { SourceBadge } from "@/components/source-badge";
import { PostedAgo } from "@/components/posted-ago";
import { DistanceChip } from "@/components/distance-chip";
import { formatRent } from "@/lib/format";
import { furnishingLabel, genderLabel } from "@/lib/normalize";

export function ListingCard({ listing }: { listing: ListingRow }) {
  const furnishing = furnishingLabel(listing.furnishingStatus);
  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-accent/40"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-lg font-semibold tracking-tight">
            {formatRent(listing.rent)}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">
              {[listing.location, listing.city].filter(Boolean).join(", ") ||
                "Location unknown"}
            </span>
          </p>
        </div>
        <SourceBadge source={listing.source} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {listing.bhk && (
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
            <Home className="size-3" />
            {listing.bhk}
          </span>
        )}
        <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">
          {genderLabel(listing.genderPreference)}
        </span>
        {furnishing && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">
            {furnishing}
          </span>
        )}
        <DistanceChip
          lat={listing.latitude}
          lng={listing.longitude}
          distanceKm={listing.distanceKm}
        />
      </div>

      <p className="line-clamp-2 text-sm text-muted-foreground">
        {listing.originalText}
      </p>

      <p className="mt-auto text-xs text-muted-foreground">
        Posted <PostedAgo date={listing.postedAt} />
      </p>
    </Link>
  );
}
