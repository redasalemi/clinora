import { describe, expect, it } from "vitest";

import expectedResults from "../../../test/fixtures/expected-results-scenario-1.json";
import scenario1 from "../../../test/fixtures/scenario-1-clean.json";
import scenario2 from "../../../test/fixtures/scenario-2-gaps.json";
import scenario3 from "../../../test/fixtures/scenario-3-edge-cases.json";
import { evaluateGaps, flagKey, type GapCheckDraft } from "./gaps";

/**
 * The scenario fixtures are full ReportDraft JSON (SPEC.md 2.2) with plenty
 * of fields evaluateGaps doesn't touch (supports, recommendations, ...);
 * evaluateGaps only reads goals/measures/barriers. The cast is needed
 * because JSON module imports widen string literals (e.g. a goal's status)
 * to `string`, which TypeScript won't narrow back to GoalStatus on its own;
 * the fixtures are hand-authored and spec-conformant, not untrusted input. [A]
 */
const SCENARIO_1 = scenario1 as unknown as GapCheckDraft;
const SCENARIO_2 = scenario2 as unknown as GapCheckDraft;
const SCENARIO_3 = scenario3 as unknown as GapCheckDraft;

describe("flagKey (SPEC 4)", () => {
  it("is rule_id + ':' + target_uid", () => {
    expect(flagKey("R1", "g1")).toBe("R1:g1");
    expect(flagKey("R4", "some-goal-uid")).toBe("R4:some-goal-uid");
  });

  it("falls back to 'report' for a report-level flag (no target_uid) [A]", () => {
    expect(flagKey("R1", null)).toBe("R1:report");
  });
});

describe("evaluateGaps against the golden fixture (test/fixtures/expected-results-scenario-1.json)", () => {
  it("scenario-1-clean: nothing fires", () => {
    expect(evaluateGaps(SCENARIO_1)).toEqual(
      expectedResults.scenarios["scenario-1-clean.json"].expected_flags_R1_R4,
    );
  });

  it("scenario-2-gaps: matches the golden expected R1-R4 flags exactly", () => {
    // The golden fixture's key predates a file rename (see git history); it
    // matches scenario-2-gaps.json by report_id, not by filename.
    expect(evaluateGaps(SCENARIO_2)).toEqual(
      expectedResults.scenarios["report_scenario_2_messy.json"].expected_flags_R1_R4,
    );
  });

  it("scenario-3-edge-cases: matches the golden expected R1-R4 flags exactly", () => {
    expect(evaluateGaps(SCENARIO_3)).toEqual(
      expectedResults.scenarios["report_scenario_3_edge.json"].expected_flags_R1_R4,
    );
  });
});

describe("R1 GOAL_NO_MEASURE (critical)", () => {
  it("fires for a goal with no linked measure that actually exists (scenario-2, Goal 1 and Goal 4)", () => {
    const flags = evaluateGaps(SCENARIO_2).filter((f) => f.rule_id === "R1");
    expect(flags).toEqual([
      {
        rule_id: "R1",
        severity: "critical",
        target_uid: "s2-g1",
        target_label: "Goal 1",
        message: "Goal 1 has no linked measure.",
      },
      {
        rule_id: "R1",
        severity: "critical",
        target_uid: "s2-g4",
        target_label: "Goal 4",
        message: "Goal 4 has no linked measure.",
      },
    ]);
  });

  it("fires when a goal's linked_measure_uids points at a measure that was deleted (scenario-2, Goal 4)", () => {
    // s2-g4 links "s2-m-deleted", which is not in scenario-2's measures array.
    const flag = evaluateGaps(SCENARIO_2).find((f) => f.target_uid === "s2-g4");
    expect(flag?.rule_id).toBe("R1");
  });

  it("does not fire when every goal has at least one linked measure that exists (scenario-1)", () => {
    expect(evaluateGaps(SCENARIO_1).some((f) => f.rule_id === "R1")).toBe(false);
  });
});

describe("R2 MEASURE_NO_BASELINE (critical)", () => {
  it("fires for a measure with no baseline value (scenario-2, Grip Strength)", () => {
    const flags = evaluateGaps(SCENARIO_2).filter((f) => f.rule_id === "R2");
    expect(flags).toEqual([
      {
        rule_id: "R2",
        severity: "critical",
        target_uid: "s2-m-grip",
        target_label: "Grip Strength",
        message: "Grip Strength has no baseline value, so change cannot be calculated.",
      },
    ]);
  });

  it("does not fire when every measure has a baseline value (scenario-1)", () => {
    expect(evaluateGaps(SCENARIO_1).some((f) => f.rule_id === "R2")).toBe(false);
  });
});

describe("R3 CONDITIONS_CHANGED (non-critical)", () => {
  it("fires for a measure marked same_conditions: false (scenario-3, 6-Minute Walk Test)", () => {
    const flags = evaluateGaps(SCENARIO_3).filter((f) => f.rule_id === "R3");
    expect(flags).toEqual([
      {
        rule_id: "R3",
        severity: "non-critical",
        target_uid: "s3-m-6mwt",
        target_label: "6-Minute Walk Test",
        message:
          "6-Minute Walk Test was measured under different conditions or aids, so the change is not directly comparable.",
      },
    ]);
  });

  it("does not fire when every measure was recorded under the same conditions (scenario-1)", () => {
    expect(evaluateGaps(SCENARIO_1).some((f) => f.rule_id === "R3")).toBe(false);
  });
});

describe("R4 UNACHIEVED_GOAL_NO_BARRIER (non-critical)", () => {
  it("fires for an unachieved goal with no linked barrier (scenario-2, Goal 1)", () => {
    const flags = evaluateGaps(SCENARIO_2).filter((f) => f.rule_id === "R4");
    expect(flags).toEqual([
      {
        rule_id: "R4",
        severity: "non-critical",
        target_uid: "s2-g1",
        target_label: "Goal 1",
        message: "Goal 1 is not fully achieved and has no linked barrier.",
      },
    ]);
  });

  it(
    "does not fire for partially_achieved/not_achieved goals that do have a linked barrier " +
      "(scenario-1, Goal 2 and Goal 3)",
    () => {
      expect(evaluateGaps(SCENARIO_1).some((f) => f.rule_id === "R4")).toBe(false);
    },
  );

  it("does not fire for an achieved goal, regardless of barriers", () => {
    const draft: GapCheckDraft = {
      goals: [{ uid: "g1", status: "achieved", linked_measure_uids: ["m1"] }],
      measures: [{ uid: "m1", test_id: "TUG", baseline_value: 10, same_conditions: true }],
      barriers: [],
    };
    expect(evaluateGaps(draft)).toEqual([]);
  });

  it("does not fire for a goal with status: null (SPEC 4 notes: shouldn't reach the rules, but is handled)", () => {
    const draft: GapCheckDraft = {
      goals: [{ uid: "g1", status: null, linked_measure_uids: ["m1"] }],
      measures: [{ uid: "m1", test_id: "TUG", baseline_value: 10, same_conditions: true }],
      barriers: [],
    };
    expect(evaluateGaps(draft)).toEqual([]);
  });
});

describe("all four rules firing together", () => {
  // Purpose-built and clearly fake: no existing scenario fixture fires all
  // four rules on the same draft, so this constructs a minimal one that does.
  const draft: GapCheckDraft = {
    goals: [
      // Goal 1: no linked measure (R1) AND not_achieved with no barrier (R4).
      { uid: "fake-g1", status: "not_achieved", linked_measure_uids: [] },
      // Goal 2: has a real linked measure and is achieved — fires nothing.
      { uid: "fake-g2", status: "achieved", linked_measure_uids: ["fake-m1"] },
    ],
    measures: [
      // fake-m1: no baseline (R2) and same_conditions: false (R3).
      { uid: "fake-m1", test_id: "TUG", baseline_value: null, same_conditions: false },
    ],
    barriers: [],
  };

  it("fires R1, R2, R3 and R4, in that order, then by position (SPEC 4)", () => {
    const flags = evaluateGaps(draft);
    expect(flags.map((f) => f.rule_id)).toEqual(["R1", "R2", "R3", "R4"]);
    expect(flags).toEqual([
      {
        rule_id: "R1",
        severity: "critical",
        target_uid: "fake-g1",
        target_label: "Goal 1",
        message: "Goal 1 has no linked measure.",
      },
      {
        rule_id: "R2",
        severity: "critical",
        target_uid: "fake-m1",
        target_label: "Timed Up and Go",
        message: "Timed Up and Go has no baseline value, so change cannot be calculated.",
      },
      {
        rule_id: "R3",
        severity: "non-critical",
        target_uid: "fake-m1",
        target_label: "Timed Up and Go",
        message:
          "Timed Up and Go was measured under different conditions or aids, so the change is not directly comparable.",
      },
      {
        rule_id: "R4",
        severity: "non-critical",
        target_uid: "fake-g1",
        target_label: "Goal 1",
        message: "Goal 1 is not fully achieved and has no linked barrier.",
      },
    ]);
  });

  it("never returns an R5 or R6 flag (NOT-NOW.md item 6 — cut, not built)", () => {
    const ruleIds = new Set(evaluateGaps(draft).map((f) => f.rule_id));
    expect(ruleIds).toEqual(new Set(["R1", "R2", "R3", "R4"]));
  });
});
