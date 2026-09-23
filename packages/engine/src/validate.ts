/**
 * Server-side validation V1-V8. SPEC.md 5.9.
 *
 * This is H6's actual enforcement: "Never let AI output contain a numeral
 * outside a locked token. Enforce it with validation V1 to V8." (CLAUDE.md)
 * Every check here must be correct, not just present — a false pass here
 * is a numeral leaking into a clinical report.
 *
 * Pure: takes the model's raw text and the context computed by tokens.ts,
 * returns either the validated sections or the list of rules that failed.
 * No I/O, no AI call.
 */

import type { RequiredSentence } from "./tokens";

export type ValidationCode = "V1" | "V2" | "V3" | "V4" | "V5" | "V6" | "V7" | "V8";

export interface ValidatedSentence {
  text: string;
  /** Union of the model's own sources and every ref found in the sentence's tokens. */
  sources: string[];
}

export interface ValidatedSection {
  step: 1 | 2 | 3 | 4 | 5 | 6;
  sentences: ValidatedSentence[];
}

export type ValidationResult =
  | { ok: true; sections: ValidatedSection[] }
  | { ok: false; failed: ValidationCode[] };

export interface ValidationContext {
  /** From prepareTokens(...).tokens — every valid "ref.field" key. */
  tokens: Readonly<Record<string, string>>;
  /** From prepareTokens(...).sourceRefs — every valid bare ref for `sources`. */
  sourceRefs: ReadonlySet<string>;
  /** From prepareTokens(...).requiredSentences. */
  requiredSentences: readonly RequiredSentence[];
  /** From prepareTokens(...).goalRefs, e.g. ["G1","G2"]. For V6. */
  goalRefs: readonly string[];
}

const STEPS = [1, 2, 3, 4, 5, 6] as const;

/** Matches a whole `[[ref.field]]` token: ref starts with a letter, field is snake_case. */
const TOKEN_RE = /^\[\[([A-Za-z][A-Za-z0-9]*)\.([a-z][a-z_]*)\]\]$/;

/** Matches any `[[...]]`-shaped span, valid or not — used to strip tokens for V3. */
const BRACKET_SPAN_RE = /\[\[[^[\]]*\]\]/g;

interface RawSentence {
  text: unknown;
  sources: unknown;
}

interface RawSection {
  step: unknown;
  sentences: unknown;
}

interface RawOutput {
  sections: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * V1: valid JSON, matches schema, exactly 6 sections in order (step 1..6,
 * one each, matching array position), each with at least 1 sentence.
 * Returns the parsed, shape-checked sections, or null if V1 fails.
 */
function checkV1(raw: string): ValidatedSection[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const { sections } = parsed as unknown as RawOutput;
  if (!Array.isArray(sections) || sections.length !== 6) return null;

  const result: ValidatedSection[] = [];
  for (let i = 0; i < STEPS.length; i++) {
    const expectedStep = STEPS[i] as 1 | 2 | 3 | 4 | 5 | 6;
    const section = sections[i];
    if (!isRecord(section)) return null;
    const { step, sentences } = section as unknown as RawSection;
    if (step !== expectedStep) return null;
    if (!Array.isArray(sentences) || sentences.length < 1) return null;

    const sentenceResults: ValidatedSentence[] = [];
    for (const sentence of sentences) {
      if (!isRecord(sentence)) return null;
      const { text, sources } = sentence as unknown as RawSentence;
      if (typeof text !== "string") return null;
      if (!Array.isArray(sources) || !sources.every((s) => typeof s === "string")) {
        return null;
      }
      sentenceResults.push({ text, sources: sources as string[] });
    }
    result.push({ step: expectedStep, sentences: sentenceResults });
  }
  return result;
}

/** Every `[[...]]`-shaped span in the sentence text, valid-grammar or not. */
function bracketSpans(text: string): string[] {
  return text.match(BRACKET_SPAN_RE) ?? [];
}

/** Every grammar-valid token's "ref.field" pair, e.g. [["M1","change_phrase"]]. */
function validTokenRefsAndFields(text: string): Array<{ ref: string; field: string; key: string }> {
  return bracketSpans(text).flatMap((span) => {
    const match = TOKEN_RE.exec(span);
    if (!match) return [];
    const [, ref, field] = match;
    return [{ ref: ref ?? "", field: field ?? "", key: `${ref}.${field}` }];
  });
}

function refFamily(ref: string): string {
  const match = /^([A-Za-z]+)/.exec(ref);
  return match ? (match[1] as string) : ref;
}

/**
 * SPEC.md 5.9 V1-V8, run against already-V1-valid sections. V2 checks
 * grammar/existence for every apparent token; V3 checks no stray digit
 * survives once tokens (valid or not) are stripped; V4 checks every cited
 * source ref exists; V5 checks required sentences appear verbatim; V6
 * checks step 3 names every goal; V7 checks steps 4-6 stay on their own
 * evidence; V8 checks step 6 uses only C/G/P tokens.
 */
function checkRemaining(
  sections: ValidatedSection[],
  context: ValidationContext,
): ValidationCode[] {
  const failed = new Set<ValidationCode>();

  // V2: every apparent [[...]] token matches the grammar and exists.
  for (const section of sections) {
    for (const sentence of section.sentences) {
      for (const span of bracketSpans(sentence.text)) {
        const match = TOKEN_RE.exec(span);
        if (!match) {
          failed.add("V2");
          continue;
        }
        const [, ref, field] = match;
        if (!(`${ref}.${field}` in context.tokens)) {
          failed.add("V2");
        }
      }
    }
  }

  // V3: after removing every [[...]]-shaped span, no digit remains.
  for (const section of sections) {
    for (const sentence of section.sentences) {
      const withoutTokens = sentence.text.replace(BRACKET_SPAN_RE, "");
      if (/[0-9]/.test(withoutTokens)) {
        failed.add("V3");
      }
    }
  }

  // V4: every cited source ref exists.
  for (const section of sections) {
    for (const sentence of section.sentences) {
      for (const source of sentence.sources) {
        if (!context.sourceRefs.has(source)) {
          failed.add("V4");
        }
      }
    }
  }

  // V5: every required sentence appears verbatim in its named step.
  for (const required of context.requiredSentences) {
    const section = sections.find((s) => s.step === required.step);
    const present = section?.sentences.some((sentence) => sentence.text === required.text) ?? false;
    if (!present) {
      failed.add("V5");
    }
  }

  // V6: step 3 contains [[G{n}.label]] for every goal.
  const step3 = sections.find((s) => s.step === 3);
  const step3Text = step3 ? step3.sentences.map((s) => s.text).join(" ") : "";
  for (const goalRef of context.goalRefs) {
    if (!step3Text.includes(`[[${goalRef}.label]]`)) {
      failed.add("V6");
    }
  }

  // V7: in steps 4/5/6, every sentence contains a B/R/C token respectively,
  // or is a required sentence for that step.
  const requiredTextsByStep = new Map<number, Set<string>>();
  for (const required of context.requiredSentences) {
    const set = requiredTextsByStep.get(required.step) ?? new Set<string>();
    set.add(required.text);
    requiredTextsByStep.set(required.step, set);
  }
  const evidenceFamilyByStep: Record<4 | 5 | 6, string> = { 4: "B", 5: "R", 6: "C" };
  for (const step of [4, 5, 6] as const) {
    const section = sections.find((s) => s.step === step);
    if (!section) continue;
    const requiredTexts = requiredTextsByStep.get(step) ?? new Set<string>();
    for (const sentence of section.sentences) {
      if (requiredTexts.has(sentence.text)) continue;
      const hasEvidence = validTokenRefsAndFields(sentence.text).some(
        (t) => refFamily(t.ref) === evidenceFamilyByStep[step],
      );
      if (!hasEvidence) {
        failed.add("V7");
      }
    }
  }

  // V8: step 6 contains no token other than C, G and P tokens.
  const step6 = sections.find((s) => s.step === 6);
  if (step6) {
    for (const sentence of step6.sentences) {
      for (const { ref } of validTokenRefsAndFields(sentence.text)) {
        const family = refFamily(ref);
        if (family !== "C" && family !== "G" && family !== "P") {
          failed.add("V8");
        }
      }
    }
  }

  return [...failed];
}

/** Server post-processing (SPEC 5.9): sources = model's sources ∪ every ref found in the sentence's tokens. */
function withResolvedSources(sections: ValidatedSection[]): ValidatedSection[] {
  return sections.map((section) => ({
    step: section.step,
    sentences: section.sentences.map((sentence) => {
      const tokenRefs = validTokenRefsAndFields(sentence.text).map((t) => t.ref);
      const sources = [...new Set([...sentence.sources, ...tokenRefs])];
      return { text: sentence.text, sources };
    }),
  }));
}

export function validateModelOutput(raw: string, context: ValidationContext): ValidationResult {
  const sections = checkV1(raw);
  if (sections === null) {
    return { ok: false, failed: ["V1"] };
  }

  const failed = checkRemaining(sections, context);
  if (failed.length > 0) {
    // Keep V1..V8 order regardless of the Set's insertion order.
    const order: ValidationCode[] = ["V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8"];
    return { ok: false, failed: order.filter((code) => failed.includes(code)) };
  }

  return { ok: true, sections: withResolvedSources(sections) };
}
