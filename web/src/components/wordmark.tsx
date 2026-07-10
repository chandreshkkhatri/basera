import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Basera wordmark: a bold violet glyph mark ("b") plus the display-type
 * name. Used in the site header and available for empty/hero states.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("flex items-center gap-2", className)}
      aria-label="Basera — home"
    >
      <span
        aria-hidden
        className="flex size-7 items-center justify-center rounded-lg bg-brand font-display text-lg leading-none font-bold text-brand-foreground shadow-sm"
      >
        b
      </span>
      <span className="font-display text-lg font-bold tracking-tight">
        Basera
      </span>
    </Link>
  );
}
