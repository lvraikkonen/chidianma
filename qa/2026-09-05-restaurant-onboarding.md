# Restaurant onboarding 0.4.0 — verification

Status: local verification complete; final review, strict package and production rollout pending.

Scope: [approved design](../specs/2026-09-04-restaurant-onboarding-design.md) and
[implementation plan](../plans/2026-09-04-restaurant-onboarding.md). Feature base `881b893`;
dependency-maintenance head `7f01a8e43fc2b1d0fe09fa9243922f5e6a603c2d`.
Production and package identities will be recorded in the
[release record](../docs/releases/restaurant-onboarding-0.4.0-2026-09-05.md).

## Implementation and review

- Admin and Extension require only a restaurant name; address and extra details are optional.
  A separate recommendation is opt-in, requires a nonblank reason and permits no dish.
- Admin provides editable pasted-list previews, duplicate/branch checks and per-row outcomes;
  recovery retains the original request and known successes while correcting failed rows.
- Nearby search has explicit address selection, GCJ02 centers, independent search/save gates,
  three explicit pages, source attribution and signed candidates. Imported source fields never
  supply a price, walking time or colleague recommendation.
- PostgreSQL stores source identity and atomic, durable import receipts. Existing restaurants,
  statuses, recommendation batches and wheel session behavior remain compatible.
- Extension 0.4.0 adds capability-gated Admin links with group/intent only and preserves the
  stable ID, permissions and saved-identity storage contract.
- Each implementation task received a separate spec/quality review. The reviews led to fixes for
  whitespace reason validation before writes, Mock field bounds, recovery controls and outcomes,
  retained POI saving when search is disabled, branch selection and Extension link context guards.

## Automated checks

The maintenance slice ran the following on the final dependency tree. All completed successfully.
No lint or CI-workflow run is claimed.

| Check | Result |
| --- | --- |
| `ONBOARDING_TEST_DATABASE_URL=<explicit local test DB> pnpm test` | 937 tests / 93 files: shared 65, Admin 112, Extension 412, Server 348; includes 10 real PostgreSQL tests |
| `pnpm typecheck` / `pnpm build` | All four packages pass |
| `pnpm build:railway` | Shared → Admin → Prisma generation → Server succeeds |
| `pnpm --filter @lunch/extension build:dev` | Pass |
| `STAGE7C_REQUIRE_ARTIFACTS=0 pnpm check:stage7c-release` | Dev/internal profiles, icons, stable ID, exact host and runtime checks pass; this pre-package run does not claim ZIP validation |
| `pnpm check:docs` | Pass before this QA consolidation; rerun required for final docs |
| `pnpm check:release-artifacts` / `pnpm check:release-secrets` | Pass; no legacy runtime residue |
| Frozen offline install / Prisma generate / Prisma validate | Pass |
| Static hosting and Railway contract tests | 7 pass, including Admin cache behavior, API precedence and missing-build failure |
| Disposable database verifier | All six invariants pass |

Native PostgreSQL 15 ran on a loopback-only disposable endpoint. Only the dedicated backend test
database was recreated, applying the five prior migrations before legacy fixtures and the new
`20260905010000_restaurant_onboarding` migration. Tests verify null old provenance, independent
search centers, source uniqueness, concurrent deduplication, receipt replay through a new client,
authorization, and atomic rollback of both restaurants and receipt. The separate browser QA
database was preserved. Docker was unavailable; the Docker-only historical Stage 6 wrapper was
not run. Native PostgreSQL tests and the actual Prisma CLI exercised this release's migration.

## Browser and real-service checks

Admin was tested in the in-app browser against the actual local API and PostgreSQL, using both
Mock and Amap providers. These are scripted checks, not observations of colleagues using Chrome.

| Flow | Observed result |
| --- | --- |
| Name-only entry | One active restaurant, zero recommendations, null price/walking time |
| Optional reason without dish | One recommendation; whitespace-only reason rejected before any restaurant write; correction succeeds |
| Explicit daily generation | Saves leave the current batch unchanged; Generate/Refresh creates the next batch and retains history |
| Paste preview | Ten valid rows save; exact duplicate skipped, insufficient branch address requires confirmation, three-column row rejected |
| Lost response | A local proxy commits the API write then drops its response; normal save is disabled and original-request retry creates no duplicate even after preview edits |
| Partial success and correction | One success is retained; only the corrected rejected row is resubmitted under a new ID; loss/retry of that response retains both receipts and does not recreate the first success |
| Nearby pagination | Twenty rows per page; selections from pages 1, 2 and 3 remain selected; page 3 cannot load page 4 |
| Search center | Explicit administrator selection/save survives reload; member PATCH is denied by the actual API |
| Selected POI save | One existing source is preserved and two new Mock places save; real Amap source separately saves through the actual API |
| Group deep link | Admin switches to its own authorized target membership; an unknown target shows an access error |
| Narrow layout | At 390 CSS pixels the nearby flow has no horizontal document overflow |

An empty disposable group started with zero restaurants and zero batches. A prepared ten-name
list was pasted, previewed and saved, then the first recommendation batch was explicitly generated
in **36,506 ms**. Database checks found ten restaurants, zero colleague Recommendation rows and
one current batch with three choices. Cards displayed `新收录，尚无同事推荐`, `步行时间未知` and
`人均价格未知`. This meets the scripted five-minute target; actual colleague first-use timing is
still pending.

The real Amap HTTP smoke saved 大王家面·饭 with the selected necessary source fields and GCJ02
coordinates. Its 285 m straight-line distance did not become walking minutes. Price and walking
time remained null and no recommendation was fabricated. Unauthorized requests, member center
writes, page/radius bounds and tampered tickets were rejected. Replaying the original request
returned the same result, including after restarting the API process; recommendation batches did
not change.

Manual browser coverage did not include login destination retention or every late-response race;
those have controller/routing tests. No production fault injection or production test-data seeding
was performed.

Captured local evidence: [first recommendation](assets/restaurant-onboarding-0.4.0/first-build-today.png),
[partial correction recovery](assets/restaurant-onboarding-0.4.0/correction-recovery.png), and
[390px nearby flow](assets/restaurant-onboarding-0.4.0/nearby-mobile.png).

## Real address and familiar-place samples

User-specified address: **北京市朝阳区酒仙桥电子城国际总部6号楼**. Amap resolved that wording only
to the street, so it was not silently adopted as a group center. The explicit canonical variant
**北京市朝阳区酒仙桥路6号院6号楼** returned the selected precise result at
**GCJ02 116.491188, 39.981389**; another result was shown and excluded. This was a QA search
center only. Each production group's administrator still confirms and saves its own search center.

At the default 3 km radius, three explicit calls returned 20 places each, with 60 unique POI IDs
and no page overlap. This is a bounded result sample, not the total number of nearby restaurants.

The user confirmed all three samples correspond to the groups' familiar restaurants:

| Approved group | Confirmed place and branch address |
| --- | --- |
| TT和她的饭搭子们 | 大王家面·饭 — UBP恒通商业园B15号楼东1层 |
| 冬冬，今天吃点嘛？ | 米村拌饭（酒仙桥新辰里）— 酒仙桥路12号新辰里B1 |
| 干饭天团 | 塔斯汀（朝阳万红路店）— 万红路5号5号楼1层1003号 |

Result: **3/3 confirmed, one sample per group**. This does not establish overall search coverage.
The fuzzy query “798食堂” returned unrelated 798-area matches and remains unconfirmed; it was not
imported as a verified place. Record broader coverage, branch/address errors and actual time with
the three groups during their trial.

## Dependency disposition

The old tree failed the required scan with 11 high and 3 medium production findings. The bounded
maintenance keeps Fastify 5 and Prisma 6.19.3, updates the affected packages, and preserves the
existing behavior checks. Final resolutions include Fastify 5.12.3, static 10.1.3, Vitest 3.2.7,
Vite 6.4.3 and sharp 0.35.0. The regenerated PNGs have identical decoded RGBA pixels.

`@prisma/config>deepmerge-ts: 8.0.0` is scoped to the actual Prisma CLI caller, which uses
`deepmerge` on configuration objects, not `deepmergeInto` or Map-valued configuration. Generate,
validate, migration and transaction tests pass. Revisit the override when a compatible Prisma
parent includes the fix. The Vite override keeps Vitest's broad supported range on the current
Vite 6 toolchain; the obsolete static→glob 11 override was removed for static's declared glob 13.

Official OSV-Scanner **v2.4.0**, verified SHA-256
`088119325156321c34c456ac3703d6013538fd71cbac82b891ab34db491e4d66`, rescanned 327 packages:
full report `results: []`. The unchanged production classifier inspected 111 package versions:
critical 0, high 0, medium 0, low 0. No development or production exception remains.

## Remaining human and operational evidence

- Actual Chrome 0.4.0 load, Popup/Options interaction and same-directory upgrade remain pending.
  The connected Chrome browser tool rejected `chrome://extensions/` under its URL security policy;
  no bypass was attempted and no installed extension was changed. Automated packaging/storage
  tests do not replace this manual check.
- Wheel mode locking, acceptance, non-target UI, keyboard, screen-reader and reduced-motion QA
  remain open in the [wheel record](2026-07-22-controlled-colleague-beta-stage7d-wheel.md).
  Onboarding approval does not expand the wheel's single-group rollout.
- Actual three-group first-use timing and broader place coverage remain trial observations.
- Provider authorization confirmation is deferred by the user's approved design.
- Strict ZIP, whole-branch review and production rollout are pending in this pre-release record.
