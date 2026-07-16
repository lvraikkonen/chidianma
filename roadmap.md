# 中午吃点啥 Roadmap

This roadmap tracks the staged path from the original MVP through the verified
multi-group production baseline and into an operated internal beta. The product
foundation is described by the earlier multi-group spec; the current next-stage
boundary is defined in
[`specs/2026-07-15-internal-beta-productization-stage7-design.md`](specs/2026-07-15-internal-beta-productization-stage7-design.md).

## Roadmap Principle

Stage 1 to Stage 3 make the product real and usable: multi-group data,
permissions, restaurant knowledge, daily recommendations, participation, and
feedback.

Stage 4 to Stage 5 make the product feel like the Open Designer prototype:
extension pages, admin pages, dashboard, settings, history, and polished real
states.

Stage 6 hardens the whole product for deployment, migration confidence, and
extension smoke testing.

Stage 7 changes the operating mode from project development to internal beta
productization: freeze and document the baseline, harden the lightweight
identity boundary, make the product and distribution coherent, then run a
small controlled colleague beta. Stage 8 is intentionally not planned here.

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
| Stage 1 | Multi-Group Foundation | Done | [`plans/2026-07-08-multi-group-foundation-stage1.md`](docs/archive/stages/stage-1/2026-07-08-multi-group-foundation-stage1-plan.md) | Identity, groups, memberships, sessions, invites, permissions, migration foundation |
| Stage 2 | Group-Scoped Restaurant Knowledge | Done | [`plans/2026-07-09-group-scoped-restaurant-knowledge-stage2.md`](docs/archive/stages/stage-2/2026-07-09-group-scoped-restaurant-knowledge-stage2-plan.md) | Each group can maintain its own isolated restaurant and recommendation knowledge base |
| Stage 3 | Today Recommendation Batch + Participation | Done | [`plans/2026-07-09-today-recommendation-batch-participation-stage3.md`](docs/archive/stages/stage-3/2026-07-09-today-recommendation-batch-participation-stage3-plan.md) | Core lunch loop plus minimal extension auth/storage/API client |
| Stage 4 | Prototype UI Wiring | Done | [Stage 4A Extension](docs/archive/stages/stage-4/2026-07-10-extension-prototype-ui-wiring-stage4a-plan.md)<br>[Stage 4B Admin](docs/archive/stages/stage-4/2026-07-10-admin-prototype-ui-wiring-stage4b-plan.md) | Extension and admin prototype screens connect to real Stage 1-3 APIs |
| Stage 5 | Dashboard / Settings / Weights | Done | [Stage 5A Shared + Server](docs/archive/stages/stage-5/2026-07-14-dashboard-settings-weights-stage5a-plan.md)<br>[Stage 5B Admin](docs/archive/stages/stage-5/2026-07-14-admin-dashboard-settings-stage5b-plan.md)<br>[Stage 5C Extension](docs/archive/stages/stage-5/2026-07-14-extension-history-reminders-stage5c-plan.md) | Historical review, dashboard metrics, member contribution, reminders, weights |
| Stage 6 | Deploy Hardening | Done | [`plans/2026-07-15-deploy-hardening-stage6.md`](docs/archive/stages/stage-6/2026-07-15-deploy-hardening-stage6-plan.md) | Production hosting, migration verification, extension smoke test, Railway checks |
| Stage 7 | Internal Beta Productization | In Progress | [Stage 7 design](specs/2026-07-15-internal-beta-productization-stage7-design.md)<br>[Stage 7A plan](plans/2026-07-15-internal-beta-productization-stage7a.md)<br>[Stage 7B plan](plans/2026-07-15-internal-beta-productization-stage7b.md)<br>[Stage 7B QA](qa/2026-07-15-internal-beta-productization-stage7b.md) | Frozen release baseline, explicit identity boundary, coherent distribution, and a controlled colleague beta |

## Planning Cadence

Stages 1–6 are complete and remain historical, verified prerequisites. The
active cadence is sequential:

1. Stage 7A baseline freeze, documentation/archive closure, debt disposition and
   release checks are complete.
2. Stage 7B lightweight identity definition and hardening are complete.
3. Plan and complete Stage 7C brand, experience consistency, and distribution
   readiness.
4. Start the controlled Stage 7D colleague beta, operate it, collect evidence,
   and make an account-system decision from observed friction.

Each substage receives its own detailed plan only after the previous blocking
gate is understood. Do not pre-plan Stage 8 implementation as part of Stage 7.

## Stage 1: Multi-Group Foundation

**Status:** Done per Stage 1 implementation handoff.

**Detailed plan:** [`plans/2026-07-08-multi-group-foundation-stage1.md`](docs/archive/stages/stage-1/2026-07-08-multi-group-foundation-stage1-plan.md)

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

**Detailed plan:** [`plans/2026-07-09-group-scoped-restaurant-knowledge-stage2.md`](docs/archive/stages/stage-2/2026-07-09-group-scoped-restaurant-knowledge-stage2-plan.md)

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

**Detailed plan:** [`plans/2026-07-09-today-recommendation-batch-participation-stage3.md`](docs/archive/stages/stage-3/2026-07-09-today-recommendation-batch-participation-stage3-plan.md)

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

- [`plans/2026-07-10-extension-prototype-ui-wiring-stage4a.md`](docs/archive/stages/stage-4/2026-07-10-extension-prototype-ui-wiring-stage4a-plan.md)
- [`plans/2026-07-10-admin-prototype-ui-wiring-stage4b.md`](docs/archive/stages/stage-4/2026-07-10-admin-prototype-ui-wiring-stage4b-plan.md)

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

**Design:** [`specs/2026-07-14-dashboard-settings-weights-stage5-design.md`](docs/archive/stages/stage-5/2026-07-14-dashboard-settings-weights-stage5-design.md)

**Completed 5A plan:** [`plans/2026-07-14-dashboard-settings-weights-stage5a.md`](docs/archive/stages/stage-5/2026-07-14-dashboard-settings-weights-stage5a-plan.md)

**5A handoff:** [`qa/2026-07-14-dashboard-settings-weights-stage5a.md`](docs/archive/stages/stage-5/2026-07-14-dashboard-settings-weights-stage5a-qa.md)

**Completed 5B plan:** [`plans/2026-07-14-admin-dashboard-settings-stage5b.md`](docs/archive/stages/stage-5/2026-07-14-admin-dashboard-settings-stage5b-plan.md)

**5B handoff:** [`qa/2026-07-14-admin-dashboard-settings-stage5b.md`](docs/archive/stages/stage-5/2026-07-14-admin-dashboard-settings-stage5b-qa.md)

**Completed 5C plan:** [`plans/2026-07-14-extension-history-reminders-stage5c.md`](docs/archive/stages/stage-5/2026-07-14-extension-history-reminders-stage5c-plan.md)

**5C handoff:** [`qa/2026-07-15-extension-history-reminders-stage5c.md`](docs/archive/stages/stage-5/2026-07-15-extension-history-reminders-stage5c-qa.md)

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

**Status:** Done. Implementation, Railway fresh release, production Admin QA,
and unpacked Extension QA completed on 2026-07-15.

**Design:** [`specs/2026-07-15-deploy-hardening-stage6-design.md`](docs/archive/stages/stage-6/2026-07-15-deploy-hardening-stage6-design.md)

**Detailed plan:** [`plans/2026-07-15-deploy-hardening-stage6.md`](docs/archive/stages/stage-6/2026-07-15-deploy-hardening-stage6-plan.md)

**QA handoff:** [`qa/2026-07-15-deploy-hardening-stage6.md`](docs/archive/stages/stage-6/2026-07-15-deploy-hardening-stage6-qa.md)

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

## Stage 7: Internal Beta Productization

**Status:** In Progress. Stage 7A and Stage 7B are complete; Stage 7C is Ready for Planning.

**Design:** [`specs/2026-07-15-internal-beta-productization-stage7-design.md`](specs/2026-07-15-internal-beta-productization-stage7-design.md)

**Stage 7A plan:** [`plans/2026-07-15-internal-beta-productization-stage7a.md`](plans/2026-07-15-internal-beta-productization-stage7a.md)

**Stage 7B plan:** [`plans/2026-07-15-internal-beta-productization-stage7b.md`](plans/2026-07-15-internal-beta-productization-stage7b.md)

**Accepted review triage:** [`qa/2026-07-15-production-baseline-review-triage.md`](qa/2026-07-15-production-baseline-review-triage.md)

**Stage 7A QA:** [`qa/2026-07-15-internal-beta-productization-stage7a.md`](qa/2026-07-15-internal-beta-productization-stage7a.md)

**Stage 7B QA:** [`qa/2026-07-15-internal-beta-productization-stage7b.md`](qa/2026-07-15-internal-beta-productization-stage7b.md)

**Frozen Stage 6 audit baseline:**
`1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9`, production-QA verified on
2026-07-15. The local annotated tag `v0.1.0-internal` has been created and
verified at that exact commit; it has not been pushed or published. The current Stage 7B production
runtime is Railway deployment `6d80eb52-d35a-4554-9d66-aa44dd2d6b1c`; it is an uncommitted CLI
artifact tracked by deployment ID and image digest, not by the Stage 6 tag.

**Goal:** Turn the verified production deployment into a coherent, supportable,
and observable internal beta without broadening the lunch-product scope.

**Ordered substages:**

1. **Stage 7A — Trusted baseline (Done):** freeze the version, create changelog and
   release records, replace stage-dependent current documentation, preserve
   historical evidence in an indexed archive, and dispose of known debt. The
   Claude Code / gstack review and corrected triage are complete; runtime
   security changes do not bypass into this documentation stage.
2. **Stage 7B — Lightweight identity (Done):** identity unification, Token renewal/reset, legacy
   closure, edge protection, PII/operator support, PostgreSQL concurrency and the two-step production
   rollout passed their automated, Chrome and production exit gates.
3. **Stage 7C — Brand and distribution (Ready for Planning):** align brand, icons, detail-page and
   cross-surface UX, accessibility and QuickAdd idempotency; decide the internal
   Extension distribution model; and produce a new hardened version with
   branch-appropriate install/upgrade/privacy/support materials.
4. **Stage 7D — Controlled colleague beta:** operate a small cohort, monitor the
   release using the existing structured logs plus alerting and privacy-bounded
   reminder observation, collect feedback, and make an evidence-backed account
   system decision. This is the beta process, not a pre-beta gate.

Stages 7A–7C block the ordinary colleague beta. Stage 7D is the beta itself.

**Exit target:** Colleagues can install and use a versioned internal product
with clear identity/security limits and support paths; the team can monitor,
roll back, and learn from real usage; the account-system direction is recorded
without prematurely committing Stage 8 implementation.

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
- [x] Stage 6 detailed implementation plan written.
- [x] Stage 6 implemented and verified.
- [x] Stage 7 productization boundary defined.
- [x] Stage 7A detailed implementation plan written.
- [x] Stage 7A detailed implementation plan reviewed and approved.
- [x] Production baseline multi-angle review completed and corrected triage accepted.
- [x] Stage 7A trusted baseline completed.
- [x] Stage 7B detailed implementation plan written and approved.
- [x] Stage 7B identity model and lightweight hardening completed.
- [ ] Stage 7C brand, experience, and distribution readiness completed.
- [ ] Stage 7D controlled colleague beta completed and account decision recorded.
