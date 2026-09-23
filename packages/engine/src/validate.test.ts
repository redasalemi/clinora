import { describe, expect, it } from "vitest";

import { validateModelOutput, type ValidationContext } from "./validate";

// A small, realistic, fully-consistent token map/context: one goal, one
// measure, one barrier, one risk, one recommendation, two shorthand lines.
// Two required sentences apply (Step 1: no baseline; Step 4: no barriers
// would apply if barriers were empty — here we use a Step-3 "no measure"
// requirement instead, see REQUIRED below) so V5/V7 have something to check
// against a *present* barrier too.
const TOKENS: Record<string, string> = {
  "M1.name": "Timed Up and Go",
  "M1.baseline": "20.0",
  "M1.current": "15.0",
  "M1.baseline_date": "2 Mar 2026",
  "M1.current_date": "24 Aug 2026",
  "M1.change_phrase": "an improvement of 5.0 s (25.0%)",
  "M1.threshold_phrase": "which exceeds the published MDC95 of 3.0 s for FAKE population (FAKE FIXTURE)",
  "G1.label": "Goal 1",
  "G1.text": "I want to walk to the shops.",
  "G1.therapy_text": "Increase community walking endurance.",
  "G1.status_phrase": "partially achieved",
  "S.text": "Individual exercise physiology, 2 times per week.",
  "B1.text": "Fear of falling limits outdoor practice.",
  "R1.text": "Ongoing falls risk on uneven ground.",
  "C1.text": "Continue individual sessions.",
  "P.start": "2 Mar 2026",
  "P.end": "28 Aug 2026",
};

const BASE_CONTEXT: ValidationContext = {
  tokens: TOKENS,
  sourceRefs: new Set(["G1", "M1", "S", "B1", "R1", "C1", "P", "N1", "N2", "SYS"]),
  requiredSentences: [],
  goalRefs: ["G1"],
};

function sentence(text: string, sources: string[] = []) {
  return { text, sources };
}

/** A fully valid, self-consistent model output for BASE_CONTEXT. Every rule passes. */
function happyPathSections() {
  return [
    {
      step: 1,
      sentences: [
        sentence(
          "The participant's baseline was assessed using [[M1.name]] on [[M1.baseline_date]].",
          ["M1"],
        ),
      ],
    },
    {
      step: 2,
      sentences: [
        sentence(
          "[[M1.name]] was administered at baseline on [[M1.baseline_date]] and reassessed on [[M1.current_date]].",
          ["M1"],
        ),
      ],
    },
    {
      step: 3,
      sentences: [
        sentence(
          "[[G1.label]] shows [[M1.change_phrase]], [[M1.threshold_phrase]].",
          ["G1", "M1"],
        ),
      ],
    },
    {
      step: 4,
      sentences: [sentence("The participant reports: [[B1.text]]", ["B1"])],
    },
    {
      step: 5,
      sentences: [sentence("A risk was noted: [[R1.text]]", ["R1"])],
    },
    {
      step: 6,
      sentences: [sentence("The clinician recommends: [[C1.text]]", ["C1"])],
    },
  ];
}

function raw(sections: unknown): string {
  return JSON.stringify({ sections });
}

function happyPathRaw(): string {
  return raw(happyPathSections());
}

describe("validateModelOutput: happy path", () => {
  it("passes when every rule is satisfied, and resolves sources", () => {
    const result = validateModelOutput(happyPathRaw(), BASE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sections).toHaveLength(6);
    expect(result.sections[0]?.step).toBe(1);
    expect(result.sections[5]?.step).toBe(6);
  });

  it("post-processing: sources = model's sources ∪ every ref found in the sentence's tokens", () => {
    const sections = happyPathSections();
    // Step 3's sentence cites only "G1" but its text also uses an M1 token.
    sections[2] = {
      step: 3,
      sentences: [sentence("[[G1.label]] shows [[M1.change_phrase]].", ["G1"])],
    };
    const result = validateModelOutput(raw(sections), BASE_CONTEXT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sections[2]?.sentences[0]?.sources.sort()).toEqual(["G1", "M1"]);
  });
});

describe("V1: valid JSON, matches schema, exactly 6 sections in order, each ≥1 sentence", () => {
  it("fails on malformed JSON", () => {
    const result = validateModelOutput("{not json", BASE_CONTEXT);
    expect(result).toEqual({ ok: false, failed: ["V1"] });
  });

  it("fails on markdown-fenced JSON (P6 violation caught here too)", () => {
    const result = validateModelOutput("```json\n" + happyPathRaw() + "\n```", BASE_CONTEXT);
    expect(result).toEqual({ ok: false, failed: ["V1"] });
  });

  it("fails with fewer than 6 sections", () => {
    const sections = happyPathSections().slice(0, 5);
    expect(validateModelOutput(raw(sections), BASE_CONTEXT)).toEqual({ ok: false, failed: ["V1"] });
  });

  it("fails with sections out of order", () => {
    const sections = happyPathSections();
    const [a, b] = [sections[0], sections[1]];
    sections[0] = b as (typeof sections)[number];
    sections[1] = a as (typeof sections)[number];
    expect(validateModelOutput(raw(sections), BASE_CONTEXT)).toEqual({ ok: false, failed: ["V1"] });
  });

  it("fails when a section has zero sentences", () => {
    const sections = happyPathSections();
    sections[3] = { step: 4, sentences: [] };
    expect(validateModelOutput(raw(sections), BASE_CONTEXT)).toEqual({ ok: false, failed: ["V1"] });
  });

  it("fails when a sentence is missing `sources`", () => {
    // Deliberately malformed: real model output could omit this field, and
    // V1 must catch it, so the test constructs it outside our own types.
    const sections = happyPathSections() as unknown[];
    sections[0] = { step: 1, sentences: [{ text: "No baseline measures were recorded." }] };
    expect(validateModelOutput(raw(sections), BASE_CONTEXT)).toEqual({ ok: false, failed: ["V1"] });
  });

  it("fails when the top level isn't {sections: [...]}", () => {
    expect(validateModelOutput(JSON.stringify([1, 2, 3]), BASE_CONTEXT)).toEqual({
      ok: false,
      failed: ["V1"],
    });
  });
});

describe("V2: every [[...]] matches the grammar and exists in the token map", () => {
  it("fails on malformed token grammar (missing dot)", () => {
    const sections = happyPathSections();
    sections[2] = { step: 3, sentences: [sentence("[[G1 label]] has no measure.", ["G1"])] };
    const result = validateModelOutput(raw(sections), BASE_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failed).toContain("V2");
  });

  it("fails on an unknown ref (SPEC 5.10 crafted case: unknown token)", () => {
    const sections = happyPathSections();
    sections[2] = {
      step: 3,
      sentences: [sentence("[[G1.label]] shows [[Z9.change_phrase]].", ["G1"])],
    };
    const result = validateModelOutput(raw(sections), BASE_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failed).toEqual(["V2"]);
  });

  it("fails on an unknown field for a real ref", () => {
    const sections = happyPathSections();
    sections[2] = {
      step: 3,
      sentences: [sentence("[[G1.nickname]] shows progress.", [])],
    };
    const result = validateModelOutput(raw(sections), BASE_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failed).toContain("V2");
  });
});

describe("V3: after removing all tokens, no digit remains (H6's core check)", () => {
  it("fails when a sentence types a raw number outside any token (SPEC 5.10 crafted case)", () => {
    const sections = happyPathSections();
    sections[0] = {
      step: 1,
      sentences: [sentence("The participant improved by 5 points at baseline.", [])],
    };
    const result = validateModelOutput(raw(sections), BASE_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failed).toEqual(["V3"]);
  });

  it("does not flag digits that are inside a valid token", () => {
    // "M1" itself contains a digit, but it's inside the [[...]] span, which
    // V3 strips entirely before scanning for stray digits.
    const sections = happyPathSections();
    sections[0] = {
      step: 1,
      sentences: [sentence("Assessed with [[M1.name]] at baseline.", ["M1"])],
    };
    const result = validateModelOutput(raw(sections), BASE_CONTEXT);
    expect(result.ok).toBe(true);
  });

  it("strips a malformed bracket span too, so its digits don't double-report as V3", () => {
    const sections = happyPathSections();
    // Step 1, not step 3: step 3 also requires every goal's [[G<n>.label]]
    // (V6), which this sentence doesn't provide — keep this test isolated
    // to V2/V3.
    sections[0] = { step: 1, sentences: [sentence("[[G1 has version 2]] noted.", [])] };
    const result = validateModelOutput(raw(sections), BASE_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // V2 fires (malformed grammar); V3 must not, since the whole bracketed
    // span — digit included — is stripped before the digit scan.
    expect(result.failed).toEqual(["V2"]);
  });
});

describe("V4: every source ref exists", () => {
  it("fails when a sentence cites a source ref that doesn't exist", () => {
    const sections = happyPathSections();
    sections[2] = {
      step: 3,
      sentences: [sentence("[[G1.label]] shows progress.", ["G1", "N99"])],
    };
    const result = validateModelOutput(raw(sections), BASE_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failed).toEqual(["V4"]);
  });

  it("passes when sources cite fewer refs than the sentence's own tokens (union happens after)", () => {
    const sections = happyPathSections();
    sections[2] = {
      step: 3,
      sentences: [sentence("[[G1.label]] shows [[M1.change_phrase]].", [])], // no sources cited at all
    };
    const result = validateModelOutput(raw(sections), BASE_CONTEXT);
    expect(result.ok).toBe(true);
  });
});

describe("V5: every required sentence appears verbatim in its step (SPEC 5.10 crafted case)", () => {
  const context: ValidationContext = {
    ...BASE_CONTEXT,
    requiredSentences: [{ step: 4, text: "No barriers were recorded for this reporting period." }],
  };

  it("passes when the required sentence is present verbatim", () => {
    const sections = happyPathSections();
    sections[3] = {
      step: 4,
      sentences: [sentence("No barriers were recorded for this reporting period.", [])],
    };
    expect(validateModelOutput(raw(sections), context).ok).toBe(true);
  });

  it("fails when the required sentence is missing entirely", () => {
    // happyPathSections' step 4 sentence is about B1, not the required text.
    const result = validateModelOutput(happyPathRaw(), context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failed).toContain("V5");
  });

  it("fails when the required sentence is paraphrased instead of verbatim", () => {
    const sections = happyPathSections();
    sections[3] = {
      step: 4,
      sentences: [sentence("No barriers were recorded during this reporting period.", [])], // "during" not "for"
    };
    const result = validateModelOutput(raw(sections), context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failed).toContain("V5");
  });

  it("fails when the required sentence is present but in the wrong step", () => {
    const sections = happyPathSections();
    sections[4] = {
      step: 5,
      sentences: [
        sentence("A risk was noted: [[R1.text]]", ["R1"]),
        sentence("No barriers were recorded for this reporting period.", []),
      ],
    };
    const result = validateModelOutput(raw(sections), context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failed).toContain("V5");
  });
});

describe("V6: step 3 contains [[G{n}.label]] for every goal", () => {
  it("fails when step 3 never mentions a goal that exists", () => {
    const context: ValidationContext = { ...BASE_CONTEXT, goalRefs: ["G1", "G2"] };
    const sections = happyPathSections();
    // Step 3 only ever mentions G1; G2 is never named.
    const result = validateModelOutput(raw(sections), context);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failed).toContain("V6");
  });

  it("passes when every goal's label token appears somewhere in step 3", () => {
    const context: ValidationContext = {
      ...BASE_CONTEXT,
      tokens: { ...TOKENS, "G2.label": "Goal 2" },
      sourceRefs: new Set([...BASE_CONTEXT.sourceRefs, "G2"]),
      goalRefs: ["G1", "G2"],
    };
    const sections = happyPathSections();
    sections[2] = {
      step: 3,
      sentences: [
        sentence("[[G1.label]] shows [[M1.change_phrase]].", ["G1", "M1"]),
        sentence("[[G2.label]] has no linked measure.", ["G2"]),
      ],
    };
    const result = validateModelOutput(raw(sections), context);
    expect(result.ok).toBe(true);
  });
});

describe("V7: steps 4/5/6 sentences carry B/R/C evidence respectively, or are required", () => {
  it("fails on a step 4 sentence with no B token and no required-sentence match", () => {
    const sections = happyPathSections();
    sections[3] = { step: 4, sentences: [sentence("Barriers were considered.", [])] };
    const result = validateModelOutput(raw(sections), BASE_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failed).toContain("V7");
  });

  it("fails on a step 6 sentence with no C token (SPEC 5.10 crafted case)", () => {
    const sections = happyPathSections();
    sections[5] = { step: 6, sentences: [sentence("The clinician made a recommendation.", [])] };
    const result = validateModelOutput(raw(sections), BASE_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failed).toContain("V7");
  });

  it("passes a step 4/5/6 sentence that is a required sentence, even with no token", () => {
    const context: ValidationContext = {
      ...BASE_CONTEXT,
      requiredSentences: [{ step: 6, text: "No recommendations were recorded by the clinician." }],
    };
    const sections = happyPathSections();
    sections[5] = {
      step: 6,
      sentences: [sentence("No recommendations were recorded by the clinician.", [])],
    };
    const result = validateModelOutput(raw(sections), context);
    expect(result.ok).toBe(true);
  });

  it("does not apply to steps 1-3", () => {
    // A step-1 sentence with no B/R/C-family token is fine; V7 only governs 4-6.
    const sections = happyPathSections();
    sections[0] = { step: 1, sentences: [sentence("Baseline capacity was assessed.", [])] };
    const result = validateModelOutput(raw(sections), BASE_CONTEXT);
    expect(result.ok).toBe(true);
  });
});

describe("V8: step 6 contains no token other than C, G and P tokens", () => {
  it("fails when step 6 uses an M token (SPEC 5.10 crafted case: step 6 with no C token — here, a foreign token)", () => {
    const sections = happyPathSections();
    sections[5] = {
      step: 6,
      sentences: [sentence("[[C1.text]], which follows from [[M1.change_phrase]].", ["C1", "M1"])],
    };
    const result = validateModelOutput(raw(sections), BASE_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failed).toContain("V8");
  });

  it("fails when step 6 uses a B or S token", () => {
    const sections = happyPathSections();
    sections[5] = {
      step: 6,
      sentences: [sentence("[[C1.text]], addressing [[B1.text]].", ["C1", "B1"])],
    };
    const result = validateModelOutput(raw(sections), BASE_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failed).toContain("V8");
  });

  it("passes when step 6 uses only C, G and P tokens", () => {
    const sections = happyPathSections();
    sections[5] = {
      step: 6,
      sentences: [
        sentence(
          "[[C1.text]], supporting [[G1.label]] within the period ending [[P.end]].",
          ["C1", "G1", "P"],
        ),
      ],
    };
    const result = validateModelOutput(raw(sections), BASE_CONTEXT);
    expect(result.ok).toBe(true);
  });

  it("does not apply to steps other than 6", () => {
    const sections = happyPathSections();
    sections[2] = {
      step: 3,
      sentences: [sentence("[[G1.label]] shows [[M1.change_phrase]].", ["G1", "M1"])],
    };
    const result = validateModelOutput(raw(sections), BASE_CONTEXT);
    expect(result.ok).toBe(true);
  });
});

describe("multiple simultaneous failures", () => {
  it("collects every failed code, in V1..V8 order, not just the first", () => {
    const sections = happyPathSections();
    // V3: raw digit outside a token.
    sections[0] = { step: 1, sentences: [sentence("Improved by 5 points.", [])] };
    // V2 + V4: unknown token and unknown source.
    sections[2] = {
      step: 3,
      sentences: [sentence("[[G1.label]] shows [[Z9.change_phrase]].", ["G1", "N99"])],
    };
    // V8: foreign token in step 6.
    sections[5] = { step: 6, sentences: [sentence("[[M1.change_phrase]]", ["M1"])] };
    const result = validateModelOutput(raw(sections), BASE_CONTEXT);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failed).toEqual(["V2", "V3", "V4", "V7", "V8"]);
    // V7 also fires: step 6's only sentence isn't a required sentence and
    // carries no C-family token.
  });
});
