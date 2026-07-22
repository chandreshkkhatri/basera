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
import { EmptyState } from "@/components/empty-state";
import { ListingCollapsibleDetails } from "@/components/listing-collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRentAmount } from "@/lib/format";
import { furnishingLabel, genderLabel } from "@/lib/normalize";
import { directPostLink } from "@/lib/listing-links";

/** The default feed layout: a table on desktop, compact rows on mobile. */
export function ListingList({ listings }: { listings: ListingRow[] }) {
  if (listings.length === 0) return <EmptyState />;
  return (
    <>
      {/* Mobile: stacked rows (a table is too cramped on phones). */}
      <ul className="divide-y overflow-hidden rounded-xl border bg-card sm:hidden">
        {listings.map((l) => (
          <li key={l.id}>
            <ListingRow listing={l} />
          </li>
        ))}
      </ul>

      {/* Desktop: real column-aligned table. */}
      <div className="hidden overflow-hidden rounded-xl border sm:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {[
                "Rent",
                "Location",
                "Config",
                "Tenant",
                "Furnishing",
                "Distance",
                "Posted",
                "Source",
                "Actions",
              ].map((h, i) => (
                <TableHead
                  key={h}
                  className={cellVisibility(
                    i,
                    "text-xs font-medium text-muted-foreground",
                  )}
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {listings.map((l) => (
              <ListingTableRow key={l.id} listing={l} />
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

// Tenant (3) and Furnishing (4) columns hide below lg to keep the table airy.
function cellVisibility(index: number, base = ""): string {
  const hide = index === 3 || index === 4 ? "hidden lg:table-cell" : "";
  return `${base} ${hide}`.trim();
}

function ListingTableRow({ listing }: { listing: ListingRow }) {
  const [expanded, setExpanded] = useState(false);
  const rent = formatRentAmount(listing.rent);
  const place =
    [listing.location, listing.city].filter(Boolean).join(", ") ||
    "Location unknown";
  const furnishing = furnishingLabel(listing.furnishingStatus);
  const directLink = directPostLink(listing);

  return (
    <>
      <TableRow className="relative cursor-pointer hover:bg-accent/40">
        <TableCell className="font-display font-semibold tabular-nums">
          <Link
            href={`/listings/${listing.id}`}
            className="text-highlight after:absolute after:inset-0"
          >
            {rent ?? "Rent n/a"}
          </Link>
          {rent && (
            <span className="ml-0.5 text-xs font-normal text-muted-foreground">
              /mo
            </span>
          )}
        </TableCell>
        <TableCell className="max-w-60 truncate text-muted-foreground">
          {place}
        </TableCell>
        <TableCell>{listing.bhk ?? "—"}</TableCell>
        <TableCell className="hidden lg:table-cell">
          {genderLabel(listing.genderPreference)}
        </TableCell>
        <TableCell className="hidden text-muted-foreground lg:table-cell">
          {furnishing ?? "—"}
        </TableCell>
        <TableCell>
          <DistanceChip
            lat={listing.latitude}
            lng={listing.longitude}
            precision={listing.geoPrecision}
            distanceKm={listing.distanceKm}
          />
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">
          <PostedAgo date={listing.postedAt} />
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-1 items-start">
            <SourceBadge source={listing.source} />
            {directLink && (
              <a
                href={directLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="relative z-10 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
              >
                Original post
                <ExternalLink className="size-3 shrink-0" />
              </a>
            )}
          </div>
        </TableCell>
        <TableCell>
          {/* z-10 lifts interactive elements above the row's overlay link */}
          <div className="relative z-10 flex items-center gap-1.5 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              title={expanded ? "Hide details" : "More details"}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Details
              {expanded ? (
                <ChevronUp className="size-3.5 ml-0.5" />
              ) : (
                <ChevronDown className="size-3.5 ml-0.5" />
              )}
            </Button>
            <SaveButton id={listing.id} />
          </div>
        </TableCell>
      </TableRow>

      {expanded && (
        <TableRow className="bg-muted/10 hover:bg-muted/10">
          <TableCell colSpan={9} className="p-4">
            <ListingCollapsibleDetails listing={listing} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function ListingRow({ listing }: { listing: ListingRow }) {
  const [expanded, setExpanded] = useState(false);
  const furnishing = furnishingLabel(listing.furnishingStatus);
  const rent = formatRentAmount(listing.rent);
  const place =
    [listing.location, listing.city].filter(Boolean).join(", ") ||
    "Location unknown";
  const directLink = directPostLink(listing);

  return (
    <div className="p-3 transition-colors hover:bg-accent/40">
      <div className="flex gap-3">
        <Link
          href={`/listings/${listing.id}`}
          className="relative size-16 shrink-0 overflow-hidden rounded-lg"
        >
          <ListingMedia source={listing.source} glyphClassName="text-2xl" />
        </Link>

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Link href={`/listings/${listing.id}`}>
              {rent ? (
                <p className="font-display text-lg font-bold tracking-tight text-highlight tabular-nums">
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
            </Link>
            <span className="flex shrink-0 items-center gap-1.5">
              <SourceBadge source={listing.source} />
              <SaveButton id={listing.id} />
            </span>
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
            {furnishing && <Badge variant="secondary">{furnishing}</Badge>}
            <DistanceChip
              lat={listing.latitude}
              lng={listing.longitude}
              precision={listing.geoPrecision}
              distanceKm={listing.distanceKm}
            />
            <span className="ml-auto text-xs text-muted-foreground">
              <PostedAgo date={listing.postedAt} />
            </span>
          </div>

          <div className="mt-1 flex items-center justify-between gap-2 pt-1 border-t">
            {directLink ? (
              <a
                href={directLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
              >
                Original post
                <ExternalLink className="size-3 shrink-0" />
              </a>
            ) : (
              <span />
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              {expanded ? "Hide details" : "More details"}
              {expanded ? (
                <ChevronUp className="size-3.5 ml-0.5" />
              ) : (
                <ChevronDown className="size-3.5 ml-0.5" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t">
          <ListingCollapsibleDetails listing={listing} />
        </div>
      )}
    </div>
  );
}


