// [A] Replaces US-01's magic-link /login screen per NOT-NOW.md item 2: one
// passphrase field instead of email + practice name. Plain HTML form (no
// client JS) posting to /api/auth/login, which redirects back here with
// ?error=1 on failure — the simplest option that still gives feedback.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const hasError = params.error === "1";

  return (
    <main>
      <h1>Sign in</h1>
      <form action="/api/auth/login" method="post">
        <label htmlFor="passphrase">Passphrase</label>
        <input
          id="passphrase"
          name="passphrase"
          type="password"
          autoComplete="off"
          required
        />
        <button type="submit">Sign in</button>
      </form>
      {hasError ? (
        <p role="alert">That passphrase isn&apos;t recognised.</p>
      ) : null}
    </main>
  );
}
