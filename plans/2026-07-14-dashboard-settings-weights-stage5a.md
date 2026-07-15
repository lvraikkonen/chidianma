# Stage 5A Shared Contracts And Server Implementation Plan

Status: `Done`

Date: 2026-07-14

## Goal

Implement the group-scoped contracts and Fastify APIs required by Stage 5B and
5C without changing Admin or extension UI behavior.

## Constraints

- Use TDD for each task: failing test, minimum implementation, refactor, local
  regression.
- Preserve Stage 1-4 routes and behavior.
- Reuse the existing Prisma schema and indexes; do not create a migration.
- Keep every route group-session authenticated and database-role authorized.
- Keep all public request and response types in `@lunch/shared`.

## Task 1: Shared Contracts

- Add failing tests for dashboard, history, personal history, settings,
  members, member mutation, invite rotation, route builders, data status, and
  pagination contracts.
- Implement the types and route builders in the shared package.
- Run shared tests and typecheck.

## Task 2: Office Calendar Windows

- Add failing tests for Monday-Sunday weeks, previous week, current office
  month UTC bounds, rolling 7/30 office dates, year boundaries, Shanghai, Los
  Angeles DST, and invalid IANA timezones.
- Implement reusable server date-window helpers without server-local timezone
  dependence.
- Run date tests and server typecheck.

## Task 3: Dashboard

- Add service tests for current and previous week counts, active-only today
  participation, retained removed-member history, average-price eligibility,
  insufficient data, uncategorized cuisine, top-five restaurants, and eight
  latest real create events.
- Implement the dashboard aggregation service and authenticated route.
- Add route tests for group isolation, removed membership, and response group.

## Task 4: Recommendation And Personal History

- Add tests for opaque cursor validation and stable office-date/batch-number
  ordering.
- Implement paginated batch review with current and superseded batches, stored
  score snapshots, weather, generator, and same-date decision distribution.
- Implement current-membership personal history for the last 30 office dates,
  co-diner counts, and insufficient preference state.
- Add route tests for invalid cursor/limit and group isolation.

## Task 5: Settings, Members, And Invite Rotation

- Add tests for read defaults without writes, partial atomic patches, Admin
  authorization, strict time/timezone/coordinate/weight validation, nullable
  fields, and unchanged omitted fields.
- Implement settings read and transactional patch with settings/weight upsert.
- Add current-office-month contribution aggregation and normalize member PATCH
  responses while preserving last-admin locks.
- Implement Admin-only invite rotation; prove the old code fails and the new
  one succeeds without persisting plaintext.
- Prove weight changes do not mutate old batch snapshots and new refreshes use
  the updated weights.

## Task 6: Regression And Handoff

- Register routes and run shared/server tests, typechecks, server build, then
  root tests, typecheck, and build.
- Record results and known issues in a Stage 5A handoff.
- Mark 5A Done only after all checks pass. Leave 5B/5C unplanned in detail until
  the actual 5A API shapes are verified.

## Completion

Completed on 2026-07-14 from starting commit
`7f923dc5531eb9fe46967cd8657a1af581348922`. Shared/server package checks and
the full monorepo test, typecheck, and build gates passed. Detailed evidence is
recorded in
[`qa/2026-07-14-dashboard-settings-weights-stage5a.md`](../qa/2026-07-14-dashboard-settings-weights-stage5a.md).
