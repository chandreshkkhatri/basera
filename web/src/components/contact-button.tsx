"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sourceMeta } from "@/lib/sources";
import { postLink } from "@/lib/listing-links";
import type { Listing } from "@/db/schema";
import { useSaves } from "@/components/saves/saves-provider";
import { useAuth } from "@/components/auth/auth-provider";

/**
 * The core CTA: routes the user to the original post on the source platform.
 * Prefers a direct link (contact/post URL); when none was captured, falls back
 * to the source group so the user can still find the post there.
 *
 * Auth gated automation: If the user is signed in and the listing is saved
 * as "shortlisted", clicking the link automatically updates the status to "contacted".
 */
export function ContactButton({ listing }: { listing: Listing }) {
  const { isSaved, metadata, updateMetadata } = useSaves();
  const { user } = useAuth();
  const link = postLink(listing);
  const meta = sourceMeta(listing.source);

  if (!link) {
    return (
      <Button disabled className="w-full sm:w-auto">
        No contact link available
      </Button>
    );
  }

  const label = link.isGroup
    ? `Find it in the ${meta.label} group`
    : meta.contactLabel;

  const saved = isSaved(listing.id);
  const currentStatus = saved ? (metadata[listing.id]?.status ?? "shortlisted") : null;

  const handleClick = () => {
    if (user && saved && currentStatus === "shortlisted") {
      void updateMetadata(listing.id, { status: "contacted" });
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Button asChild size="lg" className="w-full sm:w-auto">
        <a href={link.href} target="_blank" rel="noopener noreferrer" onClick={handleClick}>
          {label}
          <ExternalLink className="size-4" />
        </a>
      </Button>
      {listing.sourceUrl && listing.sourceUrl !== link.href && (
        <a
          href={listing.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClick}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          View original post
        </a>
      )}
    </div>
  );
}
