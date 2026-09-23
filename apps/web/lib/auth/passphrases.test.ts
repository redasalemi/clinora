import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidPassphrase } from "./passphrases";

// Every passphrase below is a made-up fixture value, not a real credential.
describe("isValidPassphrase", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a passphrase in the allowlist", () => {
    vi.stubEnv("AUTH_TESTER_PASSPHRASES", "alpha-fake, bravo-fake ,charlie-fake");
    expect(isValidPassphrase("bravo-fake")).toBe(true);
  });

  it("rejects a passphrase not in the allowlist", () => {
    vi.stubEnv("AUTH_TESTER_PASSPHRASES", "alpha-fake,bravo-fake");
    expect(isValidPassphrase("not-in-list")).toBe(false);
  });

  it("rejects everything when the allowlist is empty", () => {
    vi.stubEnv("AUTH_TESTER_PASSPHRASES", "");
    expect(isValidPassphrase("anything")).toBe(false);
  });

  it("rejects everything when the env var is unset", () => {
    expect(isValidPassphrase("anything")).toBe(false);
  });

  it("does not match on partial or whitespace-padded input", () => {
    vi.stubEnv("AUTH_TESTER_PASSPHRASES", "alpha-fake");
    expect(isValidPassphrase("alpha-fak")).toBe(false);
    expect(isValidPassphrase("alpha-fakee")).toBe(false);
    expect(isValidPassphrase(" alpha-fake")).toBe(false);
    expect(isValidPassphrase("alpha-fake ")).toBe(false);
  });

  it("is case-sensitive", () => {
    vi.stubEnv("AUTH_TESTER_PASSPHRASES", "Alpha-Fake");
    expect(isValidPassphrase("alpha-fake")).toBe(false);
    expect(isValidPassphrase("Alpha-Fake")).toBe(true);
  });

  it("ignores empty entries from stray commas", () => {
    vi.stubEnv("AUTH_TESTER_PASSPHRASES", "alpha-fake,,bravo-fake,");
    expect(isValidPassphrase("")).toBe(false);
  });
});
