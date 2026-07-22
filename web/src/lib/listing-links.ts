import type { Listing } from "@/db/schema";

function httpUrl(s: string | null): string | null {
  return s && /^https?:\/\//.test(s) ? s : null;
}

export type PostLink = { href: string; isGroup: boolean };

/**
 * Best outbound link to reach a listing's post/poster. Prefers a direct link
 * (contact_url, then source_url); falls back to the source group when no direct
 * post link was captured — many scraped Facebook rows have only the group URL.
 * Returns null when nothing linkable exists.
 */
export function postLink(
  listing: Pick<Listing, "contactUrl" | "sourceUrl" | "sourceGroup">,
): PostLink | null {
  const direct = directPostLink(listing);
  if (direct) return { href: direct, isGroup: false };
  const group = httpUrl(listing.sourceGroup);
  if (group) return { href: group, isGroup: true };
  return null;
}

/**
 * Direct link to the original post/poster (contact_url or source_url).
 * Returns null if no direct post URL exists (i.e. excludes group fallbacks).
 */
export function directPostLink(
  listing: Pick<Listing, "contactUrl" | "sourceUrl">,
): string | null {
  return httpUrl(listing.contactUrl) ?? httpUrl(listing.sourceUrl);
}

