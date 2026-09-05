# Restaurant onboarding 0.4.0

Status: production verified and enabled for the three approved groups; 0.4.0 ZIP ready for internal distribution. Actual Chrome upgrade and colleague trial observations remain open.

This release implements the [restaurant onboarding design](../../specs/2026-09-04-restaurant-onboarding-design.md):
minimal single entry, pasted lists and selected Amap nearby results saved to the group's library.
See the [QA record](../../qa/2026-09-05-restaurant-onboarding.md) for checks and their limits.

## Package and runtime

- Extension version: `0.4.0`.
- Stable Extension ID: `bbkeaogleldgfnkgebdhdbiohlmonbkk`.
- Permissions: `alarms`, `notifications`, `storage`; exact existing production host only.
- ZIP: `artifacts/extension/chidianma-extension-0.4.0-internal.zip`, with matching `.sha256`
  and `.release.json` files. Built under Node `22.23.1` in a clean committed worktree.
- ZIP SHA-256: `5159f4564aa07cc3b5c22b8413c2ee77f63a759c31de288bb39d5fc1893093ed`.
- Runtime and package source: `96ea5b6a50442df938021e7bd802be3e98be7fb1`, fast-forwarded into
  `main` and pushed. The final documentation commit may be newer than this runtime identity.
- Enabled Railway deployment: `fa4353d5-9202-4414-bee5-9261fdf45192` (`SUCCESS`).
- Image digest: `sha256:e54c39eb60f18245fb10a7ae363732bd7aa962d2f0f9b343b810068944640dff`.
- Verified deployment with POI paused before restoration:
  `68625219-512d-43d0-9aaa-369e051fb2e5` (`SUCCESS` at verification), same source.
- Six completed migrations and all six database invariants verified before and after restoration.
- Pre-onboarding application baseline: `93ba021a-596e-402d-bc61-39ab25a39a8e`, source
  `0caee3d8e9a973d1131590e73954966b16719016`.

## Cohort and configuration

The user approved **TT和她的饭搭子们**, **冬冬，今天吃点嘛？** and **干饭天团**. Exact database IDs
were verified operationally; the similarly named TT和他的饭搭子们 and QA groups are excluded.
Bulk import, nearby search and POI save use separate server flags and exact allowlists.
The Amap Key and independent candidate-signing secret are configured. All three new flags are
enabled for exactly those three IDs; the excluded group's capabilities remain false. Existing
wheel configuration was compared with its original value and is unchanged, with one group enabled.

Each approved group passed real geocoding and search through authenticated production routes
(HTTP 200), plus duplicate-only import and durable receipt replay. Unauthorized access returned
401. The paused deployment denied geocoding/search with 403 while bulk import continued to work.
Restaurant contents, recommendation batches, feedback and group centers were unchanged by these
checks; only duplicate-import receipts were persisted. Positive real POI creation was verified
against the actual local API and PostgreSQL, without seeding production restaurants.

The initial enabled deployment at `7220344` exposed intermittent connection failures before any
Amap HTTP response. POI search/save were paused while bulk import stayed available. The reviewed
fix adds at most two retries for coded transient GET transport failures, with abortable 250/500 ms
backoff inside one eight-second deadline. HTTP/provider/data rejections are not retried. All three
groups passed the repeated production gate at the final source. This bounded smoke does not
establish long-term provider availability; no global Node networking setting was changed.

The specified office is 北京市朝阳区酒仙桥电子城国际总部6号楼. For address resolution, the verified
canonical form is 北京市朝阳区酒仙桥路6号院6号楼. Production group centers remain unset until each
administrator explicitly confirms a result. The three familiar-place samples were confirmed 3/3;
this is not a claim of complete search coverage.

## Migration and rollback

The additive `20260905010000_restaurant_onboarding` migration adds nullable group search-center
and restaurant source fields, group/source uniqueness and durable import receipts. Old restaurant
provenance stays null. Production seed is not part of this release.

If the trial fails, disable `RESTAURANT_BULK_IMPORT_ENABLED`, `POI_SEARCH_ENABLED` and
`POI_SAVE_ENABLED`, redeploy and wait for readiness and old-instance drain. Preserve imported
restaurants, receipts and lunch history. Keep the wheel configuration unchanged. If necessary,
restore the verified application deployment while retaining the active database: this migration
is additive, and application rollback must not silently switch to a stale database snapshot.
A database incident needs a separately verified restore decision; neither database is deleted.

## Distribution and follow-up

Use the [same-directory upgrade instructions](../extension-internal-distribution.md) to preserve
the existing identity. Actual Chrome load/upgrade could not be automated because the browser tool
blocks the extension-management page; the manual check remains open. Existing wheel human QA
and its one-group boundary remain open too.

Final automated verification: 956 tests across 95 files, including 10 native PostgreSQL tests;
full typecheck/build, Railway build, strict package and release checks passed. The reviewed
dependency tree has zero OSV findings. The [QA record](../../qa/2026-09-05-restaurant-onboarding.md)
records browser checks, transport remediation and remaining human evidence. No message or package
was sent to colleagues by the agent.

Local scripted acceptance built ten restaurants and generated the first three choices in 36.5
seconds. Colleague first-use timing, broader address/branch coverage and provider authorization
confirmation remain follow-up evidence. Later product work stays in the [roadmap](../../roadmap.md):
shared curated lists, daily conditions, actual-meal feedback, freshness and ZIP update notices.
