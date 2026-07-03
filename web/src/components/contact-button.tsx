import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sourceMeta } from "@/lib/sources";
import type { Listing } from "@/db/schema";

/**
 * The core CTA: routes the user to the original post on the source platform.
 * Prefers `contact_url` (a DM/permalink to reach the poster); falls back to
 * `source_url` (the post itself) when no contact link was captured.
 */
export function ContactButton({ listing }: { listing: Listing }) {
  const href = listing.contactUrl ?? listing.sourceUrl;
  const meta = sourceMeta(listing.source);

  if (!href) {
    return (
      <Button disabled className="w-full sm:w-auto">
        No contact link available
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Button asChild size="lg" className="w-full sm:w-auto">
        <a href={href} target="_blank" rel="noopener noreferrer">
          {meta.contactLabel}
          <ExternalLink className="size-4" />
        </a>
      </Button>
      {listing.sourceUrl && listing.sourceUrl !== href && (
        <a
          href={listing.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          View original post
        </a>
      )}
    </div>
  );
}
