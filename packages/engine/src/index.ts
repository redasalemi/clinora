/**
 * @clinora/engine public surface.
 *
 * Pure TypeScript, no I/O. Imported by client and server; the server result is
 * authoritative. SPEC.md section 5.
 *
 * Built so far: 5.1 measure definitions, 5.2 input handling, 5.3 change
 * calculation, 5.4 threshold matching, 5.5 classification and phrases,
 * section 4 gap rules R1-R4 (R5/R6 cut, NOT-NOW.md item 6), 5.9 token
 * grammar/map, required sentences, system prompt (P1-P7) and validation
 * (V1-V8). The actual Bedrock call is apps/web's job — this package stays
 * I/O-free.
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
  type GoalStatus,
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

export {
  evaluateGaps,
  flagKey,
  type Flag,
  type GapBarrier,
  type GapCheckDraft,
  type GapGoal,
  type GapMeasure,
  type RuleId,
  type Severity,
} from "./gaps";

export {
  formatDate,
  prepareTokens,
  splitShorthandLines,
  type GenerationDraft,
  type PrepareTokensResult,
  type RequiredSentence,
  type TokenBarrier,
  type TokenGoal,
  type TokenMeasureInput,
  type TokenRecommendation,
  type TokenRisk,
} from "./tokens";

export {
  buildPromptContext,
  buildRetrySystemPrompt,
  buildSystemPrompt,
  type PromptContext,
  type PromptGoalContext,
  type PromptMeasureContext,
  type PromptTextContext,
} from "./prompt";

export {
  validateModelOutput,
  type ValidatedSection,
  type ValidatedSentence,
  type ValidationCode,
  type ValidationContext,
  type ValidationResult,
} from "./validate";
