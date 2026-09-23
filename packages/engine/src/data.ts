/**
 * The shipped threshold data, parsed and validated at import time.
 *
 * H5: no threshold value is ever written here or anywhere else in the engine.
 * data/thresholds.json is the only source, and every row in it stays
 * "unverified" until an AEP signs it off with a citation. Until then
 * `matchThreshold` finds zero candidates and every real measure classifies as
 * NO_VERIFIED_THRESHOLD. That is the intended behaviour, not a gap.
 *
 * The import is a static module import, not I/O, so packages/engine stays
 * pure per CLAUDE.md.
 */

import rawThresholds from "../../../data/thresholds.json";
import { parseThresholdFile, type ThresholdFile } from "./thresholds";

export const THRESHOLDS: ThresholdFile = parseThresholdFile(
  rawThresholds,
  "data/thresholds.json",
);

/** Count of rows the engine will actually consider as candidates. */
export function verifiedThresholdRowCount(file: ThresholdFile = THRESHOLDS): number {
  return file.rows.filter((row) => row.status === "verified").length;
}
