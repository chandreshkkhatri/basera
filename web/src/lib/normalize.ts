import type {
  FurnishingStatus,
  GenderPreference,
} from "@/db/schema";

/**
 * The gender/furnishing columns hold whatever the LLM extractor wrote. If the
 * model drifts and emits an unexpected string, rendering must not crash — we
 * coerce unknown values to a safe default here rather than adding a DB CHECK
 * (which would fail the Python insert instead). See schema.ts.
 */

const GENDERS: GenderPreference[] = [
  "male",
  "female",
  "family",
  "bachelor",
  "any",
];

const FURNISHINGS: FurnishingStatus[] = [
  "fully furnished",
  "semi furnished",
  "unfurnished",
];

export function normalizeGender(value: string | null): GenderPreference {
  if (value && GENDERS.includes(value as GenderPreference)) {
    return value as GenderPreference;
  }
  return "any";
}

export function normalizeFurnishing(
  value: string | null,
): FurnishingStatus | null {
  if (value && FURNISHINGS.includes(value as FurnishingStatus)) {
    return value as FurnishingStatus;
  }
  return null;
}

const GENDER_LABELS: Record<GenderPreference, string> = {
  male: "Male only",
  female: "Female only",
  family: "Family",
  bachelor: "Bachelors",
  any: "Anyone",
};

export function genderLabel(value: string | null): string {
  return GENDER_LABELS[normalizeGender(value)];
}

export function furnishingLabel(value: string | null): string | null {
  const f = normalizeFurnishing(value);
  if (!f) return null;
  return f.replace(/\b\w/g, (c) => c.toUpperCase());
}
