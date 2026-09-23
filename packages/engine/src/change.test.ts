import { describe, expect, it } from "vitest";

import { MEASURES, TEST_IDS, getMeasure, type TestId } from "../../../data/measures";
import {
  calculateChange,
  decimalPlaces,
  formatPct,
  formatValue,
  fromScaled,
  toScaled,
  validateValue,
} from "./change";

function change(testId: TestId, baseline: number, current: number) {
  const measure = getMeasure(testId);
  return calculateChange(
    measure.direction,
    toScaled(baseline, measure.decimals),
    toScaled(current, measure.decimals),
    measure.decimals,
  );
}

describe("measure definitions (SPEC 5.1)", () => {
  it("defines all eight tests", () => {
    expect(TEST_IDS).toHaveLength(8);
    expect(Object.keys(MEASURES).sort()).toEqual([...TEST_IDS].sort());
  });

  it("keeps each definition's test_id consistent with its key", () => {
    for (const testId of TEST_IDS) {
      expect(getMeasure(testId).test_id).toBe(testId);
    }
  });

  it("uses the units, directions and decimals from the spec table", () => {
    expect(getMeasure("6MWT")).toMatchObject({ unit: "m", direction: "higher", decimals: 0 });
    expect(getMeasure("2MWT")).toMatchObject({ unit: "m", direction: "higher", decimals: 0 });
    expect(getMeasure("TUG")).toMatchObject({ unit: "s", direction: "lower", decimals: 1 });
    expect(getMeasure("STS30")).toMatchObject({ unit: "reps", direction: "higher", decimals: 0 });
    expect(getMeasure("STS5")).toMatchObject({ unit: "s", direction: "lower", decimals: 1 });
    expect(getMeasure("GRIP")).toMatchObject({ unit: "kg", direction: "higher", decimals: 1 });
    expect(getMeasure("GAIT10")).toMatchObject({ unit: "m/s", direction: "higher", decimals: 2 });
    expect(getMeasure("BERG")).toMatchObject({ unit: "points", direction: "higher", decimals: 0 });
  });

  it("uses exclusive lower bounds only for the two timed tests", () => {
    for (const testId of TEST_IDS) {
      const inclusive = getMeasure(testId).valid_range.min_inclusive;
      expect(inclusive).toBe(testId !== "TUG" && testId !== "STS5");
    }
  });
});

describe("value validation (SPEC 5.2)", () => {
  it("rejects a value with more decimals than the test allows, rather than rounding", () => {
    expect(validateValue(12.34, getMeasure("TUG"))).toEqual({
      ok: false,
      reason: "TOO_MANY_DECIMALS",
    });
    expect(validateValue(12.3, getMeasure("TUG"))).toEqual({ ok: true, scaled: 123 });
    expect(validateValue(7.5, getMeasure("BERG"))).toEqual({
      ok: false,
      reason: "TOO_MANY_DECIMALS",
    });
  });

  it("applies the range guards, exclusive at zero for TUG and STS5", () => {
    expect(validateValue(0, getMeasure("TUG"))).toEqual({ ok: false, reason: "BELOW_RANGE" });
    expect(validateValue(0, getMeasure("STS5"))).toEqual({ ok: false, reason: "BELOW_RANGE" });
    expect(validateValue(0, getMeasure("STS30"))).toEqual({ ok: true, scaled: 0 });
    expect(validateValue(57, getMeasure("BERG"))).toEqual({ ok: false, reason: "ABOVE_RANGE" });
    expect(validateValue(56, getMeasure("BERG"))).toEqual({ ok: true, scaled: 56 });
    expect(validateValue(1001, getMeasure("6MWT"))).toEqual({ ok: false, reason: "ABOVE_RANGE" });
    expect(validateValue(5.01, getMeasure("GAIT10"))).toEqual({
      ok: false,
      reason: "ABOVE_RANGE",
    });
  });

  it("rejects non-finite values", () => {
    expect(validateValue(Number.NaN, getMeasure("GRIP"))).toEqual({
      ok: false,
      reason: "NOT_A_NUMBER",
    });
    expect(validateValue(Number.POSITIVE_INFINITY, getMeasure("GRIP"))).toEqual({
      ok: false,
      reason: "NOT_A_NUMBER",
    });
  });

  it("counts decimals written in exponential form", () => {
    expect(decimalPlaces(1e-7)).toBe(7);
    expect(decimalPlaces(1.5e2)).toBe(0);
    expect(decimalPlaces(20)).toBe(0);
    expect(decimalPlaces(20.05)).toBe(2);
  });
});

describe("scaled-integer arithmetic (SPEC 5.2)", () => {
  it("round-trips through the scale", () => {
    expect(toScaled(0.45, 2)).toBe(45);
    expect(toScaled(18.4, 1)).toBe(184);
    expect(toScaled(320, 0)).toBe(320);
    expect(fromScaled(45, 2)).toBe(0.45);
  });

  it("avoids the float error a naive subtraction would produce (GAIT10)", () => {
    expect(0.3 - 0.1).not.toBe(0.2);
    const result = change("GAIT10", 0.1, 0.3);
    expect(result.improvement_scaled).toBe(20);
    expect(result.improvement).toBe(0.2);
    expect(formatValue(result.improvement_abs, 2)).toBe("0.20");
  });

  it("avoids float error on one-decimal tests (STS5)", () => {
    expect(18.4 - 14.2).not.toBe(4.2);
    const result = change("STS5", 18.4, 14.2);
    expect(result.improvement_scaled).toBe(42);
    expect(result.improvement).toBe(4.2);
  });

  it("keeps 0.1 + 0.2 style additions exact at GAIT10's scale", () => {
    expect(change("GAIT10", 0.07, 0.29).improvement_scaled).toBe(22);
    expect(change("GAIT10", 1.1, 1.3).improvement).toBe(0.2);
  });
});

interface DirectionCase {
  test_id: TestId;
  baseline: number;
  current: number;
  improvement: number;
  pct: number | null;
  label: "improved" | "declined" | "unchanged";
}

const DIRECTION_CASES: DirectionCase[] = [
  // higher is better
  { test_id: "6MWT", baseline: 300, current: 320, improvement: 20, pct: 6.7, label: "improved" },
  { test_id: "6MWT", baseline: 320, current: 300, improvement: -20, pct: 6.3, label: "declined" },
  { test_id: "2MWT", baseline: 95, current: 101, improvement: 6, pct: 6.3, label: "improved" },
  { test_id: "2MWT", baseline: 101, current: 95, improvement: -6, pct: 5.9, label: "declined" },
  { test_id: "STS30", baseline: 8, current: 12, improvement: 4, pct: 50.0, label: "improved" },
  { test_id: "STS30", baseline: 12, current: 8, improvement: -4, pct: 33.3, label: "declined" },
  { test_id: "GRIP", baseline: 24.5, current: 27.0, improvement: 2.5, pct: 10.2, label: "improved" },
  { test_id: "GRIP", baseline: 27.0, current: 24.5, improvement: -2.5, pct: 9.3, label: "declined" },
  {
    test_id: "GAIT10",
    baseline: 0.45,
    current: 0.6,
    improvement: 0.15,
    pct: 33.3,
    label: "improved",
  },
  {
    test_id: "GAIT10",
    baseline: 0.6,
    current: 0.45,
    improvement: -0.15,
    pct: 25.0,
    label: "declined",
  },
  { test_id: "BERG", baseline: 40, current: 42, improvement: 2, pct: 5.0, label: "improved" },
  { test_id: "BERG", baseline: 40, current: 36, improvement: -4, pct: 10.0, label: "declined" },
  // lower is better
  { test_id: "TUG", baseline: 20.0, current: 15.0, improvement: 5.0, pct: 25.0, label: "improved" },
  {
    test_id: "TUG",
    baseline: 12.0,
    current: 16.5,
    improvement: -4.5,
    pct: 37.5,
    label: "declined",
  },
  { test_id: "STS5", baseline: 18.4, current: 14.2, improvement: 4.2, pct: 22.8, label: "improved" },
  {
    test_id: "STS5",
    baseline: 14.2,
    current: 18.4,
    improvement: -4.2,
    pct: 29.6,
    label: "declined",
  },
];

describe("change calculation and direction, all 8 tests (SPEC 5.3)", () => {
  it.each(DIRECTION_CASES)(
    "$test_id $baseline to $current gives improvement $improvement and $label",
    ({ test_id, baseline, current, improvement, pct, label }) => {
      const result = change(test_id, baseline, current);
      expect(result.improvement).toBeCloseTo(improvement, 10);
      expect(result.improvement_abs).toBeCloseTo(Math.abs(improvement), 10);
      expect(result.pct).toBe(pct);
      expect(result.direction_label).toBe(label);
    },
  );

  it("covers every test in both directions", () => {
    for (const testId of TEST_IDS) {
      const labels = DIRECTION_CASES.filter((c) => c.test_id === testId).map((c) => c.label);
      expect(labels).toContain("improved");
      expect(labels).toContain("declined");
    }
  });

  it("applies direction only to improvement, never to delta", () => {
    const tug = change("TUG", 20.0, 15.0);
    expect(tug.delta).toBe(-5);
    expect(tug.improvement).toBe(5);

    const berg = change("BERG", 40, 36);
    expect(berg.delta).toBe(-4);
    expect(berg.improvement).toBe(-4);
  });

  it("reports unchanged with a zero percentage when the value is identical", () => {
    const result = change("GAIT10", 0.45, 0.45);
    expect(result.improvement).toBe(0);
    expect(result.pct).toBe(0);
    expect(result.direction_label).toBe("unchanged");
  });

  it("returns a null percentage when the baseline is zero", () => {
    const result = change("STS30", 0, 5);
    expect(result.improvement).toBe(5);
    expect(result.pct).toBeNull();
    expect(result.direction_label).toBe("improved");
  });

  it("rounds the percentage half away from zero to one decimal", () => {
    // 20 / 320 = 6.25 exactly, which must round up, not to even.
    expect(change("6MWT", 320, 300).pct).toBe(6.3);
    // 1 / 8 = 12.5 exactly.
    expect(change("STS30", 8, 9).pct).toBe(12.5);
    expect(formatPct(6.3)).toBe("6.3");
    expect(formatPct(25)).toBe("25.0");
  });
});
