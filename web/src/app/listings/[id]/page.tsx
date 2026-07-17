import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, TriangleAlert } from "lucide-react";
import { getListingById } from "@/db/queries/listings";
import { SourceBadge } from "@/components/source-badge";
import { PostedAgo } from "@/components/posted-ago";
import { ContactButton } from "@/components/contact-button";
import { DistanceChip } from "@/components/distance-chip";
import { SearchTerms } from "@/components/search-terms";
import { ListingMedia } from "@/components/listing-media";
import { MiniMap } from "@/components/map/mini-map";
import { Badge } from "@/components/ui/badge";
import { formatRent, formatRentAmount } from "@/lib/format";
import { furnishingLabel, genderLabel } from "@/lib/normalize";

function isUrl(s: string | null): boolean {
  return !!s && /^https?:\/\//.test(s);
}

export async function generateMetadata({
  params,
}: PageProps<"/listings/[id]">): Promise<Metadata> {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) return {};
  // getListingById is cache()d — the page render reuses this row.
  const listing = await getListingById(numId).catch(() => null);
  if (!listing) return {};

  const place =
    [listing.location, listing.city].filter(Boolean).join(", ") || "India";
  const title = [
    formatRent(listing.rent),
    listing.bhk,
    `in ${place}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const description = listing.originalText
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);

  return {
    title,
    description,
    alternates: { canonical: `/listings/${listing.id}` },
    openGraph: { title, description, url: `/listings/${listing.id}` },
    // Long-dead or admin-hidden posts shouldn't be indexed (they still render
    // with a warning banner for people holding old links).
    robots: listing.status === "active" ? undefined : { index: false },
  };
}

export default async function ListingDetailPage({
  params,
}: PageProps<"/listings/[id]">) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) notFound();

  const listing = await getListingById(numId);
  if (!listing) notFound();

  const rent = formatRentAmount(listing.rent);
  const place =
    [listing.location, listing.city].filter(Boolean).join(", ") ||
    "Location unknown";
  const furnishing = furnishingLabel(listing.furnishingStatus);

  const rows: [string, string | null][] = [
    ["Rent", formatRent(listing.rent)],
    ["Configuration", listing.bhk],
    ["Location", [listing.location, listing.city].filter(Boolean).join(", ") || null],
    ["Tenant preference", genderLabel(listing.genderPreference)],
    ["Furnishing", furnishing],
    ["Extra details", listing.additionalDetails],
    ["Posted by", listing.contactName],
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" />
        Back to listings
      </Link>

      <div className="relative aspect-2/1 overflow-hidden rounded-xl border">
        <ListingMedia source={listing.source} glyphClassName="text-8xl" />
        <SourceBadge source={listing.source} className="absolute top-3 right-3" />
      </div>

      <div>
        <span className="text-sm text-muted-foreground">
          Posted <PostedAgo date={listing.postedAt} />
        </span>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">
          {rent ? (
            <>
              {rent}
              <span className="ml-1 text-lg font-medium text-muted-foreground">
                /mo
              </span>
            </>
          ) : (
            "Rent not specified"
          )}
        </h1>
        <p className="mt-1 flex items-center gap-1 text-muted-foreground">
          <MapPin className="size-4 shrink-0" />
          {place}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {listing.bhk && <Badge variant="secondary">{listing.bhk}</Badge>}
          <Badge variant="secondary">
            {genderLabel(listing.genderPreference)}
          </Badge>
          {furnishing && <Badge variant="secondary">{furnishing}</Badge>}
          <DistanceChip
            lat={listing.latitude}
            lng={listing.longitude}
            precision={listing.geoPrecision}
            distanceKm={null}
          />
        </div>
      </div>

      {listing.status !== "active" && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          <TriangleAlert className="size-4 shrink-0" />
          This post may no longer be available. The original link may still work.
        </div>
      )}

      <div className="rounded-xl border p-4">
        <ContactButton listing={listing} />
        {isUrl(listing.sourceGroup) ? (
          <p className="mt-3 text-sm text-muted-foreground">
            From group{" "}
            <a
              href={listing.sourceGroup!}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              {listing.sourceGroup}
            </a>
          </p>
        ) : listing.sourceGroup ? (
          <p className="mt-3 text-sm text-muted-foreground">
            From group “{listing.sourceGroup}”
          </p>
        ) : null}
        <SearchTerms text={listing.originalText} />
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border p-4 sm:grid-cols-2">
        {rows
          .filter(([, v]) => v)
          .map(([label, value]) => (
            <div key={label} className="flex flex-col">
              <dt className="text-xs font-medium text-muted-foreground">
                {label}
              </dt>
              <dd className="text-sm">{value}</dd>
            </div>
          ))}
      </dl>

      {listing.latitude != null && listing.longitude != null && (
        <MiniMap lat={listing.latitude} lng={listing.longitude} />
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">
          Original post
        </h2>
        <p className="whitespace-pre-wrap rounded-xl border bg-muted/30 p-4 text-sm leading-relaxed">
          {listing.originalText}
        </p>
      </div>
    </div>
  );
}
