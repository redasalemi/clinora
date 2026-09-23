// [A] SPEC.md/NOT-NOW.md don't specify the env var's format. Simplest
// option: one comma-separated list of plaintext passphrases, one per
// tester. The app never associates a passphrase with a tester's name —
// that mapping, if wanted, stays with whoever hands the passphrases out,
// outside the app.
function getAllowlist(): string[] {
  const raw = process.env.AUTH_TESTER_PASSPHRASES ?? "";
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

// [A] Avoids node:crypto so this works whether this runs under the Edge
// runtime or Node.js. Not cryptographically rigorous, but proportionate for
// a small allowlist of tester passphrases, not a public auth system.
function timingSafeStringEqual(a: string, b: string): boolean {
  const maxLength = Math.max(a.length, b.length);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < maxLength; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export function isValidPassphrase(candidate: string): boolean {
  const allowlist = getAllowlist();
  let matched = false;
  for (const passphrase of allowlist) {
    if (timingSafeStringEqual(candidate, passphrase)) matched = true;
  }
  return matched;
}
