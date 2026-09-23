/**
 * @clinora/engine public surface.
 *
 * Pure TypeScript, no I/O. Imported by client and server; the server result is
 * authoritative. SPEC.md section 5.
 *
 * Built so far: 5.1 measure definitions, 5.2 input handling, 5.3 change
 * calculation, 5.4 threshold matching, 5.5 classification and phrases.
 * Gap rules (section 4), token resolution and validation (5.9) are later
 * slices.
 */

export {
  MEASURES,
  TEST_IDS,
  getMeasure,
  isTestId,
  type Direction,
  type MeasureDefinition,
  type TestId,
  type ValidRange,
} from "../../../data/measures";

export {
  AGE_BANDS,
  POPULATION_OTHER,
  isAgeBand,
  type AgeBand,
  type ChangeClass,
  type DirectionLabel,
  type ParticipantContext,
  type PopulationCode,
} from "./types";

export {
  calculateChange,
  decimalPlaces,
  formatPct,
  formatValue,
  fromScaled,
  toScaled,
  validateValue,
  type ChangeResult,
  type ValueRejection,
  type ValueValidation,
} from "./change";

export {
  EMPTY_THRESHOLD_FILE,
  ThresholdFileError,
  matchThreshold,
  parseThresholdFile,
  populationCodes,
  populationLabel,
  thresholdCandidates,
  type ThresholdFile,
  type ThresholdMetric,
  type ThresholdQuery,
  type ThresholdRow,
  type ThresholdStatus,
} from "./thresholds";

export {
  NOT_COMPARABLE_PHRASE,
  NO_BASELINE_PHRASE,
  NO_VERIFIED_THRESHOLD_PHRASE,
  THRESHOLD_TOLERANCE,
  buildChangePhrase,
  buildExceedsPhrase,
  buildWithinPhrase,
  evaluateMeasure,
  evaluateMeasures,
  exceedsThreshold,
  type MeasureEvaluation,
  type MeasureInput,
} from "./classify";

export { THRESHOLDS, verifiedThresholdRowCount } from "./data";
