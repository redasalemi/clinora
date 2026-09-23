Clinora is a web app for NDIS exercise physiologists (EPs). It turns goals and retest scores into a checked, goal-linked NDIS progress report that the EP reviews and signs. Deterministic code calculates every number. AI writes prose only around locked number tokens.

Read SPEC.md and NOT-NOW.md at the start of every session.

Stack
TypeScript
Next.js, App Router
PostgreSQL with Prisma
AWS SES (magic-link email)
AWS App Runner (one container)
Region: ap-southeast-2 for everything
Tests: Vitest

Verify App Runner and SES availability in ap-southeast-2 before starting.

Repo layout
packages/engine    pure TypeScript, no I/O. Calculation, gap rules, token resolution, validation.
                   Imported by client and server. The server result is authoritative.
apps/web           Next.js app: UI plus API routes.
data/              static data: measures.ts, thresholds.json
test/fixtures/     fake values for tests only
SPEC.md            what to build
NOT-NOW.md         what not to build
CLAUDE.md          this file
.env               secrets, never pasted into chat, never committed
Hard rules

A violation of H1 to H8 is a bug, not a trade-off. Do not weigh them against speed, convenience or a cleaner design.

H1. Never write participant content (goals, scores, notes, barriers, risks, recommendations, draft text) to the database, logs, error trackers or analytics. Participant content exists only in the request, in the browser, and in the Bedrock call.
H2. Run inference only on Amazon Bedrock with an Australian geographic inference profile (Sydney and Melbourne). Never call api.anthropic.com or any non-AU LLM endpoint. Read the model ID and profile from env BEDROCK_MODEL_ID. Never hardcode them.
H3. Never add third-party analytics, session replay, keystroke capture, or error tools that capture request bodies.
H4. Never log request bodies. Never log headers. Log only method, path, status and duration.
H5. Never write any real threshold value from your own memory. data/thresholds.json ships with "rows": []. Reda adds rows with an AEP, each with a citation. Use clearly fake values in test/fixtures/ only.
H6. Never let AI output contain a numeral outside a locked token (SPEC.md 5.9). Enforce it with validation V1 to V8.
H7. Never let the app output any of these: "NDIS-compliant", "audit-proof", "clinically significant" (as an automatic verdict), "Privacy Act compliant", "HIPAA", "fully de-identified", "improves funding outcomes".
H8. Export only. Never submit anything to an NDIA portal.
Working rules

Write tests with every feature. Run them before saying done. Do not say done on a red or unrun test suite.
Never commit secrets. Secrets live in .env and are never pasted into chat.
Never touch production data.
Ask before adding a new dependency.
Stay inside SPEC.md. Anything else goes in NOT-NOW.md.
If SPEC.md and NOT-NOW.md conflict, NOT-NOW.md wins. Do not build the item.
Export is formatted copy-paste (HTML to clipboard). Do not build .docx export. It is build-next, after EP validation.
Do not fill any threshold data. See H5.
Plan first. Build one slice per session. Commit after every green slice.
Where SPEC.md is silent, pick the simplest option, mark it [A] in the code comment or PR note, and continue. Do not ask.
Commands

npm workspaces (packages/engine, apps/web). Run from the repo root.
Install:   npm install
Dev:       npm run dev            (apps/web only, via next dev)
Build:     npm run build          (apps/web only, via next build)
Test:      npm run test           (both workspaces, via vitest run)
Typecheck: npm run typecheck      (both workspaces, via tsc --noEmit)
Lint: not set up yet. Record the real command here when it is — do not guess one.
