import type { Source } from "@/db/schema";

type SourceMeta = {
  label: string;
  /** Verb-phrased CTA for the contact button on a listing. */
  contactLabel: string;
  /** Tailwind classes for the SourceBadge. */
  badgeClass: string;
};

const SOURCES: Record<Source, SourceMeta> = {
  telegram: {
    label: "Telegram",
    contactLabel: "Contact on Telegram",
    badgeClass: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  },
  whatsapp: {
    label: "WhatsApp",
    contactLabel: "Chat on WhatsApp",
    badgeClass:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  facebook: {
    label: "Facebook",
    contactLabel: "Open post on Facebook",
    badgeClass:
      "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  },
};

export const SOURCE_KEYS = Object.keys(SOURCES) as Source[];

export function sourceMeta(source: string): SourceMeta {
  return (
    SOURCES[source as Source] ?? {
      label: source,
      contactLabel: "Open original post",
      badgeClass: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800",
    }
  );
}
