/**
 * Classification and phrase generation. SPEC.md 5.5.
 *
 * Deterministic code produces every number and every phrase here. No AI
 * touches this. H7: no pass/fail verdict word beyond the phrases below.
 */

import { getMeasure, type MeasureDefinition, type TestId } from "../../../data/measures";
import { calculateChange, formatPct, formatValue, toScaled, type ChangeResult } from "./change";
import { matchThreshold, type ThresholdFile, type ThresholdRow } from "./thresholds";
import { populationLabel } from "./thresholds";
import type { ChangeClass, DirectionLabel, ParticipantContext } from "./types";

/** Tolerance for the threshold comparison. SPEC.md 5.5. */
export const THRESHOLD_TOLERANCE = 1e-9;

export interface MeasureInput {
  uid?: string;
  test_id: TestId;
  baseline_value: number | null;
  current_value: number;
  /** null is treated as "not explicitly different". SPEC.md 5.5 row 2. [A] */
  same_conditions: boolean | null;
}

export interface MeasureEvaluation {
  uid: string | null;
  test_id: TestId;
  measure: MeasureDefinition;
  class: ChangeClass;
  /** null when there is no baseline. */
  change: ChangeResult | null;
  improvement: number | null;
  improvement_abs: number | null;
  pct: number | null;
  direction_label: DirectionLabel | null;
  threshold_row_id: string | null;
  threshold_row: ThresholdRow | null;
  change_phrase: string;
  threshold_phrase: string;
}

export const NO_BASELINE_PHRASE = "no baseline was recorded, so change cannot be calculated";

export const NOT_COMPARABLE_PHRASE =
  "measured under different conditions, so the change is not directly comparable";

export const NO_VERIFIED_THRESHOLD_PHRASE =
  "for which no verified change threshold is available for this population";

/** SPEC.md 5.5, change phrase for rows 2 to 6. */
export function buildChangePhrase(change: ChangeResult, measure: MeasureDefinition): string {
  if (change.improvement_scaled === 0) return "no change";
  const word = change.improvement_scaled > 0 ? "an improvement" : "a decline";
  const amount = `${formatValue(change.improvement_abs, measure.decimals)} ${measure.unit}`;
  if (change.pct === null) return `${word} of ${amount}`;
  return `${word} of ${amount} (${formatPct(change.pct)}%)`;
}

function thresholdDescriptor(
  row: ThresholdRow,
  measure: MeasureDefinition,
  file: ThresholdFile,
): string {
  const value = formatValue(row.value, measure.decimals);
  const label = populationLabel(file, row.population_code);
  return `the published ${row.metric} of ${value} ${measure.unit} for ${label} (${row.citation})`;
}

/** SPEC.md 5.5 rows 4 and 5. */
export function buildExceedsPhrase(
  row: ThresholdRow,
  measure: MeasureDefinition,
  file: ThresholdFile,
): string {
  return `which exceeds ${thresholdDescriptor(row, measure, file)}`;
}

/**
 * SPEC.md 5.5 row 6. The table there only spells out MDC95 and MCID wording;
 * MDC90 is an MDC statistic too (a minimal-detectable-change bound, just at
 * 90% rather than 95% confidence — SPEC.md 2.3), so it gets the same
 * measurement-error wording as MDC95, not the MCID wording, which is about
 * clinical meaningfulness rather than measurement noise. [A]
 */
export function buildWithinPhrase(
  row: ThresholdRow,
  measure: MeasureDefinition,
  file: ThresholdFile,
): string {
  const tail =
    row.metric === "MDC95" || row.metric === "MDC90"
      ? "so it cannot be distinguished from measurement error"
      : "so it is below the published threshold for meaningful change";
  return `which does not exceed ${thresholdDescriptor(row, measure, file)}, ${tail}`;
}

/**
 * SPEC.md 5.5: strict "greater than", with the scaled improvement converted
 * back to a number and compared using a 1e-9 tolerance.
 */
export function exceedsThreshold(improvementAbs: number, thresholdValue: number): boolean {
  return improvementAbs - thresholdValue > THRESHOLD_TOLERANCE;
}

/**
 * Evaluate one measure against the participant context and a threshold file.
 * Pure: the caller supplies the threshold file, so tests can pass fixtures.
 */
export function evaluateMeasure(
  input: MeasureInput,
  context: ParticipantContext,
  thresholds: ThresholdFile,
): MeasureEvaluation {
  const measure = getMeasure(input.test_id);
  const uid = input.uid ?? null;

  // Threshold matching depends only on the test, population and age band, so
  // it runs even when the change itself cannot be used. [A]
  const thresholdRow = matchThreshold(
    {
      test_id: input.test_id,
      population_code: context.population_code,
      age_band: context.age_band,
    },
    thresholds,
  );

  const base = {
    uid,
    test_id: input.test_id,
    measure,
    threshold_row_id: thresholdRow?.id ?? null,
    threshold_row: thresholdRow,
  };

  // Precedence row 1.
  if (input.baseline_value === null) {
    return {
      ...base,
      class: "NO_BASELINE",
      change: null,
      improvement: null,
      improvement_abs: null,
      pct: null,
      direction_label: null,
      change_phrase: NO_BASELINE_PHRASE,
      threshold_phrase: "",
    };
  }

  const change = calculateChange(
    measure.direction,
    toScaled(input.baseline_value, measure.decimals),
    toScaled(input.current_value, measure.decimals),
    measure.decimals,
  );

  const withChange = {
    ...base,
    change,
    improvement: change.improvement,
    improvement_abs: change.improvement_abs,
    pct: change.pct,
    direction_label: change.direction_label,
    change_phrase: buildChangePhrase(change, measure),
  };

  // Precedence row 2.
  if (input.same_conditions === false) {
    return { ...withChange, class: "NOT_COMPARABLE", threshold_phrase: NOT_COMPARABLE_PHRASE };
  }

  // Precedence row 3.
  if (thresholdRow === null) {
    return {
      ...withChange,
      class: "NO_VERIFIED_THRESHOLD",
      threshold_phrase: NO_VERIFIED_THRESHOLD_PHRASE,
    };
  }

  const exceeds = exceedsThreshold(change.improvement_abs, thresholdRow.value);

  // Precedence row 4.
  if (exceeds && change.improvement_scaled > 0) {
    return {
      ...withChange,
      class: "IMPROVED_BEYOND_THRESHOLD",
      threshold_phrase: buildExceedsPhrase(thresholdRow, measure, thresholds),
    };
  }

  // Precedence row 5.
  if (exceeds && change.improvement_scaled < 0) {
    return {
      ...withChange,
      class: "DECLINED_BEYOND_THRESHOLD",
      threshold_phrase: buildExceedsPhrase(thresholdRow, measure, thresholds),
    };
  }

  // Precedence row 6.
  return {
    ...withChange,
    class: "WITHIN_THRESHOLD",
    threshold_phrase: buildWithinPhrase(thresholdRow, measure, thresholds),
  };
}

export function evaluateMeasures(
  inputs: readonly MeasureInput[],
  context: ParticipantContext,
  thresholds: ThresholdFile,
): MeasureEvaluation[] {
  return inputs.map((input) => evaluateMeasure(input, context, thresholds));
}
