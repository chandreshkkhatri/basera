import type { Source } from "@/db/schema";

type SourceMeta = {
  label: string;
  /** Verb-phrased CTA for the contact button on a listing. */
  contactLabel: string;
  /** Tailwind classes for the SourceBadge. */
  badgeClass: string;
  /**
   * Raw accent color (single source of truth) for contexts that can't use
   * Tailwind classes: Leaflet map markers and the card media-tile tint.
   */
  accent: string;
};

const SOURCES: Record<Source, SourceMeta> = {
  telegram: {
    label: "Telegram",
    contactLabel: "Contact on Telegram",
    badgeClass: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
    accent: "#0284c7",
  },
  whatsapp: {
    label: "WhatsApp",
    contactLabel: "Chat on WhatsApp",
    badgeClass:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    accent: "#059669",
  },
  facebook: {
    label: "Facebook",
    contactLabel: "Open post on Facebook",
    badgeClass:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
    accent: "#4f46e5",
  },
};

export const SOURCE_KEYS = Object.keys(SOURCES) as Source[];

/**
 * Brand violet as a raw color for Leaflet markers that represent "a point"
 * (the user's POI, a listing's own location) rather than a source. Kept here
 * as the single definition since Leaflet can't consume Tailwind tokens.
 */
export const BRAND_MARKER = "oklch(0.62 0.24 293)";

export function sourceMeta(source: string): SourceMeta {
  return (
    SOURCES[source as Source] ?? {
      label: source,
      contactLabel: "Open original post",
      badgeClass: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800",
      accent: "#6b7280",
    }
  );
}
