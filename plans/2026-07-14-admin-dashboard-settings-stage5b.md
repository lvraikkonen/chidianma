# Stage 5B Admin Dashboard And Settings Implementation Plan

Status: `Done`

Date: 2026-07-14

## Goal

Connect the Stage 4 Admin shell to the verified Stage 5A Dashboard, history,
settings, members, and invite-rotation contracts without changing Server,
Prisma, Extension, or shared public types.

## Confirmed UX Decisions

- Add `#dashboard` (“推荐记录”) and `#settings`; do not add separate history or
  members routes.
- Combine Dashboard and batch history on the recommendation-record page.
- Expand complete batch details inline and paginate through an explicit
  “加载更多” action using 20-item pages.
- Combine group profile, reminder defaults, weights, members, and invite
  operations on the settings page.
- Save group profile, reminders, and weights as independent PATCH sections.
- Use CSS bars and the established warm Admin visual system; add no chart or
  state-management dependency.

## TDD Tasks

### 1. Clients, routes, and models

- Write failing tests for exact Stage 5A routes, tokens, cursor query strings,
  methods, and JSON bodies, then implement the Admin clients.
- Write failing router and shell tests, then add the two hash routes and four
  production navigation links.
- Build pure Dashboard and settings models for partial load states, history
  append/deduplication, independent drafts, validation, member updates, and
  one-time invite state.

### 2. Recommendation records

- Test and render Dashboard ready/insufficient states, today and weekly KPIs,
  restaurant counts, top restaurants, categories, and real recent activity.
- Test and render same-day current/superseded batches, weather unavailable,
  multi-restaurant decisions, complete stored snapshots, accessible inline
  disclosure, cursor append, retry, and end-of-list states.

### 3. Settings and members

- Mirror Server validation before writes and keep unrelated dirty drafts after
  a section save.
- Render member mode as read-only and Admin mode with profile, reminder,
  weights, role/status, restore/remove, and invite-rotation controls.
- Disable the only active Admin's destructive role/status controls while
  retaining Server `last_admin` handling.
- Sync auth state after current-member or group-name changes. Never persist or
  log rotated invite plaintext.

### 4. Integration and verification

- Capture group context per request and ignore stale responses after route or
  group changes.
- Add responsive styles and browser-check desktop, narrow-screen, keyboard,
  Admin, member, batch expansion, section saving, member mutation, and invite
  rotation behavior when an executable fixture is available.
- Run Admin tests/typecheck/build, then full monorepo tests/typecheck/build.
- Record QA results and mark 5B Done only after all required automated checks
  pass. Leave Extension reminder/history work in Stage 5C.

## Completion

- Added the Stage 5 Admin clients, `#dashboard` / `#settings` routes, four-link
  navigation, pure Dashboard/settings models, recommendation-record page,
  settings/member/invite page, and responsive styling without changing the
  Stage 5A contracts.
- Grew the Admin suite from 58 to 75 tests. Admin test, typecheck, and build
  pass; the final monorepo suite passes 478 tests plus full typecheck/build.
- Completed real browser QA against the configured development database for
  Admin/member roles, section saving, validation, invite rotation, same-day
  current/superseded batches, inline snapshots, and the 390px layout.
- Detailed evidence and remaining manual-only cases are recorded in
  [`qa/2026-07-14-admin-dashboard-settings-stage5b.md`](../qa/2026-07-14-admin-dashboard-settings-stage5b.md).
