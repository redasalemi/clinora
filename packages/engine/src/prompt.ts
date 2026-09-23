/**
 * System prompt construction. SPEC.md 5.9 "System prompt requirements"
 * (P1-P7) and "What the model sees".
 *
 * [A] Design principle for what's shown to the model, beyond the two things
 * 5.9 states explicitly (goal texts/statuses are shown; baseline/current
 * *values* are not): the model is given only what it needs to choose the
 * right phrasing and weave clinician-authored text into prose — classes,
 * direction labels, link structure, and verbatim text fields. It is never
 * given a measure's baseline/current value or either per-measure date
 * (baseline_date/current_date); it writes sentence structure around the
 * token names blind to those values, which is the actual point of the
 * locked-token design (H6) — the fewer real values the model sees, the
 * less there is to leak into free text. Test names are shown (not
 * numeric, not sensitive, and needed to write coherent step-2 prose);
 * report period dates are shown, since 5.9 explicitly lists "period" as
 * visible.
 *
 * Pure: returns prompt strings. No I/O, no AI call.
 */

import type { MeasureEvaluation } from "./classify";
import type { ChangeClass, DirectionLabel } from "./types";
import { splitShorthandLines, type GenerationDraft, type PrepareTokensResult, type RequiredSentence } from "./tokens";

export interface PromptGoalContext {
  ref: string; // "G1"
  ndis_goal_text: string;
  therapy_goal_text: string;
  status_phrase: string;
  linkedMeasureRefs: string[]; // ["M1", "M3"]
}

export interface PromptMeasureContext {
  ref: string; // "M1"
  name: string;
  class: ChangeClass;
  direction_label: DirectionLabel | null; // null only for the NO_BASELINE class
}

export interface PromptTextContext {
  ref: string; // "B1" | "R1" | "C1"
  text: string;
}

export interface PromptContext {
  goals: PromptGoalContext[];
  measures: PromptMeasureContext[];
  supportsText: string;
  barriers: PromptTextContext[];
  risks: PromptTextContext[];
  recommendations: PromptTextContext[];
  shorthandLines: string[]; // N1.. in order
  requiredSentences: RequiredSentence[];
  /** SPEC.md 5.9 explicitly lists "period" as visible, unlike measure dates. */
  periodStart: string;
  periodEnd: string;
}

/** Builds the prompt-facing context from the draft and its prepared tokens. */
export function buildPromptContext(
  draft: GenerationDraft,
  prepared: PrepareTokensResult,
): PromptContext {
  const measureRefByUid = new Map<string, string>();
  draft.measures.forEach((measure, index) => {
    measureRefByUid.set(measure.uid, `M${index + 1}`);
  });

  const measures: PromptMeasureContext[] = draft.measures.map((measure, index) => {
    const evaluation = prepared.measureEvaluations[index] as MeasureEvaluation;
    return {
      ref: `M${index + 1}`,
      name: evaluation.measure.name,
      class: evaluation.class,
      direction_label: evaluation.direction_label,
    };
  });

  const goals: PromptGoalContext[] = draft.goals.map((goal, index) => ({
    ref: `G${index + 1}`,
    ndis_goal_text: goal.ndis_goal_text,
    therapy_goal_text: goal.therapy_goal_text,
    status_phrase: goal.status.replace(/_/g, " "),
    linkedMeasureRefs: goal.linked_measure_uids
      .map((uid) => measureRefByUid.get(uid))
      .filter((ref): ref is string => ref !== undefined),
  }));

  const barriers = draft.barriers.map((barrier, index) => ({
    ref: `B${index + 1}`,
    text: barrier.text,
  }));
  const risks = draft.risks.map((risk, index) => ({ ref: `R${index + 1}`, text: risk.text }));
  const recommendations = draft.recommendations.map((recommendation, index) => ({
    ref: `C${index + 1}`,
    text: recommendation.text,
  }));

  return {
    goals,
    measures,
    supportsText: draft.supports_text,
    barriers,
    risks,
    recommendations,
    shorthandLines: splitShorthandLines(draft.shorthand),
    requiredSentences: prepared.requiredSentences,
    periodStart: prepared.tokens["P.start"] ?? "",
    periodEnd: prepared.tokens["P.end"] ?? "",
  };
}

const STEP_NAMES: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: "Baseline capacity",
  2: "Measures used",
  3: "Progress toward goals",
  4: "Barriers",
  5: "Risks",
  6: "Recommendations",
};

/** SPEC.md 5.9: the JSON-only output schema, restated for the model. */
const OUTPUT_SCHEMA_TEXT = `{ "sections": [ { "step": 1..6, "sentences": [ { "text": string, "sources": string[] } ] } ] }`;

/**
 * SPEC.md 5.9: builds the full system prompt — P1 to P7, the context the
 * model is given (see the module doc comment for what's included and why),
 * and the output schema.
 */
export function buildSystemPrompt(context: PromptContext): string {
  const tokenGrammarLines = [
    "Token grammar: a token looks exactly like [[ref.field]] — for example [[M1.change_phrase]] or [[G2.label]]. Never write a digit, a date, a test name, a goal label, or any clinician-entered text directly. Write it only as a [[ref.field]] token from the list below.",
    "",
    "Available refs and their fields:",
    "  M<n> (one per measure used): name, baseline, current, baseline_date, current_date, change_phrase, threshold_phrase",
    "  G<n> (one per goal): label, text, therapy_text, status_phrase",
    "  S (one, covering all supports delivered): text",
    "  B<n> (one per barrier): text",
    "  R<n> (one per risk): text",
    "  C<n> (one per recommendation): text",
    "  P (the reporting period): start, end",
  ].join("\n");

  const measureLines = context.measures.length
    ? context.measures
        .map(
          (m) =>
            `  ${m.ref}: "${m.name}" — class ${m.class}, direction ${m.direction_label ?? "n/a (no baseline)"}.`,
        )
        .join("\n")
    : "  (none)";

  const goalLines = context.goals.length
    ? context.goals
        .map((g) => {
          const linked = g.linkedMeasureRefs.length ? g.linkedMeasureRefs.join(", ") : "none";
          return (
            `  ${g.ref} (status: ${g.status_phrase}):\n` +
            `    NDIS goal: "${g.ndis_goal_text}"\n` +
            `    Therapy goal: "${g.therapy_goal_text}"\n` +
            `    Linked measures: ${linked}`
          );
        })
        .join("\n")
    : "  (none)";

  const listLines = (label: string, items: PromptTextContext[]): string =>
    items.length
      ? items.map((item) => `  ${item.ref}: "${item.text}"`).join("\n")
      : `  (no ${label} recorded)`;

  const shorthandLines = context.shorthandLines.length
    ? context.shorthandLines.map((line, i) => `  N${i + 1}: "${line}"`).join("\n")
    : "  (none)";

  const requiredSentenceLines = context.requiredSentences.length
    ? context.requiredSentences
        .map((s) => `  Step ${s.step} (${STEP_NAMES[s.step]}): "${s.text}"`)
        .join("\n")
    : "  (none required for this report)";

  return [
    "You are drafting a clinical progress report for an NDIS exercise physiologist, in six numbered steps.",
    "",
    // P1
    `P1. Write exactly six sections, steps 1 to 6, in this order: ${Object.entries(STEP_NAMES)
      .map(([step, name]) => `${step}. ${name}`)
      .join(", ")}. Write in third person clinical register — refer to "the participant", never "you" or a name.`,
    "",
    // P2
    "P2. Every number, date, test name, goal label and clinician-entered piece of text must appear only as a [[...]] token from the list below. Never type a digit. Never type a number word (\"three\", \"twenty\") either.",
    "",
    tokenGrammarLines,
    "",
    // P3
    "P3. Do not diagnose. Do not recommend supports, hours, or treatment, and do not add any recommendation of your own — recommendations come only from the clinician's own text via [[C<n>.text]] tokens. In step 6, you may only frame the clinician's own recommendations; never originate one.",
    "",
    // P4
    "P4. Section content: Step 1 summarises baseline capacity using the available baseline tokens. Step 2 lists the measures used with their dates. Step 3 covers every goal in order, using its status and its linked measures' change_phrase and threshold_phrase tokens. Steps 4 to 6 cover barriers, risks and recommendations respectively.",
    "",
    // P5
    'P5. Never use the words "clinically significant", "compliant", or any claim about funding outcomes.',
    "",
    // P6
    "P6. Output JSON only, matching this schema exactly. No markdown code fences, no commentary before or after the JSON.",
    "",
    OUTPUT_SCHEMA_TEXT,
    "",
    'Each sentence has "sources": the refs (e.g. "G1", "M2", "N3") that sentence draws on. Cite every ref you actually used.',
    "",
    // P7
    "P7. The following sentences are required. Include each one exactly as written, verbatim, as one of the sentences in the named step — do not paraphrase them:",
    "",
    requiredSentenceLines,
    "",
    "--- Report context ---",
    "",
    `Reporting period: ${context.periodStart} to ${context.periodEnd}. Refer to it only via [[P.start]] and [[P.end]].`,
    "",
    "Measures used, with their calculated classification (not their values):",
    measureLines,
    "",
    "Goals, in order:",
    goalLines,
    "",
    `Supports delivered (S): "${context.supportsText}"`,
    "",
    "Barriers:",
    listLines("barriers", context.barriers),
    "",
    "Risks:",
    listLines("risks", context.risks),
    "",
    "Recommendations (clinician-authored):",
    listLines("recommendations", context.recommendations),
    "",
    "Clinician shorthand notes:",
    shorthandLines,
  ].join("\n");
}

/**
 * SPEC.md 5.9: "On any failure: retry once with the failed rule codes (no
 * content) appended to the prompt." — the previous attempt's text is never
 * echoed back, only which checks it failed.
 */
export function buildRetrySystemPrompt(basePrompt: string, failedCodes: readonly string[]): string {
  return [
    basePrompt,
    "",
    "--- Retry ---",
    "",
    `Your previous attempt failed these checks: ${failedCodes.join(", ")}. Follow every rule above exactly and produce a fresh, fully compliant response.`,
  ].join("\n");
}
