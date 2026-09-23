// [A] Placeholder authenticated Home screen. The real Home (free-report
// counter, "New report", "Resume draft") is cut for this slice — see
// NOT-NOW.md items 1 and 10. This page exists only to prove the auth flow
// end-to-end (an authenticated session reaches "/", sign out clears it)
// ahead of the report screens, which are a later slice.
export default function HomePage() {
  return (
    <main>
      <h1>Clinora</h1>
      <p>You are signed in. The report workflow is not built yet.</p>
      <form action="/api/auth/logout" method="post">
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
