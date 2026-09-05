# 餐馆快速建库一期

Status: Approved for implementation by the user on 2026-09-04.

## Purpose and supersession

Deliver minimal restaurant entry, pasted lists, and real Amap nearby search plus explicit selected-result persistence to the three existing colleague groups in the same office area. The target is importing a prepared ten-restaurant list and generating recommendations in five minutes.

This specification supersedes Stage 7D.2's session-only search, no savable Amap draft, separate `spike/poi-reference-search`, and no-migration boundaries. The user explicitly chose real search and save in all three existing production groups, with provider authorization confirmation tracked as later work. This is the approved product/engineering trial scope; no provider permission confirmation is claimed. Keep the existing wheel rollout scope and outstanding manual QA.

## Entry and knowledge

- A restaurant entry is a group-owned place. Only its name is required; address distinguishes branches. A teammate recommendation is a separate, optional experience with a nonblank reason and optional dish. Neither means the member actually ate there today.
- Admin and Extension default to name/address. Additional fields are collapsed. An explicit optional recommendation section requires a reason only when enabled. Name-only submission never fabricates a Recommendation row.
- Preserve the existing lost-response recovery, including correct restaurant identity and safe retry when no recommendation is requested.
- Active newly listed restaurants are eligible for the existing candidates. Without teammate recommendations, communicate `新收录，尚无同事推荐`. Unknown prices/walking minutes remain unknown and earn no corresponding score. Do not call listing evidence of popularity or actual dining.
- Saving does not create/refresh a recommendation batch. Offer the existing generate/refresh action after success. Existing wheel result, reroll limits, pending acceptance and group/session boundaries remain authoritative.

## Paste and nearby user flows

- Admin restaurant library offers single entry, pasted list and nearby search. Paste accepts one name per line or two tab-separated columns (name/address), at most 60 nonempty rows. Editable preview, per-row selection, duplicate/ambiguous/error states precede explicit save.
- Existing records are skipped, never overwritten/reactivated. Same-provider place ID wins duplicate detection, then normalized name plus address. Same name with insufficient address is ambiguous; require address or an explicit separate-branch confirmation. Existing same-name/address rows including blank addresses count as duplicates.
- After import show created/existing/rejected per row; allow corrected rejected rows to be submitted again without recreating successes.
- Nearby search: confirm center → explicit search → explicit pagination → select → preview → save. Default radius 3000m, range 500–5000m; 20 results/page, pages 1–3 only.
- Admin sets a reusable group search center from an explicit Amap address-resolution result. Members may use a temporary resolved address. Center is GCJ02 and independent of the existing weather-office coordinates whose provenance is unknown.
- Display name/address/provider category/straight-line meters and Amap attribution. Straight-line meters must never be written into `distanceMinutes`. Price, walking time, dish and teammate reason are not inferred from POI data.
- Extension has minimal single entry and links into the Admin hash router with group ID and `bulk`/`nearby` intent; no credentials in the URL. Admin independently validates its identity and target membership and retains the requested destination through existing login/identity linking.
- Cancel/close/search failure writes no restaurants. Discard responses after cancellation, query or group change. Selected rows persist across pages of one search, but clear when group/center/query changes.

## Interfaces and persistence

Shared contracts live in `packages/shared`. Add group-scoped POST endpoints `/poi/geocode`, `/poi/search`, `/restaurants/import` beneath `/api/groups/:groupId`. Extend the current group settings API for a nullable search center; group admin writes and active members read it.

- Add `restaurantBulkImport` to capabilities and implement existing `poiReferenceSearch`, `poiReferenceDraft`, `poiOfficePreset`, `poiProvider` semantics for this trial. Older clients remain compatible.
- Environment flags independently gate bulk import, POI search and POI save with precise group allowlists and false/empty defaults. Amap key is server-only. Use Mock for deterministic development/tests and Amap v3 geocode/around (`types=050000`, `extensions=base`, `sortrule=distance`, `offset=20`) for live verification.
- POI results have normalized necessary fields and a short-lived signed import ticket bound to group, membership and identity authorization version. Use an independent signing key/domain from bearer sessions. Validate type, expiry, signature and active membership; tokens are not authorization substitutes. Tickets expire after 30 minutes. Do not accept client-fabricated provider identity/coordinates.
- Save only selected normalized name/address and optional source platform/place ID/category/GCJ02 coordinates/import time. No full response persistence or raw provider logging. Old restaurant provenance remains null. Enforce uniqueness of `(groupId, sourceProvider, sourcePlaceId)` for sourced restaurants.
- Persist each import receipt with group, membership, caller request ID, canonical request hash and per-row result. Replaying the same request returns its original result after current authorization/capability checks, including after a response loss or restart; different content with the same ID returns conflict. Return stored successful receipts before rejecting now-expired tickets for that same request.
- Serialize competing imports within a group, deduplicate against current DB state, create valid rows and the receipt in one transaction. Invalid/duplicate rows are reported while valid rows commit. A database failure rolls back all new rows and its receipt. A retry uses the same request ID until an outcome is known; corrections use a new request ID.
- All active members may contribute/import. Retain creator/admin editing and admin-only status changes. Do not expose another group's existing restaurant identity in duplicate results.
- Use additive migrations for search-center fields, optional restaurant provenance, source uniqueness and receipts. Preserve old data, relationships and release rollback compatibility.

## Verification and rollout

Use TDD for new behavior and independent task/whole-branch review. Cover optional entry recovery; list parsing/ambiguous branches; repeat/concurrent import and rollback; provider normalization; signed ticket tampering/expiry/cross-group/reset; disabled routes and unauthorized membership; query cancellation/pagination; new-listing reasons; unchanged batch/wheel/old client behavior.

Rehearse all migrations and parallel/replayed imports against disposable real PostgreSQL. Run relevant package checks, then full tests/typecheck/build, Railway build, documentation, artifact, secret and strict Extension packaging checks. Release Extension 0.4.0 with its stable ID and existing permissions. Verify actual Admin/Extension interaction where supported, recording any operator-only checks honestly.

Deploy compatible server/schema with features disabled, verify readiness/revision, then enable for exactly the existing three colleague groups after smoke checks. Never assume all database groups are cohort groups. Keep wheel flags unchanged. Record search success/failure and import counts without keys/raw results. Feature flags stop new search/import; do not delete imported/history data on rollback.

Actual cohort timing, coverage and address/branch accuracy are measured with colleagues' familiar restaurant samples; automated tests do not stand in for those observations.

## Deferred sequence

After this branch is complete and merged: cross-group selected lists; same-day conditions; actual dining/revisit/queue feedback; place freshness and facade photos; in-product ZIP update notifications. Do not prebuild these tables or screens. Provider authorization confirmation remains an explicit follow-up.
