# Stage 4 Prototype UI Wiring Design

Status: `Review Requested`

Date: 2026-07-10

Source documents:

- `roadmap.md`, Stage 4: Prototype UI Wiring.
- `specs/2026-07-08-multi-group-prototype-implementation-design.md`.
- `plans/2026-07-09-today-recommendation-batch-participation-stage3.md` and the completed Stage 3 implementation.
- `demo-design/` Open Designer extension and admin prototypes.

## Overview

Stage 4 connects the Open Designer extension and admin prototype surfaces to
the real Stage 1-3 multi-group APIs. It is a UI wiring and state-hardening
stage, not a new backend feature stage.

The roadmap keeps Stage 4 as one milestone, but implementation is split into
two independently reviewable vertical slices:

1. Stage 4A: Extension Prototype UI Wiring.
2. Stage 4B: Admin Prototype UI Wiring.

Both slices must finish before Stage 4 is marked `Done`.

## Goals

- Replace the extension's minimal Stage 3 UI with real prototype-aligned
  popup, detail, quick-add, and settings experiences.
- Replace the admin's legacy single-team form with real multi-group login,
  group selection, today recommendation, and restaurant library pages.
- Remove static demo data from production surfaces.
- Make loading, empty, error, cached, session-expired, and permission states
  explicit and testable.
- Keep group switching safe: a response, session, or cache from one group must
  never appear in another group's UI.
- Preserve the warm, compact Open Designer visual language without shipping
  prototype review aids.

## Non-Goals

- No recommendation history or batch review UI.
- No dashboard, statistics, member management, group settings, reminder
  defaults, or scoring weight editing in Admin.
- No extension history view.
- No new database models, migrations, server routes, or lunch-loop semantics.
- No server-side hosting of the Admin production build.
- No new extension framework, Admin router, or global state-management
  dependency.
- No cross-application UI component package.
- No formal accounts, email login, passwords, OAuth, maps, delivery, payments,
  or public restaurant discovery.

History, dashboard, member management, group settings, and weight tuning remain
Stage 5 work. Production hosting and final deploy hardening remain Stage 6 work.

## Confirmed Design Decisions

- Use a contract/client-first vertical-slice approach.
- Keep one Stage 4 design and create two implementation plans, 4A and 4B.
- Give extension users a product-facing identity/create/join/switch flow; do
  not expose raw identity or group session token fields.
- Include extension quick-add for a restaurant plus its first recommendation.
- Defer extension history to Stage 5.
- Limit Stage 4 Admin to login/group entry, today recommendations, and the
  restaurant library.
- Do not expose clickable placeholder pages for Stage 5 features.
- Reuse Stage 1-3 APIs and contracts. Add a shared route builder, export, or
  UI-neutral type only if implementation proves it is missing; do not change
  a response shape merely to reproduce static prototype copy.
- Keep the extension in native DOM and Admin in React.

## Architecture

### Shared and server boundary

Stage 4 consumes the existing `@lunch/shared` group contracts and the existing
Stage 1-3 API routes. The server remains the source of truth for identities,
memberships, roles, groups, restaurants, recommendations, current batches,
participation, decisions, feedback, and permissions.

Stage 4 does not add server behavior. In particular:

- `GET /api/groups/:groupId/today-recommendations` remains read-only.
- `POST /api/groups/:groupId/today-recommendations/refresh` remains the only UI
  path that creates a new current batch.
- The UI derives its recommendation strategy explanation from the returned
  weather, reasons, and item-level `scoreBreakdown`; it does not invent or
  display an algorithm version or weights that the response does not contain.
- Extension and Admin clients use `ApiErrorResponse` and the server's stable
  `error` codes for state classification.

If implementation finds a missing `GROUP_ROUTES` member, barrel export, or
request/response type for an already-existing endpoint, it may add that
UI-neutral contract with shared tests. Such a change must not create a new
server semantic.

### Stage 4A module boundaries

The extension remains a Manifest V3 application implemented with native DOM
APIs.

- A group client owns identity creation, group creation/joining/listing,
  session refresh, restaurant creation/listing, and recommendation creation.
- The existing recommendation client continues to own current-batch reads,
  refresh, participation, decision, feedback, and current-group cache fallback.
- Pure controllers or view-model builders own state transitions and derived
  display data. DOM entrypoints own element lookup, rendering, and event
  binding only.
- `chrome.storage` remains the source of extension UI state. Every partial
  `lunchState` write continues through `updateStorageState` under the existing
  `lunch-extension-storage-state` Web Locks exclusive lock.
- The popup and standalone detail page may share pure recommendation-card and
  score-breakdown view models without sharing live DOM nodes.

### Stage 4B module boundaries

Admin remains a React + Vite application.

- A session store owns the local identity token, display name, active group,
  group summaries, and sessions bucketed by `groupId`.
- Feature clients own identity/group, today/participation, and restaurant/
  recommendation calls.
- A small hash router supports `#login`, `#today`, and `#restaurants`. It does
  not add a routing dependency and remains compatible with Stage 6 static
  hosting.
- React code is split into app shell, auth/group entry, today, restaurant
  library, and local reusable presentation components.
- Visual components such as button, chip, panel, table, modal, form field, and
  status badge live inside Admin. They are not shared with the native-DOM
  extension.

### Common data flow

Both applications follow the same directional flow:

```text
user action
  -> controller / React hook
  -> typed feature client
  -> Stage 1-3 API
  -> local session or UI state
  -> render
```

Group switching is commit-after-success:

1. Capture the requested group ID and identity token.
2. Request a fresh session for that group.
3. Store the returned session and group summary.
4. Set `activeGroupId` only after the session succeeds.
5. Clear the previous page's view data and load the new group.

A failed switch leaves the previously active group unchanged.

## Stage 4A: Extension Experience

### Product-facing connection and settings

The options page stops asking users to paste `identityToken`, `groupId`, or
`groupSessionToken`.

The disconnected experience asks for a display name. The connection controller
first creates a lightweight identity through `POST /api/identities`, stores its
identity token, and then offers two actions:

- Create a group with group name and optional subtitle.
- Join a group with an invite code.

The create and join endpoints receive the saved identity token and return a
refreshed identity token, group session, and group summary. The extension stores
them through the locked storage mutation helper and makes the returned group
active. If group creation or joining fails, the already-created identity remains
available for retry. Group creation also displays the one-time invite code.
Copy support must not require a new manifest permission; the code remains
selectable if clipboard access fails.

The connected experience:

- Loads active memberships from `GET /api/groups`.
- Shows the current group and all joined groups.
- Requests a fresh group session before switching.
- Supports creating or joining another group without replacing the current
  identity.
- Stores a local `identityDisplayName` for UI copy; authorization continues to
  rely only on signed server tokens and current database membership.
- Writes reminder time and enabled state to the current group's local reminder
  override.
- Keeps the API base URL in an advanced connection section.

Changing the API host disconnects the old service. On confirmed host change,
the extension clears identity, active group, group sessions, group summaries,
group caches, and group reminder overrides from the previous host. Global
reminder defaults remain. This prevents old tokens, IDs, and cached restaurant
data from being sent to or displayed for a different server.

### Popup states

The popup has explicit states rather than a single generic message area.

| State | Trigger | UI behavior |
| --- | --- | --- |
| Disconnected | No identity, active group, or usable group session | Explain how to connect and open settings. |
| Loading | Initial current-group request | Show calm skeletons or loading placeholders. |
| No current batch | 404 with `no_current_batch` | Show a generate button that calls `POST /refresh`. |
| Ready | Fresh current-group response | Show group, date, weather, participation, and 2-3 recommendation cards. |
| Cached | Eligible network/5xx failure plus matching active-group cache | Mark cache and generation time, allow retry, and make writes read-only. |
| Empty | Successful current batch with no recommendation items | Explain that the group needs restaurants and open quick-add. |
| Session expired | Group API 401 | Prompt reconnection for the current group. |
| Forbidden or removed | Membership-level 403 | Explain loss of access and offer group switching. |
| Network error | Eligible failure with no matching cache | Offer retry and settings without showing another group's data. |

The popup loads both current recommendations and today's participation. It
matches the active `GroupSummary.membershipId` against participation members to
derive the current user's state. Participation updates return the new member
record and summary; the popup renders those values immediately instead of
waiting for a full page reload.

Recommendation cards show only real response data: restaurant, dish, distance,
price, dining mode, tags, reason, and participation context. No hardcoded
weather, teammate count, price, or name may survive from the prototype.

### Popup detail and standalone detail

Selecting a recommendation opens the popup's detail state. It shows:

- Restaurant and dish metadata.
- Complete available recommendation reason.
- Item-level score and score breakdown.
- Existing restaurant recommendations when the restaurant list has been loaded.
- Want, skip, ate, and avoid feedback actions.
- The decision action.

The Stage 3 today response does not provide reliable recommender names for each
detail quote. The UI may label returned recommendation reasons as “同事推荐”,
but it must not invent names. It may load the active group's restaurant list on
demand and match by restaurant ID to show additional real recommendations.

`detail.html` remains the notification-click fallback. With a selected
restaurant parameter it focuses that recommendation; without one it renders
the day's 2-3 recommendations in expanded form. It uses the same group/session,
cache, auth, and error rules as the popup.

### Quick-add

The popup includes a focused form for creating a restaurant and its first
recommendation. The form maps only to existing Stage 2 request fields.

Submission is intentionally two-step:

1. Create the restaurant.
2. Create the first recommendation using the returned restaurant ID.

The controller tracks the returned restaurant ID. If step 2 fails, the UI says
that the restaurant was saved but the recommendation was not, preserves the
recommendation fields, and retries only step 2. It must not create a duplicate
restaurant on retry.

Extension quick-add does not expose restaurant status governance. All active
members can contribute; server permissions remain authoritative.

### Cache behavior

Cache fallback remains restricted to
`lastRecommendationsByGroupId[activeGroupId]`, including the existing stored
response `groupId` validation.

Cached recommendations are read-only. Participation, decision, and feedback
controls are disabled with an offline explanation until a fresh response is
obtained. Retry and settings remain available.

## Stage 4B: Admin Experience

### Login and group entry

Admin removes the legacy `/api/session` login flow and uses the multi-group
identity and group APIs.

First-time users enter a display name and create a lightweight identity before
creating or joining a group. Returning users with an identity token load
`GET /api/groups` and select from active memberships. Users may create or join
additional groups while retaining their identity. A failed group create or join
does not discard the new identity and can be retried.

Creating a group displays the one-time invite code. Selecting a group obtains
a fresh group session before entering the app shell. Admin also provides an
explicit change-identity/disconnect action that clears local authentication
state without mutating server data.

### App shell and routing

The production navigation contains only:

- 今日推荐
- 餐厅库

Dashboard, history, members, and settings are not clickable placeholders.
The top-level group switcher is available throughout the authenticated shell.
Hash routing uses `#login`, `#today`, and `#restaurants` so a production refresh
does not depend on server-side SPA fallback behavior.

### Today recommendations

The today page loads the current batch and participation for the captured
active-group context.

- `no_current_batch` is a first-use state with a generate action, not a generic
  error.
- A current batch shows weather, batch number, generation time, real reasons,
  total scores, and every `scoreBreakdown` component.
- The recommendation strategy panel summarizes only signals present in the
  returned weather, reasons, and breakdown.
- Participation members are grouped into joining, decided, away, and
  undecided states using the real participation response.
- Refresh explains that it creates a new batch, disables duplicate submission,
  and replaces the current view only after success.
- A successful empty result links to the restaurant library.

Any active member may generate or refresh according to the Stage 3 API. Stage 4
does not add an Admin-only restriction that the server does not have.

### Restaurant library

The restaurant page loads only the current group's restaurant response and
performs small-team filtering locally.

Supported filters:

- Restaurant name, cuisine, and area search.
- Cuisine selection.
- Active, paused, and blocked status.

The page supports:

- Creating a restaurant with its first recommendation.
- Editing restaurant information.
- Adding another recommendation.
- Editing a recommendation when the current membership owns it or has the
  admin role.
- Pausing, restoring, or blocking a restaurant when the current membership is
  an admin.

Before creation, the client compares normalized name plus area against the
loaded group list. A possible duplicate produces a confirmation warning but
does not block creation, preserving the approved same-name chain-store rule.

The combined create flow uses the same two-step and partial-success behavior as
extension quick-add. A failed first-recommendation request must not retry the
restaurant creation.

Members can edit permitted content and see restaurant status, but status
governance controls are hidden unless `GroupSummary.role === "admin"`.
Recommendation edit controls compare `createdByMembershipId` with the active
summary's `membershipId`; admins may edit all recommendations in the group.
These UI rules improve clarity but never replace server authorization.

Admin restaurant `blocked` status remains distinct from member feedback type
`avoid`.

### Group switch race safety

Every page request captures its group ID and session at request start. Admin
uses an `AbortController` or monotonic request generation so that a slow Group A
response cannot commit after Group B becomes active.

On a successful group switch, current page data is cleared before the new load.
On a failed switch, Group A remains active and its view is retained with an
inline switch error.

## Visual and Interaction Rules

The production UI reuses the prototype's:

- Warm paper-like neutral background.
- Warm orange primary action color.
- Rain, hot-food, want, ate, and avoid semantic colors.
- Compact, scannable cards and tables.
- Chips, segmented filters, switches, panels, forms, modals, and inline SVG
  icon language.

The production UI removes:

- The faux Chrome toolbar.
- Prototype overview and state navigation.
- Static restaurant, member, date, time, weather, batch, and metric values.
- Review-only `data-od-*` attributes.
- Stage 5 placeholder pages and links.

All asynchronous actions have pending, success, and retryable failure states.
Pending actions prevent duplicate submission. Form errors appear next to the
relevant field. Modals provide a close control, Escape behavior, and basic
focus management. Status messages use `aria-live`, and controls remain keyboard
usable.

The extension continues to render server data through `textContent` and DOM
node APIs. Neither application renders untrusted server strings as HTML.

Tokens are never rendered in normal UI, written to logs, or included in error
copy.

## Error Handling

Feature clients expose a structured error containing HTTP status, server error
code, and safe message data. UI state mapping follows these rules:

| Failure | UI handling |
| --- | --- |
| 400 validation | Map known error codes to field or business validation copy. |
| 401 identity token | Return to identity connection and preserve only non-auth settings. |
| 401 group session | Clear that group's unusable session and prompt session refresh/reconnection. |
| 403 membership invalid/removed | Exit the current group and return to group selection. |
| 403 operation permission | Keep the session and show an inline permission error. |
| 404 `no_current_batch` | Show the explicit generate state. |
| Extension network/5xx | Use only matching current-group cache; otherwise show retry. |
| Admin network/5xx | Keep the last successful same-group view with a refresh-failed marker. |
| Unknown | Show stable Chinese fallback copy and keep diagnostic detail development-only. |

An Admin refresh failure may preserve the last successful view for the same
group. A group switch never preserves the previous group's page data.

Quick-add and combined Admin create flows have a specific partial-success state
because restaurant and recommendation creation are separate existing APIs.

## Testing Strategy

### Stage 4A automated coverage

- Identity creation, group creation/join/list, session refresh, and group switch
  client behavior.
- Active group changes only after session refresh succeeds.
- Locked storage updates preserve identity, sessions, group summaries,
  reminders, and caches under controlled interleaving.
- Popup controller/view-model transitions for every documented state.
- Active membership participation selection and returned-summary updates.
- 401, 403, `no_current_batch`, network, 5xx, and cache classification.
- Cached views disable writes and fresh responses restore them.
- Quick-add full success, first-step failure, partial success, and
  recommendation-only retry.
- Existing notification, alarm, legacy compatibility, action, and grouped cache
  regression tests.
- Extension typecheck, tests, production build, and emitted manifest checks.

Extension tests must continue to avoid importing side-effectful
`background.ts`.

### Stage 4B automated coverage

- Admin session persistence, restore, group switch, disconnect, and invalid
  session clearing.
- Correct identity-token and group-session authorization headers.
- Login, create, join, group-list, and group-selection state transitions.
- Stale Group A responses cannot overwrite active Group B state.
- Today no-batch, ready, refresh, empty, and participation grouping view models.
- Restaurant search, filtering, duplicate warning, permission derivation, and
  two-step create controller behavior.
- Member versus admin status controls and recommendation ownership rules.
- Membership-level 401/403 recovery versus operation-level 403 inline errors.
- Admin typecheck, tests, and production build.

Pure controllers, reducers, view models, and client boundaries provide the
primary automated UI coverage. Stage 4 does not add a large UI testing
framework solely for DOM snapshots.

### Manual validation

Manual validation uses a real local server and database with at least:

- Two identities.
- Two groups.
- Admin and member roles.
- A group with no current batch.
- A group with a current batch.
- A group with an empty restaurant library.
- A removed membership.

Validation covers group isolation, no-batch generation, refresh, participation,
decision, feedback, quick-add, restaurant maintenance, cache fallback, session
expiry, removed membership, and role-specific controls.

Load `apps/extension/dist` in Chrome Developer Mode and validate popup, popup
detail, standalone detail, settings, notification fallback, and manifest
permissions. Validate Admin login, today, and restaurant pages at desktop and
narrow widths. Compare both applications with `demo-design/` and record results
in `qa/`.

### Required commands

```bash
pnpm --filter @lunch/extension test
pnpm --filter @lunch/extension typecheck
pnpm --filter @lunch/extension build
pnpm --filter @lunch/admin test
pnpm --filter @lunch/admin typecheck
pnpm --filter @lunch/admin build
pnpm test
pnpm typecheck
pnpm build
```

If implementation changes `packages/shared`, run its focused tests before the
affected application tests. If Stage 4 leaves server behavior untouched, the
root regression commands are sufficient server verification; any server change
requires focused server tests in addition.

## Acceptance Criteria

Stage 4A is complete when:

- A user can create or join a group without manually handling tokens.
- A returning identity can list and switch groups safely.
- Popup, popup detail, standalone detail, quick-add, and settings match the
  production portions of the prototype and contain no static demo data.
- Popup can generate a missing batch, display fresh or matching cached results,
  update participation, decide, and submit all four feedback types.
- Cached data is visibly marked, current-group-only, and read-only.
- Session-expired, removed-member, empty, loading, and failure states are
  explicit.
- Extension tests, typecheck, build, and manifest verification pass.

Stage 4B is complete when:

- Admin uses only multi-group identity and group-session APIs.
- Users can create, join, list, and switch groups.
- Today and restaurant pages reload entirely from the active group and cannot
  be overwritten by stale previous-group responses.
- Today shows real batch, weather, scores, breakdown, participation, refresh,
  no-batch, and empty states.
- Restaurant library supports real filtering, creation, editing,
  recommendations, duplicate warning, and role-aware status governance.
- Loading, error, session-expired, removed-member, and permission states are
  explicit.
- Admin tests, typecheck, and production build pass.

Stage 4 is complete only when both Stage 4A and Stage 4B are implemented,
verified, documented in `qa/`, and handed off. `roadmap.md` must link both plans
while keeping Stage 4 as one milestone.

## Implementation Plan Boundaries

After this design is approved, write two plans:

- `plans/2026-07-10-extension-prototype-ui-wiring-stage4a.md`
- `plans/2026-07-10-admin-prototype-ui-wiring-stage4b.md`

The Stage 4A plan owns extension-local shared-contract fixes if any are needed
first. The Stage 4B plan consumes the approved Stage 1-3 contracts and any
UI-neutral shared correction made by 4A. Each plan ends with its own automated
verification and manual-validation checklist; the final 4B integration task
performs the complete Stage 4 regression and roadmap handoff.
