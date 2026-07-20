import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Basera wordmark: a bold violet glyph tile ("b") with a faint top highlight,
 * plus the display-type name. Used in the site header and available for
 * empty/hero states.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("group flex items-center gap-2", className)}
      aria-label="Basera — home"
    >
      <span
        aria-hidden
        className="flex size-7 items-center justify-center rounded-md bg-brand font-display text-lg leading-none font-bold text-brand-foreground shadow-sm ring-1 ring-inset ring-white/15 transition-transform duration-150 group-hover:-translate-y-px"
      >
        b
      </span>
      <span className="font-display text-lg font-bold tracking-tight">
        Basera
      </span>
    </Link>
  );
}
