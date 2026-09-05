# Internal Release Record

Status: `Restaurant onboarding 0.4.0 production verified for three approved groups; internal ZIP ready. Wheel remains enabled for one approved group with manual QA open.`

Date: 2026-09-05

Current release: [0.4.0 record](docs/releases/restaurant-onboarding-0.4.0-2026-09-05.md)
and [QA evidence](qa/2026-09-05-restaurant-onboarding.md). Earlier artifacts below remain audit
history; their tags were not moved.

## Version and deployment

- Extension `0.4.0` retains ID `bbkeaogleldgfnkgebdhdbiohlmonbkk`, existing permissions and the
  exact production host. The strict internal ZIP is ready; the agent has not sent it to colleagues.
- Package and runtime source: `96ea5b6a50442df938021e7bd802be3e98be7fb1`, merged and pushed to
  `main`. A later documentation-only commit is not a different runtime or package.
- ZIP SHA-256: `5159f4564aa07cc3b5c22b8413c2ee77f63a759c31de288bb39d5fc1893093ed`.
- Current Railway deployment: `fa4353d5-9202-4414-bee5-9261fdf45192` (`SUCCESS`).
- Current image digest: `sha256:e54c39eb60f18245fb10a7ae363732bd7aa962d2f0f9b343b810068944640dff`.
- Bulk import, nearby search and POI save are enabled for TT和她的饭搭子们、冬冬，今天吃点嘛？
  and 干饭天团 through exact ID allowlists. Other groups remain excluded; wheel scope is unchanged.

### Earlier rollout artifacts (historical)

- Stage 6 local annotated audit tag: `v0.1.0-internal`.
- Stage 6 peeled commit: `1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9`.
- Stage 7D pushed annotated baseline tag: `v0.2.0-internal`.
- Stage 7D baseline peeled commit: `072ce70abda268f2cdf4fea1a349c16a976e70b5`.
- Remote tag object: `de578a58f3057966e6af7153fd92ae4e94185faf`.
- Pre-onboarding Stage 7D.1 runtime source commit:
  `0caee3d8e9a973d1131590e73954966b16719016`.
- Extension `0.2.0` candidate ID: `bbkeaogleldgfnkgebdhdbiohlmonbkk`.
- Extension `0.3.0` Stage 7D.1 source candidate retains that ID, exact production host and
  permissions. Its strict validation package was built from
  `395ccb0fda52c1a625c490e1ad5a5ca7036bc798`; the operator loaded the unpacked
  candidate for QA, but it has not been distributed to the colleague cohort.
- Extension `0.3.0` validation ZIP SHA-256:
  `ab671c5703a92b5ac6942bd3b40b5435a887b9e8a5f69271085cef27d6219702`.
- Stage 7C rollback Extension ZIP SHA-256:
  `4a1db2cf62c998b6759f88dff1e775f91e7c6455dc037558effd8f2e4e9d948c`.
- Railway project/service: `remarkable-reverence / @lunch/server`.
- Pre-onboarding Railway deployment: `93ba021a-596e-402d-bc61-39ab25a39a8e` (`SUCCESS` at verification).
- Pre-onboarding Railway image digest:
  `sha256:464ba4087f9a910ddb8d04d307295a22b7f26a68308ecdbe27b786e70d9bcffe`.
- Verified Stage 7D.1 flags-off deployment:
  `ce7eb120-824a-4e75-8cd4-9486ba62a71b`.
- Skipped docs-only deployment for `072ce70`:
  `029815eb-e635-45d9-8254-289fb760e6ff`.
- Immediate pre-Stage 7D application rollback deployment:
  `03d744f6-a5bd-486c-ba65-3541dbfe9096`.
- Deeper Stage 7B application rollback deployment:
  `6d80eb52-d35a-4554-9d66-aa44dd2d6b1c`.
- Pre-Stage 7B variable-change rollback deployment:
  `2d3db6db-e1ab-41c2-86c0-edd2138dcc1a`.
- Pre-7B rollback deployment: `371242e7-9783-4866-aaa5-f4f26218ddcf`
  (`ad0260b4abf12b48bbc64e73020858ff316227f3`).
- Stage 6 production-QA deployment: `10f427de-858e-42f1-8c0c-23194180d4d8`
  (historical record; now `REMOVED` after the later deployment).
- Production URL: `https://lunchserver-production.up.railway.app`.
- Runtime: Node `22.23.1`, pnpm `9.15.0`.

The current `/api/ready` reports `96ea5b6a50442df938021e7bd802be3e98be7fb1`. Use the current
source, deployment ID and image digest as runtime identity. `v0.2.0-internal` remains the immutable
Stage 7D planning baseline and was not moved by this rollout.

## Database and migrations

- Active PostgreSQL service: `Postgres-W12K`.
- Retained rollback service: `Postgres`.
- Production seed: never run.
- Pre-deploy: environment check → `prisma migrate deploy` → read-only database verifier.
- Applied migrations: six completed, including `20260905010000_restaurant_onboarding`;
  all six read-only database invariants pass. New provenance/search-center fields are nullable.
- Migration rollback is database-level: application rollback alone does not reverse forward SQL.

The rollback database is retained until Stage 7D completes plus a 14-day observation window,
with an operational review on 2026-08-15. There is no automatic deletion. Deletion requires a
verified current backup/restore path, passing database verification and separate destructive
approval.

## Rollback

1. Stop promotion or pause beta expansion.
2. Disable the affected onboarding flags, redeploy and wait for the old instance to drain.
   Keep wheel configuration unchanged unless the incident concerns the wheel itself.
3. If application rollback is still required, select a verified application artifact, using the
   pre-onboarding source/deployment above as the baseline and confirming its availability first.
4. Keep active database `Postgres-W12K`. The onboarding migration is additive; preserve imported
   restaurants, receipts and lunch history. Switching to retained `Postgres` requires a separate
   database-incident decision.
5. Wait for `/api/ready` to report HTTP 200 and the expected revision.
6. Verify `/`, `/api/health`, protected API 401 behavior and unknown API 404 behavior.
7. Run the read-only database verifier and record sanitized results.
8. Rebuild/reload the matching unpacked Extension if the client version changed.

Detailed procedure: [rollback runbook](docs/runbooks/rollback.md).

## Production data

The clearly named Stage 6 QA identities, groups, restaurants and behavior records are retained
as Demo/smoke fixtures. They are group-isolated, preserve active-admin invariants and contain no
repository-recorded invite/token values. The clearly named Stage 7B production-smoke identity and
group are retained as Demo evidence; no cleanup script will run during Stage 7B. Revisit the
decision before expanding Stage 7D beyond the first cohort.

## Known issues and accepted dispositions

- **Stage 7B complete:** legacy closure, identity linking/reset, rate limits, Origin policy, safe
  logging, operator tools and real PostgreSQL concurrency are deployed. Both production deployments,
  migration/verifier gates, external smoke, same-identity Admin/Extension checks and Demo dry-run
  pass. Production group creation is disabled and both legacy variables are removed.
- **Stage 7C complete:** brand assets, Extension/Admin visual alignment,
  Modal focus containment, QuickAdd lost-response recovery, stable-ID build profiles and controlled
  unpacked packaging are implemented. The versioned ZIP passed the strict release gate, and Railway
  deployment `a1e581ad-cb05-48b3-b7f9-6db9858b4fb2` passed build, pre-deploy verification, readiness,
  Admin static-resource and core API smoke. Chrome `150.0.7871.125` loaded the expected internal
  name, `0.2.0` version and stable ID; the Popup disconnected-state visual check and Options
  navigation/profile checks passed. The existing Admin identity was linked successfully into the
  Extension, restoring the expected identity/group and entering the recommendation experience.
  Recommendation cards, readable reasons, batch refresh, detail navigation and detail-state controls
  also passed. QuickAdd successfully created a non-duplicate restaurant/recommendation and the
  result was confirmed in the Admin restaurant library. The primary lunch-decision action reached
  the expected completed state. Feedback pending/disabled behavior, successful completion,
  duplicate protection and post-refresh stability passed. Reload preserved the stable identity,
  group, reminder settings and recommendation state. Replacing the loaded directory with the same
  versioned ZIP and reloading also preserved those states. Loading the same ZIP from a second
  directory produced the same stable Extension ID. The Chrome reminder notification used the formal
  icon, rendered its title/body correctly and opened the Popup when clicked; its temporary test
  schedule was restored afterward. Admin Modal live keyboard focus entry, forward/reverse cycling,
  Escape close and trigger-focus restoration passed. Admin desktop and approximately 390px
  responsive layouts also remained usable without overflow or obstruction. The standalone Detail
  page passed desktop/narrow layout, wrapping, pending/disabled and keyboard-focus checks.
  The 16px toolbar icon remained recognizable on both light and dark Chrome toolbar themes.
  The final exit-gate rerun passed all tests, typechecks, internal/dev/Railway builds, documentation,
  artifact, secret and strict Stage 7C release checks; production health/readiness remained green
  with no observed HTTP 5xx in the verification window. Popup loading/empty/cached/error and
  QuickAdd lost-response/uncertain paths are accepted through deterministic source/state mapping and
  automated coverage rather than risky production fault injection. Stage 7C is approved as the
  input to Stage 7D. The Stage 7D detailed plan is now approved and its baseline is frozen; actual
  broader colleague distribution still requires the remaining browser/accessibility QA and
  explicit expansion approval.
- **Stage 7D.1 controlled Server rollout active:** group-scoped capabilities, wheel selection,
  Server candidates, Extension session/controller and accessible Popup wiring are implemented.
  A traceable flags-off deployment passed health, readiness, revision and all six database checks;
  an explicit operator-approved group was then added to the exact-match allowlist and the enabled
  deployment passed the same Server gates. The production predicate returns true for the target
  group and false for a non-target value. All three source-review findings remain regression-tested,
  and the full 846-test suite, typecheck/build, Railway build, Extension builds, compatibility
  checks and strict `0.3.0` package pass. The operator has now confirmed that the target-group Popup
  shows the wheel entry, renders normal candidates, completes one spin and restores that selected
  result when re-entered. The single reroll produces a second result and then reaches an explicit
  exhausted state. Exclusion removes only the current-round candidate, recalculates the pool and
  does not restore a spent spin; a production read confirmed all three active restaurants remain.
  Mode locking, acceptance, non-target UI behavior, keyboard, screen-reader and reduced-motion
  checks remain pending, so expansion beyond this single group remains blocked.
- **Operated beta (7D):** error alerting and privacy-bounded reminder delivery observation.
- **Dependency audit (0.4.0 source):** OSV-Scanner `v2.4.0` (official SHA-256
  `088119325156321c34c456ac3703d6013538fd71cbac82b891ab34db491e4d66`)
  rescanned 327 packages after the reviewed maintenance slice and returned no findings. The
  unchanged production classifier found zero findings across 111 package versions. The old
  lockfile's 11 high/3 medium production findings and development findings have been resolved in
  the deployed release, with Fastify 5/Prisma 6 architecture retained. See the QA record for exact versions, override
  rationale and full regression evidence.
- **Git repository:** approximately 14,507 loose objects / 159 MiB with unreachable-object and
  `.git/gc.log` warnings. A verified bundle recovery point exists at
  `/private/tmp/chidianma-stage7a-pre-maintenance-2026-07-15.bundle`; destructive prune is deferred.
- **Identity:** no formal account, verified personal identity, long-term recovery credential,
  single-device remote revoke or account merge. Link codes require one still-connected device.

Evidence: [Stage 6 production QA](docs/archive/stages/stage-6/2026-07-15-deploy-hardening-stage6-qa.md),
[Stage 7 review triage](qa/2026-07-15-production-baseline-review-triage.md),
[Stage 7B QA](qa/2026-07-15-internal-beta-productization-stage7b.md) and
[Stage 7C QA](qa/2026-07-16-internal-beta-productization-stage7c.md). Current Stage 7D.1 evidence is
the [wheel QA record](qa/2026-07-22-controlled-colleague-beta-stage7d-wheel.md), governed by the
[Stage 7D detailed plan](plans/2026-07-20-controlled-colleague-beta-stage7d.md).

## Next step

Use the [same-directory upgrade procedure](docs/extension-internal-distribution.md) and complete
the actual Chrome 0.4.0 load/upgrade check. Record colleague first-use timing and broader
branch/address coverage during the three-group trial. Wheel manual checks and its single-group
boundary remain open. Later product work follows the [roadmap](roadmap.md).
