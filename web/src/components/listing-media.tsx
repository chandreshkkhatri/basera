import { sourceMeta } from "@/lib/sources";
import { cn } from "@/lib/utils";

/**
 * Fills its (positioned/sized) parent with a listing's image. Listings have no
 * photos yet (see schema): until the scraper captures post images this renders
 * a branded, source-tinted placeholder. When an image URL lands on the row,
 * pass it as `src` and the real image takes over, with the tint as fallback.
 * Shared by the card (large tile) and the list row (small square).
 */
export function ListingMedia({
  source,
  src,
  glyphClassName,
}: {
  source: string;
  src?: string | null;
  glyphClassName?: string;
}) {
  const { accent } = sourceMeta(source);

  if (src) {
    return (
      // Scraped from an external host, not a Next-optimized asset.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
      />
    );
  }

  return (
    <div
      className="flex size-full items-center justify-center"
      style={{
        backgroundImage: `linear-gradient(135deg, ${accent}2e, ${accent}0a)`,
      }}
    >
      <span
        aria-hidden
        className={cn("font-display font-bold opacity-20", glyphClassName)}
        style={{ color: accent }}
      >
        b
      </span>
    </div>
  );
}
