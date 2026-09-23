/**
 * Threshold file parsing and matching. SPEC.md 2.3 and 5.4.
 *
 * H5: this file never contains a threshold value. It only reads what is
 * already in data/thresholds.json. Rows are added by hand by an AEP with a
 * citation, and stay "unverified" until then.
 */

import { isTestId, type TestId } from "../../../data/measures";
import { isAgeBand, POPULATION_OTHER, type AgeBand, type PopulationCode } from "./types";

export type ThresholdMetric = "MDC95" | "MCID";

export type ThresholdStatus = "verified" | "unverified";

export interface ThresholdRow {
  id: string;
  test_id: TestId;
  population_code: PopulationCode;
  /** null = all age bands. SPEC.md 2.3. */
  age_bands: AgeBand[] | null;
  metric: ThresholdMetric;
  /** In the test's unit. Greater than 0. */
  value: number;
  citation: string;
  url: string;
  verified_by: string | null;
  verified_on: string | null;
  status: ThresholdStatus;
}

export interface ThresholdFile {
  population_labels: Record<string, string>;
  rows: ThresholdRow[];
}

export const EMPTY_THRESHOLD_FILE: ThresholdFile = { population_labels: {}, rows: [] };

export class ThresholdFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThresholdFileError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMetric(value: unknown): value is ThresholdMetric {
  return value === "MDC95" || value === "MCID";
}

/**
 * Boot-time schema validation. SPEC.md 2.3 says zod; zod is not a dependency
 * yet and CLAUDE.md says to ask before adding one, so this is a hand-rolled
 * check with the same effect: a malformed row throws at import time. [A]
 *
 * [A] A row whose `metric` is neither MDC95 nor MCID is a hard error when the
 *     row is verified, and is dropped when it is unverified. Dropping keeps
 *     the parsed rows honestly typed without failing the build on rows that
 *     can never be used as a candidate anyway (5.4.1).
 */
export function parseThresholdFile(raw: unknown, source = "threshold file"): ThresholdFile {
  if (!isRecord(raw)) {
    throw new ThresholdFileError(`${source}: expected an object`);
  }
  const labelsRaw = raw["population_labels"];
  if (!isRecord(labelsRaw)) {
    throw new ThresholdFileError(`${source}: population_labels must be an object`);
  }
  const population_labels: Record<string, string> = {};
  for (const [code, label] of Object.entries(labelsRaw)) {
    if (typeof label !== "string") {
      throw new ThresholdFileError(`${source}: population label for "${code}" must be a string`);
    }
    population_labels[code] = label;
  }

  const rowsRaw = raw["rows"];
  if (!Array.isArray(rowsRaw)) {
    throw new ThresholdFileError(`${source}: rows must be an array`);
  }

  const rows: ThresholdRow[] = [];
  const seenIds = new Set<string>();

  rowsRaw.forEach((rowRaw, index) => {
    const where = `${source}: row ${index}`;
    if (!isRecord(rowRaw)) {
      throw new ThresholdFileError(`${where} must be an object`);
    }
    const id = rowRaw["id"];
    if (typeof id !== "string" || id.length === 0) {
      throw new ThresholdFileError(`${where} has no id`);
    }
    if (seenIds.has(id)) {
      throw new ThresholdFileError(`${source}: duplicate row id "${id}"`);
    }
    seenIds.add(id);

    const testId = rowRaw["test_id"];
    if (!isTestId(testId)) {
      throw new ThresholdFileError(`${where} ("${id}") has an unknown test_id`);
    }
    const populationCode = rowRaw["population_code"];
    if (typeof populationCode !== "string" || populationCode.length === 0) {
      throw new ThresholdFileError(`${where} ("${id}") has no population_code`);
    }
    const ageBandsRaw = rowRaw["age_bands"];
    let ageBands: AgeBand[] | null;
    if (ageBandsRaw === null) {
      ageBands = null;
    } else if (Array.isArray(ageBandsRaw) && ageBandsRaw.every(isAgeBand)) {
      ageBands = [...ageBandsRaw];
    } else {
      throw new ThresholdFileError(`${where} ("${id}") has invalid age_bands`);
    }
    const value = rowRaw["value"];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new ThresholdFileError(`${where} ("${id}") has a non-numeric value`);
    }
    const citation = rowRaw["citation"];
    if (typeof citation !== "string" || citation.length === 0) {
      throw new ThresholdFileError(`${where} ("${id}") has no citation`);
    }
    const url = rowRaw["url"];
    if (typeof url !== "string") {
      throw new ThresholdFileError(`${where} ("${id}") has a non-string url`);
    }
    const verifiedBy = rowRaw["verified_by"];
    if (verifiedBy !== null && typeof verifiedBy !== "string") {
      throw new ThresholdFileError(`${where} ("${id}") has an invalid verified_by`);
    }
    const verifiedOn = rowRaw["verified_on"];
    if (verifiedOn !== null && typeof verifiedOn !== "string") {
      throw new ThresholdFileError(`${where} ("${id}") has an invalid verified_on`);
    }
    const status = rowRaw["status"];
    if (status !== "verified" && status !== "unverified") {
      throw new ThresholdFileError(`${where} ("${id}") has an invalid status`);
    }

    const metric = rowRaw["metric"];
    if (!isMetric(metric)) {
      if (status === "verified") {
        throw new ThresholdFileError(`${where} ("${id}") has an unsupported metric`);
      }
      return; // unverified and unusable: dropped. [A]
    }
    if (status === "verified" && value <= 0) {
      throw new ThresholdFileError(`${where} ("${id}") is verified but its value is not > 0`);
    }

    rows.push({
      id,
      test_id: testId,
      population_code: populationCode,
      age_bands: ageBands,
      metric,
      value,
      citation,
      url,
      verified_by: verifiedBy,
      verified_on: verifiedOn,
      status,
    });
  });

  return { population_labels, rows };
}

export interface ThresholdQuery {
  test_id: TestId;
  population_code: PopulationCode | null;
  age_band: AgeBand | null;
}

/**
 * SPEC.md 5.4. Returns every row that could apply, before the "most
 * conservative" tie-break. Exported so the rule is testable on its own.
 */
export function thresholdCandidates(query: ThresholdQuery, file: ThresholdFile): ThresholdRow[] {
  // 5.4.2: "other" gives no candidates. A missing population does the same. [A]
  if (query.population_code === null || query.population_code === POPULATION_OTHER) {
    return [];
  }
  return file.rows.filter((row) => {
    if (row.status !== "verified") return false;
    if (row.test_id !== query.test_id) return false;
    if (row.population_code !== query.population_code) return false;
    if (row.age_bands === null) return true;
    // [A] A row restricted to age bands cannot match a participant with no
    //     age band recorded.
    return query.age_band !== null && row.age_bands.includes(query.age_band);
  });
}

/**
 * SPEC.md 5.4.3: with more than one candidate, use the largest value (most
 * conservative). [A] Ties are broken by keeping the first such row in file
 * order, so the result is deterministic.
 */
export function matchThreshold(query: ThresholdQuery, file: ThresholdFile): ThresholdRow | null {
  const candidates = thresholdCandidates(query, file);
  let best: ThresholdRow | null = null;
  for (const candidate of candidates) {
    if (best === null || candidate.value > best.value) {
      best = candidate;
    }
  }
  return best;
}

/** [A] Falls back to the raw code when the file has no label for it. */
export function populationLabel(file: ThresholdFile, code: PopulationCode | null): string {
  if (code === null) return "";
  return file.population_labels[code] ?? code;
}

/** Distinct population codes in the file, for the setup dropdown. SPEC.md 2.2. */
export function populationCodes(file: ThresholdFile): string[] {
  const codes = new Set<string>();
  for (const row of file.rows) codes.add(row.population_code);
  return [...codes].sort();
}
