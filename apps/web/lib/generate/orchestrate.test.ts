import { describe, expect, it, vi } from "vitest";
import type { GenerationDraft, ParticipantContext, ThresholdFile } from "@clinora/engine";
import { runGeneration } from "./orchestrate";

const CONTEXT: ParticipantContext = { age_band: "65-74", population_code: "test_population_a" };

const THRESHOLDS: ThresholdFile = {
  population_labels: { test_population_a: "FAKE test population A (fixtures only)" },
  rows: [
    {
      id: "FAKE-TUG-01",
      test_id: "TUG",
      population_code: "test_population_a",
      age_bands: null,
      metric: "MDC95",
      value: 3.0,
      citation: "FAKE FIXTURE, NOT A REAL SOURCE",
      url: "",
      verified_by: "FAKE_FIXTURE_NOT_AN_AEP",
      verified_on: "2000-01-01",
      status: "verified",
    },
  ],
};

// One of everything, nothing missing, so no required sentences apply —
// keeps the happy-path mock output simple.
const DRAFT: GenerationDraft = {
  period: { start: "2026-03-02", end: "2026-08-28" },
  supports_text: "Individual exercise physiology, 2 times per week.",
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
  recommendations: [{ uid: "c1", text: "Continue individual sessions.", goal_uids: ["g1"] }],
  shorthand: "TUG improved, no aid indoors",
};

function sentence(text: string, sources: string[] = []) {
  return { text, sources };
}

function happyPathRaw(): string {
  return JSON.stringify({
    sections: [
      { step: 1, sentences: [sentence("Assessed with [[M1.name]] at baseline.", ["M1"])] },
      {
        step: 2,
        sentences: [
          sentence("[[M1.name]] at [[M1.baseline_date]] and [[M1.current_date]].", ["M1"]),
        ],
      },
      {
        step: 3,
        sentences: [
          sentence("[[G1.label]] shows [[M1.change_phrase]], [[M1.threshold_phrase]].", ["G1", "M1"]),
        ],
      },
      { step: 4, sentences: [sentence("Noted: [[B1.text]]", ["B1"])] },
      { step: 5, sentences: [sentence("Noted: [[R1.text]]", ["R1"])] },
      { step: 6, sentences: [sentence("Recommended: [[C1.text]]", ["C1"])] },
    ],
  });
}

function malformedRaw(): string {
  return "not valid json at all";
}

describe("runGeneration", () => {
  it("returns ok:true from a single successful call, without retrying", async () => {
    const callModel = vi.fn().mockResolvedValue(happyPathRaw());
    const result = await runGeneration(DRAFT, CONTEXT, THRESHOLDS, { callModel });
    expect(result.ok).toBe(true);
    expect(callModel).toHaveBeenCalledTimes(1);
    if (!result.ok) return;
    expect(result.sections).toHaveLength(6);
    expect(result.tokens["G1.label"]).toBe("Goal 1");
  });

  it("retries once on a failed first attempt, and succeeds if the retry passes", async () => {
    const callModel = vi
      .fn()
      .mockResolvedValueOnce(malformedRaw())
      .mockResolvedValueOnce(happyPathRaw());
    const result = await runGeneration(DRAFT, CONTEXT, THRESHOLDS, { callModel });
    expect(result.ok).toBe(true);
    expect(callModel).toHaveBeenCalledTimes(2);
  });

  it("the retry prompt names the first attempt's failed codes (SPEC 5.9: no content, just the codes)", async () => {
    const callModel = vi
      .fn()
      .mockResolvedValueOnce(malformedRaw()) // V1 failure: malformed JSON
      .mockResolvedValueOnce(happyPathRaw());
    await runGeneration(DRAFT, CONTEXT, THRESHOLDS, { callModel });
    const retryPrompt = callModel.mock.calls[1]?.[0] as string;
    expect(retryPrompt).toContain("V1");
    expect(retryPrompt).toContain("Your previous attempt failed these checks");
  });

  it("fails after the retry also fails, without a third attempt (502 territory — that's the route's job)", async () => {
    const callModel = vi.fn().mockResolvedValue(malformedRaw());
    const result = await runGeneration(DRAFT, CONTEXT, THRESHOLDS, { callModel });
    expect(result.ok).toBe(false);
    expect(callModel).toHaveBeenCalledTimes(2);
    if (result.ok) return;
    expect(result.failedCodes).toEqual(["V1"]);
  });

  it("reports the *second* attempt's failed codes, not the first's, when they differ", async () => {
    // First attempt: malformed JSON (V1). Retry: valid JSON but step 6 cites
    // a foreign token (V8).
    const step6Foreign = JSON.stringify({
      sections: [
        { step: 1, sentences: [sentence("Assessed with [[M1.name]] at baseline.", ["M1"])] },
        {
          step: 2,
          sentences: [sentence("[[M1.name]] at [[M1.baseline_date]].", ["M1"])],
        },
        {
          step: 3,
          sentences: [sentence("[[G1.label]] shows [[M1.change_phrase]].", ["G1", "M1"])],
        },
        { step: 4, sentences: [sentence("Noted: [[B1.text]]", ["B1"])] },
        { step: 5, sentences: [sentence("Noted: [[R1.text]]", ["R1"])] },
        {
          step: 6,
          sentences: [sentence("Recommended: [[C1.text]], following [[M1.change_phrase]].", ["C1", "M1"])],
        },
      ],
    });
    const callModel = vi
      .fn()
      .mockResolvedValueOnce(malformedRaw())
      .mockResolvedValueOnce(step6Foreign);
    const result = await runGeneration(DRAFT, CONTEXT, THRESHOLDS, { callModel });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failedCodes).toEqual(["V8"]);
  });

  it("defaults to the real Bedrock caller when none is injected (smoke: throws without BEDROCK_MODEL_ID, doesn't crash differently)", async () => {
    const originalEnv = process.env.BEDROCK_MODEL_ID;
    delete process.env.BEDROCK_MODEL_ID;
    try {
      await expect(runGeneration(DRAFT, CONTEXT, THRESHOLDS)).rejects.toThrow(
        "BEDROCK_MODEL_ID is not set",
      );
    } finally {
      if (originalEnv !== undefined) process.env.BEDROCK_MODEL_ID = originalEnv;
    }
  });
});
