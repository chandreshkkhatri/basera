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
import { ContactButton } from "@/components/contact-button";
import { ShareButton } from "@/components/share-button";
import { SearchTerms } from "@/components/search-terms";
import { ShortlistTracker } from "@/components/saves/shortlist-tracker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatRent, formatRentAmount } from "@/lib/format";
import { furnishingLabel, genderLabel } from "@/lib/normalize";
import { postLink } from "@/lib/listing-links";

function isUrl(s: string | null): boolean {
  return !!s && /^https?:\/\//.test(s);
}

export function ListingCard({ listing }: { listing: ListingRow }) {
  const [expanded, setExpanded] = useState(false);
  const furnishing = furnishingLabel(listing.furnishingStatus);
  const rent = formatRentAmount(listing.rent);
  const place =
    [listing.location, listing.city].filter(Boolean).join(", ") ||
    "Location unknown";
  const link = postLink(listing);
  const shareTitle = `${formatRent(listing.rent)}${listing.bhk ? ` · ${listing.bhk}` : ""} in ${place}`;
  const detailUrl = `/listings/${listing.id}`;

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
            {link?.href && (
              <a
                href={link.href}
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
          <div className="mt-3 flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 text-left shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
              <ContactButton listing={listing} />
              <ShareButton title={shareTitle} url={detailUrl} />
            </div>

            <ShortlistTracker listingId={listing.id} />

            {isUrl(listing.sourceGroup) ? (
              <p className="text-xs text-muted-foreground">
                From group{" "}
                <a
                  href={listing.sourceGroup!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 font-medium text-foreground hover:text-primary"
                >
                  {listing.sourceGroup}
                </a>
              </p>
            ) : listing.sourceGroup ? (
              <p className="text-xs text-muted-foreground">
                From group “{listing.sourceGroup}”
              </p>
            ) : null}

            <SearchTerms text={listing.originalText} />

            {listing.additionalDetails && (
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Extra details: </span>
                {listing.additionalDetails}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

