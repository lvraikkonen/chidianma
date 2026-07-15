# Stage 5B Admin Dashboard And Settings Handoff

Status: `Passed`

Date: 2026-07-14

Branch: `stage5-dashboard-settings-weights`

Starting commit: `7f923dc5531eb9fe46967cd8657a1af581348922`

## Delivered Boundary

- Added Admin clients for Dashboard, batch history, settings, members, member
  mutation, and invite rotation using the Stage 5A shared contracts.
- Added `#dashboard` and `#settings`, with the production navigation fixed to
  今日推荐 / 餐厅库 / 推荐记录 / 设置.
- Added partial-failure Dashboard/history loading, stable append/deduplication,
  explicit cursor loading, retry, and stale-response generation gates.
- Added KPI, insufficient, CSS-bar, real recent-activity, current/superseded
  batch, real decision-distribution, weather, algorithm, weight, score, reason,
  and full breakdown views with accessible inline disclosure.
- Added independent group/reminder/weight drafts and PATCH saves, mirrored
  client validation, read-only member mode, contribution rows, last-Admin UI
  protection, member role/status operations, and auth resynchronization.
- Added confirmed invite rotation with one-time in-memory plaintext, clipboard
  success/failure messaging, and immediate clearing when the result modal
  closes.
- Added desktop and narrow-screen layout rules without adding dependencies or
  changing Server, Prisma, Extension, or shared Stage 5A contracts.

## TDD And Automated Verification

Baseline before Stage 5B:

- Admin: 58 tests passed; typecheck and build passed.
- Monorepo: 461 tests passed.

Final Admin checks:

- `pnpm --filter @lunch/admin test`: 75 tests passed in 18 files.
- `pnpm --filter @lunch/admin typecheck`: passed.
- `pnpm --filter @lunch/admin build`: passed.

Final monorepo checks:

- `pnpm test`: 478 tests passed: shared 17, server 211, Admin 75, extension 175.
- `pnpm typecheck`: passed for every participating workspace.
- `pnpm build`: passed for shared, server, Admin, and extension.
- `git diff --check`: passed.

Coverage added for exact routes and tokens, router fallback/navigation, partial
resource failures, history append/deduplication and retry, insufficient and
stored-snapshot rendering, same-day batches, multi-restaurant decisions,
section draft isolation, validation, last-Admin detection, member order, Admin
and member markup, and one-time invite rendering.

## Browser QA

Ran the Admin Vite build against the real local Stage 5 server and configured
development PostgreSQL database.

Verified:

- Four-link navigation, active route state, Dashboard empty/insufficient
  states, real restaurant counts, and real create activity.
- Admin group-profile save and immediate group-switcher name refresh.
- Invalid IANA timezone is rejected by the client before save.
- Invite confirmation, version increment, clipboard success, one-time modal,
  DOM clearing on close, old-code rejection, and new-code joining.
- Ordinary member can read Dashboard, settings, weights, invite metadata, and
  both member rows, while all write controls remain disabled or absent.
- A real restaurant/recommendation can produce two batches on the same office
  date; history shows batch 2 as current and batch 1 as superseded.
- Inline expansion exposes generation metadata, stored algorithm and six
  weights, recommendation score/reason/breakdown, and the explicit no-decision
  state with `aria-expanded` semantics.
- Desktop and 390px Dashboard/settings layouts. At 390px the document and
  responsive sidebar both matched the viewport width with no horizontal
  overflow.
- Browser console contained zero error entries.

The browser run created a disposable `Stage 5B QA 小组` fixture, two QA
identities, one restaurant/recommendation, and two recommendation batches in
the configured development database.

## Not Manually Exercised

- Dashboard `ready` averages/category percentages require at least three
  historical decisions across two memberships; those thresholds and rendering
  are covered by Server and Admin automated tests, while the browser fixture
  intentionally remained insufficient.
- Destructive member role/status mutations, self-demotion/removal, restore,
  Server `last_admin`, clipboard rejection, pagination failure/retry, and a
  multi-restaurant decided distribution were not mutated in the shared
  development database. Their state/model/route behavior is covered by the
  automated suites.
- No Chrome extension QA was run; Extension consumption of reminder defaults
  and personal history belongs to Stage 5C.

## Known Boundary

Historical restaurant and recommendation labels still reflect current related
records. Stored batch weather, weights, algorithm, score, reason, and breakdown
remain the immutable history boundary established in Stage 5A.
