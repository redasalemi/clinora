import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/auth/logout", () => {
  it("clears the session cookie and redirects to /login", async () => {
    const response = await POST(new Request("http://localhost/api/auth/logout", { method: "POST" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost/login");

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("cw_session=;");
    expect(setCookie).toMatch(/max-age=0/i);
  });
});
