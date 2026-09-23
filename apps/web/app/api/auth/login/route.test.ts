import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

function formRequest(fields: Record<string, string>) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_TESTER_PASSPHRASES", "alpha-fake,bravo-fake");
    vi.stubEnv("SESSION_SECRET", "test-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sets a session cookie and redirects home for a valid passphrase", async () => {
    const response = await POST(formRequest({ passphrase: "bravo-fake" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/");

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("cw_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie.toLowerCase()).toContain("samesite=lax");
  });

  it("redirects back to /login with an error flag for an invalid passphrase, and sets no cookie", async () => {
    const response = await POST(formRequest({ passphrase: "not-real" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login?error=1");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("redirects with an error flag when no passphrase field is submitted", async () => {
    const response = await POST(formRequest({}));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login?error=1");
  });

  it("never leaks the submitted passphrase back in the response body", async () => {
    const response = await POST(formRequest({ passphrase: "bravo-fake" }));
    const text = await response.text();
    expect(text).not.toContain("bravo-fake");
  });
});
