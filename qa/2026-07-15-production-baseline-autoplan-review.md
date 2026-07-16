# Production Baseline Multi-Angle Review — 中午吃点啥

**Review date:** 2026-07-15
**Review type:** `/autoplan` multi-perspective review (product, identity/auth, security/privacy, architecture/data-integrity, UX/accessibility, operations/release, code-quality/maintainability)
**Baseline branch:** `main`
**Deployed / production-QA-verified revision:** `1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9`
**Working tree HEAD:** `32d414a` (docs-only commit on top of the baseline — Stage 6 QA record; no runtime change). Uncommitted tree changes are doc/plan only (`AGENTS.md`, `roadmap.md`, new Stage 7 spec/plan).
**Method:** Direct read of identity/auth/ops code by the reviewer, plus four independent parallel investigations (security, architecture/data-integrity, UX/accessibility, ops/maintainability). Every finding below cites `file:line` evidence verified against the working tree.
**Code was not modified.** This is a review deliverable only.

This review is the multi-angle audit called for by Stage 7A
([`specs/2026-07-15-internal-beta-productization-stage7-design.md`](../specs/2026-07-15-internal-beta-productization-stage7-design.md)).
Stage 7 design already anticipates several items below; where that is the case
the finding is marked **(in Stage 7 scope)** so it is not mistaken for a surprise.

---

## 1. Executive summary

The production baseline is **architecturally sound and data-integrity is strong**. The
multi-group identity model is correct: `displayName` is never treated as proof of identity,
identities are cuid-based, group-session tokens are re-validated against DB membership on
every request, invite codes are hashed/rotated, the last-admin invariant is protected with
row locks, historical recommendation snapshots are immutable, group isolation is enforced
consistently, concurrent batch creation is guarded by a serializable transaction plus a
partial unique index, and a read-only six-check database verifier runs in pre-deploy. The
Stage 6 QA evidence is credible and matches the code.

The problems are concentrated in **two areas**, plus documentation:

1. **A live legacy MVP stack that bypasses everything the new model was built to enforce.**
   The original single-team routes (`/api/session`, `/api/restaurants`, `/api/recommendations`,
   `/api/feedback`, `/api/today-recommendations`) are still registered in production. They
   hardcode a single `DEFAULT_GROUP_ID`, authenticate via a name-based shared-admin session
   or a weak shared read-token, and — for `GET /api/restaurants` — require **no auth at all**.
   `/api/session` maps any caller who knows `TEAM_INVITE_CODE` to one shared admin identity
   (`seed-identity-admin`) over the default group. No production client calls these in the
   normal group flow (admin and extension are both on the new flow), so they are **orphaned
   attack surface and a fallback data path**, and they reintroduce the exact "name as
   identity / shared identity" problem the new system removed. This is the highest-priority
   item to resolve before the identity model is credible for a beta — and it is squarely
   Stage 7B's "lightweight identity hardening."

2. **The public API has no rate limiting and reflects any CORS origin**, so the
   internet-exposed endpoints can be hammered: invite-code brute-force on `/api/groups/join`
   (and `/api/session`), and unbounded identity/group flooding. `/api/groups/join` also loads
   every group row and runs an HMAC per row on each attempt.

3. **Documentation drift is severe enough to mislead an operator into breaking production.**
   The root `README.md` deploy checklist omits the admin build and the real `*:railway`
   scripts, and still claims admin static hosting is "deferred to Stage 6" — but it is live
   in production. Following the README to redeploy would produce a server with no admin
   bundle. `AGENTS.md` and `docs/ai-collaboration-protocol.md` describe the legacy auth/route
   model as current.

4. **Operability is near zero**: only Fastify's default logger (which correctly excludes
   headers), Railway's `/api/ready` probe, and no error alerting. Failed lunch reminders —
   the product's core value — are detectable only in a user's local DevTools console. There
   is no rollback or incident runbook on disk.

**Severity roll-up: 0 × P0, 4 × P1, 17 × P2, 15 × P3.** No confirmed data-corruption or
critical-security bug. The P1s are: (a) the live legacy stack, (b) no rate limiting,
(c) the misleading README deploy section, (d) no production observability / failed-reminder
visibility. All four are reasonable to close as part of Stage 7A–7C.

---

## 2. Findings table (P0 → P3)

`Type`: **Bug** = confirmed incorrect behavior · **Risk** = correct today but a real
failure/abuse/exploit surface · **Doc** = documentation drift · **Opt** = optional
improvement. `(S7)` = already within a Stage 7 substage's planned scope.

| ID | Sev | Type | Finding | Primary evidence |
|----|-----|------|---------|------------------|
| **P1-1** | P1 | Risk | Legacy MVP stack is live and bypasses the identity/isolation model: unauthenticated `GET /api/restaurants`, `/api/session` shared-admin backdoor, default-group-hardcoded routes, name-uniqueness (`Teammate.name`). | `apps/server/src/app.ts:46-50`; `routes/session.ts:14,27-39`; `routes/restaurants.ts:9-14`; `routes/recommendations-admin.ts:17-21`; `routes/feedback.ts:17-32`; `routes/recommendations.ts:8-15`; `services/groups/defaultGroup.ts` (`DEFAULT_GROUP_ID="seed-group-default"`); `schema.prisma:136-145` (`Teammate.name @unique`) |
| **P1-2** | P1 | Risk | No rate limiting on any endpoint (invite-code brute-force, identity/group flooding) on a public-internet API. | `apps/server/src/app.ts:25-57` (zero rate-limit registration); endpoints at `routes/groups.ts:107,123,193`, `routes/session.ts:14` |
| **P1-3** | P1 | Doc | `README.md` deploy section is wrong: omits the admin build and the real `build:railway`/`predeploy:railway`/`start:railway` scripts, and claims admin hosting is "deferred to Stage 6" (it is live). Following it breaks production admin. | `README.md:52-60,66,109` vs `package.json:12-15`, `app.ts:51-54`, `routes/adminStatic.ts` |
| **P1-4** | P1 | Risk | Production is not observable: no structured logging, no error alerting, and failed reminders are invisible to operators (client-side only). | `apps/server/src/app.ts:26` (default logger only); `apps/extension/src/background.ts:25-30` (console-only); no `sentry`/`datadog`/`otel` dependency in `apps/server/package.json` |
| P2-1 | P2 | Risk | CORS reflects any origin (`origin: true`); compounds P1-2 (any website can drive unauthenticated requests). | `apps/server/src/app.ts:29` |
| P2-2 | P2 | Risk | No PII deletion/export/retention path; identities, membership, participation, feedback retained indefinitely. (S7) | No delete/export routes; `schema.prisma:46-256` retains `displayName`, `lastSeenAt`, `status`, `removedAt`, participation, feedback |
| P2-3 | P2 | Doc | `pnpm audit` is broken (npm registry audit endpoint retired, HTTP 410); no dependency vulnerability scan in CI. | `pnpm audit` → `ERR_PNPM_AUDIT_BAD_RESPONSE 410`; no vuln step in `scripts/check-stage6-artifacts.mjs` |
| P2-4 | P2 | Risk | Legacy admin session token is never re-validated against the DB (signature + expiry only); a removed teammate keeps admin write until 12h expiry. | `apps/server/src/services/auth/sessionToken.ts:33-41`; guards `routes/restaurants.ts:27,46`, `recommendations-admin.ts:18`, `feedback.ts:18-19` |
| P2-5 | P2 | Risk | `ALLOW_PUBLIC_GROUP_CREATION` defaults to `true`; not listed in `apps/server/README.md` required-vars, so production may have group creation open without an operator realizing. | `apps/server/src/env.ts:21`; `.env.example:5`; `routes/groups.ts:123-128`; `apps/server/README.md:7-19` |
| P2-6 | P2 | Risk | `TEAM_INVITE_CODE` and `EXTENSION_READ_TOKEN` have no minimum-entropy requirement (`min(1)`); `.env.example` ships weak defaults. | `apps/server/src/env.ts:18,20`; `apps/server/.env.example:2-4` |
| P2-7 | P2 | Bug | Extension ships `readToken: "dev-read-token"` in default storage state; the legacy fallback path is wired into production runtime. | `apps/extension/src/storage.ts` (`getDefaultStorageState`); `recommendationClient.ts:187-208,323-332` (fallback to `/api/today-recommendations`, `/api/feedback`) |
| P2-8 | P2 | Risk | Stage 6 legacy-batch data migration is irreversible; rollback requires restoring the retained DB snapshot. Mitigated by documented snapshot retention. | `apps/server/prisma/migrations/20260715120000_stage6_legacy_batch_history/migration.sql` (copy into batches/items; conditional delete of default group) |
| P2-9 | P2 | Doc | No rollback runbook and no incident runbooks on disk (only narrative prose inside QA/spec). | `find docs qa specs plans -iname '*runbook*' -o -iname '*rollback*'` → none; procedure only in `qa/2026-07-15-deploy-hardening-stage6.md:80-83` |
| P2-10 | P2 | Risk | Concurrency invariant (one current batch) is only mock-simulated; never verified against a real Postgres partial unique index. | `apps/server/tests/groupTodayConcurrency.test.ts:124,327` (mocks `P2034`/`P2002`); enforcing index in `migrations/20260709120000_stage3_current_batch_invariant/migration.sql:4-6` |
| P2-11 | P2 | Risk | No extension auto-update/distribution mechanism (no `update_url`, no Web Store, no packaging step). (S7 7C) | `apps/extension/public/manifest.json` (no `update_url`); `apps/extension/package.json` build = bare `vite build` |
| P2-12 | P2 | Doc | `docs/ai-collaboration-protocol.md` lists the 2026-07-07 MVP artifacts as "current" and omits the `roadmap.md`/`qa/` tiers. | `docs/ai-collaboration-protocol.md:86-102,120-139` |
| P2-13 | P2 | Bug | Standalone detail page buttons are completely unstyled — raw browser defaults on a real user surface. (S7 7C, already registered as "detail page visually weak") | `apps/extension/styles/detail.css` (zero `.button` rules); buttons at `detail.ts:131,254,265,286`, `detail.html:13` |
| P2-14 | P2 | Risk | Admin Modal lacks a keyboard focus trap (Tab escapes into background content). | `apps/admin/src/components/Modal.tsx:17-36` |
| P2-15 | P2 | Risk | QuickAdd recommendation retry is not idempotent; a lost response + retry can create a duplicate recommendation (extension + admin). | `apps/extension/src/quickAddController.ts:82-85`; `apps/admin/src/app/App.tsx:346-370` |
| P2-16 | P2 | Bug/Risk | UX polish bundle: default API URL `http://localhost:3000`; internal codename "Stage 5C" shown to admins; brand mark mismatch (extension `♨` vs admin `餐`); design tokens duplicated with drift across 4 CSS files; double `<h1>` in popup empty state. | `apps/extension/src/storage.ts` (default apiBaseUrl); `apps/admin/src/pages/SettingsPage.tsx:320`; `index.html:13` vs `AppShell.tsx:25`; `popup.css` vs `styles.css` token blocks; `popup.ts:224-229` |
| P3-1 | P3 | Opt | Non-constant-time secret comparisons: `EXTENSION_READ_TOKEN` (`===`) and `TEAM_INVITE_CODE` (`!==`). Low practical risk (network jitter); inconsistent with the careful `timingSafeEqual` elsewhere. | `apps/server/src/services/auth/readToken.ts:7`; `routes/session.ts:16` |
| P3-2 | P3 | Opt | `/api/groups/join` loads all groups and runs an HMAC per row on each attempt (O(n), self-DoS amplifier as groups grow). | `apps/server/src/routes/groups.ts:195-203` |
| P3-3 | P3 | Risk | Admin SPA stores tokens in `window.localStorage` (XSS-exfiltrable). Standard for a same-origin SPA; proportional to XSS surface (admin uses `textContent`, not `innerHTML`). | `apps/admin/src/sessionStore.ts:56-58` |
| P3-4 | P3 | Risk | Concurrent double-submit of `/api/groups/join` (same identity) can surface as an unhandled `P2002` → HTTP 500 (no data corruption; retry succeeds). | `apps/server/src/routes/groups.ts:215-244` (catch handles only `AuthError`) |
| P3-5 | P3 | Risk | If the MV3 service worker is killed mid-`handlePrimaryAlarm` (after claim, before the `finally` re-arm), a single day's primary reminder could be missed; recovers on next startup. | `apps/extension/src/reminderRuntime.ts:408-459,380-406` |
| P3-6 | P3 | Risk | Stage 6 legacy-batch migration is not safely re-runnable after a partial failure (no `ON CONFLICT`; deterministic PKs). Acceptable for a one-time migration. | `migrations/20260715120000_stage6_legacy_batch_history/migration.sql` |
| P3-7 | P3 | Doc | Legacy route paths are inline string literals outside the shared `GROUP_ROUTES` constant. | `recommendationClient.ts:191,323`; `routes/recommendations.ts:8`, `feedback.ts:17`, `restaurants.ts:9,26,43`, `session.ts:14` |
| P3-8 | P3 | Opt | `/api/ready` DB probe has no explicit query timeout; a hanging Postgres query blocks until Railway's 120s container timeout. | `apps/server/src/routes/health.ts:10-12`; `app.ts:33-36` |
| P3-9 | P3 | Risk | Artifact gate checks manifest permissions + admin residue but does not verify built extension runtime assets (`assets/background.js`, icons, manifest text). | `scripts/check-stage6-artifacts.mjs:48-57` |
| P3-10 | P3 | Doc | `apps/server/README.md` required-variables list omits `ALLOW_PUBLIC_GROUP_CREATION`, `IDENTITY_TOKEN_TTL_DAYS`, `GROUP_SESSION_TTL_DAYS` (mandatory in production per `env.ts:57-67`). | `apps/server/README.md:7-19` vs `env.ts:57-67` |
| P3-11 | P3 | Opt | Recommendation/feedback/operations behavior is tested redundantly across legacy and group suites. | `recommendation.test.ts:30,83`; `feedback.test.ts:59,163`; `stage5Routes.test.ts:183` vs `groupToday.test.ts`, `groupKnowledge.test.ts` |
| P3-12 | P3 | Risk | The six database-verifier raw SQL checks are never run against a real schema (only fed mock counts). | `apps/server/tests/stage6DatabaseVerifier.test.ts:27-33`; SQL in `databaseVerifier.ts:21-139` |
| P3-13 | P3 | Opt | Production module `apps/extension/src/stage5Client.ts` encodes project history ("stage 5") in its name rather than what it does. | `apps/extension/src/stage5Client.ts` (live, imported by `optionsController.ts`, `background.ts`, `reminderRuntime.ts`) |
| P3-14 | P3 | Doc | `AGENTS.md:138` frames admin static hosting as a pending restriction ("deploy-hardening work unless…"); should state it is implemented production behavior. | `AGENTS.md:138` |
| P3-15 | P3 | Opt | Minor visual nits: focus-ring opacity varies across surfaces (18–28%); popup empty state has a second `<h1>`. | `popup.css:52,244`; `options.css:34`; `styles.css:56`; `popup.ts:224-229` |

---

## 3. P1 detail — remediation and acceptance tests

### P1-1 — Legacy MVP stack is live and bypasses the identity/isolation model  `(S7 7B)`

**What's wrong.** Five pre-multi-group route plugins are still registered
([`app.ts:46-50`](../apps/server/src/app.ts)) and operate exclusively on a hardcoded
`DEFAULT_GROUP_ID = "seed-group-default"` (`apps/server/src/services/groups/defaultGroup.ts`,
removed by Stage 7B):

- `POST /api/session` (`apps/server/src/routes/session.ts:14,27-39`, removed by Stage 7B) — anyone
  who supplies `TEAM_INVITE_CODE` gets a signed admin session, and the handler upserts a
  **single shared identity** (`seed-identity-admin`) and a single shared admin membership over
  the default group. The `Teammate` row is upserted by unique `name`, so two people who type
  the same name share one teammate row. This is the only place in the codebase where
  name-uniqueness is load-bearing and where a display name is effectively treated as identity.
- `GET /api/restaurants` (`apps/server/src/routes/restaurants.ts:9-14`, removed by Stage 7B) —
  **no auth at all**; returns the default group's restaurants to any caller.
- `POST/PATCH /api/restaurants`, `POST /api/recommendations`
  (`apps/server/src/routes/recommendations-admin.ts:17-21`, removed by Stage 7B),
  `POST /api/feedback` (`apps/server/src/routes/feedback.ts:17-32`, removed by Stage 7B) — legacy
  shared-admin-session or shared-read-token auth, all writing to the default group.
- `GET /api/today-recommendations` (`apps/server/src/routes/recommendations.ts:8-15`, removed by Stage 7B)
  — shared read-token only.

No production client calls these in the normal flow (admin uses `/api/identities`,
`/api/groups`, `/api/groups/join`, `/api/groups/:id/session`; the extension uses the group
routes with an active group). They are reachable only as (a) direct attack surface and
(b) the extension's **fallback** when no group is active
([`recommendationClient.ts:187-208,323-332`](../apps/extension/src/recommendationClient.ts)).

The stale comment at `session.ts:15` ("Keep this route as legacy compatibility until admin is
rewired to group sessions") is obsolete — the admin was rewired in Stage 4.

**Why P1.** These routes re-introduce the shared-identity / name-as-identity problem the
Stage 1 identity model was built to eliminate, and `GET /api/restaurants` is unauthenticated
on a public URL. They undermine the credibility of the very isolation guarantees Stage 6 QA
verified (QA verified the *group* flow, not these legacy paths).

**Remediation (Stage 7B).**
1. Remove the extension legacy fallback first: require an active group for today/feedback
   (no `activeGroupId` → onboarding state, not a default-group request).
2. Delete `session.ts`, `restaurants.ts`, `recommendations-admin.ts`, `recommendations.ts`,
   `feedback.ts`, their auth deps `sessionToken.ts` + `readToken.ts`, the `Teammate` model,
   and the `EXTENSION_READ_TOKEN`/`TEAM_INVITE_CODE` plumbing — **or** gate them behind an
   explicit `LEGACY_ROUTES_ENABLED` flag that is off in production. Deletion is preferred
   (see P2/P3 legacy-cleanup findings).
3. If any legacy route must stay temporarily, add auth to `GET /api/restaurants` and a DB
   membership/teammate re-check to the admin session (see P2-4).

**Acceptance test.**
- `curl https://<prod>/api/restaurants` without credentials → 401 (or the route is gone).
- `POST /api/session` with the team invite code → 404 (route gone) or, if retained, no longer
  mints an admin session for a shared identity.
- After removing the extension fallback, a fresh install with no group shows the onboarding
  state and never calls `/api/today-recommendations`.
- `pnpm typecheck && pnpm test && pnpm build` pass with the legacy stack and `Teammate` removed.

### P1-2 — No rate limiting on the public API

**What's wrong.** No `@fastify/rate-limit` (or equivalent) is registered
([`app.ts:25-57`](../apps/server/src/app.ts)); grep for `rateLimit|throttle|slow.down` returns
nothing. Every public endpoint accepts unbounded requests, including the invite-gated ones:
`POST /api/identities`, `POST /api/groups`, `POST /api/groups/join`, `POST /api/session`.
`/api/groups/join` validates a 6-char invite code (`LUNCH-XXXXXX`, 32-symbol alphabet) by
loading **all** groups and running an HMAC per row ([`groups.ts:195-203`](../apps/server/src/routes/groups.ts)).

**Why P1.** The API is on a public Railway URL. With no limit, invite codes are brute-forceable
over time and identity/group rows can be flooded. `/api/groups/join`'s O(n)-groups-per-request
makes it a self-amplifying DoS vector. CORS `origin: true` (P2-1) lets any website drive this.

**Remediation.** Register `@fastify/rate-limit` with tight per-IP limits on unauthenticated
POSTs (e.g. 5/min for identity/group/join/session creation) and a global authenticated limit
(e.g. 100/min). Put it behind the Railway proxy's forwarded IP.

**Acceptance test.** From one IP, send 100 rapid `POST /api/identities`; confirm 429s after
the limit. Confirm a legitimate single join still succeeds.

### P1-3 — `README.md` deploy instructions are wrong and would break production admin

**What's wrong.** The root `README.md` deploy checklist
([`README.md:52-60`](../README.md)) lists `shared build → prisma:generate → server build →
migrate deploy → start` and **omits the admin build** and the real scripts
(`build:railway`, `predeploy:railway`, `start:railway` at [`package.json:12-15`](../package.json)).
It also states admin static hosting is "deferred to Stage 6" ([`README.md:66,109`](../README.md))
— but Stage 6 is Done and admin **is** hosted in production
([`app.ts:51-54`](../apps/server/src/app.ts), [`routes/adminStatic.ts`](../apps/server/src/routes/adminStatic.ts)).

**Why P1 (doc).** A contributor following the README to redeploy would build a server with no
admin bundle; `adminStatic` would throw in production.

**Remediation.** Rewrite the deploy section to reference `railway.json` and the `*:railway`
scripts (which already build admin in the correct order and run `env:check` + `migrate deploy`
+ `db:verify`), and correct the admin-hosting status to "live, served by the server on the same
origin." (Stage 7A's README rewrite covers this.)

**Acceptance test.** The README deploy steps match `package.json` exactly; no "deferred"/
"Stage 6 work" phrasing remains for admin hosting; running the documented commands yields a
server that serves `/` as admin HTML.

### P1-4 — Production is not observable; failed reminders are invisible to operators

**What's wrong.** Only Fastify's default pino logger is configured ([`app.ts:26`](../apps/server/src/app.ts));
there is no structured request/error logging, no `setErrorHandler`, and no error-reporting
dependency (no Sentry/Datadog/OTel in `apps/server/package.json`). Explicit `app.log` calls
exist in only two places. Reminders fire entirely client-side; on failure the error is written
only to the user's local DevTools ([`background.ts:25-30`](../apps/extension/src/background.ts))
and the server receives no delivery signal. Service-layer errors are context-free
(e.g. [`groupToday.ts`](../apps/server/src/services/recommendation/groupToday.ts)
`throw new Error("Could not create group daily recommendation batch")` — no groupId/date/retry).
Note: the default logger **does exclude headers**, so no tokens are logged (clean — see §5).

**Why P1.** The product's core promise is a useful, non-annoying reminder. A silently-failed
reminder is undiagnosable and unreportable today, and Stage 7D's exit gate requires "minimal
monitoring and ops cadence."

**Remediation.** (1) Add structured request/error logging with groupId context and a Fastify
error handler. (2) Add either an error-reporting integration or a lightweight server endpoint
for the extension to post delivery telemetry. (3) Decide whether a scheduled daily batch job is
needed (batches are currently created only on manual refresh). (Stage 7D monitoring scope.)

**Acceptance test.** Given a failed recommendation creation, an operator can identify the
groupId, office date, and root cause from logs alone. A failed reminder is visible to operators
within the monitoring cadence.

---

## 4. P2 remediation notes (concise)

- **P2-1 CORS:** replace `origin: true` with an allowlist (`[env.PUBLIC_API_BASE_URL]` plus the
  extension origin). Acceptance: cross-origin request from a foreign origin gets no
  `Access-Control-Allow-Origin`.
- **P2-2 PII retention (S7):** add `DELETE /api/identities/me` (cascade or anonymize
  memberships/participation/feedback) and document a retention window. Acceptance: calling it
  with a valid identity token removes/anonymizes the identity's PII.
- **P2-3 Dependency scan:** add an `osv-scanner`/`audit-ci` step (npm bulk advisory endpoint)
  to CI as `check:vulns`. Acceptance: `pnpm check:vulns` exits non-zero on a high/critical advisory.
- **P2-4 Admin session DB re-check:** folded into P1-1 legacy cleanup; if retained, add a
  `teammate.findUnique` inside `requireAdminSession`. Acceptance: deleted teammate's token → 401.
- **P2-5 Open group creation:** default `ALLOW_PUBLIC_GROUP_CREATION=false` in production (or
  document it must be set), and add it to `apps/server/README.md` required vars. Acceptance:
  production with the default rejects `POST /api/groups` with 403 unless explicitly enabled.
- **P2-6 Token entropy:** add a `min(N)` (≈16–20) or entropy heuristic for `TEAM_INVITE_CODE`
  and `EXTENSION_READ_TOKEN` in the production `superRefine`. Acceptance: 1-char values fail
  `env:check` in production.
- **P2-7 dev-read-token / legacy fallback:** default `readToken` to `""` and remove the
  extension legacy fallback (part of P1-1). Acceptance: cleared storage shows empty readToken;
  fresh install never hits the legacy routes.
- **P2-8 Irreversible Stage 6 migration:** keep the current DB-snapshot retention strategy and
  state it explicitly in the rollback runbook (P2-9). Acceptance: runbook names the snapshot as
  the only rollback path for this migration.
- **P2-9 Runbooks:** create `docs/runbooks/rollback.md` and incident pages (reminder not firing,
  migration failure, suspected isolation breach). Acceptance: an operator can execute rollback
  or triage an incident using only the runbook.
- **P2-10 Concurrency integration test:** add a testcontainers-Postgres test running two
  concurrent refreshes. Acceptance: exactly one current batch survives against a real Postgres.
- **P2-11 Extension distribution (S7 7C):** decide versioned-unpacked vs Web Store unlisted in
  `decisions/0002-extension-distribution.md`; produce versioned builds + install/upgrade docs.
  Acceptance: a version bump reaches existing installs without manual reload.
- **P2-12 ai-collaboration-protocol:** update current-documents list to match `AGENTS.md`
  (roadmap/qa tiers, Stage 7). Acceptance: protocol's "current" list matches `AGENTS.md:81-87`.
- **P2-13 Detail-page buttons (S7 7C):** add shared `.button` styles to `detail.css` matching
  the popup theme (min-height ≥40px). Acceptance: detail buttons match popup buttons, ≥40px.
- **P2-14 Modal focus trap:** add a Tab/Shift+Tab cycle handler or `inert` siblings.
  Acceptance: Tab never leaves the open modal.
- **P2-15 QuickAdd idempotency:** add a client idempotency key to the recommendation POST, or a
  "may have already saved" confirmation before retry. Acceptance: retry after a lost 201 does
  not create a duplicate.
- **P2-16 UX polish bundle:** set the default API URL to the production origin (or surface it in
  first-run); remove the "Stage 5C" string ([`SettingsPage.tsx:320`](../apps/admin/src/pages/SettingsPage.tsx));
  unify the brand mark; extract shared design tokens; fix the double `<h1>`. Acceptance: fresh
  install pre-fills the production URL; no internal stage names in UI; one brand mark across
  surfaces.

---

## 5. Explicit "no issue found" — reviewed high-risk areas

These areas were examined directly and found clean; they are the reason the overall verdict is
"sound foundation, fix the edges."

- **Identity model (new flow): displayName is never proof of identity.** Identities are
  cuid-based (`schema.prisma:46-55`). Identity tokens carry only `{identityId, exp}`
  ([`tokens.ts:76-87`](../apps/server/src/services/auth/tokens.ts)); `verifyIdentityToken`
  rejects tokens that carry group fields. Group-session tokens carry
  `{identityId, groupId, membershipId, role, exp}` and are re-verified against the DB on every
  request: signature + expiry + `claims.groupId === route.groupId` + active membership in that
  group ([`memberships.ts:16-49`](../apps/server/src/services/groups/memberships.ts)). No new-flow
  path relies on name uniqueness.
- **Invite codes:** server-generated (`randomBytes`), stored only as an HMAC hash (never
  plaintext), constant-time verified, admin-only rotation, version-tracked, and a removed
  member cannot self-rejoin ([`inviteCodes.ts`](../apps/server/src/services/groups/inviteCodes.ts),
  [`groups.ts:193-245`](../apps/server/src/routes/groups.ts), [`groupOperations.ts:54-64`](../apps/server/src/routes/groupOperations.ts)).
- **Last-admin invariant:** enforced with `SELECT … FOR UPDATE` + count inside the transaction
  ([`groups.ts:304-337`](../apps/server/src/routes/groups.ts), [`memberships.ts:51-73`](../apps/server/src/services/groups/memberships.ts)).
- **Group isolation (data layer):** every group-scoped query filters by the auth-verified
  `request.params.groupId`; no route reads `groupId` from body/query. Verified across
  `groupToday`, `groupKnowledge`, `groupOperations`, `groupParticipation`, `groupDashboard`,
  `groupHistory`. (The only isolation-bypassing routes are the **legacy** ones in P1-1.)
- **Token transport:** tokens travel only via `Authorization: Bearer` (identity/group) or the
  `x-lunch-read-token` header (legacy read); never in URL query strings.
- **Sensitive logging:** Fastify's default serializer logs `{method, url, host, …}` and
  **excludes headers**; no token/invite/secret is logged anywhere. `console.log` appears only
  in CLI scripts, not the running server.
- **Signature verification:** both token paths and invite-code verification use HMAC-SHA256 +
  `timingSafeEqual` with length guards ([`tokens.ts:35-40`](../apps/server/src/services/auth/tokens.ts),
  `apps/server/src/services/auth/sessionToken.ts:21-26` (removed by Stage 7B),
  [`inviteCodes.ts:14-19`](../apps/server/src/services/groups/inviteCodes.ts)).
- **Secret / frontend residue:** zero references to `TEAM_INVITE_CODE`/`SESSION_SECRET`/
  `EXTENSION_READ_TOKEN` in `apps/admin` or `apps/extension` source;
  `scripts/check-stage6-artifacts.mjs` scans the built admin bundle for these plus `localhost`.
- **Extension token storage:** tokens live in `chrome.storage.local` (isolated per extension
  under MV3), not exposed to web pages.
- **Shared contracts single-source-of-truth:** `GROUP_ROUTES` + header constants in
  `packages/shared` are consumed uniformly by all extension and admin clients; every path
  matches its server registration.
- **Transaction boundaries:** all multi-step writes (create-group, join, patch-member,
  patch-settings, rotate-invite, both recommendation-refresh paths) are wrapped in
  `$transaction`; refresh paths use `Serializable` isolation.
- **Historical snapshot immutability:** `scoringWeightsSnapshot` / `scoreBreakdown` are
  write-once; old batches are superseded (`isCurrent=false`), never mutated; weight changes
  only affect the next batch. The partial unique index
  `daily_recommendation_batches_one_current_key` is idempotent and enforces one current batch.
- **Weather:** server-side only, cached per `(groupId, date, city)` with a race-safe upsert,
  graceful `weatherUnavailable` fallback; never called from the extension.
- **Dependency versions:** `fastify@5.10.0` is above the 5.8.5 fix for CVE-2026-33806; the
  `@fastify/static>glob` override pins the non-vulnerable glob; no known high/critical
  advisories for the resolved `@fastify/cors`, `@fastify/static`, `prisma`, `zod`, `vite`,
  `dotenv`.
- **Health/readiness split:** `/api/health` is liveness-only (no DB); `/api/ready` probes the
  DB and returns 503 on failure and reports the deployed commit. Graceful shutdown is
  idempotent on SIGTERM/SIGINT.
- **Extension manifest permissions:** minimal (`alarms`, `notifications`, `storage`) with
  scoped host permissions (localhost + Railway); no `<all_urls>`; artifact-gated.
- **Production env gate:** `SESSION_SECRET` ≥32 chars and `PUBLIC_API_BASE_URL` HTTPS are
  enforced in production, and nine keys must be explicitly set.
- **State completeness (UX):** popup and admin both implement loading, empty, error+retry,
  cache/expired-session (401), forbidden (403/removed_member), and partial-degradation states
  truthfully. No `console.log` in UI code; no interactive-`<div>` antipattern; focus-visible
  styling and `aria-live` status regions are present across surfaces.

---

## 6. Recommended implementation sequence

Mapped onto the existing Stage 7 substages so this review slots into the plan already on
file. Items are ordered by dependency and risk-reduction leverage.

**Immediate — before any colleague installs the extension (Stage 7A, parallel with doc work)**
1. **P1-3** Fix the README deploy section + admin-hosting status (and P3-10 env-key list).
   This unblocks safe redeploy and is pure docs.
2. **P1-2** Add rate limiting (+ **P2-1** CORS allowlist). Small, high-leverage, independent of
   everything else.
3. **P1-1 (first half)** Remove the extension legacy fallback and `dev-read-token` default
   (**P2-7**) so no client path can reach the legacy routes; ship the onboarding state for
   no-group installs.

**Stage 7A — trusted baseline + docs (no behavior change)**
4. **P2-9** Write `docs/runbooks/rollback.md` + incident runbooks; state the Stage 6 migration
   irreversibility (**P2-8**) and the retained-snapshot rollback path.
5. **P2-3** Add a dependency-vuln scan to CI (`check:vulns`).
6. **P2-12 / P3-14** Reconcile `docs/ai-collaboration-protocol.md` and `AGENTS.md:138` with
   current behavior. Tag `v0.1.0-internal` on `1eb7dbb`.
7. **P3-9** Extend the artifact gate to verify extension runtime assets.

**Stage 7B — identity model and lightweight hardening**
8. **P1-1 (second half)** Delete (or flag-off) the legacy server routes + `sessionToken.ts` +
   `readToken.ts` + `Teammate` model (**P2-4**, **P3-7**, **P3-11** fall out of this).
9. **P2-5 / P2-6** Default `ALLOW_PUBLIC_GROUP_CREATION=false` in production; add entropy
   requirements for `TEAM_INVITE_CODE` / `EXTENSION_READ_TOKEN`.
10. **P2-2** Decide and implement the PII retention/deletion path; document accepted risks in
    `identity-and-security.md`.
11. **P1-4 (first half)** Add structured logging with groupId context + a Fastify error handler.
12. **P2-10** Add the real-Postgres concurrency integration test.

**Stage 7C — brand, experience consistency, distribution**
13. **P2-13** Style the detail-page buttons; **P2-16** UX polish bundle (brand mark, tokens,
    "Stage 5C" copy, default API URL, double `<h1>`); **P2-14** Modal focus trap; **P2-15**
    QuickAdd idempotency.
14. **P2-11** Decide and implement extension distribution/auto-update; versioned builds +
    install/upgrade/permissions/privacy docs.

**Stage 7D — operated beta**
15. **P1-4 (second half)** Stand up minimal monitoring (health/readiness, deploy revision, DB
    verifier, error + reminder-delivery observation) per the 7D plan; collect the operational
    signals that drive the account-system decision.

**P3 items** (timing-safe comparisons, join O(n), localStorage, join 500, SW orphan alarm,
probe timeout, verifier-SQL coverage, `stage5Client` rename, focus-ring opacity) can be
folded into the nearest relevant substage above as low-risk cleanup; none block the beta.

---

## 7. Reviewer's note on scope and sources

Sources of truth, per the review brief: (1) current implementation and tests, (2) Stage 6 QA
([`qa/2026-07-15-deploy-hardening-stage6.md`](../docs/archive/stages/stage-6/2026-07-15-deploy-hardening-stage6-qa.md)),
(3) product README + `AGENTS.md` + `roadmap.md` + Stage 7 design, (4) archived Stage plans as
historical evidence only. Where an archived plan and current code disagreed (notably the legacy
auth described in `AGENTS.md`), current code + tests + QA were treated as authoritative, per
the Stage 7 design's own rule.

No code or non-review files were modified. Findings are ready to be triaged into the Stage 7A
backlog; implementation should not begin until this report is accepted.
