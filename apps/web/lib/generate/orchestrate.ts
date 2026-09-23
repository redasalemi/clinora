import {
  buildPromptContext,
  buildRetrySystemPrompt,
  buildSystemPrompt,
  prepareTokens,
  validateModelOutput,
  type GenerationDraft,
  type ParticipantContext,
  type ThresholdFile,
  type ValidatedSection,
  type ValidationCode,
  type ValidationContext,
} from "@clinora/engine";
import { callBedrock } from "./bedrock";

export type CallModelFn = (systemPrompt: string) => Promise<string>;

export interface RunGenerationOptions {
  /** Injectable for tests (SPEC 5.10 / this slice's own ask: mocked model). Defaults to the real Bedrock call. */
  callModel?: CallModelFn;
}

export type RunGenerationResult =
  | { ok: true; sections: ValidatedSection[]; tokens: Record<string, string> }
  | { ok: false; failedCodes: ValidationCode[] };

/**
 * SPEC.md 5.9: "On any failure: retry once with the failed rule codes (no
 * content) appended to the prompt. On second failure return 502
 * GENERATION_FAILED" — the 502 itself is the route handler's job; this
 * returns the pass/fail result either way.
 */
export async function runGeneration(
  draft: GenerationDraft,
  context: ParticipantContext,
  thresholds: ThresholdFile,
  options: RunGenerationOptions = {},
): Promise<RunGenerationResult> {
  const callModel = options.callModel ?? ((systemPrompt: string) => callBedrock({ systemPrompt }));

  const prepared = prepareTokens(draft, context, thresholds);
  const promptContext = buildPromptContext(draft, prepared);
  const systemPrompt = buildSystemPrompt(promptContext);

  const validationContext: ValidationContext = {
    tokens: prepared.tokens,
    sourceRefs: prepared.sourceRefs,
    requiredSentences: prepared.requiredSentences,
    goalRefs: prepared.goalRefs,
  };

  const attempt = async (prompt: string): Promise<RunGenerationResult> => {
    const raw = await callModel(prompt);
    const result = validateModelOutput(raw, validationContext);
    return result.ok
      ? { ok: true, sections: result.sections, tokens: prepared.tokens }
      : { ok: false, failedCodes: result.failed };
  };

  const first = await attempt(systemPrompt);
  if (first.ok) return first;

  const retryPrompt = buildRetrySystemPrompt(systemPrompt, first.failedCodes);
  return attempt(retryPrompt);
}
