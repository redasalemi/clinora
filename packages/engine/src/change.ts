/**
 * Input handling and change calculation. SPEC.md 5.2 and 5.3.
 *
 * Every value is converted to a scaled integer (value * 10^decimals) on the
 * way in. All arithmetic on values is integer arithmetic. Values are
 * converted back only for display. No AI, no I/O.
 */

import type { Direction, MeasureDefinition } from "../../../data/measures";
import type { DirectionLabel } from "./types";

/** SPEC.md 5.2: scale a display value to its integer representation. */
export function toScaled(value: number, decimals: number): number {
  return Math.round(value * 10 ** decimals);
}

/** SPEC.md 5.2: convert a scaled integer back for display. */
export function fromScaled(scaled: number, decimals: number): number {
  return scaled / 10 ** decimals;
}

/** Display a value at the test's decimals. SPEC.md 5.8. */
export function formatValue(value: number, decimals: number): string {
  // Normalise -0 so it never prints as "-0".
  const safe = value === 0 ? 0 : value;
  return safe.toFixed(decimals);
}

/** Display a percentage at 1 decimal. SPEC.md 5.8. */
export function formatPct(pct: number): string {
  return formatValue(pct, 1);
}

/** Number of decimal places in a finite number, as written. */
export function decimalPlaces(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const text = String(value);
  const exponential = /^-?(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(text);
  if (exponential) {
    const fraction = exponential[2] ?? "";
    const exponent = Number(exponential[3] ?? "0");
    return Math.max(0, fraction.length - exponent);
  }
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

export type ValueRejection =
  | "NOT_A_NUMBER"
  | "TOO_MANY_DECIMALS"
  | "BELOW_RANGE"
  | "ABOVE_RANGE";

export type ValueValidation =
  | { ok: true; scaled: number }
  | { ok: false; reason: ValueRejection };

/**
 * SPEC.md 5.2: a value with more decimals than the test allows is rejected by
 * validation, not rounded. Ranges (5.1) are input sanity guards only.
 */
export function validateValue(value: number, measure: MeasureDefinition): ValueValidation {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, reason: "NOT_A_NUMBER" };
  }
  if (decimalPlaces(value) > measure.decimals) {
    return { ok: false, reason: "TOO_MANY_DECIMALS" };
  }
  const { min, min_inclusive, max, max_inclusive } = measure.valid_range;
  if (min_inclusive ? value < min : value <= min) {
    return { ok: false, reason: "BELOW_RANGE" };
  }
  if (max_inclusive ? value > max : value >= max) {
    return { ok: false, reason: "ABOVE_RANGE" };
  }
  return { ok: true, scaled: toScaled(value, measure.decimals) };
}

export interface ChangeResult {
  /** current - baseline, in scaled integers. */
  delta_scaled: number;
  /** Direction-adjusted change, scaled. Positive means better. */
  improvement_scaled: number;
  improvement_abs_scaled: number;
  /** Display values, unscaled. */
  delta: number;
  improvement: number;
  improvement_abs: number;
  /**
   * Unsigned percentage change to 1 decimal, rounded half away from zero.
   * null when baseline is 0. SPEC.md 5.3.4.
   */
  pct: number | null;
  direction_label: DirectionLabel;
}

/**
 * SPEC.md 5.3.4: pct to one decimal, rounded half away from zero, computed
 * from the scaled integers so the ratio is exact before rounding.
 * Returned as tenths of a percent.
 */
function pctTenths(improvementAbsScaled: number, baselineScaled: number): number | null {
  if (baselineScaled === 0) return null;
  const numerator = improvementAbsScaled * 1000;
  const denominator = Math.abs(baselineScaled);
  if (!Number.isSafeInteger(numerator)) {
    // Falls back to float only for values far outside every valid range. [A]
    const pct = (improvementAbsScaled / denominator) * 100;
    return Math.sign(pct) * Math.round(Math.abs(pct) * 10);
  }
  const whole = Math.floor(numerator / denominator);
  const remainder = numerator - whole * denominator;
  return remainder * 2 >= denominator ? whole + 1 : whole;
}

/**
 * SPEC.md 5.3. Inputs are scaled integers. `direction` is applied here and
 * nowhere else.
 */
export function calculateChange(
  direction: Direction,
  baselineScaled: number,
  currentScaled: number,
  decimals: number,
): ChangeResult {
  const deltaScaled = currentScaled - baselineScaled;
  const improvementScaled = direction === "higher" ? deltaScaled : -deltaScaled;
  const improvementAbsScaled = Math.abs(improvementScaled);

  const tenths = pctTenths(improvementAbsScaled, baselineScaled);

  const directionLabel: DirectionLabel =
    improvementScaled > 0 ? "improved" : improvementScaled < 0 ? "declined" : "unchanged";

  return {
    delta_scaled: deltaScaled,
    improvement_scaled: improvementScaled,
    improvement_abs_scaled: improvementAbsScaled,
    delta: fromScaled(deltaScaled, decimals),
    improvement: fromScaled(improvementScaled, decimals),
    improvement_abs: fromScaled(improvementAbsScaled, decimals),
    pct: tenths === null ? null : tenths / 10,
    direction_label: directionLabel,
  };
}
