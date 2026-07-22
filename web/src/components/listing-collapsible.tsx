"use client";

import { ExternalLink, MessageCircle, TriangleAlert } from "lucide-react";
import type { ListingRow } from "@/db/queries/listings";
import { ContactButton } from "@/components/contact-button";
import { ShareButton } from "@/components/share-button";
import { SearchTerms } from "@/components/search-terms";
import { ShortlistTracker } from "@/components/saves/shortlist-tracker";
import { MiniMap } from "@/components/map/mini-map";
import { Button } from "@/components/ui/button";
import { formatRent } from "@/lib/format";
import { furnishingLabel, genderLabel } from "@/lib/normalize";
import { directPostLink } from "@/lib/listing-links";
import { extractPhone, whatsappHref } from "@/lib/phone";
import { siteUrl } from "@/lib/site";

function isUrl(s: string | null): boolean {
  return !!s && /^https?:\/\//.test(s);
}

/**
 * Integrated inline collapsible panel displaying all detail page elements
 * for a listing directly inside the list view.
 */
export function ListingCollapsibleDetails({
  listing,
}: {
  listing: ListingRow;
}) {
  const directLink = directPostLink(listing);
  const place =
    [listing.location, listing.city].filter(Boolean).join(", ") ||
    "Location unknown";
  const furnishing = furnishingLabel(listing.furnishingStatus);
  const shareTitle = `${formatRent(listing.rent)}${listing.bhk ? ` · ${listing.bhk}` : ""} in ${place}`;
  const detailUrl = `/listings/${listing.id}`;

  const phone = extractPhone(listing.originalText);
  let whatsappHrefUrl: string | null = null;
  if (phone) {
    const canonicalUrl = new URL(detailUrl, siteUrl()).toString();
    const message =
      `Hi! I saw your rental listing` +
      (listing.bhk ? ` (${listing.bhk})` : "") +
      (place !== "Location unknown" ? ` in ${place}` : "") +
      ` on Basera and I'm interested. Is it still available?\n${canonicalUrl}`;
    whatsappHrefUrl = whatsappHref(phone.e164, message);
  }

  const detailRows: [string, string | null][] = [
    ["Rent", formatRent(listing.rent)],
    ["Configuration", listing.bhk],
    [
      "Location",
      [listing.location, listing.city].filter(Boolean).join(", ") || null,
    ],
    ["Tenant preference", genderLabel(listing.genderPreference)],
    ["Furnishing", furnishing],
    ["Extra details", listing.additionalDetails],
    ["Posted by", listing.contactName],
  ];

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="flex flex-col gap-4 rounded-xl border bg-card p-4 text-left shadow-xs transition-all animate-in fade-in slide-in-from-top-2 duration-200"
    >
      {/* Warning banner for non-active listings */}
      {listing.status !== "active" && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <TriangleAlert className="size-4 shrink-0" />
          This post may no longer be available.
        </div>
      )}

      {/* Primary Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <ContactButton listing={listing} />
        <div className="flex flex-wrap items-center gap-2">
          {directLink && (
            <Button asChild variant="outline" size="sm">
              <a href={directLink} target="_blank" rel="noopener noreferrer">
                Original post
                <ExternalLink className="size-3.5 ml-1" />
              </a>
            </Button>
          )}
          <ShareButton title={shareTitle} url={detailUrl} />
        </div>
      </div>

      {/* WhatsApp Click-To-Chat (if phone number is extracted) */}
      {phone && whatsappHrefUrl && (
        <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold">Message poster on WhatsApp</p>
            <p className="text-xs text-muted-foreground">{phone.display}</p>
          </div>
          <Button
            asChild
            size="sm"
            className="bg-whatsapp text-whatsapp-foreground hover:bg-whatsapp/90"
          >
            <a
              href={whatsappHrefUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="size-3.5 mr-1" />
              Message on WhatsApp
            </a>
          </Button>
        </div>
      )}

      {/* Shortlist Pipeline Tracker */}
      <ShortlistTracker listingId={listing.id} />

      {/* Group Info */}
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

      {/* Search Terms for Facebook Group Search */}
      <SearchTerms text={listing.originalText} />

      {/* Detailed Key Attributes Grid */}
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg border bg-muted/10 p-3 text-xs sm:grid-cols-2">
        {detailRows
          .filter(([, v]) => v)
          .map(([label, value]) => (
            <div key={label} className="flex flex-col">
              <dt className="font-medium text-muted-foreground">{label}</dt>
              <dd className="text-foreground">{value}</dd>
            </div>
          ))}
      </dl>

      {/* Mini Map (Location visual preview if coordinates are present) */}
      {listing.latitude != null && listing.longitude != null && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            Location Map
          </p>
          <MiniMap lat={listing.latitude} lng={listing.longitude} />
        </div>
      )}

      {/* Full Original Post Text */}
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          Original post text:
        </p>
        <p className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-foreground">
          {listing.originalText}
        </p>
      </div>
    </div>
  );
}
