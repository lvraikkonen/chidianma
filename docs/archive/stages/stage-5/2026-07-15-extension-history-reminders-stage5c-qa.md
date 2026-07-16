# Stage 5C Extension History And Reminder Runtime Handoff

Status: `Passed`

Date: 2026-07-15

Branch: `stage5-dashboard-settings-weights`

Planning commit: `b941e1ab9a11c0c659f507e4f54f0f94d0197523`

Tested implementation commit: `1031c78cc469ec26a96ec9ca51a54c552ec73518`

## Delivered Boundary

- Added captured group-context clients for settings, personal history, and
  live participation with response group/membership validation.
- Added validated group-settings cache, canonical device overrides, reminder
  revisions, and persisted primary/second alarm contexts under Web Locks.
- Added strict timezone scheduling, DST handling, follow-default and local
  override modes, and a dependency-injected Manifest V3 reminder runtime.
- Added independent settings/history Options resources, single-flight session
  refresh, stale-generation protection, restore-default behavior, and section
  04 personal-history states.
- Added primary reminders plus a fresh-response-only second reminder that
  checks live participation after 20 minutes and remains quiet after any
  decision or request/context failure.
- Hardened real Chrome delivery by verifying actual alarm creation and time,
  serializing runtime operations, preserving newer alarms after stale work,
  restoring future alarms without stealing due events, persisting alarms
  across sessions, and resolving notification icons with a full extension URL.

No Shared, Server, Prisma, Admin, dependency, migration, or Chrome-permission
change was made by Stage 5C.

## TDD And Automated Verification

Planning baseline:

- Extension: 175 tests passed; typecheck and build passed.
- Monorepo: 478 tests passed.

Final package checks:

- `pnpm --filter @lunch/extension test`: 259 tests passed in 20 files.
- `pnpm --filter @lunch/extension typecheck`: passed.
- `pnpm --filter @lunch/extension build`: passed.

Final monorepo checks:

- `pnpm test`: 562 tests passed: Shared 17, Server 211, Admin 75, Extension 259.
- `pnpm typecheck`: passed for all participating workspaces.
- `pnpm build`: passed for Shared, Server, Admin, and Extension.
- `git diff --check`: passed.

The built Manifest V3 file retains only `alarms`, `notifications`, and
`storage`, with the existing localhost and Railway host permissions.

Added coverage includes exact Stage 5 routes and captured contexts, malformed
responses, storage migration and lock behavior, reminder fingerprint/revision
rules, Shanghai and Los Angeles DST scheduling, primary cache policy, strict
second-reminder policy, session/resource recovery, group-switch races,
personal-history states, alarm creation verification, stale scheduling races,
due-event worker wakeup, and serialized rescheduling.

## Chrome Developer Mode QA

Environment:

- Chrome `150.0.7871.116` on macOS.
- Browser machine timezone: `America/Los_Angeles`.
- QA group office timezone: `Asia/Shanghai`.
- Unpacked build: `apps/extension/dist`.
- Current Stage 5 server and development PostgreSQL ran at
  `http://localhost:3000`.

Verified:

- Options sections 03 and 04 load settings and personal history independently.
- Follow-group defaults, device-local override, strict reminder time save, and
  restore-group-default behavior.
- Personal history `empty`, `insufficient`, and `ready` states, three ordered
  office-date records, conditional average price, and category bars.
- A real popup quick-add created a restaurant and recommendation; refresh,
  feedback, joining, decided, and status changes remained functional.
- A Los Angeles browser scheduled against Shanghai office time and delivered
  the primary notification at the expected Shanghai minute.
- The primary notification used the group-managed title and label, weather
  context, and truthful empty-recommendation fallback.
- With no decision, the persisted second alarm delivered once after the fixed
  20-minute delay.
- With a real decided participation, an accelerated QA second alarm performed
  the live participation request, consumed its context, and created no
  notification.
- Closing Service Worker DevTools allowed suspension; a later primary alarm
  still woke the worker and displayed the notification.
- Approximately 390px Options layout had no horizontal overflow, controls and
  history stacked vertically, keyboard focus was visible, and reminder fields
  and save were operable by keyboard.
- macOS Chrome notification permission was explicitly enabled before delivery
  verification.

The local QA fixture contains a disposable group/identity, restaurant,
recommendation, batches, feedback, current participation, and two seeded prior
office-date decisions used only to reach the history-ready threshold. No invite
code or session token is recorded in this handoff.

## Not Manually Exercised

- A live group switch during in-flight settings/history requests, concurrent
  401 single-flight recovery, removed membership, corrupt cache, invalid
  timezone, and mismatched host/group/membership/revision were not destructive-
  tested in the shared browser fixture. Their no-write/no-notification behavior
  is covered by the Extension suites.
- Offline primary cache fallback, offline second-reminder suppression, and the
  no-active-group legacy Shanghai mode were not manually forced. Their policy
  and runtime branches are covered by automated tests.
- A nonzero co-decider history label and missing optional history fields were
  not seeded in Chrome; model/rendering coverage verifies these states.

## Known Deployment Boundary

`https://lunchserver-production.up.railway.app` answered health requests but
returned 404 for the Stage 5 settings and personal-history routes during QA,
which shows that production is still on a pre-Stage-5 server build. Local QA
used the current server successfully. Railway deployment, migration rehearsal,
production smoke testing, and final release validation remain Stage 6 work.
