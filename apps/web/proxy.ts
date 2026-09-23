import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, isValidSessionToken } from "@/lib/auth/session";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const authenticated = await isValidSessionToken(token);

  if (authenticated) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api")) {
    // US-01: "Unauthenticated /api/* returns 401." — kept by NOT-NOW item 2.
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  // US-01: "Unauthenticated requests to /report/* redirect to /login."
  // [A] Extended to every page besides /login: there's no unauthenticated
  // Home variant in this app, so the whole app is protected by default.
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // Runs on everything except /login itself, the auth API routes, and
  // Next's own static/image internals. [A]
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};
