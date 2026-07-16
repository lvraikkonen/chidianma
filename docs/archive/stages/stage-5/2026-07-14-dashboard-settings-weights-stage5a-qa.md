# Stage 5A Shared Contracts And Server Handoff

Status: `Passed`

Date: 2026-07-14

Branch: `stage5-dashboard-settings-weights`

Starting commit: `7f923dc5531eb9fe46967cd8657a1af581348922`

## Delivered Boundary

- Added shared route builders and request/response contracts for Dashboard,
  recommendation history, personal lunch history, settings, members, member
  mutation, and invite-code rotation.
- Added office-calendar windows for Monday-Sunday weeks, previous week,
  rolling 7/30 office dates, and office-timezone natural-month UTC bounds.
- Added authenticated group Dashboard aggregation with explicit insufficient
  states, active-only today participation, retained historical decisions, top
  restaurants, category distribution, status counts, and recent create events.
- Added stable opaque-cursor history ordered by `officeDate DESC, batchNo DESC`,
  including current and superseded batches, stored scoring snapshots, weather,
  algorithm version, recommendation results, and real decision distribution.
- Added current-session personal history for the last 30 office dates.
- Added settings defaults/read, transactional partial update, scoring-weight
  upsert, current-month member contribution, normalized member mutation, and
  transactional invite-code rotation.
- Reused the existing Prisma schema and indexes. No migration was added.

## Public Routes

- `GET /api/groups/:groupId/dashboard`
- `GET /api/groups/:groupId/history?cursor=&limit=`
- `GET /api/groups/:groupId/history/me`
- `GET /api/groups/:groupId/settings`
- `PATCH /api/groups/:groupId/settings`
- `GET /api/groups/:groupId/members`
- `PATCH /api/groups/:groupId/members/:membershipId`
- `POST /api/groups/:groupId/invite-code/rotate`

All routes require a current active group membership. Settings/member/invite
mutations require the current database role to be Admin.

## TDD And Verification Results

Baseline before Stage 5A:

- Shared: 14 tests passed; typecheck passed.
- Server: 157 tests passed; typecheck passed.

Final package checks:

- `pnpm --filter @lunch/shared test`: 17 tests passed.
- `pnpm --filter @lunch/shared typecheck`: passed.
- `pnpm --filter @lunch/server test`: 211 tests passed.
- `pnpm --filter @lunch/server typecheck`: passed.
- `pnpm --filter @lunch/server build`: passed.

Final monorepo checks:

- `pnpm test`: 461 tests passed across shared, server, Admin, and extension.
- `pnpm typecheck`: passed for all participating workspaces.
- `pnpm build`: passed for shared, server, Admin, and extension.
- `git diff --check`: passed.

Coverage added for route literals, timezone/DST boundaries, aggregation
insufficiency, current and removed membership behavior, cross-group isolation,
stale-role checks, cursor validation and stable pagination, multi-restaurant
decisions, partial settings atomicity, validation-before-write, current-month
contributions, invite invalidation, and immutable historical weight snapshots.

## Not Performed

- No browser or Chrome manual validation was run because 5A intentionally
  contains no Admin or extension UI/runtime behavior. Those checks belong to
  5B and 5C.
- No live PostgreSQL/Railway validation was run. Stage 5A adds no migration;
  database behavior is covered by service and Fastify route tests with Prisma
  test doubles. Deployment rehearsal remains Stage 6 work.

## Known Contract Limitation

Historical restaurant names, dishes, cuisine, and price use current associated
records. Only the already persisted batch score, reason, breakdown, weight
snapshot, algorithm version, and weather snapshot are immutable. This is the
approved no-migration Stage 5A boundary.
