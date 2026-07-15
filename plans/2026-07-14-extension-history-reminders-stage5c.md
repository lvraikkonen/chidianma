# Stage 5C Extension Personal History And Reminder Runtime Implementation Plan

Status: `Done`

Date: 2026-07-14

## Goal And Boundary

Connect the Chrome Extension to the verified Stage 5A group settings and
personal-history APIs, then make group reminder defaults, device-local
overrides, and the conditional second reminder reliable under Manifest V3
service-worker suspension.

- Continue on `stage5-dashboard-settings-weights` from completed Stage 5B.
- Modify only Extension code and Stage 5 documentation.
- Reuse existing shared settings, personal-history, recommendation, and
  participation contracts without changing Shared, Server, Prisma, or Admin.
- Add history as section 04 of the existing options page. Do not add another
  HTML entry, router, framework, dependency, or Chrome permission.
- Keep popup/detail focused on today's decision and preserve Stage 1-4 group,
  recommendation, participation, decision, feedback, and cache behavior.
- Do not cache personal history or add polling/push.
- Use Red -> Green -> Refactor for every behavior slice.

Planning baseline: 175 Extension tests and 478 monorepo tests pass; Extension
typecheck and production build pass.

Completion baseline: 259 Extension tests and 562 monorepo tests pass; all
workspace typechecks and production builds pass. Chrome Developer Mode QA is
recorded in
[`qa/2026-07-15-extension-history-reminders-stage5c.md`](../qa/2026-07-15-extension-history-reminders-stage5c.md).

## Public Extension Interfaces And Persisted State

Requests capture one immutable group context:

```ts
interface ExtensionGroupContext {
  apiBaseUrl: string;
  groupId: string;
  membershipId: string;
  groupSessionToken: string;
}
```

The Extension client exposes:

- `getGroupSettingsForContext(context)`
- `getPersonalHistoryForContext(context)`
- `getTodayParticipationForContext(context)`

All responses must match the captured `groupId`; personal history must also
match `membershipId`. These reads use the group bearer token and never another
group, the read token, or recommendation cache fallback.

Extend Extension storage additively:

```ts
interface GroupSettingsCacheEntry {
  response: GroupSettingsResponse;
  cachedAt: string; // ISO UTC
}

interface LocalReminderOverride {
  reminderTime?: string;
  enabled?: boolean; // read-only compatibility for old installs
  weekdayReminderEnabled?: boolean;
  secondReminderEnabled?: boolean;
}

type ScheduledPrimaryReminder =
  | { revision: number; mode: "legacy"; scheduledFor: number }
  | {
      revision: number;
      mode: "group";
      groupId: string;
      scheduledFor: number;
    };

interface PendingSecondReminder {
  revision: number;
  groupId: string;
  officeDate: string;
  scheduledFor: number;
}
```

`ExtensionStorageShape` adds `groupSettingsCacheByGroupId`,
`reminderRevision` (default `0`), `scheduledPrimaryReminder`, and
`pendingSecondReminder`. Old override reads resolve weekday enablement as
`weekdayReminderEnabled -> enabled -> group default`; canonical writes store
the three current override fields and remove legacy `enabled`.

Every override, cache, revision, and alarm-context change stays inside the
existing Web Lock. Explicit group mutations re-read storage under the lock and
reject a stale active-group target. No unsafe read-modify-write fallback is
added.

## TDD Tasks

### 1. Source Of Truth, Planning Commit, And Baseline

- Update the Stage 5 spec, this plan, and Roadmap before runtime code.
- Commit those source-of-truth documents separately, record the implementation
  starting commit, and require a clean worktree.
- Run Extension tests/typecheck/build and the monorepo test baseline. Treat any
  difference from 175 and 478 tests as pre-existing until proven otherwise.

### 2. Clients, Storage Migration, And Reminder Policy

- First test exact routes, bearer token, captured host/group/membership,
  non-2xx propagation, and response mismatch rejection; then implement the
  three context-based reads using shared types.
- First test additive storage migration, validated settings cache writes,
  legacy override reads, canonical writes, explicit group targeting,
  restore-default deletion, revision changes, and atomic primary/second
  context claim; then implement the storage helpers.
- Validate cached settings used for scheduling: response group, strict
  `HH:mm`, booleans, non-empty notification title, and valid IANA timezone.
  Corrupt or malformed cache data is unschedulable.
- Resolve effective reminders as follows:
  - Active group plus valid cache: merge group defaults with an explicit local
    override.
  - Active group without valid cache: schedule nothing, even if a local time
    override exists, because the office timezone is unknown.
  - No active group: retain the true legacy Shanghai primary reminder and
    never enable a second reminder.
- A newly joined group starts in follow-default mode without materializing a
  local override. Group-managed office timezone, title, and label remain
  read-only.
- Compare an effective reminder fingerprint containing group/mode, office
  timezone, time, weekday/second switches, title, and label. Relevant changes
  increment `reminderRevision` and clear stale alarm contexts; unrelated group
  profile, weights, invite metadata, or `cachedAt` changes do not.
- Group sync removes settings caches for inaccessible groups. Identity/API host
  replacement clears group caches and alarm contexts. Tokens, notification
  copy, and history never enter alarm records or logs.

### 3. Strict Office Calendar Scheduling

- Replace lenient reminder parsing with strict
  `^(?:[01]\\d|2[0-3]):[0-5]\\d$`; invalid values and IANA timezones are
  unschedulable and never clamp or silently fall back.
- Keep Monday-through-Friday calculation independent of browser local time.
  `weekdayReminderEnabled=false` means no primary reminder, not weekend
  scheduling.
- Lock DST behavior with tests: nonexistent local wall times advance to the
  first valid instant after the gap; repeated wall times use the first
  occurrence.
- Cover Shanghai, Los Angeles spring/fall DST, weekend rollover, same-day next
  time, month/year boundaries, disabled settings, and the fixed 20-minute
  follow-up.

### 4. Persisted Primary And Second Reminder Runtime

- Extract pure policy and dependency-injected orchestration into reminder
  modules. Keep `background.ts` as thin Chrome listener wiring; tests must not
  import it.
- Use stable primary and second alarm names backed by persisted contexts.
  Alarm creation stores context under the lock, creates the Chrome alarm, then
  revalidates storage and clears the alarm if a concurrent change made it
  stale.
- Alarm handlers atomically claim the matching context before side effects.
  Duplicate delivery finds no context and is a no-op.
- Startup restores future contexts only when revision/group still match.
  Missing future alarms are recreated; expired contexts are cleared and the
  next primary is calculated without backfilling a notification.
- A primary alarm:
  - Claims the scheduled context and revalidates host/group/session/revision.
  - Refreshes group settings when possible. A changed fingerprint or disabled
    reminder suppresses the old primary and reschedules from the new state.
  - May use an already validated settings cache after an ordinary network/5xx
    failure, but not after auth/removed failure and not when no cache exists.
  - May retain existing recommendation cache fallback for a calm primary.
  - Revalidates context immediately before notification creation.
  - Uses group title and optional label for group mode and the existing
    headline for true legacy mode.
  - Always computes the next primary from current state in a final path.
- Persist a second reminder exactly 20 minutes after successful primary
  notification creation only when settings were freshly synchronized, the
  recommendation is a fresh group response, second reminder is enabled, and
  group/date/session/revision still match.
- A second alarm atomically consumes pending context and performs a
  network-only participation read. Notify only when `decidedCount === 0` and
  response group/date still match. Any decision, multiple restaurants,
  401/403, removed membership, network failure, malformed response, stale
  context, settings change, group switch, or duplicate delivery stays quiet.
- Group/identity/API-host changes clear both alarm contexts and old visible
  notification IDs. Clicking either notification retains popup-first with the
  existing detail-tab fallback.

### 5. Options Resource Model And Session Recovery

- Refactor options ready state to hold independent settings and history
  resources with `idle | loading | ready | error` status. Load the group shell
  first, then start both resources in parallel.
- Add a monotonically increasing generation. A successful group switch clears
  old resources immediately before loading the new group. Old responses may
  not render, cache, save an override, send an alarm message, or retry into the
  new group.
- Coalesce concurrent resource 401s through one single-flight session refresh
  per generation/group. Successful refresh rebuilds the captured context and
  retries each failed resource once.
- If refresh itself returns 401, clear the unusable group session, stop its
  reminders, preserve local preferences, and show the existing connection-
  expired guidance. Removed/active-membership 403 clears the session and
  synchronizes group summaries. Ordinary network failures stay local to the
  affected resource.
- A successful live settings response updates the cache. If its reminder
  fingerprint changed, send exactly one reminder-context-changed message.
- Keep mutation actions exclusive, but give settings/history retry independent
  pending state so one resource does not disable unrelated controls.

### 6. Reminder And Personal History UI

- First test a pure reminder form model: follow-default, custom mode initialized
  from effective values, strict time validation, independent weekday/second
  switches, captured-group save, restore default, and late-save rejection.
- Update section 03 to show group default time, switches, office timezone,
  title, and optional label. Make “跟随小组默认”, “本机自定义”, and “恢复小组默认”
  explicit. Restoring deletes the override instead of copying defaults.
- Explain that the second reminder runs 20 minutes after a successful primary
  only if nobody has decided and that network/session failures remain quiet.
  A local save updates only draft/storage and must not reload history.
- Render section 04 “我的午饭记录” with the server window, independent
  loading/error/retry, truthful empty state, insufficient union, optional
  average price, server percentages as CSS bars, and a compact date list.
- Preserve server order. The current membership has at most one decided item
  per office date. Render optional dish, cuisine, price, and decided time only
  when present. Describe `coDinerCount` as other teammates who also completed a
  decision that day, never as same restaurant/table evidence.
- Do not paginate, cache history, infer a winner, or recalculate preferences.
  Keep desktop and approximately 390px layouts free of horizontal overflow and
  maintain keyboard/focus semantics.

### 7. Regression, Chrome QA, And Handoff

- Run:
  - `pnpm --filter @lunch/extension test`
  - `pnpm --filter @lunch/extension typecheck`
  - `pnpm --filter @lunch/extension build`
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm build`
- Confirm the built manifest adds no permission and retains only existing
  alarms, notifications, storage, and specific API host access.
- Load `apps/extension/dist` unpacked in Chrome Developer Mode. Verify follow
  default, local override, restore, ready/insufficient/empty history, 390px,
  keyboard behavior, group switch, primary reminder, both second-reminder
  outcomes, offline/session suppression, and service-worker suspension.
- Write `qa/2026-07-14-extension-history-reminders-stage5c.md` with final test
  counts, Chrome version and scenarios, untested items, and known issues.
- Only after automated gates and Chrome QA pass, mark this plan and Roadmap 5C
  `Done`, mark Stage 5 implemented and verified, and make Stage 6 ready for
  detailed planning. Do not start Stage 6 implementation here.

## Required Test Scenarios

- Group A responses, cache writes, saves, alarms, and retries cannot affect B
  after a switch.
- Mismatched host, group, membership, office date, revision, or malformed
  settings perform no storage or notification side effect.
- Group default changes update follow-mode scheduling; explicit local override
  remains until restore. Existing legacy `enabled` data remains readable.
- Active group without valid group settings remains quiet; only no-group legacy
  mode uses Shanghai defaults.
- Primary settings/recommendation cache fallback never arms the second alarm.
  A fully fresh successful primary arms exactly one follow-up for 20 minutes.
- Live participation with zero decisions notifies once; one or more decisions
  stays quiet regardless of restaurant distribution.
- Worker suspension preserves valid future contexts without making process
  globals authoritative. Duplicate, stale, corrupt, switched, disabled,
  disconnected, and expired contexts are no-ops.
- Personal history renders ready, insufficient, empty, missing optional fields,
  `未分类`, one own decision per date, correct co-decider wording, and cross-
  group isolation.
- Stage 1-4 popup, detail, quick-add, participation, decision, feedback,
  create/join/switch, and recommendation-cache tests remain green.

## Assumptions

- Stage 5A API shapes and authorization behavior remain unchanged.
- Group reminders are Monday-through-Friday in office timezone. Active groups
  without valid settings prefer silence over a guessed timezone.
- Second-reminder delay is fixed at 20 minutes and is not a device setting.
- One active Extension group means one persisted primary and second context is
  sufficient.
- Normal Extension lifecycle events synchronize group defaults; Stage 5C adds
  no polling or push channel.
- History display fields continue to reflect current linked restaurant and
  recommendation records. `coDinerCount` counts other decided memberships on
  that office date regardless of restaurant.
- Railway release and final cross-product deployment smoke testing remain
  Stage 6.
