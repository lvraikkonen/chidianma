# Restaurant onboarding 0.4.0

Status: release candidate; final review, strict package and production rollout pending.

This release implements the [restaurant onboarding design](../../specs/2026-09-04-restaurant-onboarding-design.md):
minimal single entry, pasted lists and selected Amap nearby results saved to the group's library.
See the [QA record](../../qa/2026-09-05-restaurant-onboarding.md) for checks and their limits.

## Package and runtime

- Extension version: `0.4.0`.
- Stable Extension ID: `bbkeaogleldgfnkgebdhdbiohlmonbkk`.
- Permissions: `alarms`, `notifications`, `storage`; exact existing production host only.
- Strict ZIP, checksum and metadata identity: pending.
- New Railway deployment, revision and migration evidence: pending.
- Current pre-onboarding runtime: `93ba021a-596e-402d-bc61-39ab25a39a8e`, source
  `0caee3d8e9a973d1131590e73954966b16719016`.

## Cohort and configuration

The user approved **TT和她的饭搭子们**, **冬冬，今天吃点嘛？** and **干饭天团**. Exact database IDs
were verified operationally; the similarly named TT和他的饭搭子们 and QA groups are excluded.
Bulk import, nearby search and POI save use separate server flags and exact allowlists.
The Amap Key and independent candidate-signing secret were staged securely without deployment;
all three new flags remain off at this point. Existing wheel configuration is unchanged.

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

Local scripted acceptance built ten restaurants and generated the first three choices in 36.5
seconds. Colleague first-use timing, broader address/branch coverage and provider authorization
confirmation remain follow-up evidence. Later product work stays in the [roadmap](../../roadmap.md):
shared curated lists, daily conditions, actual-meal feedback, freshness and ZIP update notices.
