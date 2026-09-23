import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { COOKIE_NAME, SESSION_DURATION_MS, createSessionToken } from "./lib/auth/session";

function requestTo(path: string, cookieHeader?: string) {
  const headers = new Headers();
  if (cookieHeader) headers.set("cookie", cookieHeader);
  return new NextRequest(`http://localhost${path}`, { headers });
}

describe("proxy", () => {
  beforeEach(() => {
    vi.stubEnv("SESSION_SECRET", "test-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects an unauthenticated page request to /login", async () => {
    const response = await proxy(requestTo("/report/setup"));
    expect(response.status).toBeGreaterThanOrEqual(300);
    expect(response.status).toBeLessThan(400);
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });

  it("redirects an unauthenticated request to the bare root", async () => {
    const response = await proxy(requestTo("/"));
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });

  it("returns 401 JSON for an unauthenticated /api/* request, not a redirect", async () => {
    const response = await proxy(requestTo("/api/generate"));
    expect(response.status).toBe(401);
    expect(response.headers.get("location")).toBeNull();
    expect(await response.json()).toEqual({ error: "UNAUTHENTICATED" });
  });

  it("passes an authenticated page request through", async () => {
    const token = await createSessionToken();
    const response = await proxy(requestTo("/report/setup", `${COOKIE_NAME}=${token}`));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("passes an authenticated /api/* request through", async () => {
    const token = await createSessionToken();
    const response = await proxy(requestTo("/api/generate", `${COOKIE_NAME}=${token}`));
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("treats an expired session as unauthenticated", async () => {
    const token = await createSessionToken(Date.now() - SESSION_DURATION_MS - 1000);
    const response = await proxy(requestTo("/", `${COOKIE_NAME}=${token}`));
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });

  it("treats a tampered session token as unauthenticated", async () => {
    const token = await createSessionToken();
    // Flip the signature's first character, not the token's last: the final
    // base64url character of a 32-byte signature can carry unused padding
    // bits, so tampering there can occasionally leave the decoded bytes
    // (and so the verification result) unchanged.
    const dot = token.indexOf(".");
    const signature = token.slice(dot + 1);
    const flippedChar = signature.at(0) === "A" ? "B" : "A";
    const tampered = `${token.slice(0, dot + 1)}${flippedChar}${signature.slice(1)}`;
    const response = await proxy(requestTo("/", `${COOKIE_NAME}=${tampered}`));
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });

  it("treats a missing cookie as unauthenticated, not an error", async () => {
    const response = await proxy(requestTo("/"));
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });
});
