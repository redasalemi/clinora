/**
 * Shared engine types. SPEC.md 2.2 and 5.5.
 */

export type AgeBand = "18-34" | "35-49" | "50-64" | "65-74" | "75+";

export const AGE_BANDS: readonly AgeBand[] = ["18-34", "35-49", "50-64", "65-74", "75+"];

export function isAgeBand(value: unknown): value is AgeBand {
  return typeof value === "string" && (AGE_BANDS as readonly string[]).includes(value);
}

/**
 * Population codes come from data/thresholds.json plus the literal "other".
 * "other" never matches any threshold row (SPEC.md 5.4.2).
 */
export type PopulationCode = string;

export const POPULATION_OTHER = "other";

/** SPEC.md 5.5 precedence table, in precedence order. */
export type ChangeClass =
  | "NO_BASELINE"
  | "NOT_COMPARABLE"
  | "NO_VERIFIED_THRESHOLD"
  | "IMPROVED_BEYOND_THRESHOLD"
  | "DECLINED_BEYOND_THRESHOLD"
  | "WITHIN_THRESHOLD";

export type DirectionLabel = "improved" | "declined" | "unchanged";

/** Participant context the engine needs. No identifying fields (SPEC.md 2.2). */
export interface ParticipantContext {
  age_band: AgeBand | null;
  population_code: PopulationCode | null;
}
