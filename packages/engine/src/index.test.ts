import { describe, expect, it } from "vitest";

import * as engine from "./index";

describe("engine public surface", () => {
  it("exports the calculation entry points this slice builds", () => {
    expect(typeof engine.calculateChange).toBe("function");
    expect(typeof engine.matchThreshold).toBe("function");
    expect(typeof engine.evaluateMeasure).toBe("function");
    expect(typeof engine.parseThresholdFile).toBe("function");
    expect(engine.TEST_IDS).toHaveLength(8);
  });

  it("ships the threshold file with nothing verified yet (H5)", () => {
    expect(engine.verifiedThresholdRowCount(engine.THRESHOLDS)).toBe(0);
  });

  it("classifies a real-population measure as NO_VERIFIED_THRESHOLD today", () => {
    const result = engine.evaluateMeasure(
      { test_id: "TUG", baseline_value: 20.0, current_value: 15.0, same_conditions: true },
      { age_band: "65-74", population_code: "stroke" },
      engine.THRESHOLDS,
    );
    expect(result.class).toBe("NO_VERIFIED_THRESHOLD");
    expect(result.threshold_row_id).toBeNull();
    expect(result.change_phrase).toBe("an improvement of 5.0 s (25.0%)");
    expect(result.threshold_phrase).toBe(
      "for which no verified change threshold is available for this population",
    );
  });
});
