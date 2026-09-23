import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COOKIE_NAME,
  SESSION_DURATION_MS,
  createSessionToken,
  isValidSessionToken,
} from "./session";

describe("session token", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", "test-secret-value");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("has a cookie name", () => {
    expect(COOKIE_NAME).toBe("cw_session");
  });

  it("round-trips: a freshly created token is valid", async () => {
    const token = await createSessionToken();
    expect(await isValidSessionToken(token)).toBe(true);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken();
    vi.stubEnv("SESSION_SECRET", "a-different-secret");
    expect(await isValidSessionToken(token)).toBe(false);
  });

  it("rejects a tampered signature", async () => {
    const token = await createSessionToken();
    const [payload, signature] = token.split(".") as [string, string];
    // Flip the first character, not the last: a base64url signature's final
    // character can carry unused padding bits, so tampering it there can
    // occasionally leave the decoded bytes unchanged (e.g. "A" <-> "B" both
    // decode to the same byte once the real data bits are accounted for).
    const flippedChar = signature.at(0) === "A" ? "B" : "A";
    const tampered = `${payload}.${flippedChar}${signature.slice(1)}`;
    expect(await isValidSessionToken(tampered)).toBe(false);
  });

  it("rejects a tampered payload (extended expiry) even with the original signature", async () => {
    const token = await createSessionToken();
    const [, signature] = token.split(".") as [string, string];
    const farFuture = Date.now() + SESSION_DURATION_MS * 100;
    const tampered = `${farFuture}.${signature}`;
    expect(await isValidSessionToken(tampered)).toBe(false);
  });

  it("rejects an expired token", async () => {
    const now = Date.now();
    const token = await createSessionToken(now - SESSION_DURATION_MS - 1000);
    expect(await isValidSessionToken(token, now)).toBe(false);
  });

  it("accepts a token right up to (but not past) its expiry", async () => {
    const now = Date.now();
    const token = await createSessionToken(now - SESSION_DURATION_MS + 1000);
    expect(await isValidSessionToken(token, now)).toBe(true);
  });

  it("rejects malformed tokens", async () => {
    expect(await isValidSessionToken("not-a-token")).toBe(false);
    expect(await isValidSessionToken("")).toBe(false);
    expect(await isValidSessionToken(null)).toBe(false);
    expect(await isValidSessionToken(undefined)).toBe(false);
    expect(await isValidSessionToken("abc.def")).toBe(false); // non-numeric payload
  });

  it("throws from createSessionToken when SESSION_SECRET is not configured", async () => {
    vi.unstubAllEnvs();
    await expect(createSessionToken()).rejects.toThrow();
  });

  it("treats a missing SESSION_SECRET as an invalid token rather than throwing", async () => {
    const token = await createSessionToken();
    vi.unstubAllEnvs();
    expect(await isValidSessionToken(token)).toBe(false);
  });
});
