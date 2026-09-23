import { describe, expect, it } from "vitest";

import fakeThresholdsJson from "../../../test/fixtures/fake-thresholds.json";
import { evaluateMeasure, exceedsThreshold, type MeasureInput } from "./classify";
import { parseThresholdFile } from "./thresholds";
import type { ParticipantContext } from "./types";

const FAKE = parseThresholdFile(fakeThresholdsJson, "fake-thresholds.json");
const EMPTY = parseThresholdFile({ population_labels: {}, rows: [] }, "empty");

/** Age band 65-74 so the age-banded fake rows (STS5, BERG, 2MWT) behave predictably. */
const CONTEXT: ParticipantContext = { age_band: "65-74", population_code: "test_population_a" };
const FAKE_LABEL = "FAKE test population A (fixtures only)";
const FAKE_CITE = "FAKE FIXTURE, NOT A REAL SOURCE";

function evaluate(input: MeasureInput, context = CONTEXT, thresholds = FAKE) {
  return evaluateMeasure(input, context, thresholds);
}

describe("worked fixtures (SPEC 5.7)", () => {
  it("1. TUG 20.0 to 15.0, same conditions, fake MDC95 3.0 s", () => {
    const result = evaluate({
      test_id: "TUG",
      baseline_value: 20.0,
      current_value: 15.0,
      same_conditions: true,
    });
    expect(result.improvement).toBe(5);
    expect(result.pct).toBe(25.0);
    expect(result.class).toBe("IMPROVED_BEYOND_THRESHOLD");
    expect(result.change_phrase).toBe("an improvement of 5.0 s (25.0%)");
    expect(result.threshold_phrase).toBe(
      `which exceeds the published MDC95 of 3.0 s for ${FAKE_LABEL} (${FAKE_CITE})`,
    );
  });

  it("2. 6MWT 300 to 320, fake MDC95 30 m", () => {
    const result = evaluate({
      test_id: "6MWT",
      baseline_value: 300,
      current_value: 320,
      same_conditions: true,
    });
    expect(result.improvement).toBe(20);
    expect(result.class).toBe("WITHIN_THRESHOLD");
    expect(result.change_phrase).toBe("an improvement of 20 m (6.7%)");
    expect(result.threshold_phrase).toBe(
      `which does not exceed the published MDC95 of 30 m for ${FAKE_LABEL} (${FAKE_CITE}), ` +
        "so it cannot be distinguished from measurement error",
    );
  });

  it("3. Berg 40 to 36 with no threshold row", () => {
    const result = evaluate(
      { test_id: "BERG", baseline_value: 40, current_value: 36, same_conditions: true },
      CONTEXT,
      EMPTY,
    );
    expect(result.improvement).toBe(-4);
    expect(result.class).toBe("NO_VERIFIED_THRESHOLD");
    expect(result.change_phrase).toBe("a decline of 4 points (10.0%)");
    expect(result.threshold_phrase).toBe(
      "for which no verified change threshold is available for this population",
    );
  });

  it("4. Grip with same_conditions false is NOT_COMPARABLE regardless of threshold", () => {
    const result = evaluate({
      test_id: "GRIP",
      baseline_value: 20.0,
      current_value: 30.0,
      same_conditions: false,
    });
    expect(result.threshold_row_id).toBe("FAKE-GRIP-06");
    expect(result.class).toBe("NOT_COMPARABLE");
    expect(result.change_phrase).toBe("an improvement of 10.0 kg (50.0%)");
    expect(result.threshold_phrase).toBe(
      "measured under different conditions, so the change is not directly comparable",
    );
  });

  it("5. STS30 from a baseline of 0 has a null pct and no parenthesis", () => {
    const result = evaluate({
      test_id: "STS30",
      baseline_value: 0,
      current_value: 5,
      same_conditions: true,
    });
    expect(result.pct).toBeNull();
    expect(result.change_phrase).toBe("an improvement of 5 reps");
    expect(result.class).toBe("IMPROVED_BEYOND_THRESHOLD");
  });
});

describe("classification precedence table (SPEC 5.5)", () => {
  it("row 1: no baseline wins over everything", () => {
    const result = evaluate({
      test_id: "TUG",
      baseline_value: null,
      current_value: 15.0,
      same_conditions: true,
    });
    expect(result.class).toBe("NO_BASELINE");
    expect(result.change).toBeNull();
    expect(result.improvement).toBeNull();
    expect(result.pct).toBeNull();
    expect(result.direction_label).toBeNull();
    expect(result.change_phrase).toBe(
      "no baseline was recorded, so change cannot be calculated",
    );
    expect(result.threshold_phrase).toBe("");
  });

  it("row 1 beats row 2: no baseline and changed conditions together", () => {
    const result = evaluate({
      test_id: "TUG",
      baseline_value: null,
      current_value: 15.0,
      same_conditions: false,
    });
    expect(result.class).toBe("NO_BASELINE");
    expect(result.threshold_phrase).toBe("");
  });

  it("row 1 beats row 3: no baseline and no threshold together", () => {
    const result = evaluate(
      { test_id: "BERG", baseline_value: null, current_value: 36, same_conditions: false },
      CONTEXT,
      EMPTY,
    );
    expect(result.class).toBe("NO_BASELINE");
  });

  it("row 2 beats row 3: changed conditions and no threshold together", () => {
    const result = evaluate(
      { test_id: "BERG", baseline_value: 40, current_value: 50, same_conditions: false },
      CONTEXT,
      EMPTY,
    );
    expect(result.class).toBe("NOT_COMPARABLE");
    expect(result.threshold_phrase).toBe(
      "measured under different conditions, so the change is not directly comparable",
    );
  });

  it("row 2 beats rows 4 and 5: changed conditions with a large decline", () => {
    const result = evaluate({
      test_id: "TUG",
      baseline_value: 12.0,
      current_value: 30.0,
      same_conditions: false,
    });
    expect(result.class).toBe("NOT_COMPARABLE");
    expect(result.change_phrase).toBe("a decline of 18.0 s (150.0%)");
  });

  it("row 3: an unmatched population gives NO_VERIFIED_THRESHOLD", () => {
    const result = evaluate(
      { test_id: "TUG", baseline_value: 20.0, current_value: 15.0, same_conditions: true },
      { age_band: "65-74", population_code: "other" },
    );
    expect(result.class).toBe("NO_VERIFIED_THRESHOLD");
    expect(result.threshold_row_id).toBeNull();
  });

  it("row 5: a decline larger than the threshold", () => {
    const result = evaluate({
      test_id: "TUG",
      baseline_value: 12.0,
      current_value: 16.5,
      same_conditions: true,
    });
    expect(result.class).toBe("DECLINED_BEYOND_THRESHOLD");
    expect(result.direction_label).toBe("declined");
    expect(result.change_phrase).toBe("a decline of 4.5 s (37.5%)");
    expect(result.threshold_phrase).toBe(
      `which exceeds the published MDC95 of 3.0 s for ${FAKE_LABEL} (${FAKE_CITE})`,
    );
  });

  it("row 6: an exact tie with the threshold does not exceed it", () => {
    const result = evaluate({
      test_id: "TUG",
      baseline_value: 20.0,
      current_value: 17.0,
      same_conditions: true,
    });
    expect(result.improvement).toBe(3);
    expect(result.class).toBe("WITHIN_THRESHOLD");
  });

  it("row 6: no change still reports the threshold it was compared against", () => {
    const result = evaluate({
      test_id: "GAIT10",
      baseline_value: 0.45,
      current_value: 0.45,
      same_conditions: true,
    });
    expect(result.class).toBe("WITHIN_THRESHOLD");
    expect(result.direction_label).toBe("unchanged");
    expect(result.change_phrase).toBe("no change");
    expect(result.threshold_row_id).toBe("FAKE-GAIT10-07");
  });

  it("row 6: the MCID wording differs from the MDC95 wording", () => {
    const result = evaluate(
      { test_id: "2MWT", baseline_value: 95, current_value: 101, same_conditions: true },
      { age_band: "50-64", population_code: "test_population_a" },
    );
    expect(result.class).toBe("WITHIN_THRESHOLD");
    expect(result.threshold_phrase).toBe(
      `which does not exceed the published MCID of 11 m for ${FAKE_LABEL} (${FAKE_CITE}), ` +
        "so it is below the published threshold for meaningful change",
    );
  });

  it("treats a null same_conditions as not explicitly different", () => {
    const result = evaluate({
      test_id: "TUG",
      baseline_value: 20.0,
      current_value: 15.0,
      same_conditions: null,
    });
    expect(result.class).toBe("IMPROVED_BEYOND_THRESHOLD");
  });

  it("produces all six classes across the cases above", () => {
    const classes = new Set([
      evaluate({ test_id: "TUG", baseline_value: null, current_value: 15, same_conditions: true })
        .class,
      evaluate({ test_id: "TUG", baseline_value: 20, current_value: 15, same_conditions: false })
        .class,
      evaluate(
        { test_id: "TUG", baseline_value: 20, current_value: 15, same_conditions: true },
        CONTEXT,
        EMPTY,
      ).class,
      evaluate({ test_id: "TUG", baseline_value: 20, current_value: 15, same_conditions: true })
        .class,
      evaluate({ test_id: "TUG", baseline_value: 12, current_value: 16.5, same_conditions: true })
        .class,
      evaluate({ test_id: "TUG", baseline_value: 20, current_value: 17, same_conditions: true })
        .class,
    ]);
    expect(classes).toEqual(
      new Set([
        "NO_BASELINE",
        "NOT_COMPARABLE",
        "NO_VERIFIED_THRESHOLD",
        "IMPROVED_BEYOND_THRESHOLD",
        "DECLINED_BEYOND_THRESHOLD",
        "WITHIN_THRESHOLD",
      ]),
    );
  });
});

describe("threshold comparison tolerance (SPEC 5.5)", () => {
  it("uses a strict greater-than with a 1e-9 tolerance", () => {
    expect(exceedsThreshold(3.0, 3.0)).toBe(false);
    expect(exceedsThreshold(3.0 + 1e-12, 3.0)).toBe(false);
    expect(exceedsThreshold(3.1, 3.0)).toBe(true);
    expect(exceedsThreshold(2.9, 3.0)).toBe(false);
  });

  it("is not tripped by float error in the scaled-to-display conversion", () => {
    // 0.45 - 0.30 is 0.15000000000000002 in floating point; the threshold is 0.15.
    const result = evaluate({
      test_id: "GAIT10",
      baseline_value: 0.3,
      current_value: 0.45,
      same_conditions: true,
    });
    expect(result.improvement).toBe(0.15);
    expect(result.class).toBe("WITHIN_THRESHOLD");
  });
});

describe("H7: no verdict wording", () => {
  const banned = [
    "clinically significant",
    "NDIS-compliant",
    "audit-proof",
    "Privacy Act compliant",
    "HIPAA",
    "fully de-identified",
    "improves funding outcomes",
  ];

  it("never appears in a generated phrase", () => {
    const inputs: MeasureInput[] = [
      { test_id: "TUG", baseline_value: 20, current_value: 15, same_conditions: true },
      { test_id: "TUG", baseline_value: 12, current_value: 16.5, same_conditions: true },
      { test_id: "6MWT", baseline_value: 300, current_value: 320, same_conditions: true },
      { test_id: "GRIP", baseline_value: 20, current_value: 30, same_conditions: false },
      { test_id: "STS30", baseline_value: null, current_value: 5, same_conditions: true },
      { test_id: "STS30", baseline_value: 0, current_value: 5, same_conditions: true },
    ];
    for (const input of inputs) {
      const result = evaluate(input);
      const text = `${result.change_phrase} ${result.threshold_phrase}`.toLowerCase();
      for (const phrase of banned) {
        expect(text).not.toContain(phrase.toLowerCase());
      }
    }
  });
});
