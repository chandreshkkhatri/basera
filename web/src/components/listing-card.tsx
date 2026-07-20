import Link from "next/link";
import { MapPin } from "lucide-react";
import type { ListingRow } from "@/db/queries/listings";
import { SourceBadge } from "@/components/source-badge";
import { PostedAgo } from "@/components/posted-ago";
import { DistanceChip } from "@/components/distance-chip";
import { ListingMedia } from "@/components/listing-media";
import { SaveButton } from "@/components/saves/save-button";
import { Badge } from "@/components/ui/badge";
import { formatRentAmount } from "@/lib/format";
import { furnishingLabel, genderLabel } from "@/lib/normalize";

export function ListingCard({ listing }: { listing: ListingRow }) {
  const furnishing = furnishingLabel(listing.furnishingStatus);
  const rent = formatRentAmount(listing.rent);
  const place =
    [listing.location, listing.city].filter(Boolean).join(", ") ||
    "Location unknown";

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-all duration-150 hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-lg"
    >
      {/* Signature: a brand left-spine that lights up on hover. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 z-10 w-0.5 bg-brand opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      />
      <div className="relative aspect-16/10 overflow-hidden">
        <ListingMedia source={listing.source} glyphClassName="text-6xl" />
        <SourceBadge source={listing.source} className="absolute top-2 right-2" />
        <SaveButton id={listing.id} className="absolute top-2 left-2" />
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div>
          {rent ? (
            <p className="font-display text-2xl font-bold tracking-tight text-highlight tabular-nums">
              {rent}
              <span className="ml-0.5 text-sm font-medium text-muted-foreground">
                /mo
              </span>
            </p>
          ) : (
            <p className="font-display text-lg font-semibold text-muted-foreground">
              Rent not specified
            </p>
          )}
          <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">{place}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {listing.bhk && <Badge variant="secondary">{listing.bhk}</Badge>}
          <Badge variant="secondary">
            {genderLabel(listing.genderPreference)}
          </Badge>
          {furnishing && <Badge variant="secondary">{furnishing}</Badge>}
          <DistanceChip
            lat={listing.latitude}
            lng={listing.longitude}
            precision={listing.geoPrecision}
            distanceKm={listing.distanceKm}
          />
        </div>

        <p className="line-clamp-2 text-sm text-muted-foreground">
          {listing.originalText}
        </p>

        <p className="mt-auto pt-1 text-xs text-muted-foreground">
          Posted <PostedAgo date={listing.postedAt} />
        </p>
      </div>
    </Link>
  );
}
