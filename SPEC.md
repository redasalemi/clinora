# Clinora MVP Spec v1 (SPEC.md)

Source: Clinora.ai Pre-Build Blueprint (Parts 8 to 11, 16), dated Sep 19, 2026.

Tags: [E#] = evidence key from the Blueprint. [A] = assumption chosen here because the Blueprint is silent (simplest option picked). [H] = hypothesis. [V] = Reda's own decision.

Scope: standalone web app, NDIS only, 8 tests only, no PMS integration, no multi-funder, no persistent evidence record (stateless MVP).

Revisions applied to v1: (1) percentiles and norm data removed entirely; (2) export changed from .docx to formatted copy-paste (HTML to clipboard), replacing US-11.

Precedence: if this file and `NOT-NOW.md` conflict, `NOT-NOW.md` wins.

---

## 0. Build constraints for Claude Code

**Stack** [A]: TypeScript, Next.js (App Router), PostgreSQL (RDS) with Prisma, AWS SES for magic-link email, one container on AWS App Runner. Everything in `ap-southeast-2` (verify App Runner and SES availability there before starting). Tests: Vitest.

**Repo layout** [A]:
- `packages/engine`: pure TypeScript, no I/O. Calculation, gap rules, token resolution, validation. Imported by client and server. The server result is authoritative.
- `apps/web`: Next.js app (UI plus API routes).
- `data/measures.ts`, `data/thresholds.json`: static data (see 2.3).

**Hard rules (a violation is a bug, not a trade-off):**
- H1. Participant content (goals, scores, notes, barriers, risks, recommendations, draft text) is never written to the database, logs, error trackers or analytics. It exists in the request, in the browser, and in the Bedrock call only. [Blueprint Part 8]
- H2. Inference runs only on Amazon Bedrock with an Australian geographic inference profile (Sydney and Melbourne). No call to `api.anthropic.com` or any non-AU LLM endpoint. Model ID and profile come from env `BEDROCK_MODEL_ID`; do not hardcode. [E14]
- H3. No third-party analytics, session replay, keystroke capture, or error tools that capture request bodies. [Blueprint Part 8]
- H4. Request logging excludes bodies and headers other than method, path, status, duration.
- H5. Claude Code must NOT write any real threshold value from its own memory. `data/thresholds.json` ships with `"rows": []`. Rows are added by Reda with an AEP, each with a citation. Test fixtures use clearly fake values in `test/fixtures/` only.
- H6. AI output never contains a numeral outside a locked token (5.9).
- H7. The app never says "NDIS-compliant", "audit-proof", "clinically significant" (as an automatic verdict), "Privacy Act compliant", "HIPAA", "fully de-identified", or "improves funding outcomes". [Blueprint Part 9]
- H8. Export only. Nothing is ever submitted to an NDIA portal.

---

## 1. User stories

Persona (only one): **Owner-operator EP.** Runs or co-runs an NDIS-heavy EP practice, writes their own plan reassessment reports, is the account holder and the card-payer, is the clinician who reviews and signs. [Blueprint Parts 4, 11]

Core workflow (only one): goals, measures, links, gaps, generate, review, approve, export.

### US-01 Sign in
As the EP I sign in with my email so I can use the tool without a password.
- Form has email and practice name. Practice name is ignored if the email already has an account. [A]
- POST `/api/auth/request` always returns the same "check your email" response whether or not the account exists. [A]
- Magic link is single-use and expires in 15 minutes. Session is an httpOnly, Secure, SameSite=Lax cookie lasting 30 days. [A]
- Unauthenticated requests to `/report/*` redirect to `/login`. Unauthenticated `/api/*` returns 401.
- Sign out clears the cookie.

### US-02 Start a report and set context
As the EP I start a report and enter the period, the participant context used only to pick thresholds, and the supports delivered.
- "New report" creates `report_id` (UUID v4) in the browser. No server call.
- `period.start` and `period.end` are required, `start <= end`, neither in the future. [A]
- `age_band`, `sex`, `population_code` are required (options in 2.2). No field for exact age.
- Supports: 0 to 5 rows. Each has `type` (text 1 to 100), `frequency_count` (int 1 to 99 or empty), `frequency_per` (week, fortnight, month, or empty), `duration_minutes` (int 1 to 600 or empty). Empty frequency or duration is allowed at entry and is caught by gap rule R6.
- No input, label, placeholder or schema field anywhere in the app is for participant name, NDIS number or date of birth. A test scans the rendered DOM and the type definitions for these terms and fails if any is found.

### US-03 Enter goals
As the EP I paste the participant's NDIS goals verbatim and add my therapy goal for each.
- 1 to 5 goals. Each requires `ndis_goal_text` (1 to 500 chars), `therapy_goal_text` (1 to 500 chars), and `status` (achieved, partially_achieved, not_achieved). [A: status values, needed by R4]
- Goals are labelled Goal 1 to Goal n by position. Deleting a goal relabels the rest. Internal identity is a `uid`. [A]
- Pasted text is preserved exactly (no trimming beyond leading and trailing whitespace).
- Cannot proceed with 0 goals.

### US-04 Enter measures
As the EP I enter baseline and current scores for the tests I ran.
- Pick from the 8 tests only. Each test can appear once per report. [A]
- Per row: `baseline_value` (number or empty, with a "No baseline recorded" checkbox), `baseline_date`, `current_value`, `current_date`, `same_conditions` (Yes or No, no default, required). [A: no default so it is a deliberate choice]
- Validation from `data/measures.ts` (range, decimals, integer-only). Unit shown beside the input. "Lower is better" shown for TUG and 5x Sit-to-Stand.
- `baseline_date <= current_date`, neither in the future. `baseline_date` is required only when `baseline_value` is present.
- Live preview under each row, produced by the engine with no AI: change phrase, threshold label and direction (5.5).

### US-05 Link measures to goals
As the EP I link each measure to the goal it evidences.
- Matrix: goals as rows, measures as columns, checkbox per cell (many-to-many).
- Zero links is allowed at this screen. Rule R1 is the single point that enforces "each goal has a measure". [A: resolves a Blueprint inconsistency: the journey step says at least 1 link per goal, and R1 exists to catch exactly that]
- Deleting a measure removes its links.

### US-06 Enter barriers, risks, recommendations, shorthand
As the EP I add the context NDIA asks for and optional session shorthand.
- Barriers: 0 to 10, each `text` (1 to 300) plus `goal_ids` (0 or more goals).
- Risks: 0 to 10, each `text` (1 to 300). No goal link.
- Recommendations: 0 to 10, each `text` (1 to 300) plus `goal_ids` (0 or more goals). Clinician-entered only. The app has no button that suggests or generates a recommendation.
- Shorthand: optional, up to 5000 chars. Split on newlines into non-empty lines N1 to Nk, max 100 lines. [A]

### US-07 Run the gap check
As the EP I see what evidence is missing before I generate.
- Screen evaluates the 6 rules in section 4 on entry and on every input change.
- Each flag shows: rule ID, severity (critical or non-critical), plain message, target, and a link to the screen that fixes it.
- Critical flags cannot be overridden.
- Non-critical flags can be overridden with a typed reason (10 to 300 chars). [A]
- "Continue to generate" is always enabled. The gate is at Approve and Export (US-10, US-11). [A: Blueprint puts the gate at export]
- Zero flags shows "No gaps found by the 6 rules."

### US-08 Generate the draft
As the EP I generate a draft in NDIA's 6-step structure with numbers I can trust.
- POST `/api/generate` with the report inputs and `report_id`. Server re-runs the engine and gap check (authoritative).
- Loading state up to 60 seconds. On failure show the error code and a Retry button. No partial draft is ever shown.
- Response follows the contract in 5.9: exactly 6 sections, all numbers as locked tokens, every validation V1 to V8 passed.
- Draft is watermarked "DRAFT, not reviewed" until approval.
- Editing any input after generation marks the draft stale. A stale draft cannot be approved or exported. Regenerate is required. Staleness is detected by comparing `inputs_hash` (SHA-256 of canonical JSON of input fields). [A]
- Max 5 generations per `report_id`. [A] Failed generations do not count.

### US-09 Review and edit
As the EP I review every sentence and fix what I disagree with.
- Six sections in order, each a list of sentences.
- Each sentence shows source chips (M1, G2, N3 and so on). A sentence with no tokens and no sources is highlighted amber. Header shows the count of amber sentences.
- Number tokens render as locked chips and show the resolved value. The chip is not editable.
- Edit a sentence: a textarea holds the token form of the sentence (tokens as literal `[[...]]` text). On save, every token must be valid (grammar and existence) or save is rejected. The clinician may type any other text including numerals, since they are the author. [A]
- Delete a sentence. Add a sentence (marked "clinician-authored", not amber).
- No AI rewrite, regenerate-section, or suggest buttons.

### US-10 Approve
As the EP I attest that I have reviewed and authored the report.
- Approve is enabled only when: draft not stale; zero unresolved critical flags; every non-critical flag has an override reason.
- Requires `clinician_name` (1 to 100 chars) and the attestation checkbox with fixed text: "I have reviewed this draft, I am the author of this report, and I take responsibility for its content." [A: wording]
- Approval removes the watermark. Any later edit to inputs or draft text clears the approval. [A]
- Emits telemetry event `approved` (content-free).

### US-11 Export as formatted copy-paste
As the EP I copy the approved report as formatted text, paste it into my own Word template, and add the participant identifiers myself.
- Enabled only when approved.
- A "Copy report" button writes the report to the clipboard as `text/html` with a `text/plain` fallback, using `navigator.clipboard.write` with `ClipboardItem`. The HTML is built in the browser. No participant content is sent to the server for export. [A]
- The HTML uses only basic semantic tags (headings, `p`, `ul`, `table`, `tr`, `th`, `td`, `strong`) with no CSS classes, no scripts and no external resources, so it pastes cleanly into Word and Google Docs. [A]
- All clinician-entered text is HTML-escaped before it goes into the clipboard HTML. [A]
- Contents in order: header with blank lines "Participant name: ____", "NDIS number: ____", "Date of birth: ____"; clinician name; period; supports table (deterministic); Steps 1 to 6 with resolved tokens; measures table (test, unit, baseline, current, change phrase, threshold label); footer "Draft prepared with Clinora. Reviewed and approved by {clinician_name}." [A: footer wording]
- If the clipboard write fails or is unavailable, show the same report in a selectable panel with a "Select all" button. [A]
- No file is generated. No participant data leaves the browser.
- The first successful copy emits telemetry `exported` and removes the draft from localStorage. The draft stays in tab memory so "Copy again" works until the tab closes or reloads. [A]
- The .docx export is build-next, after EP validation. It is not part of this build.

### US-12 Identifier guard (cross-cutting)
As the EP I get warned if I paste something that looks like an identifier.
- Applies to every free-text field and to paste events.
- Warning (not a block) names the field and says "Possible name or NDIS number. Remove it before continuing."
- Patterns [A]: NDIS number `(?<!\d)\d{3}[ -]?\d{3}[ -]?\d{3}(?!\d)` (assumes 9 digits, confirm); name `\b(?:Mr|Mrs|Ms|Miss|Mx|Dr)\.?\s+[A-Z][a-z]+` and `\b(?:[Nn]ame is|[Nn]amed|[Cc]alled)\s+[A-Z][a-z]+`.
- Emits telemetry `identifier_warning` with field ID and kind only, never the matched text.

### US-13 Free-report limit
As a new practice I get 3 free reports, then I am asked to pay.
- The first successful generation for a `report_id` increments `practices.free_reports_used`. Regenerations of the same `report_id` do not.
- If `plan = 'free'` and `free_reports_used >= 3` and the `report_id` was not already counted, `/api/generate` returns 402 `PAYWALL`.
- Paywall screen shows "Founding price: A$50 per month per practice, locked for 12 months" [V] and a button to `STRIPE_PAYMENT_LINK_URL` (env).
- `plan` is flipped to `paid` manually by an admin script. No webhook. [A]
- Home screen shows "N of 3 free reports used".

### US-14 Content-free telemetry
As the founder I can measure the 28-day scorecard without storing participant content. [Blueprint Parts 8, 15]
- Events are POSTed to `/api/events` and validated against a strict schema (2.1, `events`). Unknown keys or free-text strings are rejected.
- Allowed events and payloads are listed in 2.1. Nothing else is collected.

---

## 2. Data model

### 2.1 Persisted on the server (PostgreSQL)

```
practices
  id               uuid pk
  email            text unique not null
  practice_name    text not null
  plan             enum('free','paid') default 'free'
  free_reports_used int default 0
  created_at       timestamptz

login_tokens
  token_hash       text pk            -- store hash only
  practice_id      uuid fk
  expires_at       timestamptz
  used_at          timestamptz null

report_generations
  practice_id      uuid fk
  report_id        uuid               -- client-generated, content-free
  first_generated_at timestamptz
  generation_count int
  pk(practice_id, report_id)

events
  id               bigserial pk
  practice_id      uuid fk
  report_id        uuid null
  type             text               -- one of the event types below
  payload          jsonb              -- validated per type; numbers, booleans, enums only
  created_at       timestamptz
```

Sessions: signed cookie, no table. [A]

**Allowed event types and payloads** [A: derived from the Blueprint's collectible list, minus items with no MVP UI]:
- `report_started` {}
- `generation_succeeded` {duration_ms: int, attempts: 1|2, tests_used: TestId[], goals_count: int, measures_count: int}
- `generation_failed` {reason: 'validation'|'timeout'|'bedrock_error'|'paywall'}
- `identifier_warning` {field_id: enum of form field IDs, kind: 'ndis_number'|'name'}
- `approved` {seconds_since_generation: int, gaps_fired: RuleId[], gaps_overridden: RuleId[]}
- `exported` {format: 'clipboard', seconds_since_report_started: int, sentences_total: int, sentences_edited: int, amber_remaining: int, steps_edited: (1..6)[]}

`sentences_total` = AI sentences in the generated draft. `sentences_edited` = AI sentences whose text changed or were deleted, plus clinician-added sentences.

Never stored: any participant content, override reason text, clinician name, exact age, DOB, names, NDIS numbers.

### 2.2 Client-only report draft (browser)

```ts
type TestId = "6MWT" | "2MWT" | "TUG" | "STS30" | "STS5" | "GRIP" | "GAIT10" | "BERG";
type AgeBand = "18-34" | "35-49" | "50-64" | "65-74" | "75+";              // [A]
type Sex = "female" | "male" | "not_stated";                               // [A]
type GoalStatus = "achieved" | "partially_achieved" | "not_achieved";      // [A]
type PopulationCode = string; // from data files; seed: stroke, parkinsons, ms, sci, abi, other  [A: AEP to confirm]
                              // dropdown = distinct codes in thresholds.json + "other".
                              // "other" never matches any threshold row.

interface ReportDraft {
  schema_version: 1;
  report_id: string;                       // uuid v4
  created_at: string; updated_at: string;  // ISO 8601
  participant_context: {
    age_band: AgeBand | null;
    sex: Sex | null;
    population_code: PopulationCode | null;
  };
  period: { start: string | null; end: string | null };   // YYYY-MM-DD
  supports: Array<{
    uid: string;
    type: string;                          // 1..100
    frequency_count: number | null;        // int 1..99
    frequency_per: "week" | "fortnight" | "month" | null;
    duration_minutes: number | null;       // int 1..600
  }>;                                      // max 5
  goals: Array<{
    uid: string;
    ndis_goal_text: string;                // 1..500, verbatim
    therapy_goal_text: string;             // 1..500
    status: GoalStatus | null;             // required before generate
    linked_measure_uids: string[];
  }>;                                      // 1..5
  measures: Array<{
    uid: string;
    test_id: TestId;                       // unique per report
    baseline_value: number | null;
    baseline_date: string | null;
    current_value: number | null;          // required
    current_date: string | null;           // required
    same_conditions: boolean | null;       // required
  }>;                                      // max 8
  barriers: Array<{ uid: string; text: string; goal_uids: string[] }>;   // max 10, text 1..300
  risks: Array<{ uid: string; text: string }>;                           // max 10, text 1..300
  recommendations: Array<{ uid: string; text: string; goal_uids: string[] }>; // max 10, text 1..300
  shorthand: string;                       // 0..5000
  gap_overrides: Array<{ rule_id: RuleId; target_uid: string | null; reason: string }>; // reason 10..300
  generated: null | {
    inputs_hash: string;
    generated_at: string;
    sections: Section[];                   // see 5.9
    tokens: Record<string, string>;        // resolved token values
    generation_count: number;
  };
  approval: { attested: boolean; clinician_name: string; approved_at: string | null };
}
```

`sex` is retained as specified. The engine no longer reads it after the removal of norms. [A: candidate for removal, decide before build]

**Fields that must not exist anywhere in the schema, forms, API, logs or telemetry:** participant name, NDIS number, date of birth, address, phone, participant email, exact age, free-text diagnosis, session-replay data.

Persistence: `localStorage` key `cw_draft_v1`. On app load, if `updated_at` is older than 24 hours, delete it. On export (first successful copy), delete it. Nothing from the draft is ever sent anywhere except the `/api/generate` request body. [A: 24 h from Blueprint Part 8, marked there as adjustable]

### 2.3 Static data files

`data/measures.ts`: see 5.1.

`data/thresholds.json` (rows added by hand, engine uses only `status: "verified"`):
```
{ "population_labels": { "<code>": "<display label>" },
  "rows": [ {
    "id": string,
    "test_id": TestId,
    "population_code": string,
    "age_bands": AgeBand[] | null,      // null = all bands
    "metric": "MDC95" | "MCID",
    "value": number,                    // > 0, in the test's unit
    "citation": string,                 // short, e.g. "Author Year"
    "url": string,
    "verified_by": string | null,       // AEP name, only with their permission
    "verified_on": string | null,       // YYYY-MM-DD
    "status": "verified" | "unverified"
  } ] }
```

Boot-time schema validation (zod) fails the build if a row is malformed.

---

## 3. Screen list (workflow order)

1. `/login`: email and practice name, sends magic link, shows "check your email".
2. `/auth/verify`: consumes the magic link token, sets session, redirects (no UI beyond an error state).
3. `/` Home: free-report counter, "New report", "Resume draft" if a local draft exists.
4. `/report/setup`: period, age band, sex, population, supports delivered.
5. `/report/goals`: 1 to 5 goals with verbatim NDIS text, therapy goal, status.
6. `/report/measures`: 8-test table with baseline, current, dates, conditions, live engine preview.
7. `/report/links`: goals by measures checkbox matrix.
8. `/report/context`: barriers, risks, recommendations, optional shorthand.
9. `/report/gaps`: the 6 rule results, fix links, overrides for non-critical flags.
10. `/report/generating`: progress state while `/api/generate` runs, with error and retry.
11. `/report/paywall`: shown on 402, Stripe payment link.
12. `/report/review`: six sections, source chips, amber highlights, locked number chips, edit and delete.
13. `/report/approve`: clinician name, attestation, gate status, copy report button.
14. `/privacy`: data location, AWS as subprocessor, retention, no training, telemetry list. Text drafted from Blueprint Part 8, flagged "lawyer review pending" in the repo. [A]
15. `/terms`: placeholder terms, flagged "lawyer review pending". [Blueprint Part 10]

Header on every authenticated screen: step indicator, sign out.

---

## 4. Gap checker: the 6 rules

Six NDIA steps used as report sections [A: derived from the Blueprint's E1 list (baseline capacity, named measures, quantified progress toward goals, barriers, risks, justified recommendations) in that order, so "progress toward goals" is step 3. Verify wording against the NDIA source before coding section titles]:
1. Baseline capacity. 2. Measures used. 3. Progress toward goals. 4. Barriers. 5. Risks. 6. Recommendations.

**Severity assignment** [A: Blueprint says "critical gaps block export, others need a typed override reason" but does not say which rules are critical]: R1 and R2 are critical (no quantified change is possible without them). R3 to R6 are non-critical.

**Flag key** = `rule_id + ":" + target_uid` (or `rule_id + ":report"` for report-level flags). A flag is **resolved** when it no longer fires, or (non-critical only) when a `gap_override` exists for its key.

| ID | Severity | Fires when (code this exactly) | Target | Message |
| --- | --- | --- | --- | --- |
| R1 GOAL_NO_MEASURE | critical | For goal g: `g.linked_measure_uids.filter(uid => measures.some(m => m.uid === uid)).length === 0` | goal | "Goal {n} has no linked measure." |
| R2 MEASURE_NO_BASELINE | critical | For measure m: `m.baseline_value === null` | measure | "{test name} has no baseline value, so change cannot be calculated." |
| R3 CONDITIONS_CHANGED | non-critical | For measure m: `m.same_conditions === false` | measure | "{test name} was measured under different conditions or aids, so the change is not directly comparable." |
| R4 UNACHIEVED_GOAL_NO_BARRIER | non-critical | For goal g with `g.status` in `{partially_achieved, not_achieved}`: `barriers.filter(b => b.goal_uids.includes(g.uid)).length === 0` | goal | "Goal {n} is not fully achieved and has no linked barrier." |
| R5 REC_NOT_LINKED | non-critical | For recommendation c: `c.goal_uids.length === 0` | recommendation | "Recommendation {n} is not linked to a goal." |
| R6 SUPPORT_MISSING_FREQ_OR_DURATION | non-critical | For support s: `s.frequency_count === null \|\| s.frequency_per === null \|\| s.duration_minutes === null`. Also once at report level if `supports.length === 0` [A] | support or report | "Support {n} is missing frequency or duration." / "No supports delivered are recorded." |

Notes:
- Rules run only over entered data. A goal with `status === null` or a measure with `current_value === null` fails form validation before the gap screen and never reaches the rules.
- Evaluation order: R1 to R6, then by position. Output is a flat array of `{rule_id, severity, target_uid, target_label, message}`.
- Pure function `evaluateGaps(draft) => Flag[]` in `packages/engine`. Unit-tested with one passing and one failing fixture per rule, plus a fixture where all six fire.

---

## 5. Engine logic (`packages/engine`)

### 5.1 Measure definitions (`data/measures.ts`)

| test_id | Name (display) | Unit | Direction | Decimals | Valid range [A] |
| --- | --- | --- | --- | --- | --- |
| 6MWT | 6-Minute Walk Test | m | higher is better | 0 | 0 to 1000 |
| 2MWT | 2-Minute Walk Test | m | higher is better | 0 | 0 to 500 |
| TUG | Timed Up and Go | s | lower is better | 1 | greater than 0, up to 300 |
| STS30 | 30-Second Sit-to-Stand | reps | higher is better | 0 (integer) | 0 to 60 |
| STS5 | 5x Sit-to-Stand | s | lower is better | 1 | greater than 0, up to 300 |
| GRIP | Grip Strength | kg | higher is better | 1 | 0 to 100 |
| GAIT10 | 10-Metre Walk Test (gait speed) | m/s | higher is better | 2 | 0 to 5 |
| BERG | Berg Balance Scale | points | higher is better | 0 (integer) | 0 to 56 |

Direction values are standard test conventions [A: AEP to confirm]. Ranges are input sanity guards only, not clinical claims [A]. GAIT10 is entered as speed in m/s, one gait speed type, no comfortable/fast split [A]. GRIP is one value in kg, no side field [A].

### 5.2 Input handling
- Convert every entered value to a scaled integer: `Math.round(value * 10^decimals)`. All arithmetic on values uses scaled integers to avoid float error. Convert back only for display. [A]
- A value with more decimals than the test allows is rejected by validation, not rounded.

### 5.3 Change calculation (per measure, no AI)

Inputs: `direction`, `baseline`, `current` (scaled ints).
1. `delta = current - baseline`.
2. `improvement = direction === "higher" ? delta : -delta`. Positive means better. This is the only place direction is applied to change.
3. `improvement_abs = Math.abs(improvement)`.
4. `pct = baseline === 0 ? null : (improvement_abs / Math.abs(baseline)) * 100`, rounded half away from zero to 1 decimal. Shown unsigned; the word "improvement" or "decline" carries direction.
5. Direction label: `improvement > 0` gives "improved"; `< 0` gives "declined"; `=== 0` gives "unchanged".

Examples (arithmetic only): TUG 20.0 s to 15.0 s: delta = -5.0, improvement = +5.0, pct = 25.0, "improved". Berg 40 to 36: delta = -4, improvement = -4, pct = 10.0, "declined". STS30 0 to 5: pct is null.

### 5.4 Threshold matching
1. Candidate rows: `status === "verified"`, `test_id` equal, `population_code` equal to the participant's, and (`age_bands === null` or includes the participant's `age_band`).
2. `population_code === "other"` gives no candidates.
3. If more than one candidate: use the one with the largest `value` (most conservative). [A]
4. No candidate: `NO_VERIFIED_THRESHOLD`.

### 5.5 Classification and phrases

Precedence, first match wins:

| Order | Condition | Class | `change_phrase` | `threshold_phrase` |
| --- | --- | --- | --- | --- |
| 1 | `baseline_value === null` | NO_BASELINE | "no baseline was recorded, so change cannot be calculated" | "" |
| 2 | `same_conditions === false` | NOT_COMPARABLE | change phrase as below | "measured under different conditions, so the change is not directly comparable" |
| 3 | no threshold candidate | NO_VERIFIED_THRESHOLD | change phrase as below | "for which no verified change threshold is available for this population" |
| 4 | `improvement_abs > threshold.value` (strict) and `improvement > 0` | IMPROVED_BEYOND_THRESHOLD | as below | "which exceeds the published {metric} of {value} {unit} for {population_label} ({citation})" |
| 5 | `improvement_abs > threshold.value` and `improvement < 0` | DECLINED_BEYOND_THRESHOLD | as below | same as row 4 |
| 6 | otherwise | WITHIN_THRESHOLD | as below | MDC95: "which does not exceed the published MDC95 of {value} {unit} for {population_label} ({citation}), so it cannot be distinguished from measurement error". MCID: "which does not exceed the published MCID of {value} {unit} for {population_label} ({citation}), so it is below the published threshold for meaningful change" |

Change phrase (rows 2 to 6):
- `improvement > 0`: "an improvement of {improvement_abs} {unit} ({pct}%)"
- `improvement < 0`: "a decline of {improvement_abs} {unit} ({pct}%)"
- `improvement === 0`: "no change"
- If `pct` is null, drop the parenthesis.
- `improvement_abs` displayed at the test's decimals. `pct` at 1 decimal.

Threshold comparison uses the scaled `improvement_abs` divided back to a number and compared with `threshold.value` using tolerance 1e-9. Strict "greater than" matches the Blueprint wording "exceeds". [A]

The app never produces "clinically significant" or any pass/fail verdict word beyond the phrases above (H7).

### 5.6 (intentionally unused)

Numbering is kept stable so that references to 5.7 to 5.10 stay valid. Build nothing under this number.

### 5.7 Worked fixtures (for tests; values are fake, not published thresholds)

1. TUG, baseline 20.0, current 15.0, same conditions, fixture threshold MDC95 = 3.0 s (fake): improvement 5.0, pct 25.0, class IMPROVED_BEYOND_THRESHOLD, change phrase "an improvement of 5.0 s (25.0%)".
2. 6MWT, baseline 300, current 320, fixture threshold MDC95 = 30 m (fake): improvement 20, class WITHIN_THRESHOLD.
3. Berg, baseline 40, current 36, no threshold row: improvement -4, class NO_VERIFIED_THRESHOLD, phrase "a decline of 4 points (10.0%)".
4. Grip, `same_conditions = false`: class NOT_COMPARABLE regardless of threshold.
5. STS30, baseline 0: pct null, phrase has no parenthesis.

### 5.8 Formatting
- Values shown at the test's decimals. Percentages at 1 decimal. Dates as `D MMM YYYY` (en-AU). [A]

### 5.9 Locked-token contract and generation

**Token grammar:** `[[<ref>.<field>]]`. Refs are assigned by position at generation time.

| Ref | Fields |
| --- | --- |
| `M1..Mn` (measures) | `name`, `baseline`, `current`, `baseline_date`, `current_date`, `change_phrase`, `threshold_phrase` |
| `G1..Gn` (goals) | `label` ("Goal 1"), `text` (NDIS goal verbatim), `therapy_text`, `status_phrase` ("achieved", "partially achieved", "not achieved") |
| `S1..Sn` (supports) | `phrase` (e.g. "individual exercise physiology, 2 times per week, 60 minutes per session"; missing parts omitted) |
| `B1..Bn` (barriers) | `text` verbatim |
| `R1..Rn` (risks) | `text` verbatim |
| `C1..Cn` (recommendations) | `text` verbatim |
| `P` (period) | `start`, `end` |

Source refs (not tokens): `M`, `G`, `S`, `B`, `R`, `C`, `P`, `N1..Nk` (shorthand lines), and `SYS` (server-required sentences). The server builds `tokens: Record<string,string>` mapping every token key to its display string. Client and clipboard export resolve tokens from this map only.

**What the model sees:** the token names, classes and direction labels per measure (no numeric values), goal texts and statuses, link structure, barrier, risk and recommendation text, shorthand lines, period. It does not see baseline or current values. [A]

**Required sentences** (server computes; the model must include each verbatim in the named step) [A]:
- Step 3, for each goal with no linked measure: "[[G{n}.label]] has no linked measure."
- Step 4, if no barriers: "No barriers were recorded for this reporting period."
- Step 5, if no risks: "No risks were recorded for this reporting period."
- Step 6, if no recommendations: "No recommendations were recorded by the clinician."
- Step 1, if no measure has a baseline: "No baseline measures were recorded."

**System prompt requirements** (Claude Code writes the prompt text; each item must be present and tested with a mocked model):
- P1. Write six sections, steps 1 to 6, in third person clinical register ("the participant"). [A]
- P2. Every number, date, test name, goal label and clinician-entered text must appear only as a `[[...]]` token from the provided list. Never type a digit or a number word.
- P3. Do not diagnose, do not recommend supports, hours, or treatment, and do not add any recommendation. Step 6 may only frame clinician recommendations.
- P4. Step 1 summarises baseline capacity using baseline tokens. Step 2 lists the measures used with their dates. Step 3 covers every goal in order using status, linked measures' `change_phrase` and `threshold_phrase`. Steps 4 to 6 cover barriers, risks, recommendations.
- P5. Do not use "clinically significant", "compliant", or any funding-outcome claim.
- P6. Output JSON only, matching the schema below. No markdown fences.
- P7. Include the required sentences verbatim.

**Output schema:**
```
{ "sections": [ { "step": 1..6, "sentences": [ { "text": string, "sources": string[] } ] } ] }
```
Server post-processing: `sources` = union of the model's sources and every ref found in the sentence's tokens. [A]

**Validation (server, all must pass):**
- V1. Valid JSON, matches schema, exactly 6 sections in order, each with at least 1 sentence.
- V2. Every `[[...]]` matches the grammar and exists in the token map.
- V3. After removing all tokens, no character `[0-9]` remains in any sentence.
- V4. Every source ref exists.
- V5. Every required sentence appears verbatim in its step.
- V6. Step 3 contains `[[G{n}.label]]` for every goal.
- V7. In steps 4, 5, 6, every sentence contains a `B`, `R`, or `C` token respectively, or is a required sentence. [A: mechanical enforcement of "AI never originates recommendations"]
- V8. Step 6 contains no token other than `C`, `G`, and `P` tokens.

On any failure: retry once with the failed rule codes (no content) appended to the prompt. On second failure return 502 `GENERATION_FAILED`, do not count the free report, emit `generation_failed`. Known limit: number words ("three") are only blocked by the prompt, not by V3. Review highlighting is the second line of defence. [H]

**Bedrock call** [A]: temperature 0, max output tokens 3000, timeout 60 s, region `ap-southeast-2`, profile from `BEDROCK_MODEL_ID`.

**API errors:** 401 unauthenticated; 402 `PAYWALL`; 409 `REGEN_CAP`; 422 `INPUT_INVALID` (list of field names only, never values); 502 `GENERATION_FAILED`.

### 5.10 Required unit tests
- Change calculation and direction for all 8 tests (both directions), pct null case, scaled-integer arithmetic (e.g. 0.1 + 0.2 style cases for GAIT10).
- Classification precedence table (all 6 classes, plus order conflicts such as no baseline and changed conditions together).
- Threshold matching: age band, population, `other`, multiple candidates, unverified rows ignored, empty file.
- Each gap rule pass and fail, plus all-six-fire fixture.
- Token grammar, V1 to V8 with crafted bad model outputs (digit outside token, unknown token, missing required sentence, step 6 sentence with no `C` token).
- DOM and type scan for identifier fields (US-02).
- Identifier regexes: positive and negative examples, including "Berg Balance Scale" and "Timed Up and Go" not triggering the name pattern.
- Paywall: counter increments once per `report_id`, not on failure.
- Clipboard HTML builder (US-11): resolves every token, contains no `[[`, contains the three blank identifier lines, escapes HTML in clinician-entered text. [A]

---

## 6. Explicitly NOT in this spec

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

From your scope line and Blueprint later phases:
- PMS integration (Cliniko import, Splose), multi-funder renderers (DVA, Medicare, WorkCover), the persistent evidence log and retest capture, owner review mode across juniors' drafts.

Left out here because the Blueprint lists them but the MVP has no UI for them [A]:
- Per-section thumbs, template chooser, overriding a calculated number with a reason (to change a number, change the input), MFA, Stripe webhook, in-app admin console.

---

## 7. Build order notes

The build cuts for the two-week demo are in `NOT-NOW.md`. That file wins over this one.

**Build next, after EP validation:** .docx export (browser-generated, replaces formatted copy-paste as the primary export).

**Not cuttable** without breaking the point of the product: the change engine (5.3 to 5.5), R1 and R2, locked-token validation V1 to V8, Bedrock AU-only, the identifier warning, attestation, and the approve gate on critical gaps.

**Strongest counter-argument to this spec** [H]: with thresholds empty by rule H5 and only a few verified by week 2, most measures will read "no verified change threshold". The demo then shows a structured form plus prose drafter, which is the commodity SecondShift gives away free [E6]. The 2-week bar ("EP says it saved time") can pass on prose alone and tell you nothing about A3, the belief that calculated, checked evidence is what they value. And because the app is stateless with no PMS link, the EP re-keys goals, baselines and scores every time; if typing takes longer than the Word template they already have, the time-saved test fails on data entry, not on the engine.
