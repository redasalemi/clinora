import { NextResponse } from "next/server";
import { THRESHOLDS, type GenerationDraft, type ParticipantContext } from "@clinora/engine";
import { runGeneration } from "@/lib/generate/orchestrate";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * [A] Full per-field input validation (US-02 to US-06's own 422
 * INPUT_INVALID rules — text lengths, date ranges, enum values, and so on)
 * is a separate slice; those screens own their own field checks before a
 * draft ever reaches this endpoint. This only checks the shape generation
 * itself needs to avoid crashing on a malformed body.
 */
function parseRequestBody(
  body: unknown,
): { draft: GenerationDraft; context: ParticipantContext } | null {
  if (!isPlainObject(body)) return null;
  const participantContext = body["participant_context"];
  const draft = body["draft"];
  if (!isPlainObject(participantContext) || !isPlainObject(draft)) return null;

  const requiredArrayFields = ["goals", "measures", "barriers", "risks", "recommendations"] as const;
  for (const field of requiredArrayFields) {
    if (!Array.isArray(draft[field])) return null;
  }

  return {
    context: participantContext as unknown as ParticipantContext,
    draft: draft as unknown as GenerationDraft,
  };
}

// SPEC.md US-08. Next's route-handler type checker (verified by `next build`)
// requires POST to match its own (request, context) signature exactly, so
// this can't take an extra parameter for test injection the way the auth
// routes' single-arg handlers could get away with — route.test.ts mocks
// "@/lib/generate/bedrock" instead, so the real runGeneration retry logic
// still runs in tests, only the actual network call is replaced. [A]
export async function POST(request: Request) {
  const startedAt = Date.now();
  let status = 500;
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      status = 422;
      return NextResponse.json({ error: "INPUT_INVALID", fields: ["body"] }, { status });
    }

    const parsed = parseRequestBody(body);
    if (!parsed) {
      status = 422;
      return NextResponse.json({ error: "INPUT_INVALID", fields: ["draft"] }, { status });
    }

    const result = await runGeneration(parsed.draft, parsed.context, THRESHOLDS);

    if (!result.ok) {
      // SPEC.md 5.9: second failure -> 502 GENERATION_FAILED. Free-report
      // counting and its telemetry event are both cut (NOT-NOW.md items 1, 4).
      status = 502;
      return NextResponse.json({ error: "GENERATION_FAILED" }, { status });
    }

    status = 200;
    return NextResponse.json({ sections: result.sections, tokens: result.tokens }, { status });
  } finally {
    // NOT-NOW.md item 4: "one server log line per generation with duration
    // and success or failure. No content in the log line (H1, H4)."
    console.log(
      JSON.stringify({
        method: "POST",
        path: "/api/generate",
        status,
        duration_ms: Date.now() - startedAt,
      }),
    );
  }
}
