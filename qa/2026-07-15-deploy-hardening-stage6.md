# Stage 6 Deploy Hardening QA Handoff

Status: `Passed`

Date: 2026-07-15

Branch: `main`

Tested implementation commit and deployed revision:
`1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9`

Railway project/service: `remarkable-reverence / @lunch/server`

Railway deployment: `10f427de-858e-42f1-8c0c-23194180d4d8`

Production URL: `https://lunchserver-production.up.railway.app`

Fresh PostgreSQL service: `Postgres-W12K`

Chrome: `150.0.7871.125` on macOS

## Release Boundary

- The production Server now hosts the built Admin from the same origin, while
  preserving JSON API precedence and 404 behavior for unknown routes.
- Railway uses Node `22.23.1` and pnpm `9.15.0` for the deterministic Shared →
  Prisma generate → Admin → Server build.
- Pre-deploy runs the sanitized environment check, all Prisma migrations, and
  the read-only database verifier. Production seed is not run.
- The application uses the new sibling PostgreSQL service. The previous
  `Postgres` service remains intact as the short-term rollback database.
- No invite code, token, session secret, or connection string is recorded in
  this handoff.

## Automated Gates

| Gate | Result | Evidence |
| --- | --- | --- |
| Focused Stage 6 suites | PASS | Environment, readiness, static hosting, lifecycle, legacy migration, verifier, Admin legacy display, and Railway contract coverage passed. |
| `pnpm test` | PASS | Full monorepo command exited 0; the Stage 5 baseline of 562 tests did not regress. |
| `pnpm typecheck` | PASS | Shared, Server, Admin, and Extension passed. |
| `pnpm build` | PASS | Shared, Server, Admin, and Extension production builds passed. |
| `fnm exec --using=22.23.1 -- pnpm build:railway` | PASS | Railway build order passed under Node 22.23.1 and pnpm 9.15.0. |
| `pnpm check:stage6-artifacts` | PASS | Admin static output, minimal Extension permissions, and Railway config were valid; sensitive/frontend residue scan passed. |
| Stage 6 Docker migration rehearsal | PASS | Fresh deploy, two-batch legacy fixture, verifier repeatability, deterministic legacy ranks/scores, and atomic overlap abort passed on PostgreSQL 16. |
| Production dependency audit | PASS WITH MODERATE NOTES | pnpm 11 audit against the same lockfile reports 0 high/critical and 2 moderate `@fastify/static` advisories. pnpm 9's audit endpoint returns HTTP 410, so pnpm 11 was used only for the audit request. |
| `git diff --check` | PASS | No whitespace errors. |

## Railway Fresh Release

Verified:

- A new empty sibling PostgreSQL service was created without clearing or
  deleting the old database.
- Production variables passed the sanitized environment checker. A fresh
  high-entropy session secret was supplied without printing it; existing
  compatibility invite/read-token values were preserved without reading them.
- Railway detected `railway.json`, installed Node 22.23.1 and pnpm 9.15.0,
  completed the configured build, then ran all four migrations against
  `Postgres-W12K`.
- Pre-deploy database verification passed all six checks with count `0`.
- `/api/ready` passed the Railway health check before traffic promotion.
- The deployment reached `SUCCESS`, and readiness reports the exact expected
  commit revision.
- A second read-only verifier run inside the live Railway container after the
  Admin QA writes again passed all six checks with count `0`.

HTTP smoke results:

| Check | Result |
| --- | --- |
| `/` | HTTP 200 Admin HTML with `cache-control: no-store`. |
| `/index.html` | Served by the production Admin static host. |
| Hashed `/assets/*` | HTTP 200 with one-year immutable caching. |
| `/api/health` | HTTP 200 with the unchanged body `{"ok":true}`. |
| `/api/ready` | HTTP 200, database `ready`, revision `1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9`. |
| Unauthenticated protected API | HTTP 401 JSON. |
| Unknown `/api/*` | HTTP 404 JSON, never Admin HTML. |

Rollback remains available by selecting the previous deployment and restoring
the Server's database reference to the retained old `Postgres` service. The
old database must not be deleted without a separate destructive approval after
all Stage 6 gates pass.

## Production Admin QA

QA identity: `Stage6 QA 0715`

QA group: `Stage6 Railway QA`

Verified through the deployed root Admin:

- Created the first production identity and group through the product flow.
- The one-time invite was displayed. It was used only in the live QA session
  and is intentionally omitted here.
- Created three restaurants plus their first recommendations, including real
  cuisine, walking-distance, price, weather, weekday, tag, dish, and reason
  fields.
- Generated the current recommendation batch with three ranked choices.
- Live Open-Meteo data returned a Shanghai `hot` snapshot; weather, weekday,
  and distance signals produced explainable scores and reasons.
- Dashboard totals, recent activity, batch history, generator, algorithm
  version, weight snapshot, ranked items, and score components reflected the
  production writes.
- Updated and reloaded the group subtitle.
- Updated and reloaded the weekday-match weight from 20 to 21; the existing
  batch retained its historical weight snapshot as designed.
- Enabled the group-default conditional second reminder and confirmed the
  persisted setting after leaving and returning to the route.
- Rotated the one-time invite twice and confirmed the invite version advanced
  and the previous value was invalidated without recording either value.
- The members view showed the sole identity as the active Admin and correctly
  disabled last-Admin demotion/removal.
- After the Extension identity joined, promoted it to Admin and demoted it back
  to Member; both role transitions were reflected immediately.
- At a 390 × 844 viewport, Today, Restaurants, Dashboard, and Settings each
  had `scrollWidth === clientWidth === 390`; navigation and forms remained
  usable without horizontal overflow.

## Chrome Extension Production QA

Unpacked build: `apps/extension/dist`

QA identity: `Stage6 Extension QA`

Second QA group: `Stage6 Isolation QA`

Chrome security does not allow the automation layer to inspect or operate
`chrome://extensions` or `chrome-extension://` pages. The user loaded and
operated the final unpacked build, while Admin and database observations were
independently checked through supported production surfaces.

Verified:

- Set the Extension API host to the production Railway origin, created the
  second identity, and joined `Stage6 Railway QA` with the newly rotated invite.
- Admin independently showed the second active Member with zero initial
  contributions, proving the join reached the fresh production database.
- Created `Stage6 Isolation QA`, quick-added `QA Extension Bento` plus its
  first recommendation, and generated/read its current recommendation batch.
- Switching to the isolation group showed only its bento data. Switching back
  showed only the original three restaurants; switching again restored only
  the bento. Sessions, current batches, and cached recommendations did not
  cross group boundaries.
- In the original group, exercised `away`, then `joining`, submitted `want`
  feedback for `QA 轻食碗`, and decided on that restaurant.
- Extension personal history showed today's `QA 轻食碗` decision and the
  expected insufficient-data state after one decision.
- Admin independently reflected 1 of 2 members decided, one weekly decision,
  `QA 轻食碗` as the hot restaurant, one Extension feedback contribution, and
  the decision in both current and superseded batch history.
- With `Stage6 Isolation QA` active and nobody decided, a local override at
  21:07 delivered the primary notification after Service Worker DevTools and
  Extension pages were closed. The real second notification arrived exactly
  20 minutes later at 21:27.
- With the already-decided original group active, a 21:30 primary notification
  arrived under the same suspended-worker conditions. The 21:50 second-reminder
  boundary remained silent, proving the live decided suppression branch.
- The final Extension manifest retained only `alarms`, `notifications`, and
  `storage`, with the existing explicit localhost and Railway host permissions.

After all Extension writes, the live Railway database verifier again passed
all six checks with count `0`.

## QA Data And Cleanup

- The two named QA identities, the original QA group, the isolation group,
  their restaurants/recommendations/batches, one feedback, one decision, group
  subtitle/weight change, and reminder settings are intentionally retained as
  the internal-release smoke fixture. The product currently has no identity or
  group deletion flow; no unnamed or accidental fixture was created.
- The Extension identity remains a normal active Member of the original group
  and the active Admin of its own isolation group, so every retained group has
  an active Admin. The final database verifier confirms this invariant.
- Invite values and tokens were never written to this handoff. The latest
  invite remains valid only as an operational product value and was not copied
  into the repository.
- The old Railway `Postgres` service remains retained for rollback. Its deletion
  is a separate destructive action and is not part of this completed handoff.
