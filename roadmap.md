# 中午吃点啥 Roadmap

This roadmap tracks the staged path from the current MVP to the multi-group,
prototype-aligned product described in
[`specs/2026-07-08-multi-group-prototype-implementation-design.md`](specs/2026-07-08-multi-group-prototype-implementation-design.md).

## Roadmap Principle

Stage 1 to Stage 3 make the product real and usable: multi-group data,
permissions, restaurant knowledge, daily recommendations, participation, and
feedback.

Stage 4 to Stage 5 make the product feel like the Open Designer prototype:
extension pages, admin pages, dashboard, settings, history, and polished real
states.

Stage 6 hardens the whole product for deployment, migration confidence, and
extension smoke testing.

## Status Legend

- `Planned`: Detailed implementation plan exists.
- `Approved for Execution`: Detailed plan has passed review and can be implemented.
- `Ready for Planning`: Previous stage should finish before writing the detailed plan.
- `Not Started`: Later stage, intentionally not planned in detail yet.
- `In Progress`: Implementation has started.
- `Done`: Implemented, tested, and handed off.

## Stage Overview

| Stage | Name | Status | Detailed Plan | Primary Outcome |
| --- | --- | --- | --- | --- |
| Stage 1 | Multi-Group Foundation | Done | [`plans/2026-07-08-multi-group-foundation-stage1.md`](plans/2026-07-08-multi-group-foundation-stage1.md) | Identity, groups, memberships, sessions, invites, permissions, migration foundation |
| Stage 2 | Group-Scoped Restaurant Knowledge | Done | [`plans/2026-07-09-group-scoped-restaurant-knowledge-stage2.md`](plans/2026-07-09-group-scoped-restaurant-knowledge-stage2.md) | Each group can maintain its own isolated restaurant and recommendation knowledge base |
| Stage 3 | Today Recommendation Batch + Participation | Done | [`plans/2026-07-09-today-recommendation-batch-participation-stage3.md`](plans/2026-07-09-today-recommendation-batch-participation-stage3.md) | Core lunch loop plus minimal extension auth/storage/API client |
| Stage 4 | Prototype UI Wiring | Done | [Stage 4A Extension](plans/2026-07-10-extension-prototype-ui-wiring-stage4a.md)<br>[Stage 4B Admin](plans/2026-07-10-admin-prototype-ui-wiring-stage4b.md) | Extension and admin prototype screens connect to real Stage 1-3 APIs |
| Stage 5 | Dashboard / Settings / Weights | Done | [Stage 5A Shared + Server](plans/2026-07-14-dashboard-settings-weights-stage5a.md)<br>[Stage 5B Admin](plans/2026-07-14-admin-dashboard-settings-stage5b.md)<br>[Stage 5C Extension](plans/2026-07-14-extension-history-reminders-stage5c.md) | Historical review, dashboard metrics, member contribution, reminders, weights |
| Stage 6 | Deploy Hardening | Ready for Planning | Write after Stage 5 | Production hosting, migration verification, extension smoke test, Railway checks |

## Planning Cadence

The recommended flow is sequential:

1. Implement Stage 1 from its existing plan.
2. Review Stage 1 results, tests, schema changes, and any product adjustments.
3. Write the detailed Stage 2 plan.
4. Implement Stage 2.
5. Repeat the same plan-then-build cycle for Stage 3, Stage 4, Stage 5, and Stage 6.

This keeps later plans honest. Stage 2 and Stage 3 depend on the actual schema,
auth middleware, token contracts, migration choices, and safety checks produced
by Stage 1. Stage 4 depends on the real API shapes produced by Stage 1-3.

Stage 3 must include the minimum extension-side group session plumbing needed
to prove the real lunch loop works: `identityToken`, `sessionsByGroupId`,
`activeGroupId`, group-session API calls, and cache fallback by active group.
Stage 4 is where the extension/admin screens are fully rebuilt in the Open
Designer visual style with complete loading, empty, error, cache, and
permission-state polish.

## Stage 1: Multi-Group Foundation

**Status:** Done per Stage 1 implementation handoff.

**Detailed plan:** [`plans/2026-07-08-multi-group-foundation-stage1.md`](plans/2026-07-08-multi-group-foundation-stage1.md)

**Goal:** Build the multi-group data and auth foundation while keeping the
existing MVP legacy routes working.

**In scope:**

- Multi-group data foundation.
- `identity`, `group`, `membership`, and `role`.
- Signed `identityToken` and `groupSessionToken`.
- Group creation and invite-based joining.
- Removed member behavior, last-admin invariant, and permission boundaries.
- Default group migration and seed path for existing MVP data.
- Legacy MVP routes remain usable during the transition.

**Out of scope:**

- Restaurant library UI rebuild.
- New recommendation batch logic.
- Participation, decision, and feedback workflow rebuild.
- Open Designer UI wiring.

**Exit criteria:**

- Existing MVP behavior still runs through the compatibility path.
- The same identity can create or join multiple groups and list them through
  `GET /api/groups`.
- New group/session APIs are covered by tests.
- Removed member, stale role token, non-admin patch, and last-admin safety cases
  are tested with explicit HTTP status codes.
- Database migration path backfills or preserves the default group correctly
  before enforcing non-null group foreign keys.

## Stage 2: Group-Scoped Restaurant Knowledge

**Status:** Done per Stage 2 implementation handoff.

**Detailed plan:** [`plans/2026-07-09-group-scoped-restaurant-knowledge-stage2.md`](plans/2026-07-09-group-scoped-restaurant-knowledge-stage2.md)

**Goal:** Make each lunch group own an isolated restaurant and recommendation
knowledge base.

**Expected scope:**

- Group-scoped restaurant CRUD.
- Group-scoped recommendation CRUD.
- Member/admin editing permissions.
- Member "avoid" feedback semantics, distinct from admin-only restaurant
  `blocked` status.
- Cross-group ID spoofing protection tests.
- Initial real admin restaurant-library APIs.

**Exit target:** Every group can safely maintain its own restaurant knowledge
without leaking or mutating another group's data.

## Stage 3: Today Recommendation Batch + Participation

**Status:** Done per Stage 3 implementation handoff.

**Detailed plan:** [`plans/2026-07-09-today-recommendation-batch-participation-stage3.md`](plans/2026-07-09-today-recommendation-batch-participation-stage3.md)

**Goal:** Restore and upgrade the core lunch decision loop on top of the
multi-group foundation.

**Expected scope:**

- New `daily_recommendation_batches` and `daily_recommendation_items` model.
- `GET /api/groups/:groupId/today-recommendations` reads only the current batch.
- `POST /api/groups/:groupId/today-recommendations/refresh` creates a new batch.
- Optional `ensure` semantics if the implementation plan chooses to include it.
- Weather, scoring weights, and algorithm snapshots.
- Participation states: `joining`, `away`, and `decided`.
- "就决定是你了" decision flow.
- Group-scoped feedback affects future recommendations.
- Extension storage supports `identityToken`, `activeGroupId`, and
  `sessionsByGroupId`.
- Extension API client sends the active group's `groupSessionToken`.
- Extension popup/detail can fetch current group recommendations, update
  participation, submit decisions, and write feedback through real APIs.
- Cache fallback reads only `lastRecommendationsByGroupId[activeGroupId]`.

**Exit target:** The real API can support "today, what should this group eat?"
end to end, with a minimal plugin path proving the flow before the prototype
visual rebuild.

## Stage 4: Prototype UI Wiring

**Status:** Done. Stage 4A is QA verified locally and against the Railway dev
API. Stage 4B is QA verified locally against the real server and database.

**Detailed plans:**

- [`plans/2026-07-10-extension-prototype-ui-wiring-stage4a.md`](plans/2026-07-10-extension-prototype-ui-wiring-stage4a.md)
- [`plans/2026-07-10-admin-prototype-ui-wiring-stage4b.md`](plans/2026-07-10-admin-prototype-ui-wiring-stage4b.md)

**Goal:** Connect the Open Designer extension and admin prototype screens to the
real APIs built in Stage 1-3.

**Expected scope:**

- Extension `popup`, `detail`, and `settings` rebuilt in prototype style.
- Extension product-facing identity/create/join/switch flow and restaurant +
  first-recommendation quick-add, including partial-success retry.
- Admin `login`, `today`, and `restaurants` rebuilt in prototype style.
- Admin authenticated create/join/list/switch plus restaurant +
  first-recommendation quick-add, including partial-success retry.
- Static demo data replaced with real API data.
- Loading, empty, error, cache, session-expired, and permission states.
- Multi-group switching reflected consistently in extension and admin surfaces.
- No new server-only lunch-loop semantics should be invented here; Stage 4 uses
  the API contracts and storage model proven by Stage 1-3.
- Extension history plus Admin history, dashboard, members, and settings remain
  deferred to Stage 5.

**Exit target:** The product feels like the prototype for the main daily-use
flows.

## Stage 5: Dashboard / Settings / Weights

**Status:** Done. Stage 5A shared/server APIs, Stage 5B Admin, and Stage 5C
Extension implementation and QA are complete.

**Design:** [`specs/2026-07-14-dashboard-settings-weights-stage5-design.md`](specs/2026-07-14-dashboard-settings-weights-stage5-design.md)

**Completed 5A plan:** [`plans/2026-07-14-dashboard-settings-weights-stage5a.md`](plans/2026-07-14-dashboard-settings-weights-stage5a.md)

**5A handoff:** [`qa/2026-07-14-dashboard-settings-weights-stage5a.md`](qa/2026-07-14-dashboard-settings-weights-stage5a.md)

**Completed 5B plan:** [`plans/2026-07-14-admin-dashboard-settings-stage5b.md`](plans/2026-07-14-admin-dashboard-settings-stage5b.md)

**5B handoff:** [`qa/2026-07-14-admin-dashboard-settings-stage5b.md`](qa/2026-07-14-admin-dashboard-settings-stage5b.md)

**Completed 5C plan:** [`plans/2026-07-14-extension-history-reminders-stage5c.md`](plans/2026-07-14-extension-history-reminders-stage5c.md)

**5C handoff:** [`qa/2026-07-15-extension-history-reminders-stage5c.md`](qa/2026-07-15-extension-history-reminders-stage5c.md)

**Goal:** Add the prototype's review, operations, and tuning surfaces.

**Expected scope:**

- Dashboard.
- Recommendation history and review.
- Member contribution and member management views.
- Reminder settings.
- Extension personal history, group-default/device-override reminder behavior,
  and the conditional second reminder runtime.
- Scoring weight settings.
- Weekly and historical statistics.
- Data-insufficient states and timezone-aware aggregation windows.

**Exit target:** Admin users can review team lunch behavior, tune the system,
and manage group operations from real data.

## Stage 6: Deploy Hardening

**Status:** Ready for Planning.

**Goal:** Prepare the multi-group, prototype-aligned product for reliable
deployment and manual extension validation.

**Expected scope:**

- Production admin build hosting strategy.
- Migration verification against existing data.
- Railway deploy checks.
- Server readiness and environment validation.
- Extension build verification.
- Manual Chrome Developer Mode smoke test for `apps/extension/dist`.
- Final regression pass across extension, admin, server, and shared contracts.

**Exit target:** The product is ready for a confident internal deployment and
extension handoff.

## Progress Tracker

- [x] Multi-group prototype implementation spec approved for planning.
- [x] Stage 1 detailed implementation plan written.
- [x] Stage 1 approved for execution.
- [x] Stage 1 implemented and verified.
- [x] Stage 2 detailed implementation plan written.
- [x] Stage 2 implemented and verified.
- [x] Stage 3 detailed implementation plan written.
- [x] Stage 3 implemented and verified.
- [x] Stage 4 detailed implementation plan written.
- [x] Stage 4A implemented and verified.
- [x] Stage 4B implemented and verified.
- [x] Stage 4 implemented and verified.
- [x] Stage 5 design approved.
- [x] Stage 5A detailed implementation plan written.
- [x] Stage 5A implemented and verified.
- [x] Stage 5B detailed implementation plan written.
- [x] Stage 5B implemented and verified.
- [x] Stage 5C detailed implementation plan written.
- [x] Stage 5C implemented and verified.
- [x] Stage 5 implemented and verified.
- [ ] Stage 6 detailed implementation plan written.
- [ ] Stage 6 implemented and verified.
