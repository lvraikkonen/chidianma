# Stage 4B Admin Prototype UI Wiring QA

Date: 2026-07-14

Tested code commit: `9f55bbc94b7cab0e334a278a2e56b254985659d1`

Browser: Codex in-app browser (Chromium; the exact build number is not exposed by this environment)

Server URL: `http://localhost:3000`

- Admin ran from Vite at `http://127.0.0.1:5173`.
- Fastify listened on `[::]:3000` and used the real local PostgreSQL database.
- Local Prisma migration status reported three migrations applied and the schema up to date.
- Disposable QA fixtures used two identities, two groups, group-scoped restaurants,
  recommendations, daily batches, participation, and membership status changes.

## Automated Verification

| Command | Exit | Observed result |
| --- | ---: | --- |
| `pnpm --filter @lunch/shared test` | 0 | Vitest: 14 tests passed. |
| `pnpm --filter @lunch/server test` | 0 | Vitest: 157 tests passed. |
| `pnpm --filter @lunch/extension test` | 0 | Vitest: 175 tests passed. |
| `pnpm --filter @lunch/extension typecheck` | 0 | TypeScript completed without errors. |
| `pnpm --filter @lunch/extension build` | 0 | Vite production build completed. |
| `pnpm --filter @lunch/admin test` | 0 | Vitest: 58 tests passed. |
| `pnpm --filter @lunch/admin typecheck` | 0 | TypeScript completed without errors. |
| `pnpm --filter @lunch/admin build` | 0 | Vite production build completed. |
| `pnpm test` | 0 | Root regression passed: shared 14, Admin 58, extension 175, server 157 (404 tests total). |
| `pnpm typecheck` | 0 | Shared, Admin, extension, and server typechecks completed. |
| `pnpm build` | 0 | Shared, extension, Admin, and server builds completed. |
| Stage 4B production-residue `rg` scan | 1 | No legacy root API, static prototype, or deferred navigation matches, as expected. |

## Browser Fixture

- Identity A: `Stage4B QA Admin 0714`.
- Identity B: `Stage4B QA Member 0714`.
- Group A: `Stage4B QA Group A 0714`.
- Group B: `Stage4B QA Group B 0714`.
- One-time invite codes were displayed after each group create and consumed by
  the second identity; the codes are intentionally omitted from this report.
- Group A exercised no-batch/empty-library states and restaurant filtering.
- Group B exercised a ready batch, scoring, participation, ownership, status
  governance, and partial-success recovery.

## Browser State Coverage

| State | Result | Evidence / notes |
| --- | --- | --- |
| First identity, group create, one-time invite, second identity join | PASS | Identity A created Group A and saw its one-time code. Identity B joined Group A with it. |
| Authenticated create/join panel and another group | PASS | The shell opened the same create/join panel without disconnecting. Identity A created Group B and saw its code; Identity B joined both groups. |
| Create/join failure preserves identity and active group | PASS | Joining with an invalid invite kept Group A active and retained the identity while showing an inline error. |
| Returning identity list and fresh-session switch | PASS | A page restart restored the identity, listed both groups, and switched A/B only after the fresh group session response. |
| Failed group switch | PASS | With the server stopped, switching A to B failed while A remained selected and its prior state remained visible. |
| Stale Group A response after switching to B | PASS (automated) | `requestGate.test.ts` proves every new load invalidates earlier generations; group clients capture immutable group/token context. No manual delay proxy was run for this case. |
| No-current-batch generate and manual refresh confirmation | PASS | Group A generated from the no-batch state. Group B showed batch `#1`; refresh raised a native `confirm` and rendered batch `#2`. |
| Weather and score explanation | PASS | Browser showed Shanghai hot weather, temperature and precipitation, plus the complete weather/weekday/distance/teammate/recent/negative/total breakdown. Weather-unavailable rendering is covered by `todayMarkup.test.tsx`; it was not re-injected manually in Admin QA. |
| Participation groups | PASS | The ready view rendered joining/decided/away/undecided columns; after the second member joined, both members were represented in the undecided group. |
| Empty restaurant library and filters | PASS | Empty recovery CTA rendered. Search matched recommendation text; cuisine and active/paused/blocked filters updated real row counts and empty results. |
| Duplicate warning | PASS | Reusing the normalized name/area raised a native JavaScript dialog captured as `type: confirm`. The automation layer subsequently accepted it, creating a disposable duplicate fixture. |
| Two-step create partial recovery | PASS | A one-shot proxy failed only the first recommendation POST after restaurant creation. UI showed `餐厅已保存，推荐尚未保存` and `只重试保存推荐`; retry succeeded. Database verification returned exactly one restaurant and one recommendation for `Stage4B QA Retry Cafe 0714`. |
| Member ownership controls | PASS | Identity B could edit its own restaurant/recommendation, could add a recommendation to the other-owned restaurant, and could not edit the other member's restaurant/recommendation. |
| Admin status governance and member read-only status | PASS | Identity A exercised pause, restore, block, and restore. Identity B saw no status-governance controls. |
| Identity/session expiry | PASS | A temporary signing-secret change produced group 401 followed by identity 401 and returned the UI to identity entry with `身份连接已失效，请重新进入。`. Isolated group-session recovery is also covered by auth/model tests. |
| Removed membership | PASS | Identity B's Group B membership was temporarily changed to `removed`; reload cleared that group session and returned to group selection with only Group A. The membership was restored afterward. |
| Operation-level 403 | PASS (automated + UI boundary) | Auth tests prove owner/admin operation codes do not clear group identity/session. Browser ownership controls prevented unauthorized operations; no raw forbidden mutation was sent manually. |
| Desktop and narrow layout | PASS | Desktop shell was exercised throughout. At `390×844`, the shell became one column, sidebar became static, topbar stacked, and body width remained 390 px without horizontal overflow. |
| Stage 4-only navigation and real data | PASS | Only Today and Restaurants were present. No dashboard/history/members/settings links or static demo people, restaurants, weather, or prototype IDs appeared. |

## P0 / P1 Audit

| Review item | Result | Evidence |
| --- | --- | --- |
| P0.1 preserve one-time invite after create | PASS | Authenticated auth state carries optional `inviteCode`; controller and markup tests cover it; browser showed the code after creating both groups. |
| P0.2 authenticated create/join entry | PASS | AppShell exposes `创建/加入小组`; model tests prove failed create/join preserves identity and active group; browser covered failure and success. |
| P1.1 participation 401/403 | PASS | `loadTodayView` promotes participation membership failures to `session-expired`/`forbidden`; dedicated 401 and removed-member tests pass. |
| P1.2 Task 8 wording | PASS | Plan now says `Run auth tests and verify PASS`. |
| P1.3 expanded residue scan | PASS | The plan and Completion Gate scan include legacy root APIs, prototype values, deferred selectors/routes, and return no production matches. |
| P1.4 optional Railway smoke / Stage 6 boundary | PASS | Optional Railway dev API smoke is documented but was not run. README and roadmap continue to defer static Admin hosting to Stage 6. |

## Completion Gate

- Returning identities, authenticated create/join/list/switch, one-time invite,
  and failed-operation preservation are verified.
- Today no-batch, ready, refresh, empty, participation, session-expired,
  membership-forbidden, retry, and stale-request states are verified by browser
  evidence and/or deterministic tests noted above.
- Restaurant filtering, duplicate warning, ownership, status governance, and
  partial-success retry are verified.
- Stage 4 navigation contains only Today and Restaurants.
- Stage 4A remains green in the full shared/server/extension/Admin/root regression.
- Both Stage 4A and Stage 4B QA reports contain actual execution evidence.

Result: **PASS**. Stage 4 is ready to be marked Done and Stage 5 is ready for planning.

## Known Issues / Deferred Work

- The in-app browser does not expose its exact Chromium version; DOM evidence
  and interaction notes are recorded instead.
- Optional Railway dev API smoke was not run for Stage 4B. It is supplemental,
  not an acceptance blocker.
- Static Admin hosting remains intentionally deferred to Stage 6.
- Git reports pre-existing unreachable loose objects and disables automatic GC
  until `.git/gc.log` is addressed. This is repository maintenance, not a
  Stage 4 product failure; no destructive prune was performed.
