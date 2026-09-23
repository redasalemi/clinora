import { describe, expect, it } from "vitest";

import fakeThresholdsJson from "../../../test/fixtures/fake-thresholds.json";
import { parseThresholdFile } from "./thresholds";
import { prepareTokens, type GenerationDraft } from "./tokens";
import { buildPromptContext, buildRetrySystemPrompt, buildSystemPrompt } from "./prompt";
import type { ParticipantContext } from "./types";

const FAKE_THRESHOLDS = parseThresholdFile(fakeThresholdsJson, "fake-thresholds.json");
const CONTEXT: ParticipantContext = { age_band: "65-74", population_code: "test_population_a" };

// Small, clearly-fake draft with one of everything, purpose-built for prompt tests.
const DRAFT: GenerationDraft = {
  // Deliberately distinct from the measure's baseline/current dates below,
  // so the "period is visible, per-measure dates are not" tests actually
  // distinguish the two rather than coincidentally matching.
  period: { start: "2026-01-01", end: "2026-09-01" },
  supports_text: "Individual exercise physiology, 2 times per week, 60 minutes per session.",
  goals: [
    {
      uid: "g1",
      ndis_goal_text: "I want to walk to the shops.",
      therapy_goal_text: "Increase community walking endurance.",
      status: "partially_achieved",
      linked_measure_uids: ["m1"],
    },
  ],
  measures: [
    {
      uid: "m1",
      test_id: "TUG",
      baseline_value: 20.0,
      baseline_date: "2026-03-02",
      current_value: 15.0,
      current_date: "2026-08-24",
      same_conditions: true,
    },
  ],
  barriers: [{ uid: "b1", text: "Fear of falling limits outdoor practice.", goal_uids: ["g1"] }],
  risks: [{ uid: "r1", text: "Ongoing falls risk on uneven ground." }],
  recommendations: [
    { uid: "c1", text: "Continue individual sessions.", goal_uids: ["g1"] },
  ],
  shorthand: "TUG improved, no aid indoors\nPt motivated",
};

function buildPrompt(): string {
  const prepared = prepareTokens(DRAFT, CONTEXT, FAKE_THRESHOLDS);
  const context = buildPromptContext(DRAFT, prepared);
  return buildSystemPrompt(context);
}

describe("buildPromptContext", () => {
  it("resolves each goal's linked measures to their positional refs, not uids", () => {
    const prepared = prepareTokens(DRAFT, CONTEXT, FAKE_THRESHOLDS);
    const context = buildPromptContext(DRAFT, prepared);
    expect(context.goals[0]?.linkedMeasureRefs).toEqual(["M1"]);
  });

  it("converts goal status to a spaced phrase", () => {
    const prepared = prepareTokens(DRAFT, CONTEXT, FAKE_THRESHOLDS);
    const context = buildPromptContext(DRAFT, prepared);
    expect(context.goals[0]?.status_phrase).toBe("partially achieved");
  });

  it("carries the measure's class and direction label, not its values", () => {
    const prepared = prepareTokens(DRAFT, CONTEXT, FAKE_THRESHOLDS);
    const context = buildPromptContext(DRAFT, prepared);
    expect(context.measures[0]?.class).toBe("IMPROVED_BEYOND_THRESHOLD");
    expect(context.measures[0]?.direction_label).toBe("improved");
  });

  it("recovers the shorthand lines in order", () => {
    const prepared = prepareTokens(DRAFT, CONTEXT, FAKE_THRESHOLDS);
    const context = buildPromptContext(DRAFT, prepared);
    expect(context.shorthandLines).toEqual(["TUG improved, no aid indoors", "Pt motivated"]);
  });
});

describe("buildSystemPrompt: P1-P7 are each present (SPEC 5.9)", () => {
  const prompt = buildPrompt();

  it("P1: six sections in order, third person register", () => {
    expect(prompt).toMatch(/six/i);
    expect(prompt).toContain("1. Baseline capacity");
    expect(prompt).toContain("6. Recommendations");
    expect(prompt.toLowerCase()).toContain("third person");
    expect(prompt).toContain("the participant");
  });

  it("P2: numbers/dates/test names/goal labels/clinician text must be tokens only", () => {
    expect(prompt).toContain("[[ref.field]]");
    expect(prompt).toContain("Never type a digit");
    expect(prompt).toContain("number word");
  });

  it("P3: no diagnosis, no AI-originated recommendations", () => {
    expect(prompt.toLowerCase()).toContain("do not diagnose");
    expect(prompt.toLowerCase()).toContain("never originate");
  });

  it("P4: per-step content rules are stated", () => {
    expect(prompt).toContain("Step 1 summarises baseline capacity");
    expect(prompt).toContain("Step 2 lists the measures used with their dates");
    expect(prompt).toContain("Step 3 covers every goal in order");
  });

  it('P5: banned words are explicitly named (H7 wording)', () => {
    expect(prompt).toContain("clinically significant");
    expect(prompt).toContain("compliant");
    expect(prompt).toContain("funding outcomes");
  });

  it("P6: JSON-only, matches the exact schema, no markdown fences", () => {
    expect(prompt).toContain("Output JSON only");
    expect(prompt).toContain("No markdown code fences");
    expect(prompt).toContain(
      '{ "sections": [ { "step": 1..6, "sentences": [ { "text": string, "sources": string[] } ] } ] }',
    );
  });

  it("P7: required sentences are listed verbatim, with an instruction not to paraphrase", () => {
    // This draft's goal has a linked measure, barriers/risks/recommendations
    // all present, and a baseline is recorded — nothing is required here.
    expect(prompt).toContain("do not paraphrase");
    expect(prompt).toContain("(none required for this report)");
  });

  it("P7 with a required sentence: it appears verbatim in the prompt", () => {
    const noBarriersDraft: GenerationDraft = { ...DRAFT, barriers: [] };
    const prepared = prepareTokens(noBarriersDraft, CONTEXT, FAKE_THRESHOLDS);
    const context = buildPromptContext(noBarriersDraft, prepared);
    const withGap = buildSystemPrompt(context);
    expect(withGap).toContain("No barriers were recorded for this reporting period.");
  });
});

describe("buildSystemPrompt: what the model sees (SPEC 5.9)", () => {
  const prompt = buildPrompt();

  it("shows goal text and status verbatim", () => {
    expect(prompt).toContain("I want to walk to the shops.");
    expect(prompt).toContain("Increase community walking endurance.");
    expect(prompt).toContain("partially achieved");
  });

  it("shows barrier, risk and recommendation text verbatim", () => {
    expect(prompt).toContain("Fear of falling limits outdoor practice.");
    expect(prompt).toContain("Ongoing falls risk on uneven ground.");
    expect(prompt).toContain("Continue individual sessions.");
  });

  it("shows the shorthand lines verbatim, as N-refs", () => {
    expect(prompt).toContain('N1: "TUG improved, no aid indoors"');
    expect(prompt).toContain('N2: "Pt motivated"');
  });

  it("never contains the measure's baseline or current value", () => {
    expect(prompt).not.toContain("20.0");
    expect(prompt).not.toContain("15.0");
  });

  it("never contains the measure's baseline_date or current_date value", () => {
    expect(prompt).not.toContain("2 Mar 2026");
    expect(prompt).not.toContain("24 Aug 2026");
  });

  it("shows the report period dates (SPEC 5.9 explicitly lists 'period' as visible)", () => {
    // Resolved P.start/P.end, distinct from the per-measure dates above.
    expect(prompt).toContain("1 Jan 2026");
    expect(prompt).toContain("1 Sep 2026");
  });
});

describe("buildRetrySystemPrompt (SPEC 5.9: retry once, no content, just failed codes)", () => {
  it("keeps the original prompt and appends the failed codes", () => {
    const base = "BASE PROMPT TEXT";
    const retry = buildRetrySystemPrompt(base, ["V2", "V5"]);
    expect(retry).toContain(base);
    expect(retry).toContain("V2");
    expect(retry).toContain("V5");
    expect(retry.indexOf(base)).toBe(0); // original prompt is preserved, not replaced
  });

  it("does not embed any previous model output text", () => {
    const base = "BASE";
    const retry = buildRetrySystemPrompt(base, ["V3"]);
    // The only new content is the failed-codes note, not any echoed content.
    expect(retry.replace(base, "")).not.toMatch(/"sections"/);
  });
});
