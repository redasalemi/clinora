import { describe, expect, it } from "vitest";

import expectedResults from "../../../test/fixtures/expected-results-scenario-1.json";
import fakeThresholdsJson from "../../../test/fixtures/fake-thresholds.json";
import scenario1 from "../../../test/fixtures/scenario-1-clean.json";
import scenario2 from "../../../test/fixtures/scenario-2-gaps.json";
import scenario3 from "../../../test/fixtures/scenario-3-edge-cases.json";
import { parseThresholdFile } from "./thresholds";
import { formatDate, prepareTokens, splitShorthandLines, type GenerationDraft } from "./tokens";
import type { ParticipantContext } from "./types";

const FAKE_THRESHOLDS = parseThresholdFile(fakeThresholdsJson, "fake-thresholds.json");
const CONTEXT: ParticipantContext = { age_band: "65-74", population_code: "test_population_a" };

/**
 * The scenario fixtures predate NOT-NOW.md item 6 (structured `supports`
 * rows). This adapts them into GenerationDraft's shape, synthesizing
 * `supports_text` from the old array. `scenario` is `any` deliberately —
 * this is a one-off test fixture adapter, not production code, and fighting
 * JSON-import literal widening field-by-field isn't worth it here. [A]
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toGenerationDraft(scenario: any): GenerationDraft {
  return {
    period: { start: scenario.period.start, end: scenario.period.end },
    supports_text: scenario.supports
      .map((s: { type: string }) => s.type)
      .join("; "),
    goals: scenario.goals,
    measures: scenario.measures,
    barriers: scenario.barriers,
    risks: scenario.risks,
    recommendations: scenario.recommendations,
    shorthand: scenario.shorthand,
  };
}

const DRAFT_1 = toGenerationDraft(scenario1);
const DRAFT_2 = toGenerationDraft(scenario2);
const DRAFT_3 = toGenerationDraft(scenario3);

describe("formatDate (SPEC 5.8: D MMM YYYY, en-AU)", () => {
  it("formats without a leading zero on the day", () => {
    expect(formatDate("2026-03-02")).toBe("2 Mar 2026");
    expect(formatDate("2026-08-24")).toBe("24 Aug 2026");
    expect(formatDate("2026-01-01")).toBe("1 Jan 2026");
    expect(formatDate("2026-12-31")).toBe("31 Dec 2026");
  });

  it("never goes through Date, so no timezone can shift the day", () => {
    // A naive `new Date("2026-01-01")` parse/re-format could shift a day
    // depending on the runner's timezone; this must not.
    expect(formatDate("2026-01-01")).toBe("1 Jan 2026");
  });

  it("throws on a malformed date", () => {
    expect(() => formatDate("2026/03/02")).toThrow();
    expect(() => formatDate("not-a-date")).toThrow();
    expect(() => formatDate("2026-13-01")).toThrow(); // month 13 out of range
  });
});

describe("splitShorthandLines (US-06)", () => {
  it("matches the golden fixture's shorthand_line_count for all three scenarios", () => {
    expect(splitShorthandLines(scenario1.shorthand).length).toBe(
      expectedResults.scenarios["scenario-1-clean.json"].shorthand_line_count,
    );
    expect(splitShorthandLines(scenario2.shorthand).length).toBe(
      expectedResults.scenarios["report_scenario_2_messy.json"].shorthand_line_count,
    );
    expect(splitShorthandLines(scenario3.shorthand).length).toBe(
      expectedResults.scenarios["report_scenario_3_edge.json"].shorthand_line_count,
    );
  });

  it("drops blank and whitespace-only lines", () => {
    expect(splitShorthandLines("a\n\n  \nb\n")).toEqual(["a", "b"]);
  });

  it("trims each line", () => {
    expect(splitShorthandLines("  padded line  \n")).toEqual(["padded line"]);
  });

  it("caps at 100 lines", () => {
    const many = Array.from({ length: 150 }, (_, i) => `line ${i}`).join("\n");
    expect(splitShorthandLines(many)).toHaveLength(100);
  });

  it("returns an empty array for an empty string", () => {
    expect(splitShorthandLines("")).toEqual([]);
  });
});

describe("prepareTokens: required sentences match the golden fixture exactly", () => {
  it("scenario-1-clean: none required", () => {
    const result = prepareTokens(DRAFT_1, CONTEXT, FAKE_THRESHOLDS);
    expect(result.requiredSentences).toEqual([]);
  });

  it("scenario-2-gaps: Goal 1 and Goal 4 have no measure, no risks recorded", () => {
    const result = prepareTokens(DRAFT_2, { age_band: "50-64", population_code: "test_population_a" }, FAKE_THRESHOLDS);
    expect(result.requiredSentences).toEqual(
      expectedResults.scenarios["report_scenario_2_messy.json"].required_sentences,
    );
  });

  it("scenario-3-edge-cases: no risks recorded, everything else present", () => {
    const result = prepareTokens(DRAFT_3, { age_band: "75+", population_code: "test_population_a" }, FAKE_THRESHOLDS);
    expect(result.requiredSentences).toEqual(
      expectedResults.scenarios["report_scenario_3_edge.json"].required_sentences,
    );
  });
});

describe("prepareTokens: token map (SPEC 5.9)", () => {
  const result = prepareTokens(DRAFT_1, CONTEXT, FAKE_THRESHOLDS);

  it("assigns G1..Gn by position with the exact field set", () => {
    expect(result.tokens["G1.label"]).toBe("Goal 1");
    expect(result.tokens["G1.text"]).toBe(scenario1.goals[0]?.ndis_goal_text);
    expect(result.tokens["G1.therapy_text"]).toBe(scenario1.goals[0]?.therapy_goal_text);
    expect(result.tokens["G1.status_phrase"]).toBe("achieved");
    expect(result.tokens["G2.status_phrase"]).toBe("partially achieved");
    expect(result.tokens["G3.status_phrase"]).toBe("not achieved");
    expect(result.goalRefs).toEqual(["G1", "G2", "G3"]);
  });

  it("assigns M1..Mn by position, reusing the classify engine's change/threshold phrases", () => {
    // s1-m-tug is measures[0] -> M1. From expected-results-scenario-1.json.
    expect(result.tokens["M1.name"]).toBe("Timed Up and Go");
    expect(result.tokens["M1.baseline"]).toBe("20.0");
    expect(result.tokens["M1.current"]).toBe("15.0");
    expect(result.tokens["M1.baseline_date"]).toBe("2 Mar 2026");
    expect(result.tokens["M1.current_date"]).toBe("24 Aug 2026");
    expect(result.tokens["M1.change_phrase"]).toBe(
      expectedResults.scenarios["scenario-1-clean.json"].measures["s1-m-tug"].change_phrase,
    );
    expect(result.tokens["M1.threshold_phrase"]).toBe(
      expectedResults.scenarios["scenario-1-clean.json"].measures["s1-m-tug"].threshold_phrase,
    );
  });

  it("leaves M<n>.baseline empty when there is no baseline value", () => {
    const result2 = prepareTokens(
      DRAFT_2,
      { age_band: "50-64", population_code: "test_population_a" },
      FAKE_THRESHOLDS,
    );
    // s2-m-grip (measures[0] in scenario-2) has baseline_value: null.
    expect(result2.tokens["M1.baseline"]).toBe("");
  });

  it("assigns B1..Bn, R1..Rn, C1..Cn verbatim", () => {
    expect(result.tokens["B1.text"]).toBe(scenario1.barriers[0]?.text);
    expect(result.tokens["B2.text"]).toBe(scenario1.barriers[1]?.text);
    expect(result.tokens["R1.text"]).toBe(scenario1.risks[0]?.text);
    expect(result.tokens["C1.text"]).toBe(scenario1.recommendations[0]?.text);
  });

  it("assigns the single S ref (NOT-NOW.md item 6), not S1..Sn", () => {
    expect(result.tokens["S.text"]).toBe(DRAFT_1.supports_text);
    expect(result.tokens["S1.text"]).toBeUndefined();
    expect(result.tokens["S1.phrase"]).toBeUndefined();
  });

  it("assigns P.start and P.end as formatted dates", () => {
    expect(result.tokens["P.start"]).toBe("2 Mar 2026");
    expect(result.tokens["P.end"]).toBe("28 Aug 2026");
  });
});

describe("prepareTokens: source refs (SPEC 5.9)", () => {
  it("includes every token ref prefix, N1..Nk for the shorthand lines, and SYS", () => {
    const result = prepareTokens(DRAFT_1, CONTEXT, FAKE_THRESHOLDS);
    for (const ref of ["G1", "G2", "G3", "M1", "M2", "M3", "M4", "S", "B1", "B2", "R1", "P"]) {
      expect(result.sourceRefs.has(ref)).toBe(true);
    }
    expect(result.sourceRefs.has("SYS")).toBe(true);
    // scenario-1's shorthand has 4 non-empty lines (golden fixture).
    expect(result.sourceRefs.has("N1")).toBe(true);
    expect(result.sourceRefs.has("N4")).toBe(true);
    expect(result.sourceRefs.has("N5")).toBe(false);
  });

  it("does not include a bare group letter like 'M' or 'G' — only positional refs", () => {
    const result = prepareTokens(DRAFT_1, CONTEXT, FAKE_THRESHOLDS);
    expect(result.sourceRefs.has("M")).toBe(false);
    expect(result.sourceRefs.has("G")).toBe(false);
    expect(result.sourceRefs.has("B")).toBe(false);
  });
});
