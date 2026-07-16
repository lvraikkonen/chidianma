# Stage 7B Lightweight Identity and Pre-Beta Hardening QA

Status: `Complete`

Date: 2026-07-16

## Outcome

The approved Stage 7B implementation is complete in the local workspace. The lightweight identity
boundary is documented and enforced across Server, Admin and Extension; legacy runtime routes are
closed; public entry points have rate limits and an explicit Origin policy; operator PII tools,
safe error context and the PostgreSQL concurrency rehearsal are implemented.

Stage 7B is complete. The implementation, automated gates, real unpacked-Extension Chrome matrix,
two-step production rollout and production security evidence all pass. Stage 7C is now
`Ready for Planning`; no colleague distribution build or ordinary colleague beta starts from
Stage 7B.

## Domain and authorization boundary

- Root `CONTEXT.md` defines lightweight identity, identity link code, group invite, disconnect this
  device, reset all connections, membership, removal, anonymization and operator recovery without
  acting as a requirements source.
- ADR 0001 is `Accepted`: display names are non-unique, Admin belongs to membership, link codes
  require one connected device, total Token loss creates a new identity, and last-Admin recovery is
  an operator action after colleague-relationship verification.
- `Identity.authVersion` defaults to zero, so versionless pre-7B Tokens remain valid only while the
  database version is zero. New Identity and Group Tokens carry the current version.
- Anonymized identities cannot renew, link, create/join groups or exercise membership. Every
  membership authorization revalidates route group, membership ID, claim identity, database
  identity/version/anonymization, active status and current role.
- Link codes contain 60 random bits, use the `LINK-XXXX-XXXX-XXXX` display form, expire after ten
  minutes, are one-time, invalidate prior unconsumed codes and persist only an HMAC hash.
- Reset-all-connections atomically increments `authVersion`, deletes link codes and returns one new
  Identity Token; prior Identity and Group Tokens then fail immediately.

## Client and legacy closure

- Admin and Extension renew the Identity Token before group synchronization, renew the active group
  session at startup, and use a shared single-flight session renewal for one business-request retry.
- A failed Identity renewal clears all local identity, group-session and sensitive cache state;
  removed membership clears only that group's session and resynchronizes groups.
- Both clients support create identity, redeem/generate a one-time link code, identity reference,
  disconnect this device and reset all connections. Redeeming another identity requires an explicit
  disconnect first.
- Extension storage migration removes the former read token, global last recommendation and legacy
  alarm context while preserving grouped sessions, caches, reminder overrides and active group.
- With no active group, Extension recommendation and reminder policy makes no request and creates no
  notification/alarm.
- The Server no longer registers the former unscoped session, restaurant, recommendation, feedback
  or today-recommendation APIs. Their historical tables, migration lineage and verifier coverage are
  retained. The release-artifact gate now fails on any compiled old header, path or default value.

## Edge security, logging and dependencies

- Route-specific in-memory Fastify 5 rate limits cover identity create/redeem, group join/create,
  Identity/Group session issuance, link generation and reset. The Identity buckets key on an
  irreversible hash of Authorization; public buckets key on validated client IP.
- Production accepts a syntactically valid Railway `X-Real-IP` and otherwise falls back to socket
  IP; development and tests use `request.ip`.
- CORS allows the exact public API origin, development-only Vite origins and strict
  `chrome-extension://[a-p]{32}` origins; it does not enable credentials or reflect arbitrary web
  Origins.
- 500 responses are fixed `internal_error`. Logs are restricted to request/Railway IDs, method,
  route template, group/date/operation/retry metadata, status and classified database code. Tests
  assert that fake Tokens, names, bodies, headers and database URLs are absent.
- `@fastify/static` resolves to `9.3.0`, above the `9.1.1` fix floor for both Stage 7A advisories;
  Admin static routing, caching, API precedence and missing-build behavior remain covered.
- `@fastify/rate-limit` resolves to Fastify-5-compatible `10.3.0` with the single-replica in-memory
  store. A shared store remains mandatory before adding Server replicas.

## Operator and PII support

- All four commands default to dry-run and require the exact printed confirmation for apply.
  `identity:export` requires an identity ID and non-existing output path, then uses exclusive creation
  and mode `0600`, includes only the identity's memberships, authored content, participation,
  feedback and batch attribution, and excludes Tokens, invite/link hashes and other member PII.
  Anonymization locks/checks every affected group first and aborts
  the whole transaction if the identity remains a last active Admin anywhere.
- Successful anonymization removes active memberships, clears `lastSeenAt`, applies a uniform
  non-identifying label, sets `anonymizedAt`, increments `authVersion` and deletes link codes while
  retaining historical foreign keys and statistics.
- Admin recovery atomically promotes the replacement membership before removing the old Admin;
  revoke-sessions is the operator fallback when no device remains connected.

## Automated verification

All commands used Node `22.23.1` and pnpm `9.15.0`.

| Command | Result |
| --- | --- |
| `pnpm test` | PASS: 625 tests — Shared 21, Server 265, Admin 78, Extension 261 |
| `pnpm typecheck` | PASS: all four packages |
| `pnpm build` | PASS: Shared, Server, Admin and Extension |
| `pnpm build:railway` | PASS: Shared → Prisma client → Admin → clean Server build |
| `pnpm --filter @lunch/server migration:rehearse` | PASS: fresh migration, legacy fixture, verifier repeatability, overlap abort and PostgreSQL concurrent refresh |
| PostgreSQL concurrent refresh assertion | PASS: both calls succeeded, two batches persisted, exactly one final current batch |
| `pnpm check:docs` | PASS: 55 Markdown files / 120 local links |
| `pnpm check:release-artifacts` | PASS: no compiled legacy header/path/default residue |
| `pnpm check:release-secrets` | PASS: 75 files; no supplied secret value detected |
| OSV-Scanner `v2.4.0` + production classifier | PASS: 122 production package versions; 0 critical/high/medium/low findings |
| `git diff --check` | PASS |

The full lockfile OSV report still contains five development-only advisories: one esbuild, three
Vite and one Vitest. None intersects the Server production tree. They remain a separately tested
maintenance item before a distributable build.

## Local Chrome and live-edge evidence

- The user manually loaded the latest unpacked `apps/extension/dist` build and opened its options
  page in Chrome. Browser security policy prevented automation inside the `chrome-extension://`
  page, so Extension assertions below combine user-observed UI with independently queried temporary
  PostgreSQL state.
- A production-mode Server/Admin candidate ran against an isolated PostgreSQL 16 database. Health
  returned `ok`, readiness returned `database=ready`, and the reported revision was
  `stage7b-chrome-smoke`.
- Admin created identity `cmrn4twkw00000j93vfe9zqug` and the `Stage 7B Chrome Smoke` group, then
  generated a one-time identity link code. The user redeemed it in Extension and confirmed the same
  identity reference, group and Admin role. Database evidence remained exactly one identity and one
  active Admin membership, proving the cross-end link did not create a duplicate member. Replaying
  the consumed code returned `401 invalid_identity_link_code`.
- The reverse direction also passed: Extension created identity `cmrn52pv800070j93wbr7eich` and the
  `Stage 7B Extension Smoke` group, then Admin explicitly disconnected its prior local identity and
  redeemed the Extension-generated link code. Admin displayed the same identity reference and group,
  successfully issued a group session, and PostgreSQL still contained exactly one active Admin
  membership for that identity. The link-code row was consumed once.
- Reset-all-connections preserved the Admin identity and group membership, allowed Admin to issue a
  fresh group session, incremented `authVersion` from zero to one, and deleted all link-code rows.
  After refreshing Extension, the user confirmed that the invalid old Identity/Group Tokens caused
  local identity, sessions and active-group state to clear and the UI returned to onboarding.
- Admin removed an active ordinary membership while that identity was connected in Extension.
  PostgreSQL retained the non-anonymized identity and changed only that membership to `removed`;
  after refresh the user confirmed Extension retained the lightweight identity, cleared the removed
  group's session/current-group state, and showed the create-or-join group screen.
- After restoring that isolated membership, a live three-item recommendation batch was loaded in
  Extension and persisted to its group-scoped cache. The local Server was then stopped completely;
  reopening the Extension popup still showed the same three items and explicitly stated that cached
  content was view-only with write operations disabled.
- A valid but expired group-session Token was then injected only into the isolated group's Extension
  storage while leaving the Identity Token intact. Opening the popup still rendered the same live
  recommendations. Server evidence showed the recommendation request returning 401, one successful
  group-session issuance, and one successful retry. The subsequently loaded participation request
  held the popup's original storage snapshot and independently followed the same bounded
  401/session/retry sequence; neither operation looped or disconnected the identity. Concurrent
  single-flight issuance remains covered by the automated Extension tests.
- Finally, the ordinary membership was removed again and Extension synchronized to the stable
  no-group screen. Opening the popup from that state produced no group-scoped Server request, showed
  no cached recommendation, and the Extension alarm query returned an empty array. No notification
  was emitted during the observation.
- A real preflight from the installed Extension origin returned 204 with the exact origin,
  `GET/POST/PUT/PATCH/OPTIONS`, `Authorization/Content-Type`, and a 600-second max age. A disallowed
  web origin received no CORS allow headers. Repeated invalid link-code requests reached `429
  rate_limit_exceeded`; the `Retry-After` header matched `retryAfterSeconds`, and no identity,
  membership or link-code row was added.
- `/api/session`, `/api/restaurants`, `/api/recommendations`, `/api/feedback` and
  `/api/today-recommendations` each returned JSON 404 from the running candidate.

## First production deployment evidence

- Browser security policy did not permit automation inside the installed `chrome-extension://`
  options page. The user performed the Extension-side assertions while Server UI, logs and temporary
  PostgreSQL state supplied independent evidence.
- The user approved the first rollout step, which preserved all existing Railway variables and
  deployed the current workspace to `remarkable-reverence / production / @lunch/server`.
  Deployment `2d3db6db-e1ab-41c2-86c0-edd2138dcc1a` reached `SUCCESS`; Railway deployment metadata
  records image digest `sha256:25c93bb27ab73f07d57a3f534697afe6dd2654759c3783ccd6913cf1b0ad395b`.
  Because this was a CLI upload of the approved but uncommitted workspace, `/api/ready` reports
  revision `local`; the deployment ID and image digest, rather than a Git commit, identify the
  deployed artifact. The pre-deployment rollback point is deployment
  `371242e7-9783-4866-aaa5-f4f26218ddcf` at commit
  `ad0260b4abf12b48bbc64e73020858ff316227f3`.
- Railpack used Node `22.23.1` and pnpm `9.15.0`; Shared, Prisma client, Admin and Server built
  successfully. Pre-deploy environment validation passed, migration
  `20260715180000_stage7b_identity_links` applied to `Postgres-W12K`, and all six read-only database
  verifier checks passed with zero findings. Railway's `/api/ready` healthcheck passed on its first
  attempt.
- External production smoke passed for `/api/health`, `/api/ready` and the Admin HTML shell.
  Production same-origin and the installed Chrome Extension origin received the exact CORS policy;
  an unrelated web origin received no allow headers. All five legacy APIs returned JSON 404.
- A clearly named Stage 7B Demo identity and group verified new identity creation, sliding Identity
  renewal, group creation, group-session issuance, Token expiry fields and Admin membership. The
  user linked the same identity through production Admin and Extension and confirmed the same
  identity reference, group and Admin role. A production read-only count then showed exactly one
  identity, one membership, one active Admin and one group for that Demo identity; both generated
  link codes were consumed.
- Invalid link-code redemption returned the uniform 401 response, then reached
  `429 rate_limit_exceeded`. The `Retry-After` header and `retryAfterSeconds` were both 282 seconds.
  Before and after counts were identical at 7 identities, 6 memberships, 2 link-code rows and
  4 groups, proving that the rate-limit probe wrote no data.
- The Demo identity anonymization command was run only in dry-run mode. It reported one active
  membership and correctly listed the Demo group as a blocking last-Admin group. No production
  anonymization apply was run.
- The two legacy Railway variable names remained present after deployment, and no variable value
  was changed. No HTTP 5xx or application error log was recorded for the new deployment during the
  smoke window.

## Second production deployment evidence

- The user separately approved setting `ALLOW_PUBLIC_GROUP_CREATION=false` and deleting
  `TEAM_INVITE_CODE` plus `EXTENSION_READ_TOKEN`. Railway stored all three changes before the final
  redeploy, so no intermediate configuration was promoted.
- Deployment `6d80eb52-d35a-4554-9d66-aa44dd2d6b1c` reused the validated Stage 7B application
  artifact with the final variable set and reached `SUCCESS`. Railway records final image digest
  `sha256:dba6964449d3f8627c4188855fae15935e3c065313bccb074b664ce5a52133c7`.
  Deployment `2d3db6db-e1ab-41c2-86c0-edd2138dcc1a` is the immediate pre-variable-change rollback
  point.
- Environment validation passed, no migration remained pending, all six live database verifier
  checks again reported zero findings, and `/api/ready` returned database ready.
- Production health, Admin hosting, the complete Origin matrix and all five legacy JSON 404
  responses passed again. No HTTP 5xx or application error was recorded during the smoke window.
- The final variable audit showed `ALLOW_PUBLIC_GROUP_CREATION=false`; both legacy variable names
  were absent. A newly created, clearly named no-group Demo identity received
  `403 group_creation_disabled` from `POST /api/groups`. The production group count remained four,
  and that identity created no group and acquired no membership.
- The user refreshed Admin and Extension after the final redeploy and confirmed that the existing
  production Demo identity reference, group and Admin role remained identical. A final read-only
  database check showed exactly one identity, one membership, one active Admin and one group for
  that cross-end Demo identity.

## Exit decision

Stage 7B passes every approved exit gate and is `Done`. Stage 7C is `Ready for Planning`; this QA
does not create a Stage 7C plan, produce a colleague distribution artifact or start Stage 7D.

No subagents, colleague distribution artifact, ordinary colleague beta, production anonymization,
tag push or release creation was used or performed. Production writes were limited to the clearly
named Demo identity/group/link-code smoke fixtures authorized by the rollout plan.
