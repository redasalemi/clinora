/**
 * Token grammar, token map builder, required sentences. SPEC.md 5.9.
 *
 * Pure: builds the token map and prompt inputs from the draft and the
 * already-computed engine results. No I/O, no AI call — that lives in
 * apps/web (the actual Bedrock invocation is not this package's job).
 *
 * [A] NOT-NOW.md item 6 overrides SPEC.md 5.9's S1..Sn/`phrase` token group:
 * supports are one free-text field, one token `[[S.text]]`, the same shape
 * as barriers/risks/recommendations. Per CLAUDE.md, NOT-NOW.md wins on a
 * conflict with SPEC.md, so S1..Sn/phrase is not built here.
 */

import { getMeasure, type TestId } from "../../../data/measures";
import {
  evaluateMeasures,
  type MeasureEvaluation,
  type MeasureInput,
} from "./classify";
import { evaluateGaps, type GapBarrier, type GapGoal, type GapMeasure } from "./gaps";
import { formatValue } from "./change";
import { populationLabel, type ThresholdFile } from "./thresholds";
import type { GoalStatus, ParticipantContext } from "./types";

export interface TokenGoal {
  uid: string;
  ndis_goal_text: string;
  therapy_goal_text: string;
  /**
   * Required (not null) by generation time — SPEC.md 4's notes say a goal
   * with status === null fails form validation before the gap screen and
   * never reaches this point. [A]
   */
  status: GoalStatus;
  linked_measure_uids: readonly string[];
}

export interface TokenMeasureInput {
  uid: string;
  test_id: TestId;
  baseline_value: number | null;
  baseline_date: string | null; // YYYY-MM-DD
  current_value: number;
  current_date: string; // YYYY-MM-DD
  same_conditions: boolean | null;
}

export interface TokenBarrier {
  uid: string;
  text: string;
  goal_uids: readonly string[];
}

export interface TokenRisk {
  uid: string;
  text: string;
}

export interface TokenRecommendation {
  uid: string;
  text: string;
  goal_uids: readonly string[];
}

export interface GenerationDraft {
  period: { start: string; end: string }; // YYYY-MM-DD
  /** [A] NOT-NOW.md item 6: one free-text field, 1-1000 chars, token [[S.text]]. */
  supports_text: string;
  goals: readonly TokenGoal[];
  measures: readonly TokenMeasureInput[];
  barriers: readonly TokenBarrier[];
  risks: readonly TokenRisk[];
  recommendations: readonly TokenRecommendation[];
  /** Split into N1..Nk by splitShorthandLines. */
  shorthand: string;
}

export interface RequiredSentence {
  step: 1 | 2 | 3 | 4 | 5 | 6;
  /** Exact string the model must include verbatim in this step (SPEC 5.9). */
  text: string;
}

/** SPEC.md US-06: split on newlines into non-empty (post-trim) lines, max 100. */
export function splitShorthandLines(shorthand: string): string[] {
  return shorthand
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 100);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** SPEC.md 5.8: dates as "D MMM YYYY" (en-AU). Parsed as plain text, never
 *  through `Date`, so no timezone can shift the day. */
export function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new Error(`formatDate: expected YYYY-MM-DD, got "${isoDate}"`);
  }
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) {
    throw new Error(`formatDate: month out of range in "${isoDate}"`);
  }
  return `${Number(day)} ${monthName} ${year}`;
}

/** "partially_achieved" -> "partially achieved". SPEC.md 5.9, G ref `status_phrase`. */
function statusPhrase(status: GoalStatus): string {
  return status.replace(/_/g, " ");
}

function refPrefix(tokenKey: string): string {
  const dot = tokenKey.indexOf(".");
  return dot === -1 ? tokenKey : tokenKey.slice(0, dot);
}

export interface PrepareTokensResult {
  /** "G1.label" -> "Goal 1", etc. Every token key the model may cite. */
  tokens: Record<string, string>;
  /** Every valid bare ref a sentence's `sources` may cite (SPEC 5.9). */
  sourceRefs: ReadonlySet<string>;
  requiredSentences: RequiredSentence[];
  /** Positional goal refs in order, e.g. ["G1","G2","G3"]. For V6. */
  goalRefs: string[];
  /** The engine's authoritative per-measure results, for the report UI later. */
  measureEvaluations: MeasureEvaluation[];
}

/**
 * SPEC.md 5.9: assigns M1..Mn, G1..Gn, B1..Bn, R1..Rn, C1..Cn, P (and the
 * NOT-NOW.md item 6 single S ref) by position, and builds the token map the
 * server resolves them from.
 */
export function prepareTokens(
  draft: GenerationDraft,
  context: ParticipantContext,
  thresholds: ThresholdFile,
): PrepareTokensResult {
  const tokens: Record<string, string> = {};

  // --- M1..Mn ---
  const measureInputs: MeasureInput[] = draft.measures.map((m) => ({
    uid: m.uid,
    test_id: m.test_id,
    baseline_value: m.baseline_value,
    current_value: m.current_value,
    same_conditions: m.same_conditions,
  }));
  const measureEvaluations = evaluateMeasures(measureInputs, context, thresholds);

  draft.measures.forEach((measure, index) => {
    const ref = `M${index + 1}`;
    const evaluation = measureEvaluations[index] as MeasureEvaluation;
    const definition = getMeasure(measure.test_id);
    tokens[`${ref}.name`] = definition.name;
    tokens[`${ref}.baseline`] =
      measure.baseline_value === null ? "" : formatValue(measure.baseline_value, definition.decimals);
    tokens[`${ref}.current`] = formatValue(measure.current_value, definition.decimals);
    tokens[`${ref}.baseline_date`] =
      measure.baseline_date === null ? "" : formatDate(measure.baseline_date);
    tokens[`${ref}.current_date`] = formatDate(measure.current_date);
    tokens[`${ref}.change_phrase`] = evaluation.change_phrase;
    tokens[`${ref}.threshold_phrase`] = evaluation.threshold_phrase;
  });

  // --- G1..Gn ---
  const goalRefs: string[] = [];
  draft.goals.forEach((goal, index) => {
    const ref = `G${index + 1}`;
    goalRefs.push(ref);
    tokens[`${ref}.label`] = `Goal ${index + 1}`;
    tokens[`${ref}.text`] = goal.ndis_goal_text;
    tokens[`${ref}.therapy_text`] = goal.therapy_goal_text;
    tokens[`${ref}.status_phrase`] = statusPhrase(goal.status);
  });

  // --- S (NOT-NOW.md item 6: single ref, not S1..Sn) ---
  tokens["S.text"] = draft.supports_text;

  // --- B1..Bn ---
  draft.barriers.forEach((barrier, index) => {
    tokens[`B${index + 1}.text`] = barrier.text;
  });

  // --- R1..Rn ---
  draft.risks.forEach((risk, index) => {
    tokens[`R${index + 1}.text`] = risk.text;
  });

  // --- C1..Cn ---
  draft.recommendations.forEach((recommendation, index) => {
    tokens[`C${index + 1}.text`] = recommendation.text;
  });

  // --- P ---
  tokens["P.start"] = formatDate(draft.period.start);
  tokens["P.end"] = formatDate(draft.period.end);

  // --- Required sentences (SPEC 5.9) ---
  // Goal-has-no-measure reuses gap rule R1's exact condition (SPEC 4), so
  // the required sentence and the gap flag can never disagree.
  const gapGoals: GapGoal[] = draft.goals.map((g) => ({
    uid: g.uid,
    status: g.status,
    linked_measure_uids: g.linked_measure_uids,
  }));
  const gapMeasures: GapMeasure[] = draft.measures.map((m) => ({
    uid: m.uid,
    test_id: m.test_id,
    baseline_value: m.baseline_value,
    same_conditions: m.same_conditions,
  }));
  const gapBarriers: GapBarrier[] = draft.barriers.map((b) => ({
    uid: b.uid,
    goal_uids: b.goal_uids,
  }));
  const goalUidsWithNoMeasure = new Set(
    evaluateGaps({ goals: gapGoals, measures: gapMeasures, barriers: gapBarriers })
      .filter((flag) => flag.rule_id === "R1")
      .map((flag) => flag.target_uid),
  );

  const requiredSentences: RequiredSentence[] = [];
  if (draft.measures.every((m) => m.baseline_value === null)) {
    requiredSentences.push({ step: 1, text: "No baseline measures were recorded." });
  }
  draft.goals.forEach((goal, index) => {
    if (!goalUidsWithNoMeasure.has(goal.uid)) return;
    requiredSentences.push({ step: 3, text: `[[G${index + 1}.label]] has no linked measure.` });
  });
  if (draft.barriers.length === 0) {
    requiredSentences.push({ step: 4, text: "No barriers were recorded for this reporting period." });
  }
  if (draft.risks.length === 0) {
    requiredSentences.push({ step: 5, text: "No risks were recorded for this reporting period." });
  }
  if (draft.recommendations.length === 0) {
    requiredSentences.push({
      step: 6,
      text: "No recommendations were recorded by the clinician.",
    });
  }

  // --- Source refs (SPEC 5.9: "M, G, S, B, R, C, P, N1..Nk, and SYS") ---
  const shorthandLines = splitShorthandLines(draft.shorthand);
  const sourceRefs = new Set<string>();
  for (const key of Object.keys(tokens)) sourceRefs.add(refPrefix(key));
  for (let i = 1; i <= shorthandLines.length; i++) sourceRefs.add(`N${i}`);
  sourceRefs.add("SYS");

  return { tokens, sourceRefs, requiredSentences, goalRefs, measureEvaluations };
}

// Re-exported for prompt-building, which needs the population label alongside
// the participant context (measure evaluations already carry threshold rows).
export { populationLabel };
