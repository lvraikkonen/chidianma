# Stage 7D.1 幸运餐厅大转盘 QA

Status: `NO-GO — source, automation and package gates pass; manual and deployment gates remain`

Date: 2026-07-22

## Scope and decision

本记录覆盖 `feat/lucky-restaurant-wheel` 的 Stage 7D.1 第六小节验证快照。源码、
全仓自动化和严格 `0.3.0` 打包门禁已经通过；当前 rollout 决定仍为 **NO-GO**：
验证包不得分发给同事，不得部署或开启 cohort，直到真实 Chrome、辅助技术和
flags-off 部署门禁完成。Stage 7D.0 基线、生产 runtime 和 rollback 点没有变化。

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
- Current production remains Railway deployment
  `03d744f6-a5bd-486c-ba65-3541dbfe9096`, source
  `e9912c9cc72e237b0baa1aa922b3f49c5473f66a`.
- Extension source candidate: `0.3.0`; stable ID
  `bbkeaogleldgfnkgebdhdbiohlmonbkk`.
- No Prisma migration, Manifest permission expansion or new persistent event table.
- Sanitized production inspection found Stage 7D variables unset/empty, so wheel and POI remain
  off. No cohort group ID has been approved.

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
approved colleague distribution. Stage 7D production verification remains separate.

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

## Exit checks not completed

- [x] All three source findings are reviewed and their regression tests pass.
- [x] Full root `pnpm test`, `pnpm typecheck` and `pnpm build`.
- [x] Strict, clean-worktree `0.3.0` Extension package with checksum.
- [ ] Real Chrome unpacked install/upgrade, keyboard and visual QA.
- [ ] Real screen reader announcement and reduced-motion QA.
- [ ] Server deployment with both wheel flags off.
- [ ] Deployed `/api/health`, `/api/ready`, revision and read-only database verifier.
- [ ] Explicit cohort group approval and allowlist test.

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

1. Deploy Server with flags off; verify health, readiness, revision and database state.
2. Complete every applicable item in the
   [manual QA checklist](../docs/manual-qa/stage-7d.md), including real Chrome, keyboard, screen
   reader and reduced motion.
3. Obtain an explicit cohort group ID approval, enable only that group, observe results, and retain
   flag-first rollback.
