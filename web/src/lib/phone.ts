/**
 * Phone-number handling for the poster's contact number, which lives inline in
 * a listing's `originalText` (there's no dedicated column). Shared by the
 * "search in group" terms and the WhatsApp click-to-chat affordance.
 */

// Indian mobile numbers, tolerant of a +91 prefix and space/dash separators.
export const PHONE_RE = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/;

export type ExtractedPhone = {
  /** wa.me / tel form: country-coded digits only, e.g. "919876543210". */
  e164: string;
  /** Human display, e.g. "+91 98765 43210". */
  display: string;
};

/**
 * Pull the first Indian mobile number out of free text and normalise it.
 * Returns null when no valid 10-digit mobile is present.
 */
export function extractPhone(text: string | null | undefined): ExtractedPhone | null {
  if (!text) return null;
  const match = text.match(PHONE_RE);
  if (!match) return null;

  const digits = match[0].replace(/\D/g, "");
  // Normalise to 10 national digits: drop a leading 91 (country) or 0 (trunk).
  let national = digits;
  if (national.length === 12 && national.startsWith("91")) national = national.slice(2);
  else if (national.length === 11 && national.startsWith("0")) national = national.slice(1);

  // A valid Indian mobile is 10 digits starting 6–9.
  if (national.length !== 10 || !/^[6-9]/.test(national)) return null;

  return {
    e164: `91${national}`,
    display: `+91 ${national.slice(0, 5)} ${national.slice(5)}`,
  };
}

/** A wa.me click-to-chat URL with an optional prefilled message. */
export function whatsappHref(e164: string, message?: string): string {
  const base = `https://wa.me/${e164}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
