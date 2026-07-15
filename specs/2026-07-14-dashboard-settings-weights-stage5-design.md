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

## Stage 5C Extension Experience And Reminder Runtime

The Extension keeps the popup and recommendation detail focused on today's
decision. Personal history is added as a fourth section in the existing
full-page options surface; Stage 5C does not add another HTML entry point or a
client-side router. The section shows the current membership's decided meals
from the last 30 office dates, a truthful empty state, and either the server's
insufficient-data result or average price and cuisine preferences. A
`coDinerCount` is described as other teammates who also decided that day, not
as proof that they chose the same restaurant.

Reminder controls have two explicit modes:

- Follow the group's defaults for reminder time, weekday enablement, and the
  second reminder.
- Use a device-local override for those three values until the member restores
  the group defaults.

The group-managed notification title and optional group label remain
read-only in the Extension. Existing local reminder records remain valid;
their legacy `enabled` value maps to weekday enablement, and an absent second
reminder override continues to inherit the group default. Following a group
default does not copy it into the local override bucket, so later server
changes can take effect after the Extension next synchronizes settings.

The Extension caches the last successfully validated group settings needed by
the Manifest V3 service worker, but does not cache personal history. An active
group merges an explicit local override with its cached group defaults. If an
active group has no valid settings cache and the settings request is
unavailable, the Extension schedules nothing because it cannot safely infer
the office timezone. The existing Shanghai primary-reminder fallback applies
only when there is no active group and never enables a second reminder.
Reminder times use strict `HH:mm`; invalid timezones or times are unschedulable.

Primary notifications may retain the existing recommendation cache fallback.
A second reminder is stricter: it is scheduled only after a fresh group-scoped
primary recommendation was successfully shown, it is fixed at 20 minutes, and
it performs a network-only participation read before notifying. A stale group,
office-date mismatch, any decided member, a removed or expired session, or a
network failure consumes and suppresses the pending second reminder. Group
switches, disconnects, API-host changes, and reminder-setting changes cancel
pending second reminders. Pending context is persisted in `chrome.storage` so
service-worker suspension cannot turn process memory into a source of truth.
Both primary and second alarm contexts carry a persisted reminder revision.
Every alarm claim and notification side effect revalidates that revision and
the current group/session, so clearing an alarm is not the only defense against
an interleaved group or settings change.

Chrome alarm creation is verified against both the persisted context and the
actual scheduled time. Reminder runtime operations are serialized within one
service-worker instance, and a stale scheduling attempt repairs or preserves a
newer alarm instead of clearing it by shared name. Worker evaluation restores
future alarms without consuming a context that has just become due. Chrome
notification icons use a full `chrome.runtime.getURL(...)` URL so a service
worker notification cannot fail on a relative asset path.

Settings and personal history load independently after the Extension captures
`apiBaseUrl`, `groupId`, `membershipId`, and the group session token. Switching
groups or starting a newer load invalidates older results; an old response may
not update the new group's UI, settings cache, local override, alarm, or pending
second-reminder state.
Concurrent settings/history 401 responses share one group-session refresh for
the active generation and retry each failed resource at most once. Personal
history preserves the server order and at most one current-membership decision
per office date; co-diner counts do not imply a shared restaurant.

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
5B adds Admin state and browser QA. Stage 5C adds extension client, storage,
timezone scheduling, second-reminder policy, cross-group race, options-page,
and manual Chrome Developer Mode QA.
