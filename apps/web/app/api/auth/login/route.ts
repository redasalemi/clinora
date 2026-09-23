import { NextResponse } from "next/server";
import { isValidPassphrase } from "@/lib/auth/passphrases";
import { COOKIE_NAME, SESSION_DURATION_MS, createSessionToken } from "@/lib/auth/session";

export async function POST(request: Request) {
  const formData = await request.formData().catch(() => null);
  const passphrase = formData?.get("passphrase");

  if (typeof passphrase !== "string" || passphrase.length === 0 || !isValidPassphrase(passphrase)) {
    // [A] Same redirect regardless of why it failed (missing field, unknown
    // passphrase), so the allowlist's contents can't be probed from outside.
    return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  }

  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set(COOKIE_NAME, await createSessionToken(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
  return response;
}
