# NOT-NOW.md

Do not build anything in this file in the current build. Do not start it, stub it, or add hooks for it.

Precedence: if `SPEC.md` specifies something listed here, this file wins. Skip it.

If you find yourself wanting to build something that is in neither `SPEC.md` nor this file, add one line to section C and carry on. Do not build it.

---

## A. Explicitly out of scope (SPEC.md section 6)

From the Blueprint's "DO NOT BUILD YET" and Part 8 exclusions:
- Audio or ambient scribing.
- Practice management features.
- Mobile app.
- Portal submission of any kind.
- AI-originated recommendations, supports, or hours.
- Persistent participant records or any stored participant content.
- File uploads.
- Fine-tuned or custom models.
- Cross-practice analytics or cross-practice learning on content.
- FCA, assistive technology, or initial-assessment reports.
- Other disciplines (physio, OT, speech).
- Chrome extension.
- Session-replay analytics or analytics tools that capture typed text.
- An in-house de-identification model.

From the Blueprint's "NICE TO HAVE (weeks 2 to 4)":
- PDF export, letterhead upload, practice style profile, plain-language participant summary, duplicate last report, `_NF` time note, extra seats.

From the scope line and the Blueprint's later phases:
- PMS integration (Cliniko import, Splose), multi-funder renderers (DVA, Medicare, WorkCover), the persistent evidence log and retest capture, owner review mode across juniors' drafts.

Left out because the Blueprint lists them but the MVP has no UI for them [A]:
- Per-section thumbs, template chooser, overriding a calculated number with a reason (to change a number, change the input), MFA, Stripe webhook, in-app admin console.

---

## B. Cut from the current build (SPEC.md cut list items 1, 2, 4, 5, 6, 9, 10)

Item numbers match the original cut list. Each item says what not to build, which SPEC.md parts it overrides, and what to do instead.

### 1. Payments
Not now: US-13, screen 11 (`/report/paywall`), `practices.plan`, `practices.free_reports_used`, the `report_generations` table, the 402 `PAYWALL` error, `STRIPE_PAYMENT_LINK_URL`, the home screen free-report counter, the paywall test in 5.10.
Instead: testers are free. Invoice by hand later.
Cost: leaves assumption A2 (will they pay) untested. The 28-day plan tests it anyway.

### 2. Magic-link auth
Not now: US-01 magic-link flow, `login_tokens`, AWS SES, `/auth/verify`, POST `/api/auth/request`.
Instead: an env-var allowlist of passphrases, one per tester. Entering a valid passphrase sets the session cookie. Keep the cookie settings from US-01 (httpOnly, Secure, SameSite=Lax). This still stops the public burning the Bedrock budget.
Cost: must be redone before real customers.

### 4. Telemetry
Not now: US-14, the `events` table, `/api/events`, and every "emits telemetry" line in US-08, US-10, US-11 and US-12.
Instead: a stopwatch in the watched session, and one server log line per generation with duration and success or failure. No content in the log line (H1, H4).
Keep: the identifier warning itself (US-12). Only its telemetry emission is cut.
Cost: you lose the edited-sentence metric. You can see edits live.

### 5. Override-with-reason
Not now: the typed-reason UI, `gap_overrides`, the override condition in US-07 and US-10.
Instead: non-critical flags (R3 and any others still active) are warnings. Approve requires a tick: "I have seen these flags". Critical flags still block Approve.

### 6. Rules R5 and R6, and structured supports
Not now: gap rules R5 and R6, and supports as structured rows (US-02 supports rows, the `supports` array in 2.2, `frequency_count`, `frequency_per`, `duration_minutes`).
Instead: supports become one free-text field. The gap checker runs R1 to R4 only.
Token handling [A]: the free-text field is one clinician-entered verbatim token, `[[S.text]]`, in the same way as barriers, risks and recommendations. Length 1 to 1000 chars. The `S1..Sn` tokens with `phrase` are not built.
Reason: neither rule touches the number chain.

### 9. Stale-draft hashing and regeneration cap
Not now: `inputs_hash`, staleness detection, the 409 `REGEN_CAP` error, the max-5-generations limit.
Instead: any input edit after generation clears the generated draft and the approval. Regeneration is then required.

### 10. localStorage persistence and 24 h purge
Not now: the `cw_draft_v1` localStorage key, the 24 hour purge, "Resume draft" on the home screen, the localStorage delete on export.
Instead: the report draft lives in memory only.
Cost: a refresh loses the tester's work mid-demo.

### Consequence of items 1, 2 and 4 together
`practices`, `login_tokens`, `report_generations` and `events` are all cut. No server-persisted tables remain. Do not create migrations or tables. Do not remove PostgreSQL or Prisma from the stack. Ask first if a table appears necessary.

---

## C. Added during the build

(One line per item. Date and reason.)
