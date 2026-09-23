import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth/session";

// US-01: "Sign out clears the cookie." — kept as-is by NOT-NOW.md item 2.
export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url), 303);
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
