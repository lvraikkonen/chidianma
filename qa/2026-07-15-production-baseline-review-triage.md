# Stage 7 Production Baseline Review Triage

Status: `Accepted With Corrections`

Date: 2026-07-15

Source review:
[`reviews/2026-07-15-production-baseline-autoplan-review.md`](2026-07-15-production-baseline-autoplan-review.md)

Authoritative Stage 7 design:
[`specs/2026-07-15-internal-beta-productization-stage7-design.md`](../specs/2026-07-15-internal-beta-productization-stage7-design.md)

## Outcome

The multi-angle review is accepted as Stage 7 evidence after direct source and
QA cross-checking. Its central conclusion is sound: the new multi-group model is
strong, while the remaining legacy compatibility stack, public API protection,
documentation drift, distribution polish and operational visibility need to be
closed or explicitly managed before and during the colleague beta.

The review's raw `4 × P1 / 17 × P2 / 15 × P3` roll-up is not the final backlog.
The corrections below are authoritative for Stage assignment and acceptance.

## Accepted Internal-Beta Blockers

| Finding | Decision | Stage |
| --- | --- | --- |
| P1-1 plus P2-4/P2-7: live legacy server routes, shared legacy auth and Extension fallback | Accepted. Remove the client fallback first, then disable or remove the server compatibility surface. Do not treat display name or a shared legacy session as the current identity model. | 7B |
| P1-2 plus P2-1: no rate limiting and reflective CORS | Accepted. Add proxy-aware, route-class limits and a tested origin policy covering same-origin Admin, local development and the selected Extension distribution model. CORS is not an authentication control. | 7B |
| P1-3: root README can produce an incomplete Railway build and describes Admin hosting as pending | Accepted. Correct current deployment and hosting documentation before another release operation. | 7A |

P2-7 is treated as part of the P1-1 blocker: a fresh or no-group Extension must
show onboarding and must never fall back to the legacy read token/routes.

## Corrected Or Refined Findings

- **P1-4 → split and reclassify.** Fastify's default Pino logger is already
  structured. The real gaps are business context, alerting and reminder-delivery
  visibility. Add safe server error context in 7B; add monitoring, alerting and
  privacy-bounded reminder observation during 7D. The 7D portion does not block
  beta start because 7D is the beta process.
- **P2-5 → configuration decision, not confirmed production exposure.**
  `ALLOW_PUBLIC_GROUP_CREATION` must be explicitly configured in production, so
  the local default does not prove the live value. Stage 7B must verify the
  sanitized live boolean, decide the intended policy and document/test it.
- **P2-10 → integration-test gap.** The partial unique index has been deployed to
  real PostgreSQL and the database verifier has run there. What is missing is a
  real-PostgreSQL concurrent refresh test that exercises transaction/retry
  behavior.
- **P3-12 → closed as not reproducible.** The six verifier SQL checks run against
  fresh and legacy PostgreSQL databases in the Stage 6 migration rehearsal and
  ran in Railway pre-deploy and post-QA verification. Mock-focused unit tests do
  not erase that evidence.
- **P1-1 deletion scope refined.** Legacy routes and auth can be removed without
  dropping the `Teammate` model. Stage 6 deliberately retains teammate rows as
  historical attribution. Dropping that model requires a separate current spec,
  migration, history-preservation tests and production verification.
- **P2-2 remains a decision before implementation.** Stage 7B must define PII
  retention/export/deletion semantics and last-admin/history effects. A
  self-delete endpoint or cascade/anonymization strategy is not pre-approved.
- **P2-6 follows the legacy decision.** If legacy routes are removed, remove
  `TEAM_INVITE_CODE` and `EXTENSION_READ_TOKEN` plumbing safely instead of
  investing in a dead compatibility path. If temporarily retained, harden and
  time-bound them.
- **P2-11 needs distribution-specific acceptance.** Versioned unpacked builds
  require a controlled manual upgrade procedure; automatic update is an
  acceptance criterion only for an unlisted/store distribution choice.

## Stage Boundary Decision

Stage 7A remains a trusted-baseline and documentation stage. The source review's
"immediate Stage 7A" rate-limit, CORS and Extension-fallback changes are product
behavior changes and therefore move to Stage 7B. Stage 7A may improve release
checks and documentation tooling, but it must not silently ship these runtime
changes without the Stage 7B plan and TDD gates.

Stage 7C owns the detail-page visual gap, brand/token consistency, internal
codename removal, accessible modal behavior, QuickAdd idempotency and the chosen
distribution/upgrade contract.

Stage 7D owns operated-beta monitoring, alerting, reminder-delivery observation,
feedback and the account-system decision. It remains non-blocking for beta start,
while its stop/rollback conditions apply throughout the beta.

## Release Semantics

`v0.1.0-internal` remains the audit tag for the exact production-QA-verified
baseline `1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9`. It is not evidence that the
7B/7C beta blockers are fixed and must not be presented as the colleague-beta
distribution build. The hardened distributable build receives its own later
version boundary after the 7B and 7C gates pass.

## Verification Performed

- Cross-checked route registration, legacy authentication and Extension fallback.
- Cross-checked Fastify logging/CORS configuration and production environment
  requirements.
- Cross-checked the Stage 6 PostgreSQL migration rehearsal, database verifier and
  production QA evidence.
- Cross-checked Stage 6's retained-teammate attribution decision.
- Validated all local Markdown links in the source review.

No runtime code was changed and no product tests were run as part of this triage.
