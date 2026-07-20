/**
 * "Search in group" terms: short, distinctive, copy-pasteable phrases from a
 * listing's original post text, for finding the post via Facebook's group
 * search when we couldn't capture (or you don't trust) the direct link.
 * Deterministic — works retroactively for every stored listing.
 */
import { PHONE_RE } from "@/lib/phone";

const MAX_TERMS = 3;
const MAX_WORDS = 8;
const MIN_WORDS = 3;
const MAX_CHARS = 60;

/** Strip emoji/decoration; collapse whitespace. FB search dislikes emojis. */
function clean(s: string): string {
  return s
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, " ")
    .replace(/[*_#|•●▪◦~"“”]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstWords(s: string, n: number): string {
  let out = s.split(" ").slice(0, n).join(" ");
  if (out.length > MAX_CHARS) out = out.slice(0, MAX_CHARS).replace(/\s+\S*$/, "");
  return out.trim();
}

function wordCount(s: string): number {
  return s ? s.split(" ").length : 0;
}

export function searchTerms(text: string): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();
  const add = (t: string) => {
    const key = t.toLowerCase();
    if (t && !seen.has(key) && terms.length < MAX_TERMS) {
      seen.add(key);
      terms.push(t);
    }
  };

  const lines = (text ?? "")
    .split(/\n+/)
    .map(clean)
    .filter((l) => wordCount(l) >= MIN_WORDS);

  // 1. Verbatim opening snippet — post openers are usually distinctive.
  if (lines[0]) {
    const opener = firstWords(lines[0], MAX_WORDS);
    if (wordCount(opener) >= MIN_WORDS) add(opener);
  }

  // 2. The longest remaining line — typically the meatiest detail sentence.
  const rest = lines.slice(1).sort((a, b) => b.length - a.length);
  for (const line of rest) {
    const snippet = firstWords(line, MAX_WORDS);
    if (wordCount(snippet) >= MIN_WORDS) {
      add(snippet);
      break;
    }
  }

  // 3. A phone number — near-unique when present.
  const phone = clean(text ?? "").match(PHONE_RE);
  if (phone) add(phone[0].trim());

  return terms;
}
