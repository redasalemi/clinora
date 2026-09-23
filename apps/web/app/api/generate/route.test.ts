import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocked before importing route.ts, so the real runGeneration retry logic
// still runs in these tests — only the actual Bedrock network call (the
// one thing this app can't unit-test without live AWS credentials) is
// replaced. See route.ts's POST doc comment for why this isn't parameter
// injection like the auth routes use.
vi.mock("@/lib/generate/bedrock", () => ({
  callBedrock: vi.fn(),
}));

import { callBedrock } from "@/lib/generate/bedrock";
import { POST } from "./route";

const mockCallBedrock = vi.mocked(callBedrock);

function sentence(text: string, sources: string[] = []) {
  return { text, sources };
}

function happyPathRaw(): string {
  return JSON.stringify({
    sections: [
      { step: 1, sentences: [sentence("Assessed with [[M1.name]] at baseline.", ["M1"])] },
      {
        step: 2,
        sentences: [sentence("[[M1.name]] at [[M1.baseline_date]].", ["M1"])],
      },
      {
        step: 3,
        sentences: [sentence("[[G1.label]] shows [[M1.change_phrase]].", ["G1", "M1"])],
      },
      { step: 4, sentences: [sentence("Noted: [[B1.text]]", ["B1"])] },
      { step: 5, sentences: [sentence("Noted: [[R1.text]]", ["R1"])] },
      { step: 6, sentences: [sentence("Recommended: [[C1.text]]", ["C1"])] },
    ],
  });
}

const VALID_BODY = {
  participant_context: { age_band: "65-74", population_code: "test_population_a" },
  draft: {
    period: { start: "2026-03-02", end: "2026-08-28" },
    supports_text: "Individual exercise physiology, 2 times per week.",
    goals: [
      {
        uid: "g1",
        ndis_goal_text: "I want to walk to the shops.",
        therapy_goal_text: "Increase community walking endurance.",
        status: "partially_achieved",
        linked_measure_uids: ["m1"],
      },
    ],
    measures: [
      {
        uid: "m1",
        test_id: "TUG",
        baseline_value: 20.0,
        baseline_date: "2026-03-02",
        current_value: 15.0,
        current_date: "2026-08-24",
        same_conditions: true,
      },
    ],
    barriers: [{ uid: "b1", text: "Fear of falling limits outdoor practice.", goal_uids: ["g1"] }],
    risks: [{ uid: "r1", text: "Ongoing falls risk on uneven ground." }],
    recommendations: [{ uid: "c1", text: "Continue individual sessions.", goal_uids: ["g1"] }],
    shorthand: "TUG improved, no aid indoors",
  },
};

function requestWith(body: unknown): Request {
  return new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mockCallBedrock.mockReset();
});

describe("POST /api/generate", () => {
  it("returns 200 with sections and tokens on a successful generation", async () => {
    mockCallBedrock.mockResolvedValue(happyPathRaw());
    const response = await POST(requestWith(VALID_BODY));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.sections).toHaveLength(6);
    expect(body.tokens["G1.label"]).toBe("Goal 1");
  });

  it("returns 422 INPUT_INVALID for malformed JSON", async () => {
    const request = new Request("http://localhost/api/generate", {
      method: "POST",
      body: "not json",
    });
    const response = await POST(request);
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("INPUT_INVALID");
    expect(mockCallBedrock).not.toHaveBeenCalled();
  });

  it("returns 422 INPUT_INVALID when required array fields are missing", async () => {
    const response = await POST(requestWith({ participant_context: {}, draft: { period: {} } }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("INPUT_INVALID");
    expect(mockCallBedrock).not.toHaveBeenCalled();
  });

  it("returns 502 GENERATION_FAILED after both attempts fail", async () => {
    mockCallBedrock.mockResolvedValue("not valid json");
    const response = await POST(requestWith(VALID_BODY));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toBe("GENERATION_FAILED");
    expect(mockCallBedrock).toHaveBeenCalledTimes(2);
  });

  it("succeeds after exactly one retry", async () => {
    mockCallBedrock
      .mockResolvedValueOnce("not valid json")
      .mockResolvedValueOnce(happyPathRaw());
    const response = await POST(requestWith(VALID_BODY));
    expect(response.status).toBe(200);
    expect(mockCallBedrock).toHaveBeenCalledTimes(2);
  });

  it("logs only method/path/status/duration_ms — never participant content (H1, H4; NOT-NOW.md item 4)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      mockCallBedrock.mockResolvedValue(happyPathRaw());
      await POST(requestWith(VALID_BODY));
      expect(logSpy).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
      expect(logged).toEqual({
        method: "POST",
        path: "/api/generate",
        status: 200,
        duration_ms: expect.any(Number),
      });
      const loggedText = JSON.stringify(logged);
      expect(loggedText).not.toContain("shops");
      expect(loggedText).not.toContain("falling");
    } finally {
      logSpy.mockRestore();
    }
  });
});
