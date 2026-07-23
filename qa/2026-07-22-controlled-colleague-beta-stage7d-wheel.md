# Stage 7D.1 幸运餐厅大转盘 QA

Status: `IN PROGRESS — production deployment and scoped predicate gates pass; manual wheel/accessibility and rollback gates remain`

Date: 2026-07-22

## Scope and decision

本记录覆盖 `feat/lucky-restaurant-wheel` 的 Stage 7D.1 第六小节和受控 Server
rollout。源码、全仓自动化、严格 `0.3.0` 打包和生产部署门禁已经通过；操作者明确
批准一个同事小组加入 allowlist。真实 Chrome 目标组行为和辅助技术 QA 仍未完成，
因此当前决定是：单组 Server rollout 保持开启，但不得扩大 cohort 或宣称完整 GO。
Stage 7D.0 基线 tag 和 Stage 7C application rollback 点保持不变。

参考：

- [Stage 7D 规格](../specs/2026-07-20-controlled-colleague-beta-stage7d-design.md)
- [Stage 7D 实施计划](../plans/2026-07-20-controlled-colleague-beta-stage7d.md)
- [wheel 功能说明](../docs/features/lucky-restaurant-wheel.md)
- [Stage 7D 手动 QA](../docs/manual-qa/stage-7d.md)
- [Stage 7D release note](../docs/releases/stage-7d-colleague-beta-2026-07-20.md)

## Candidate and unchanged boundaries

- Branch: `feat/lucky-restaurant-wheel`.
- Stage 7D baseline/tag: `072ce70abda268f2cdf4fea1a349c16a976e70b5` /
  `v0.2.0-internal`.
- Current production is Railway deployment
  `93ba021a-596e-402d-bc61-39ab25a39a8e`, source
  `0caee3d8e9a973d1131590e73954966b16719016`.
- Stage 7C deployment `03d744f6-a5bd-486c-ba65-3541dbfe9096` remains the application rollback
  point.
- Extension source candidate: `0.3.0`; stable ID
  `bbkeaogleldgfnkgebdhdbiohlmonbkk`.
- No Prisma migration, Manifest permission expansion or new persistent event table.
- The wheel global flag is enabled for one operator-approved exact-match group; the actual group ID
  is intentionally omitted and retained only in Railway variables. POI remains off.

## Production deployment evidence

On 2026-07-22 the Server was rolled out in two controlled phases:

1. A CLI-uploaded build was rejected as release evidence because `/api/ready` reported
   `revision: "local"`; it was not used as the rollout baseline.
2. GitHub-sourced flags-off deployment `ce7eb120-824a-4e75-8cd4-9486ba62a71b` reached
   `SUCCESS`, reported exact revision `0caee3d8e9a973d1131590e73954966b16719016`, returned
   healthy/ready responses, protected both new group routes with `401 missing_token`, and passed
   all six read-only database checks with zero violations. Railway later removed this superseded
   deployment after the enabled redeployment completed.
3. The approved group allowlist and global flag were staged without an intermediate deployment.
   Redeployment `93ba021a-596e-402d-bc61-39ab25a39a8e` then reached `SUCCESS` with the same
   source revision. Health/readiness, both unauthenticated `401` gates and all six database checks
   passed again.
4. A sanitized in-container predicate check returned enabled for the approved target and disabled
   for a non-target value. No bearer token, invite code, database URL or actual group ID was
   recorded.

## Automated evidence completed

The following checks passed with Node `22.23.1` during this verification slice:

| Check | Result |
| --- | --- |
| `pnpm --filter @lunch/shared test` | PASS — 58 tests |
| `pnpm --filter @lunch/server test` | PASS — 306 tests after tie-order regression fix |
| `pnpm --filter @lunch/server typecheck` | PASS |
| `pnpm --filter @lunch/extension test` | PASS — 397 tests |
| `pnpm test` | PASS — 846 tests: Shared 58, Admin 85, Server 306, Extension 397 |
| `pnpm typecheck` | PASS — all workspace packages |
| `pnpm build` | PASS — all workspace packages; internal Extension `0.3.0` |
| `pnpm build:railway` | PASS |
| Extension development build | PASS — `0.3.0` |
| Extension internal build | PASS — `0.3.0` |
| `pnpm check:docs` | PASS — 66 Markdown files, 165 local links |
| Release artifact checks | PASS — 4 Admin files, 23 Extension files, 3 permissions, no legacy residue; Railway configuration valid |
| `pnpm check:release-secrets` | PASS — 88 files scanned, 0 supplied secret values |
| `STAGE7C_REQUIRE_ARTIFACTS=0 pnpm check:stage7c-release` | PASS — stable ID, exact production host and 23 Extension files |
| Strict clean-worktree `pnpm package:extension:internal` | PASS — source `395ccb0fda52c1a625c490e1ad5a5ca7036bc798` |
| Strict artifact-required release check | PASS — ZIP SHA-256 `ab671c5703a92b5ac6942bd3b40b5435a887b9e8a5f69271085cef27d6219702` |

The strict package was created from a detached clean worktree, copied to the ignored local
`artifacts/extension` directory and revalidated with artifacts required. It is QA evidence, not an
approved broad colleague distribution. Production deployment evidence is recorded above; manual
browser verification remains separate.

## Source review findings

Code review found three issues; all three are resolved and covered by regression tests:

1. **Resolved — normal recommendation tie-order isolation:** wheel-specific stable ordering no
   longer changes the established normal recommendation ordering. The fix was developed with a
   focused regression test; the full Server suite now passes 306 tests and Server typecheck passes.
2. **Resolved — pending acceptance retry:** a failed or lost participation response preserves the
   selected candidate snapshot and ticket binding, retries the same `acceptancePending` decision,
   and does not reopen reroll or exclusion after a same-day candidate/batch replacement.
3. **Resolved — stale reconnect:** an additive, migrate-on-read `authorizationRevision` binds
   candidate, spin, acceptance, storage CAS and session-retry work to one authorization generation.
   New identity, reset, disconnect and API replacement advance it; ordinary token renewal does not.

The final Standards and Spec reviews found no P0/P1 source blocker. Both reported only stale
release documentation, corrected by this record; the duplicated restored-result state assembly is
a non-blocking P3 refactoring opportunity.

## Partial real Chrome evidence

On 2026-07-22 the operator reported loading the unpacked candidate, clicking **Reload** and opening
the Popup once. Chrome's visible open-tab metadata confirmed an Extension options page titled
`中午吃点啥 · Chrome 扩展设置` at Extension ID
`bbkeaogleldgfnkgebdhdbiohlmonbkk`.

The Popup is transient and Chrome's protected `chrome://` / `chrome-extension://` surfaces are not
exposed for automated visual or interaction inspection. Therefore this evidence confirms only
load/reload and launch. It does not yet pass version/permission-card inspection, default-off UI and
network behavior, keyboard navigation, screen-reader announcement, reduced motion or visual QA.

At that pre-deployment moment, `/api/ready` still reported Stage 7C revision
`e9912c9cc72e237b0baa1aa922b3f49c5473f66a`. An unauthenticated read of the new capabilities path
returned route-level 404 (`Route GET:.../capabilities not found`), confirming that the Server did
not yet contain Stage 7D routes. The Extension correctly mapped that capability failure to
all-disabled features. This is historical fail-closed compatibility evidence, not the later
Stage 7D flags-off deployment result.

After the enabled single-group deployment, the operator reopened the Popup in the approved group
and confirmed that the `转一下／幸运大转盘` entry was visible. This passes the authenticated
capability-to-entry visibility gate only; the candidate request, wheel interaction, non-target
group UI behavior and accessibility checks were not inferred from that observation.

The operator then opened the entry, observed a normally rendered candidate wheel and completed one
spin. Entering through `转一下` again restored the previously selected result instead of starting
a new draw. This passes the UI-observed candidate-load, initial-spin and selected-result restoration
checks. It does not pass candidate-count boundaries, reroll exhaustion, exclusion, acceptance,
non-target group behavior or assistive-technology checks.

The operator used the single allowed reroll, observed a normal second result and then confirmed
that no further reroll was available and the UI presented the exhausted state. This passes the
one-reroll limit without implying that mode locking, exclusion or acceptance has been tested.

## Exit checks not completed

- [x] All three source findings are reviewed and their regression tests pass.
- [x] Full root `pnpm test`, `pnpm typecheck` and `pnpm build`.
- [x] Strict, clean-worktree `0.3.0` Extension package with checksum.
- [ ] Real Chrome unpacked install/upgrade, keyboard and visual QA.
- [ ] Real screen reader announcement and reduced-motion QA.
- [x] Server flags-off deployment.
- [x] Deployed `/api/health`, `/api/ready`, exact revision and read-only database verifier.
- [x] Explicit single-group approval and sanitized Server predicate allowlist test.
- [x] Target-group Popup displays the wheel entry in real Chrome.
- [x] Target-group wheel renders normal candidates and completes an initial spin.
- [x] Re-entering through the wheel entry restores the previous selected result without a new draw.
- [x] Exactly one reroll produces a second result and then exposes the exhausted state.
- [ ] Non-allowlisted real group closed behavior in real Chrome, if a second active group is
  available without creating production test data.

Chrome automation could not enter `chrome://extensions`; an operator must complete the unpacked
installation and interaction steps. Strict packaging avoided unrelated user-owned untracked assets
by using a detached clean worktree; those assets were not copied, modified or packaged. The
automation limitation is not a product test pass.

## Known non-blocking risk

In the rare case where two open Popups accept the same persisted wheel result concurrently, the
second Popup can retain a stale in-memory participation summary until reopened. The Server decision
and persisted wheel session remain authoritative and prevent another draw. This is tracked as P3
and must be included in beta instructions; it does not relax the remaining rollout gates.

## Required sequence to reach GO

1. Reload the unpacked `0.3.0` Extension and confirm the approved group sees the wheel entry while
   normal recommendations remain usable.
2. Complete every applicable item in the
   [manual QA checklist](../docs/manual-qa/stage-7d.md), including real Chrome, keyboard, screen
   reader and reduced motion.
3. Observe candidate, reroll, exclusion and acceptance behavior for only the approved group, and
   retain flag-first rollback. Do not expand the cohort until the remaining manual checks pass.
