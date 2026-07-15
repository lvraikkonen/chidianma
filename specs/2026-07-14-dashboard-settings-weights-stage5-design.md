# Stage 5 Dashboard / Settings / Weights Design

Status: `Approved for Execution`

Date: 2026-07-14

## Overview

Stage 5 completes the review, operations, and tuning surfaces deferred by
Stage 4. It adds group-scoped historical review and statistics, member
contribution and management, group reminder defaults, scoring weights, group
profile management, invite rotation, extension personal history, and a calm
second-reminder flow.

The work is split into three independently verified slices:

1. Stage 5A: shared contracts and server APIs.
2. Stage 5B: Admin dashboard, history, members, and settings.
3. Stage 5C: extension personal history and reminder runtime.

Stage 5 reuses the existing multi-group schema. It does not add accounts,
machine-learning ranking, deployment hosting, or new database tables.

## Confirmed Product Decisions

- All active members may read group dashboard, history, settings, and members.
- Only the current database Admin role may change settings, members, weights,
  or invite codes.
- Admin history is cursor-paginated with 20 batches by default and 50 maximum.
- Extension personal history covers the current member's last 30 office dates.
- Member contributions use the current natural month in the group office
  timezone and count restaurants, recommendations, and membership-linked
  feedback.
- Natural weeks run Monday through Sunday. Rolling seven-day windows include
  the current office date.
- Team average and category preference are insufficient below three decisions
  or two distinct members.
- Scoring weights are integers from 0 through 100. Updates affect only future
  batches; stored batch snapshots stay unchanged.
- Group reminder settings are defaults. An explicit device-local override
  remains authoritative until the user restores the group default.
- When enabled, the second reminder runs 20 minutes after a successful primary
  reminder and notifies only when nobody has decided. Network or session
  failure suppresses the second reminder.
- Invite plaintext is never recoverable from storage. Rotation invalidates the
  old code and returns the new code exactly once.

## Architecture And Data Rules

`@lunch/shared` owns all new request and response contracts. Fastify remains
the authorization and aggregation boundary. Every new route is under
`/api/groups/:groupId/*` and requires a signed group session whose active
membership is re-read from PostgreSQL.

Dashboard and history derive facts from existing rows:

- `daily_participation.status=decided` is the source of truth for meals eaten.
- Batch review includes current and superseded batches and preserves stored
  score, reason, breakdown, weight snapshot, and algorithm version.
- Multiple restaurants selected on one office date remain a distribution.
- Removed members no longer count in today's active participation, but their
  historical decisions and contributions remain visible.
- Missing cuisines aggregate under `未分类`.
- Recent activity contains only real restaurant and recommendation creations;
  Stage 5 does not invent an audit log.

Historical restaurant names, dishes, cuisine, and price use the current
referenced records because the existing schema does not snapshot those display
fields. Stage 5 adds no migration to change that contract.

## Stage 5A API Boundary

- `GET /api/groups/:groupId/dashboard`
- `GET /api/groups/:groupId/history?cursor=&limit=`
- `GET /api/groups/:groupId/history/me`
- `GET /api/groups/:groupId/settings`
- `PATCH /api/groups/:groupId/settings`
- `POST /api/groups/:groupId/invite-code/rotate`
- `GET /api/groups/:groupId/members`
- `PATCH /api/groups/:groupId/members/:membershipId`

Settings patches may update group profile, reminder defaults, and scoring
weights together and commit atomically. GET returns defaults without writing
when historical settings or weights rows are missing; PATCH upserts them.

## Stage 5B Admin Experience

The Admin keeps the Stage 4 hash-router shell and adds two production pages:

- `#dashboard` is labelled “推荐记录” and combines team Dashboard metrics with
  cursor-paginated recommendation batch history.
- `#settings` combines group profile, reminder defaults, scoring weights,
  members, and invite rotation.

History rows remain compact until the user expands one inline. Expanded rows
show the stored weather, algorithm, weights, recommendation score breakdowns,
and the real multi-restaurant decision distribution. Pagination uses an
explicit “加载更多” action and the opaque server cursor.

Group profile, reminder defaults, and scoring weights save independently.
Saving one section must not discard unsaved drafts in another section. Active
members see both pages; only the current database Admin role sees enabled
mutation controls. Invite rotation requires confirmation and the returned
plaintext code exists only in the one-time in-memory result dialog.

## Error And Compatibility Rules

- Invalid cursors or limits return 400 without querying another page.
- Invalid timezones, reminder times, coordinates, weights, or nullable fields
  return 400 without partial writes.
- Cross-group sessions and removed memberships cannot read or mutate data.
- Last-active-admin locking and stale-role checks remain authoritative.
- Legacy routes and all Stage 1-4 contracts remain compatible.
- Stage 6 retains Admin static hosting, Railway hardening, migration rehearsal,
  and final Chrome smoke testing.

## Verification

Each slice uses Red-Green-Refactor. Stage 5A covers contract literals,
timezone windows including DST, aggregation insufficiency, group isolation,
history pagination and distributions, settings atomicity, current-role
authorization, invite rotation, and immutable stored weight snapshots. Stage
5B adds Admin state and browser QA. Stage 5C adds extension storage, alarm, and
manual Chrome QA.
