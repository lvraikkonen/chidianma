# Task 3 Admin bulk and nearby onboarding report

Date: 2026-09-05
Status: DONE; independent browser QA is owned by Root and was restarted after the final preview fix.

## Commit and scope

- `3a599da` — `feat(admin): add restaurant bulk and nearby onboarding`

The commit contains only Admin implementation/tests. The two pre-existing untracked image assets remain untracked and unchanged. No Extension, server, environment, provider-key, database, dependency, wheel or release files were changed.

## Implemented behavior

The existing restaurant library now embeds a focused quick-onboarding panel while preserving the existing single-entry modal and restaurant management behavior.

- Paste mode uses shared `parseRestaurantPaste`, accepts name-only or name/address TSV, exposes the original stable line IDs, displays all preview errors, supports row editing and row selection, and blocks saving over 60 nonempty rows.
- Preview compares rows with the already-loaded group restaurant list using shared NFKC/trim/whitespace/lowercase normalization. Exact same-name/address records, including blank addresses, are labeled duplicate and default skipped. A same name with insufficient address is labeled ambiguous and default skipped until the user supplies a distinct address or confirms a separate branch. Existing rows are never overwritten or reactivated.
- Imports use exact request payload objects. A network/unknown outcome retains the original request ID and payload and retries the same object. Corrections receive a new ID and include only rejected row IDs. Successful/existing results remain visible when corrected rejected rows complete.
- Result UI distinguishes created, existing/skipped and rejected rows. Input remains mounted through recoverable failures. A successful create reloads only the restaurant list and offers the existing Today generate/refresh destination; it never invokes recommendation refresh itself.
- Nearby mode resolves an explicit address, displays provider resolution choices, and requires a chosen center before search. Admins can save that confirmed GCJ02 center in group settings; members use the same choices temporarily without a settings write. The saved search center remains independent from weather-office coordinates.
- Nearby search defaults to 3000 meters, clamps explicit input to 500–5000, uses explicit pages 1–3 and preserves selection across pages within one group/center/trimmed-query/radius configuration. Center, group or query changes immediately make old results unsubmittable and then clear them. Active geocode/search requests are aborted where possible, and late responses are ignored.
- POI rows show only provider name/address/category, returned attribution and straight-line meters. The save preview states that price, walking time, dish and teammate experience are not inferred. Signed tickets stay opaque and the client sends only `{ rowId, kind: "poi", ticket, confirmSeparateBranch? }`.
- Capability handling is independent: bulk is enabled only when optional `restaurantBulkImport === true`; POI search and POI save use `poiReferenceSearch` and `poiReferenceDraft` separately. Missing/false capabilities remain disabled.
- Membership/session errors enter the existing auth recovery path. Component lifetime and group checks prevent late old-group calls from mutating the new group view or triggering its restaurant reload.
- Restaurants without teammate recommendations now use the approved copy `新收录，尚无同事推荐`.

## Route and Task 4 handoff

The canonical destination is:

```text
#restaurants?groupId=<URL-encoded-group-id>&mode=bulk
#restaurants?groupId=<URL-encoded-group-id>&mode=nearby
```

Reusable exports live in `apps/admin/src/app/router.ts`:

- `parseRestaurantRouteIntent(hash)` returns `{ groupId?, mode? }` only for the restaurant route and accepts only `bulk | nearby` modes.
- `formatRestaurantRoute(intent)` produces the canonical credential-free hash above.
- `navigateRestaurants(intent)` writes that hash.
- `resolveRestaurantDestination(intent, groups, activeGroupId)` returns `none | ready | switch | unauthorized` and only requests switching to a group present in the server-validated membership list.

The Admin retains this hash through identity/login recovery. Once the identity's memberships load, it refreshes a group session for a known target. An unknown target shows an unauthorized state and neither fetches target restaurant data nor joins it. Manual group switching updates the `groupId` in the route while retaining the requested mode. No identity/session/invite credentials are parsed or emitted in this route.

## Client contracts

`apps/admin/src/clients/onboarding.ts` uses the active group bearer context and Task 2 shared route builders:

- `getOnboardingCapabilities` → `GET GROUP_ROUTES.capabilities(groupId)`
- `getOnboardingSettings` → `GET GROUP_ROUTES.settings(groupId)`
- `patchSearchCenter` → `PATCH GROUP_ROUTES.settings(groupId)` with `{ searchCenter }`
- `geocodePoi` → `POST GROUP_ROUTES.poiGeocode(groupId)`
- `searchPoi` → `POST GROUP_ROUTES.poiSearch(groupId)`
- `importRestaurants` → `POST GROUP_ROUTES.restaurantImport(groupId)`

All calls use the existing `requestJson` 401 renewal and safe error handling. Search/geocode pass `AbortSignal` through the captured request context. The import client serializes the controller's original payload without normalization or reconstruction.

## TDD evidence

### Initial route/client/controller RED

Command:

```bash
pnpm --filter @lunch/admin exec vitest run tests/router.test.ts tests/onboardingClient.test.ts tests/onboardingModel.test.ts
```

Expected RED: the onboarding client and model modules did not exist; query-bearing restaurant hashes resolved to `today`; `formatRestaurantRoute` was missing. Vitest reported two failed suites plus two route failures. GREEN after the minimal client/router/controllers: 3 files, 14/14 tests passed.

### Markup/capability RED

Command:

```bash
pnpm --filter @lunch/admin exec vitest run tests/onboardingModel.test.ts tests/onboardingMarkup.test.tsx
```

Expected RED: `RestaurantOnboardingPanel` and `availableOnboardingModes` did not exist. Vitest reported the missing module and one missing-function failure. GREEN after capability-gated presentation components: 2 files, 7/7 tests passed.

### Browser-discovered preview/copy RED

Root's first browser pass pasted ten new TSV rows, a known name-only duplicate, a known same-name branch with insufficient address, and a malformed three-column row. The malformed row was disabled, but both known records remained selected without hints. Hot reload cleared that preview before any save, so this pass wrote no database rows.

The regression tests were added before the fix:

```bash
pnpm --filter @lunch/admin exec vitest run tests/onboardingModel.test.ts tests/onboardingMarkup.test.tsx tests/restaurantMarkup.test.tsx
```

Expected RED: 3 failures showed missing `duplicate`/`ambiguous_branch` classifications, an incorrect selected count of 2 instead of 1, and old `还没有具体推荐` copy. GREEN after normalized local classification/default skipping and copy alignment: 3 files, 16/16 tests passed.

## Final verification

- `pnpm --filter @lunch/admin test` — 22 files, **104/104 passed**.
- `pnpm --filter @lunch/admin typecheck` — passed.
- `pnpm --filter @lunch/admin build` — passed; Vite transformed 63 modules and emitted the production Admin bundle.
- `pnpm --filter @lunch/shared test` — **65/65 passed**.
- `pnpm --filter @lunch/shared typecheck` — passed.
- `pnpm --filter @lunch/shared build` — passed.
- `git diff --check` — passed before the implementation commit.

## Changed files

- App integration/routing: `apps/admin/src/app/App.tsx`, `apps/admin/src/app/router.ts`
- Client: `apps/admin/src/clients/onboarding.ts`
- Focused controller/presentation: `apps/admin/src/features/restaurants/onboardingModel.ts`, `apps/admin/src/features/restaurants/RestaurantOnboardingPanel.tsx`
- Existing page/copy and responsive styling: `apps/admin/src/pages/RestaurantsPage.tsx`, `apps/admin/src/styles.css`
- Tests: `apps/admin/tests/onboardingClient.test.ts`, `apps/admin/tests/onboardingMarkup.test.tsx`, `apps/admin/tests/onboardingModel.test.ts`, `apps/admin/tests/router.test.ts`, `apps/admin/tests/restaurantMarkup.test.tsx`

## Self-review and remaining validation

Self-review checked the approved flow against the implementation, including independent gates, payload/request identity, result merging, stale-response boundaries, source-ticket opacity, branch handling, route membership resolution and no automatic recommendation refresh. The initial self-review added an explicit POI save preview and guards that make stale center/query results unsubmittable. Root's first browser pass then exposed and drove the local duplicate/ambiguous preview fix above.

No known automated correctness issue remains. Root still owns the final browser pass against the local migrated UI database, including real click behavior, page-2/3 selection, member temporary-center behavior and auth destination handoff. Live Amap was not called by this task; provider authorization remains deferred and the live key/provider smoke remains Root's responsibility. No dependency maintenance or full-monorepo/release check was performed here because those remain later Task 4/Root gates.
