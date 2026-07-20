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
| Stage 7 | Internal Beta Productization | In Progress | [Stage 7 design](specs/2026-07-15-internal-beta-productization-stage7-design.md)<br>[Stage 7A plan](plans/2026-07-15-internal-beta-productization-stage7a.md)<br>[Stage 7B plan](plans/2026-07-15-internal-beta-productization-stage7b.md)<br>[Stage 7B QA](qa/2026-07-15-internal-beta-productization-stage7b.md)<br>[Stage 7C plan](plans/2026-07-16-internal-beta-productization-stage7c.md)<br>[Stage 7C QA](qa/2026-07-16-internal-beta-productization-stage7c.md) | Frozen release baseline, explicit identity boundary, coherent distribution, and a controlled colleague beta |

## Planning Cadence

Stages 1–6 are complete and remain historical, verified prerequisites. The
active cadence is sequential:

1. Stage 7A baseline freeze, documentation/archive closure, debt disposition and
   release checks are complete.
2. Stage 7B lightweight identity definition and hardening are complete.
3. Stage 7C brand, focused quality, real Chrome QA and versioned unpacked-distribution work are
   complete.
4. Write and approve the Stage 7D detailed plan, then start the controlled colleague beta, operate
   it, collect evidence and make an account-system decision from observed friction.

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

**Status:** In Progress. Stage 7A–7C and Stage 7D.0 are complete; Stage 7D.1 is next.

**Design:** [`specs/2026-07-15-internal-beta-productization-stage7-design.md`](specs/2026-07-15-internal-beta-productization-stage7-design.md)

**Stage 7A plan:** [`plans/2026-07-15-internal-beta-productization-stage7a.md`](plans/2026-07-15-internal-beta-productization-stage7a.md)

**Stage 7B plan:** [`plans/2026-07-15-internal-beta-productization-stage7b.md`](plans/2026-07-15-internal-beta-productization-stage7b.md)

**Accepted review triage:** [`qa/2026-07-15-production-baseline-review-triage.md`](qa/2026-07-15-production-baseline-review-triage.md)

**Stage 7A QA:** [`qa/2026-07-15-internal-beta-productization-stage7a.md`](qa/2026-07-15-internal-beta-productization-stage7a.md)

**Stage 7B QA:** [`qa/2026-07-15-internal-beta-productization-stage7b.md`](qa/2026-07-15-internal-beta-productization-stage7b.md)

**Stage 7B planning revalidation:** [`qa/2026-07-16-stage7b-revalidation-for-stage7c-planning.md`](qa/2026-07-16-stage7b-revalidation-for-stage7c-planning.md)

**Stage 7C approved plan:** [`plans/2026-07-16-internal-beta-productization-stage7c.md`](plans/2026-07-16-internal-beta-productization-stage7c.md)

**Stage 7C implementation QA:** [`qa/2026-07-16-internal-beta-productization-stage7c.md`](qa/2026-07-16-internal-beta-productization-stage7c.md)

**Stage 7D design:** [`specs/2026-07-20-controlled-colleague-beta-stage7d-design.md`](specs/2026-07-20-controlled-colleague-beta-stage7d-design.md)

**Stage 7D approved plan:** [`plans/2026-07-20-controlled-colleague-beta-stage7d.md`](plans/2026-07-20-controlled-colleague-beta-stage7d.md)

**Stage 7D baseline release record:** [`docs/releases/stage-7d-colleague-beta-2026-07-20.md`](docs/releases/stage-7d-colleague-beta-2026-07-20.md)

**Frozen Stage 6 audit baseline:**
`1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9`, production-QA verified on
2026-07-15. The local annotated tag `v0.1.0-internal` remains the Stage 6 audit marker. The pushed
annotated tag `v0.2.0-internal` freezes the Stage 7D baseline at
`072ce70abda268f2cdf4fea1a349c16a976e70b5`. The current production runtime remains Stage 7C
Railway deployment `03d744f6-a5bd-486c-ba65-3541dbfe9096`, sourced from commit
`e9912c9cc72e237b0baa1aa922b3f49c5473f66a`; the later main commit only changed documentation and
its Railway deployment was skipped. Deployment ID, source commit and image digest identify the
runtime; the baseline tag does not claim a deployment.

**Goal:** Turn the verified production deployment into a coherent, supportable,
and observable internal beta, add only the approved wheel and reference-search slices, and avoid
expanding into a full restaurant discovery, map or import platform.

**Ordered substages:**

1. **Stage 7A — Trusted baseline (Done):** freeze the version, create changelog and
   release records, replace stage-dependent current documentation, preserve
   historical evidence in an indexed archive, and dispose of known debt. The
   Claude Code / gstack review and corrected triage are complete; runtime
   security changes do not bypass into this documentation stage.
2. **Stage 7B — Lightweight identity (Done):** identity unification, Token renewal/reset, legacy
   closure, edge protection, PII/operator support, PostgreSQL concurrency and the two-step production
   rollout passed their automated, Chrome and production exit gates.
3. **Stage 7C — Brand and distribution (Done):** brand, icons, detail-page and cross-surface UX,
   accessibility, Modal focus containment and QuickAdd lost-response recovery are complete. The
   stable-ID, fixed-origin versioned unpacked candidate passed automated, Railway, real Chrome and
   release-artifact exit gates. Web Store work remains deferred until after the first controlled
   cohort.
4. **Stage 7D — Controlled colleague beta (In Progress):** Stage 7D.0 froze the baseline and
   approved the current design/plan. Stage 7D.1 implements the lucky restaurant wheel first;
   Stage 7D.2 later validates Mock + gated Amap reference search on an independent branch. Both
   remain default-off, group-allowlisted beta capabilities. The cohort then operates with the
   existing structured logs plus alerting and privacy-bounded reminder observation, collects
   feedback, and makes an evidence-backed account-system decision.

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
- [x] Stage 7C detailed implementation plan written.
- [x] Stage 7C detailed implementation plan reviewed and approved.
- [x] Stage 7C brand, experience, and distribution readiness completed.
- [x] Stage 7D detailed design and implementation plan written and approved.
- [x] Stage 7D.0 baseline validated and frozen at pushed tag `v0.2.0-internal`.
- [ ] Stage 7D controlled colleague beta completed and account decision recorded.
