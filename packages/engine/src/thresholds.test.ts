import { describe, expect, it } from "vitest";

import fakeThresholdsJson from "../../../test/fixtures/fake-thresholds.json";
import { TEST_IDS } from "../../../data/measures";
import { THRESHOLDS, verifiedThresholdRowCount } from "./data";
import {
  EMPTY_THRESHOLD_FILE,
  ThresholdFileError,
  matchThreshold,
  parseThresholdFile,
  populationLabel,
  thresholdCandidates,
  type ThresholdFile,
} from "./thresholds";

const FAKE = parseThresholdFile(fakeThresholdsJson, "fake-thresholds.json");
const FAKE_POP = "test_population_a";

/** Builds a threshold file from scratch. Values here are fake, fixtures only. */
function fileWith(rows: Array<Record<string, unknown>>): ThresholdFile {
  return parseThresholdFile(
    {
      population_labels: { [FAKE_POP]: "FAKE test population A (fixtures only)" },
      rows: rows.map((row, index) => ({
        id: `FAKE-ROW-${index}`,
        test_id: "TUG",
        population_code: FAKE_POP,
        age_bands: null,
        metric: "MDC95",
        value: 1,
        citation: "FAKE FIXTURE, NOT A REAL SOURCE",
        url: "",
        verified_by: "FAKE_FIXTURE_NOT_AN_AEP",
        verified_on: "2000-01-01",
        status: "verified",
        ...row,
      })),
    },
    "synthetic fixture",
  );
}

describe("threshold file parsing (SPEC 2.3)", () => {
  it("parses the fake fixture file", () => {
    expect(FAKE.rows).toHaveLength(8);
    expect(FAKE.population_labels[FAKE_POP]).toBe("FAKE test population A (fixtures only)");
  });

  it("falls back to the raw code when a population has no label", () => {
    expect(populationLabel(FAKE, FAKE_POP)).toBe("FAKE test population A (fixtures only)");
    expect(populationLabel(FAKE, "not_in_file")).toBe("not_in_file");
    expect(populationLabel(FAKE, null)).toBe("");
  });

  it("throws on a malformed row", () => {
    expect(() => fileWith([{ test_id: "NOT_A_TEST" }])).toThrow(ThresholdFileError);
    expect(() => fileWith([{ id: "" }])).toThrow(ThresholdFileError);
    expect(() => fileWith([{ value: "three" }])).toThrow(ThresholdFileError);
    expect(() => fileWith([{ citation: "" }])).toThrow(ThresholdFileError);
    expect(() => fileWith([{ status: "maybe" }])).toThrow(ThresholdFileError);
    expect(() => fileWith([{ age_bands: ["0-17"] }])).toThrow(ThresholdFileError);
    expect(() => fileWith([{ id: "dupe" }, { id: "dupe" }])).toThrow(ThresholdFileError);
    expect(() => parseThresholdFile({ population_labels: {} })).toThrow(ThresholdFileError);
    expect(() => parseThresholdFile(null)).toThrow(ThresholdFileError);
  });

  it("throws when a verified row has an unsupported metric or a non-positive value", () => {
    expect(() => fileWith([{ metric: "MDC90" }])).toThrow(ThresholdFileError);
    expect(() => fileWith([{ value: 0 }])).toThrow(ThresholdFileError);
  });

  it("drops an unverified row with an unsupported metric instead of failing the build", () => {
    const file = fileWith([{ metric: "MDC90", status: "unverified" }]);
    expect(file.rows).toHaveLength(0);
  });
});

describe("threshold matching (SPEC 5.4)", () => {
  it("matches a row with age_bands null for any age band", () => {
    const row = matchThreshold(
      { test_id: "6MWT", population_code: FAKE_POP, age_band: "65-74" },
      FAKE,
    );
    expect(row?.id).toBe("FAKE-6MWT-01");
    expect(
      matchThreshold({ test_id: "6MWT", population_code: FAKE_POP, age_band: null }, FAKE)?.id,
    ).toBe("FAKE-6MWT-01");
  });

  it("respects a row's age band list", () => {
    expect(
      matchThreshold({ test_id: "STS5", population_code: FAKE_POP, age_band: "65-74" }, FAKE)?.id,
    ).toBe("FAKE-STS5-05");
    expect(
      matchThreshold({ test_id: "STS5", population_code: FAKE_POP, age_band: "50-64" }, FAKE),
    ).toBeNull();
    expect(
      matchThreshold({ test_id: "STS5", population_code: FAKE_POP, age_band: null }, FAKE),
    ).toBeNull();
  });

  it("requires the population to match exactly", () => {
    expect(
      matchThreshold({ test_id: "TUG", population_code: "some_other_code", age_band: null }, FAKE),
    ).toBeNull();
    expect(
      matchThreshold({ test_id: "TUG", population_code: null, age_band: null }, FAKE),
    ).toBeNull();
  });

  it('gives no candidates for population "other", even if a row claims that code', () => {
    const file = fileWith([{ id: "FAKE-OTHER", population_code: "other", value: 2 }]);
    expect(
      thresholdCandidates({ test_id: "TUG", population_code: "other", age_band: null }, file),
    ).toHaveLength(0);
    expect(
      matchThreshold({ test_id: "TUG", population_code: "other", age_band: null }, file),
    ).toBeNull();
    expect(
      matchThreshold({ test_id: "TUG", population_code: "other", age_band: null }, FAKE),
    ).toBeNull();
  });

  it("takes the largest value when several rows are candidates", () => {
    const file = fileWith([
      { id: "FAKE-SMALL", value: 3 },
      { id: "FAKE-LARGE", value: 7 },
      { id: "FAKE-MIDDLE", value: 5 },
    ]);
    expect(thresholdCandidates({ test_id: "TUG", population_code: FAKE_POP, age_band: null }, file))
      .toHaveLength(3);
    expect(
      matchThreshold({ test_id: "TUG", population_code: FAKE_POP, age_band: null }, file)?.id,
    ).toBe("FAKE-LARGE");
  });

  it("keeps the first row on a tie, so the result is deterministic", () => {
    const file = fileWith([
      { id: "FAKE-FIRST", value: 4 },
      { id: "FAKE-SECOND", value: 4 },
    ]);
    expect(
      matchThreshold({ test_id: "TUG", population_code: FAKE_POP, age_band: null }, file)?.id,
    ).toBe("FAKE-FIRST");
  });

  it("ignores unverified rows even when they would otherwise be the match", () => {
    const file = fileWith([
      { id: "FAKE-UNVERIFIED-BIG", value: 99, status: "unverified" },
      { id: "FAKE-VERIFIED-SMALL", value: 2 },
    ]);
    expect(
      matchThreshold({ test_id: "TUG", population_code: FAKE_POP, age_band: null }, file)?.id,
    ).toBe("FAKE-VERIFIED-SMALL");

    const onlyUnverified = fileWith([{ id: "FAKE-ONLY", value: 9, status: "unverified" }]);
    expect(
      matchThreshold({ test_id: "TUG", population_code: FAKE_POP, age_band: null }, onlyUnverified),
    ).toBeNull();
  });

  it("returns null for an empty file", () => {
    const empty = parseThresholdFile({ population_labels: {}, rows: [] }, "empty");
    expect(empty.rows).toHaveLength(0);
    for (const testId of TEST_IDS) {
      expect(matchThreshold({ test_id: testId, population_code: FAKE_POP, age_band: "65-74" }, empty))
        .toBeNull();
      expect(
        matchThreshold(
          { test_id: testId, population_code: FAKE_POP, age_band: "65-74" },
          EMPTY_THRESHOLD_FILE,
        ),
      ).toBeNull();
    }
  });
});

describe("shipped data/thresholds.json (H5)", () => {
  it("parses at import time", () => {
    expect(Array.isArray(THRESHOLDS.rows)).toBe(true);
  });

  it("has no verified rows yet, so nothing can match", () => {
    expect(verifiedThresholdRowCount()).toBe(0);
    for (const testId of TEST_IDS) {
      for (const populationCode of Object.keys(THRESHOLDS.population_labels)) {
        for (const ageBand of ["18-34", "35-49", "50-64", "65-74", "75+"] as const) {
          expect(
            matchThreshold(
              { test_id: testId, population_code: populationCode, age_band: ageBand },
              THRESHOLDS,
            ),
          ).toBeNull();
        }
      }
    }
  });
});
