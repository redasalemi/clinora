/**
 * Static measure definitions. SPEC.md 5.1.
 *
 * Pure data. No I/O, no imports. The engine imports this file; nothing in
 * this file imports the engine, so the dependency stays acyclic.
 *
 * [A] Direction values are standard test conventions, pending AEP
 *     confirmation (SPEC.md 5.1).
 * [A] Ranges are input sanity guards only, not clinical claims.
 * [A] GAIT10 is entered as speed in m/s, one gait speed type.
 * [A] GRIP is one value in kg, no side field.
 */

export type TestId =
  | "6MWT"
  | "2MWT"
  | "TUG"
  | "STS30"
  | "STS5"
  | "GRIP"
  | "GAIT10"
  | "BERG";

/** "higher" = higher is better. "lower" = lower is better. */
export type Direction = "higher" | "lower";

export interface ValidRange {
  readonly min: number;
  /** false = strictly greater than min ("greater than 0" in SPEC.md 5.1). */
  readonly min_inclusive: boolean;
  readonly max: number;
  readonly max_inclusive: boolean;
}

export interface MeasureDefinition {
  readonly test_id: TestId;
  /** Display name. */
  readonly name: string;
  readonly unit: string;
  readonly direction: Direction;
  /** Decimal places allowed and displayed. 0 means the value is an integer. */
  readonly decimals: number;
  readonly valid_range: ValidRange;
}

export const MEASURES = {
  "6MWT": {
    test_id: "6MWT",
    name: "6-Minute Walk Test",
    unit: "m",
    direction: "higher",
    decimals: 0,
    valid_range: { min: 0, min_inclusive: true, max: 1000, max_inclusive: true },
  },
  "2MWT": {
    test_id: "2MWT",
    name: "2-Minute Walk Test",
    unit: "m",
    direction: "higher",
    decimals: 0,
    valid_range: { min: 0, min_inclusive: true, max: 500, max_inclusive: true },
  },
  TUG: {
    test_id: "TUG",
    name: "Timed Up and Go",
    unit: "s",
    direction: "lower",
    decimals: 1,
    valid_range: { min: 0, min_inclusive: false, max: 300, max_inclusive: true },
  },
  STS30: {
    test_id: "STS30",
    name: "30-Second Sit-to-Stand",
    unit: "reps",
    direction: "higher",
    decimals: 0,
    valid_range: { min: 0, min_inclusive: true, max: 60, max_inclusive: true },
  },
  STS5: {
    test_id: "STS5",
    name: "5x Sit-to-Stand",
    unit: "s",
    direction: "lower",
    decimals: 1,
    valid_range: { min: 0, min_inclusive: false, max: 300, max_inclusive: true },
  },
  GRIP: {
    test_id: "GRIP",
    name: "Grip Strength",
    unit: "kg",
    direction: "higher",
    decimals: 1,
    valid_range: { min: 0, min_inclusive: true, max: 100, max_inclusive: true },
  },
  GAIT10: {
    test_id: "GAIT10",
    name: "10-Metre Walk Test (gait speed)",
    unit: "m/s",
    direction: "higher",
    decimals: 2,
    valid_range: { min: 0, min_inclusive: true, max: 5, max_inclusive: true },
  },
  BERG: {
    test_id: "BERG",
    name: "Berg Balance Scale",
    unit: "points",
    direction: "higher",
    decimals: 0,
    valid_range: { min: 0, min_inclusive: true, max: 56, max_inclusive: true },
  },
} as const satisfies Record<TestId, MeasureDefinition>;

export const TEST_IDS: readonly TestId[] = [
  "6MWT",
  "2MWT",
  "TUG",
  "STS30",
  "STS5",
  "GRIP",
  "GAIT10",
  "BERG",
];

export function getMeasure(testId: TestId): MeasureDefinition {
  return MEASURES[testId];
}

export function isTestId(value: unknown): value is TestId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MEASURES, value);
}
