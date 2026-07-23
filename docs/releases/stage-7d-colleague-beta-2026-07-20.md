# Stage 7D Controlled Colleague Beta Baseline

Status: `Stage 7D.0 complete; Stage 7D.1 candidate NO-GO and not deployed`

Date: 2026-07-20

## Project notice

「中午吃点啥」是个人开发、非盈利、无广告、无付费功能的实验项目。目前只有有限
数量的同事作为自愿测试用户；它不是公司正式立项，也不是官方内部管理系统。

## Git baseline

- Baseline commit: `072ce70abda268f2cdf4fea1a349c16a976e70b5`.
- Annotated tag: `v0.2.0-internal`.
- Tag subject: `Stage 7D — Controlled colleague beta baseline`.
- Remote tag object: `de578a58f3057966e6af7153fd92ae4e94185faf`.
- Remote peeled commit: `072ce70abda268f2cdf4fea1a349c16a976e70b5`.
- Tag was pushed to `origin`; it was not moved or force-pushed.
- Feature branch: `feat/lucky-restaurant-wheel`.
- POI branch is intentionally not created until wheel is merged into main.

## Production runtime

- Production URL: `https://lunchserver-production.up.railway.app`.
- Current successful Railway deployment:
  `03d744f6-a5bd-486c-ba65-3541dbfe9096`.
- Runtime source commit: `e9912c9cc72e237b0baa1aa922b3f49c5473f66a`.
- Image digest:
  `sha256:66a975d5fd720cf85c143f1b1303ec37224955b8950aee833bbdd56b543d939c`.
- `/api/ready` reports the same runtime source commit and a ready database.
- Railway deployment `029815eb-e635-45d9-8254-289fb760e6ff` for baseline main commit
  `072ce70` was `SKIPPED` because that commit only changed files outside the runtime watch paths.

The baseline tag therefore records the reviewed source/planning boundary; it does not claim that
the docs-only baseline commit is the current production image.

## Database and storage versions

- Database: PostgreSQL through Prisma.
- Tracked/applied migrations: 5.
- Latest migration: `20260715180000_stage7b_identity_links`.
- Production `prisma migrate status`: schema up to date.
- Production read-only database verifier: all six checks returned zero violations.
- Active database service: `Postgres-W12K`.
- Retained rollback database: `Postgres`; deletion remains separately approved and destructive.
- Deployed/verified rollback Extension version: `0.2.0`.
- Extension ID: `bbkeaogleldgfnkgebdhdbiohlmonbkk`.
- Extension `lunchState`: additive, migrate-on-read and not assigned a global schema version.
- Stage 7D.1 wheel session key: `luckyWheelSession.v1`; it is independent from `lunchState`,
  contains no bearer token or raw candidate response, and stores a zero-spin batch marker plus the
  minimal last-result ticket/recommendation binding and one selected-candidate display snapshot.
  `lunchState` adds only an additive, migrate-on-read `authorizationRevision`. Active group,
  membership, identity and API origin mutations clear the wheel key and authorization replacements
  advance that revision; batch changes replace non-terminal state with a CAS-protected marker,
  except that a same-day pending/accepted result remains terminal until reconciled instead of
  silently reopening a reroll.
- Admin localStorage key: `lunchAdminSessionState.v2`.
- Build metadata schema: `1.0`.

Stage 7D.0 introduces no Prisma migration or Chrome storage change. The later Stage 7D.1
implementation adds the versioned wheel session key and additive authorization revision above;
Prisma remains unchanged.

The current Stage 7D.1 source candidate raises the Extension version to `0.3.0` while retaining
the same public key, Extension ID, permissions and exact production host. A strict validation
package was built from `395ccb0fda52c1a625c490e1ad5a5ca7036bc798`; it has not been distributed
to the colleague cohort.

## Feature flags at baseline

At the frozen baseline the Stage 7D flags were absent. The current implementation adds the
following Server-authoritative, group-allowlisted variables with false/empty defaults:

```text
LUCKY_RESTAURANT_WHEEL_ENABLED=false
LUCKY_RESTAURANT_WHEEL_GROUP_IDS=
POI_REFERENCE_SEARCH_ENABLED=false
POI_REFERENCE_SEARCH_GROUP_IDS=
POI_ACTIVE_PROVIDER=
POI_PROVIDER_MOCK_ENABLED=false
POI_PROVIDER_AMAP_ENABLED=false
POI_AMAP_REFERENCE_SAVE_ENABLED=false
POI_AMAP_PERSISTENCE_APPROVAL_REF=
POI_OFFICE_COORDINATE_SYSTEMS=
AMAP_WEB_SERVICE_KEY=<server secret, not set in source>
```

No beta group has been enabled by Stage 7D.0.

A sanitized production-variable inspection on 2026-07-22 found the Stage 7D values unset/empty,
so wheel and POI behavior remain off. No cohort group ID has been approved.

## Baseline verification

Executed with Node `22.23.1`:

- `pnpm test`: passed, 647 tests total
  (Shared 31, Admin 85, Extension 266, Server 265).
- `pnpm typecheck`: passed.
- `pnpm build`: passed.
- `pnpm build:railway`: passed.
- `pnpm check:docs`: passed, 60 existing Markdown files and 140 links before this release record.
- `pnpm check:release-artifacts`: passed.
- `pnpm check:release-secrets`: passed.
- `STAGE7C_REQUIRE_ARTIFACTS=0 pnpm check:stage7c-release`: passed.
- `git diff --check`: passed before documentation changes.

After adding the Stage 7D documents, `pnpm check:docs` passed again with 63 Markdown files and 145
local links, and `pnpm check:release-secrets` passed with 85 files scanned and no supplied secret
values.

The repository has no lint script and no CI workflow; neither is reported as passed.

## Stage 7D.1 candidate verification

The following focused checks passed on 2026-07-22 with Node `22.23.1`:

- Shared tests: 58 passed.
- Server tests: 306 passed after the normal-recommendation tie-order regression fix.
- Server typecheck: passed.
- Admin tests: 85 passed.
- Extension tests: 397 passed.
- Full root `pnpm test`: 846 passed; root `pnpm typecheck` and `pnpm build` passed.
- `pnpm build:railway`: passed.
- Extension dev and internal source builds: passed at `0.3.0`.
- `pnpm check:docs`: passed with 66 Markdown files and 165 local links after adding Stage 7D.1
  feature/manual-QA/QA documents.
- Artifact checks: passed with 4 Admin files, 23 Extension files, 3 permissions, no legacy
  residue and valid Railway configuration.
- Secret check: passed with 88 files scanned and zero supplied secret values.
- `STAGE7C_REQUIRE_ARTIFACTS=0 pnpm check:stage7c-release`: passed with stable Extension ID,
  exact production host and 23 Extension files.
- Strict clean-worktree `0.3.0` package and artifact-required release check: passed for source
  `395ccb0fda52c1a625c490e1ad5a5ca7036bc798`, ZIP SHA-256
  `ab671c5703a92b5ac6942bd3b40b5435a887b9e8a5f69271085cef27d6219702`.

Source, automation and package gates are complete, but this is not the Stage 7D.1 rollout exit
gate. Real Chrome/keyboard/screen reader/reduced-motion QA, flags-off deployment, ready/verifier
checks and cohort enablement remain pending. Chrome automation could not enter
`chrome://extensions`, so unpacked installation requires operator assistance.

Code review found three issues; all are fixed with regression tests. Normal recommendation ordering
is isolated from wheel tie-breaking, pending acceptance retries the same selected result across
same-day batch changes, and an additive authorization revision rejects stale responses after
reset/reconnect. Final Standards and Spec reviews found no P0/P1 source blocker. The candidate
remains rollout **NO-GO** until manual and deployment gates pass. Detailed evidence:
[Stage 7D.1 wheel QA](../../qa/2026-07-22-controlled-colleague-beta-stage7d-wheel.md).

## Approved Stage 7D scope

- Stage 7D.1: lucky restaurant wheel, default off and group allowlisted.
- Stage 7D.2: separate Mock + gated Amap POI reference-search spike.
- Amap persistence policy: `contract_only`.
- Amap adapter baseline: the documented v3 Web Service around-search API with
  `extensions=base`; Search 2.0/v5 is not assumed by this plan.
- Without a written permission reference, Amap results are session-only and cannot create a
  savable QuickAdd draft.
- No OSM/Overpass or Meituan implementation in this stage.
- No database migration, complex recommendation model, event-tracking table or Manifest permission
  expansion is approved.

## Known issues and risks

- Production source commit differs from baseline main commit because the latter is docs-only.
- The current recommendation hard filter only knows active/paused/blocked status; distance, price,
  dietary restrictions and opening hours are not existing hard constraints.
- The Extension uses controlled unpacked distribution without automatic updates.
- The cohort has not started and no Stage 7D feature has completed real Chrome or production QA.
- The Stage 7D.1 source candidate has no open P0/P1 source-review blocker; real Chrome, assistive
  technology and production gates remain incomplete.
- In the rare case where two open Popups accept the same persisted wheel result concurrently, the
  second Popup can keep an older in-memory participation summary until it is reopened; the Server
  decision and persisted wheel session remain authoritative and prevent another draw.
- Amap Key type, stable outbound IP restriction, quota and contract boundary must be verified before
  enabling the real provider.
- Existing office coordinates have no coordinate-system metadata; each allowlisted group must have
  an explicit verified coordinate-system deployment mapping before the office preset can call Amap.
- There is no written confirmation permitting persistence of Amap-derived POI fields.
- There is no generic behavior-event pipeline; reroll/exclusion feedback remains manual in the beta.

## Rollback

Stage 7D.0 changes no runtime or database behavior. For later Stage 7D slices:

1. Remove affected group IDs or disable the feature flag.
2. Confirm `/api/health` and `/api/ready`.
3. If application rollback is required, restore Railway deployment
   `03d744f6-a5bd-486c-ba65-3541dbfe9096`.
4. Reload the matching Extension `0.2.0` unpacked build if the client changed.
5. Run the read-only database verifier; do not reverse migrations or delete data without a separate
   approved procedure.

Detailed procedure: [rollback runbook](../runbooks/rollback.md).

## Next step

Continue Stage 7D.1 on `feat/lucky-restaurant-wheel`: complete real Chrome and accessibility QA
around a flags-off Server deployment, then collect health/ready/verifier evidence. Cohort
allowlisting still requires a separately approved group ID. Do not start POI implementation or
enable a colleague cohort while rollout remains NO-GO.
