/**
 * Canonical site origin for absolute URLs (metadataBase, sitemap, OG tags).
 * Set NEXT_PUBLIC_SITE_URL in production (e.g. https://basera.example.com);
 * falls back to the Vercel production domain, then localhost for dev.
 */
export function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return new URL(explicit);
  if (process.env.NODE_ENV === "production") return new URL("https://basera.homes");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return new URL(`https://${vercel}`);
  return new URL("http://localhost:3000");
}

