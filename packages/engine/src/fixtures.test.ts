/**
 * Drives the repo's scenario fixtures through the engine and compares against
 * test/fixtures/expected-results-scenario-1.json.
 *
 * Every value in these fixtures is fake. They exist only so the engine can be
 * tested without any real threshold data (H5).
 */

import { describe, expect, it } from "vitest";

import expectedJson from "../../../test/fixtures/expected-results-scenario-1.json";
import fakeThresholdsJson from "../../../test/fixtures/fake-thresholds.json";
import scenario1 from "../../../test/fixtures/scenario-1-clean.json";
import scenario2 from "../../../test/fixtures/scenario-2-gaps.json";
import scenario3 from "../../../test/fixtures/scenario-3-edge-cases.json";
import type { TestId } from "../../../data/measures";
import { evaluateMeasure } from "./classify";
import { parseThresholdFile } from "./thresholds";
import type { AgeBand } from "./types";

const FAKE = parseThresholdFile(fakeThresholdsJson, "fake-thresholds.json");

interface DraftMeasure {
  uid: string;
  test_id: TestId;
  baseline_value: number | null;
  current_value: number;
  same_conditions: boolean | null;
}

interface Draft {
  report_id: string;
  participant_context: { age_band: AgeBand | null; population_code: string | null };
  measures: DraftMeasure[];
}

interface ExpectedMeasure {
  test_id: string;
  class: string;
  change_phrase: string;
  threshold_phrase: string;
  improvement?: number;
  pct?: number | null;
  direction_label?: string;
  threshold_row_id?: string | null;
}

interface ExpectedFile {
  scenarios: Record<string, { report_id: string; measures: Record<string, ExpectedMeasure> }>;
}

const EXPECTED = expectedJson as unknown as ExpectedFile;

const DRAFTS: Draft[] = [
  scenario1 as unknown as Draft,
  scenario2 as unknown as Draft,
  scenario3 as unknown as Draft,
];

function expectationsFor(reportId: string): Record<string, ExpectedMeasure> {
  const entry = Object.values(EXPECTED.scenarios).find((s) => s.report_id === reportId);
  if (entry === undefined) {
    throw new Error(`no expectations for report ${reportId}`);
  }
  return entry.measures;
}

function has<K extends keyof ExpectedMeasure>(
  expected: ExpectedMeasure,
  key: K,
): expected is ExpectedMeasure & Record<K, NonNullable<unknown> | null> {
  return Object.prototype.hasOwnProperty.call(expected, key);
}

describe("scenario fixtures against the fake threshold file", () => {
  it("covers all three scenarios", () => {
    expect(DRAFTS).toHaveLength(3);
    for (const draft of DRAFTS) {
      expect(Object.keys(expectationsFor(draft.report_id)).length).toBeGreaterThan(0);
    }
  });

  for (const draft of DRAFTS) {
    const expectations = expectationsFor(draft.report_id);

    for (const [uid, expected] of Object.entries(expectations)) {
      it(`${draft.report_id} / ${uid} (${expected.test_id}) classifies as ${expected.class}`, () => {
        const measure = draft.measures.find((m) => m.uid === uid);
        expect(measure, `measure ${uid} missing from fixture`).toBeDefined();
        if (measure === undefined) return;

        const result = evaluateMeasure(
          {
            uid: measure.uid,
            test_id: measure.test_id,
            baseline_value: measure.baseline_value,
            current_value: measure.current_value,
            same_conditions: measure.same_conditions,
          },
          draft.participant_context,
          FAKE,
        );

        expect(result.test_id).toBe(expected.test_id);
        expect(result.class).toBe(expected.class);
        expect(result.change_phrase).toBe(expected.change_phrase);
        expect(result.threshold_phrase).toBe(expected.threshold_phrase);

        if (has(expected, "improvement")) {
          expect(result.improvement).toBeCloseTo(expected.improvement as number, 10);
        }
        if (has(expected, "pct")) {
          expect(result.pct).toBe(expected.pct);
        }
        if (has(expected, "direction_label")) {
          expect(result.direction_label).toBe(expected.direction_label);
        }
        if (has(expected, "threshold_row_id")) {
          expect(result.threshold_row_id).toBe(expected.threshold_row_id);
        }
      });
    }
  }
});
