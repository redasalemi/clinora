/**
 * Gap checker. SPEC.md section 4.
 *
 * R1 to R4 only. R5 (REC_NOT_LINKED) and R6 (SUPPORT_MISSING_FREQ_OR_DURATION)
 * are cut per NOT-NOW.md item 6 ("neither rule touches the number chain") —
 * do not add them here without checking NOT-NOW.md again first.
 *
 * Pure: reads the draft's goals, measures and barriers, returns flags. No I/O.
 */

import { getMeasure, type TestId } from "../../../data/measures";
import type { GoalStatus } from "./types";

export type RuleId = "R1" | "R2" | "R3" | "R4";
export type Severity = "critical" | "non-critical";

/** SPEC.md 4: "Output is a flat array of {rule_id, severity, target_uid, target_label, message}". */
export interface Flag {
  rule_id: RuleId;
  severity: Severity;
  target_uid: string;
  target_label: string;
  message: string;
}

/**
 * SPEC.md 4: "Flag key = rule_id + ':' + target_uid (or rule_id + ':report'
 * for report-level flags)." None of R1-R4 produce a report-level flag; the
 * `null` case is implemented for when R5/R6 land (NOT-NOW.md item 6). [A]
 */
export function flagKey(rule_id: RuleId, target_uid: string | null): string {
  return `${rule_id}:${target_uid ?? "report"}`;
}

/** The slice of a goal (SPEC.md 2.2) the gap rules need. */
export interface GapGoal {
  uid: string;
  status: GoalStatus | null;
  linked_measure_uids: readonly string[];
}

/** The slice of a measure (SPEC.md 2.2) the gap rules need. */
export interface GapMeasure {
  uid: string;
  test_id: TestId;
  baseline_value: number | null;
  same_conditions: boolean | null;
}

/** The slice of a barrier (SPEC.md 2.2) the gap rules need. */
export interface GapBarrier {
  uid: string;
  goal_uids: readonly string[];
}

/**
 * The slice of ReportDraft (SPEC.md 2.2) the gap rules need. [A] Not the
 * full draft shape (no supports, recommendations, shorthand, etc.) — those
 * fields don't feed R1-R4, and the full ReportDraft type doesn't exist in
 * the engine yet. A wider draft object (e.g. a whole scenario fixture)
 * satisfies this structurally, extra fields and all.
 */
export interface GapCheckDraft {
  goals: readonly GapGoal[];
  measures: readonly GapMeasure[];
  barriers: readonly GapBarrier[];
}

/** SPEC.md 4, R1 GOAL_NO_MEASURE (critical). */
function evaluateR1(draft: GapCheckDraft): Flag[] {
  const flags: Flag[] = [];
  draft.goals.forEach((goal, index) => {
    const hasMeasure = goal.linked_measure_uids.some((uid) =>
      draft.measures.some((measure) => measure.uid === uid),
    );
    if (hasMeasure) return;
    const target_label = `Goal ${index + 1}`;
    flags.push({
      rule_id: "R1",
      severity: "critical",
      target_uid: goal.uid,
      target_label,
      message: `${target_label} has no linked measure.`,
    });
  });
  return flags;
}

/** SPEC.md 4, R2 MEASURE_NO_BASELINE (critical). */
function evaluateR2(draft: GapCheckDraft): Flag[] {
  const flags: Flag[] = [];
  for (const measure of draft.measures) {
    if (measure.baseline_value !== null) continue;
    const target_label = getMeasure(measure.test_id).name;
    flags.push({
      rule_id: "R2",
      severity: "critical",
      target_uid: measure.uid,
      target_label,
      message: `${target_label} has no baseline value, so change cannot be calculated.`,
    });
  }
  return flags;
}

/** SPEC.md 4, R3 CONDITIONS_CHANGED (non-critical). */
function evaluateR3(draft: GapCheckDraft): Flag[] {
  const flags: Flag[] = [];
  for (const measure of draft.measures) {
    if (measure.same_conditions !== false) continue;
    const target_label = getMeasure(measure.test_id).name;
    flags.push({
      rule_id: "R3",
      severity: "non-critical",
      target_uid: measure.uid,
      target_label,
      message: `${target_label} was measured under different conditions or aids, so the change is not directly comparable.`,
    });
  }
  return flags;
}

/** SPEC.md 4, R4 UNACHIEVED_GOAL_NO_BARRIER (non-critical). */
function evaluateR4(draft: GapCheckDraft): Flag[] {
  const flags: Flag[] = [];
  draft.goals.forEach((goal, index) => {
    if (goal.status !== "partially_achieved" && goal.status !== "not_achieved") return;
    const hasBarrier = draft.barriers.some((barrier) => barrier.goal_uids.includes(goal.uid));
    if (hasBarrier) return;
    const target_label = `Goal ${index + 1}`;
    flags.push({
      rule_id: "R4",
      severity: "non-critical",
      target_uid: goal.uid,
      target_label,
      message: `${target_label} is not fully achieved and has no linked barrier.`,
    });
  });
  return flags;
}

/**
 * SPEC.md 4: "Pure function evaluateGaps(draft) => Flag[]." Evaluation
 * order is R1 to R4 (R5/R6 cut, NOT-NOW.md item 6), then by position within
 * each rule, exactly as "Evaluation order: R1 to R6, then by position" says.
 */
export function evaluateGaps(draft: GapCheckDraft): Flag[] {
  return [
    ...evaluateR1(draft),
    ...evaluateR2(draft),
    ...evaluateR3(draft),
    ...evaluateR4(draft),
  ];
}
