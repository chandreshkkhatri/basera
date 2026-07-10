import Link from "next/link";
import { MapPin } from "lucide-react";
import type { ListingRow } from "@/db/queries/listings";
import { SourceBadge } from "@/components/source-badge";
import { PostedAgo } from "@/components/posted-ago";
import { DistanceChip } from "@/components/distance-chip";
import { ListingMedia } from "@/components/listing-media";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
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
  const rent = formatRentAmount(listing.rent);
  const place =
    [listing.location, listing.city].filter(Boolean).join(", ") ||
    "Location unknown";
  const furnishing = furnishingLabel(listing.furnishingStatus);

  return (
    <TableRow className="relative cursor-pointer">
      <TableCell className="font-display font-semibold">
        <Link
          href={`/listings/${listing.id}`}
          className="text-foreground after:absolute after:inset-0"
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
          distanceKm={listing.distanceKm}
        />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        <PostedAgo date={listing.postedAt} />
      </TableCell>
      <TableCell>
        <SourceBadge source={listing.source} />
      </TableCell>
    </TableRow>
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
      className="group flex gap-3 p-3 transition-colors hover:bg-accent/40"
    >
      <div className="relative size-16 shrink-0 overflow-hidden rounded-lg">
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
          <SourceBadge source={listing.source} className="shrink-0" />
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
