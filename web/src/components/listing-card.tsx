"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, ExternalLink, MapPin } from "lucide-react";
import type { ListingRow } from "@/db/queries/listings";
import { SourceBadge } from "@/components/source-badge";
import { PostedAgo } from "@/components/posted-ago";
import { DistanceChip } from "@/components/distance-chip";
import { ListingMedia } from "@/components/listing-media";
import { SaveButton } from "@/components/saves/save-button";
import { ListingCollapsibleDetails } from "@/components/listing-collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRentAmount } from "@/lib/format";
import { furnishingLabel, genderLabel } from "@/lib/normalize";
import { directPostLink } from "@/lib/listing-links";

export function ListingCard({ listing }: { listing: ListingRow }) {
  const [expanded, setExpanded] = useState(false);
  const furnishing = furnishingLabel(listing.furnishingStatus);
  const rent = formatRentAmount(listing.rent);
  const place =
    [listing.location, listing.city].filter(Boolean).join(", ") ||
    "Location unknown";
  const directLink = directPostLink(listing);

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-all duration-150 hover:border-brand/50 hover:shadow-lg">
      {/* Signature: a brand left-spine that lights up on hover. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 z-10 w-0.5 bg-brand opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      />
      <div className="relative aspect-16/10 overflow-hidden">
        <Link href={`/listings/${listing.id}`}>
          <ListingMedia source={listing.source} glyphClassName="text-6xl" />
        </Link>
        <SourceBadge source={listing.source} className="absolute top-2 right-2 z-10" />
        <SaveButton id={listing.id} className="absolute top-2 left-2 z-10" />
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <Link href={`/listings/${listing.id}`} className="group/link">
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
        </Link>

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

        <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t text-xs text-muted-foreground">
          <PostedAgo date={listing.postedAt} />

          <div className="flex items-center gap-1.5">
            {directLink && (
              <a
                href={directLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 underline-offset-4 hover:underline hover:text-foreground"
              >
                Original post
                <ExternalLink className="size-3" />
              </a>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Details
              {expanded ? (
                <ChevronUp className="size-3.5 ml-0.5" />
              ) : (
                <ChevronDown className="size-3.5 ml-0.5" />
              )}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t">
            <ListingCollapsibleDetails listing={listing} />
          </div>
        )}
      </div>
    </div>
  );
}


