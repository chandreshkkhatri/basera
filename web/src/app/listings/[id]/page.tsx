import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { getListingById } from "@/db/queries/listings";
import { SourceBadge } from "@/components/source-badge";
import { PostedAgo } from "@/components/posted-ago";
import { ContactButton } from "@/components/contact-button";
import { MiniMap } from "@/components/map/mini-map";
import { formatRent } from "@/lib/format";
import { furnishingLabel, genderLabel } from "@/lib/normalize";

function isUrl(s: string | null): boolean {
  return !!s && /^https?:\/\//.test(s);
}

export default async function ListingDetailPage({
  params,
}: PageProps<"/listings/[id]">) {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) notFound();

  const listing = await getListingById(numId);
  if (!listing) notFound();

  const rows: [string, string | null][] = [
    ["Rent", formatRent(listing.rent)],
    ["Configuration", listing.bhk],
    ["Location", [listing.location, listing.city].filter(Boolean).join(", ") || null],
    ["Tenant preference", genderLabel(listing.genderPreference)],
    ["Furnishing", furnishingLabel(listing.furnishingStatus)],
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

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <SourceBadge source={listing.source} />
            <span className="text-sm text-muted-foreground">
              Posted <PostedAgo date={listing.postedAt} />
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {formatRent(listing.rent)}
            {listing.bhk ? ` · ${listing.bhk}` : ""}
          </h1>
          <p className="text-muted-foreground">
            {[listing.location, listing.city].filter(Boolean).join(", ") ||
              "Location unknown"}
          </p>
        </div>
      </div>

      {listing.status !== "active" && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
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
