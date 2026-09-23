// Stateless, signed session cookie for the passphrase login (NOT-NOW.md
// item 2). No session table — SPEC.md 2.1 already says "Sessions: signed
// cookie, no table," which still holds with passphrases instead of magic
// links.
//
// [A] Uses the Web Crypto API (globalThis.crypto.subtle) instead of
// node:crypto, so this module runs unmodified whichever runtime the
// middleware executes under (Edge or Node.js) — this app is self-hosted on
// AWS App Runner, not Vercel, so neither is assumed.

export const COOKIE_NAME = "cw_session"; // [A] not specified by SPEC.md

// [A] NOT-NOW.md only names httpOnly/Secure/SameSite=Lax as the cookie
// settings to keep from US-01; it doesn't cut the 30-day lifetime, so it's
// kept too.
export const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return secret;
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Creates a signed session token: `<expiresAtMs>.<base64url HMAC-SHA256>`.
 * The payload carries nothing but an expiry timestamp — no participant
 * content, no tester identity (H1).
 */
export async function createSessionToken(now: number = Date.now()): Promise<string> {
  const expiresAt = now + SESSION_DURATION_MS;
  const payload = String(expiresAt);
  const key = await importKey(getSecret());
  const signatureBytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${base64UrlEncode(new Uint8Array(signatureBytes))}`;
}

export async function isValidSessionToken(
  token: string | undefined | null,
  now: number = Date.now(),
): Promise<boolean> {
  if (!token) return false;

  const dot = token.indexOf(".");
  if (dot === -1) return false;

  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!/^\d+$/.test(payload)) return false;

  let secret: string;
  try {
    secret = getSecret();
  } catch {
    return false;
  }

  let signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    signatureBytes = base64UrlDecode(signature);
  } catch {
    return false;
  }

  const key = await importKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    new TextEncoder().encode(payload),
  );
  if (!valid) return false;

  return Number(payload) > now;
}
