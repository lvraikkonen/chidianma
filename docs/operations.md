# Operations

Status: current as of 2026-07-22.

## Production inventory

- Railway project/service: `remarkable-reverence / @lunch/server`.
- Production URL: `https://lunchserver-production.up.railway.app`.
- Current Railway deployment: `93ba021a-596e-402d-bc61-39ab25a39a8e`.
- Current Railway image digest:
  `sha256:464ba4087f9a910ddb8d04d307295a22b7f26a68308ecdbe27b786e70d9bcffe`.
- Stage 7D.1 source commit: `0caee3d8e9a973d1131590e73954966b16719016`.
- `/api/ready` reports revision `0caee3d8e9a973d1131590e73954966b16719016`. Use the source
  commit, deployment ID and image digest as the artifact identity.
- Verified flags-off deployment `ce7eb120-824a-4e75-8cd4-9486ba62a71b` was superseded and
  removed after the enabled redeployment completed successfully.
- Immediate pre-Stage 7D application rollback deployment: `03d744f6-a5bd-486c-ba65-3541dbfe9096`.
- Deeper Stage 7B rollback deployment: `6d80eb52-d35a-4554-9d66-aa44dd2d6b1c`.
- Pre-Stage 7B variable-change rollback deployment: `2d3db6db-e1ab-41c2-86c0-edd2138dcc1a`.
- Pre-7B rollback deployment: `371242e7-9783-4866-aaa5-f4f26218ddcf`, commit
  `ad0260b4abf12b48bbc64e73020858ff316227f3`.
- Active database: `Postgres-W12K`.
- Retained rollback database: `Postgres`.

Service identifiers and names are operational metadata; credentials and connection strings remain
only in Railway variables.

## Health and readiness

- `GET /api/health`: shallow liveness, `{ "ok": true }`.
- `GET /api/ready`: real PostgreSQL probe plus deployed revision; returns sanitized 503 on failure.
- Unknown `/api/*`: JSON 404, never Admin HTML.

## Release lifecycle

1. Run tests, typechecks, builds, migration rehearsal, documentation and artifact checks.
2. `pnpm build:railway` builds Shared → Prisma client → Admin → Server.
3. `pnpm predeploy:railway` validates environment, applies migrations and verifies the database.
4. `pnpm start:railway` starts Fastify on `host: "::"` and Railway's port.
5. Railway promotes only after `/api/ready` succeeds.

Because the Server image includes the built Admin and Shared package, `railway.json` watch patterns
cover `apps/admin`, `apps/server`, `packages/shared` and the root pnpm/build configuration. Do not
reduce the watch scope to only `apps/server`; that would skip Admin-only or Shared-only releases.

Never run `prisma:seed` in production.

## Stage 7D beta capabilities

The Server is authoritative for beta availability. `GET /api/groups/:groupId/capabilities`
requires that group's bearer session and revalidates active membership on every request. The
Extension keeps the response only in the current Popup state and treats missing, invalid, 404 or
unavailable responses as all features disabled.

The lucky-wheel capability is enabled only when both conditions are true:

- `LUCKY_RESTAURANT_WHEEL_ENABLED=true`;
- `LUCKY_RESTAURANT_WHEEL_GROUP_IDS` contains the exact group ID in its comma-separated list.

Missing values resolve to `false` and an empty list. Wildcards are not supported. Wheel business
routes enforce the same Server predicate and do not trust UI visibility. POI capabilities remain
disabled in this Stage 7D.1 slice. No database or Chrome storage migration is involved.

As of 2026-07-22, the global wheel flag is enabled and the allowlist contains exactly one
operator-approved colleague group. The actual group ID remains only in Railway variables and must
not be copied into repository documents or routine logs. The Server-side exact-match predicate was
verified true for the target group and false for a non-target value. Browser confirmation and
accessibility QA remain pending; do not add another group until those checks pass.

## Database verification

The verifier checks unfinished migrations, cross-group relationships, duplicate current batches,
legacy batch/item count deltas and groups without an active Admin. It is read-only and emits named
checks/counts without connection details. It ran against fresh/legacy rehearsal databases and the
live database during Stage 6. Both the Stage 7D.1 flags-off deployment and the enabled single-group
redeployment passed all six checks with zero violations.

## Rollback and retained database

Stage 7D.1 has no database migration. Roll back the feature first by disabling the global flag or
removing the group allowlist entry and redeploying. If application rollback is still required,
restore deployment `03d744f6-a5bd-486c-ba65-3541dbfe9096` while keeping active database
`Postgres-W12K`; switching to the retained `Postgres` service requires a separate database-incident
decision. See [rollback runbook](runbooks/rollback.md).

The `Postgres` rollback service remains until Stage 7D completion plus 14 days, reviewed on
2026-08-15. It has no automatic deletion. Deleting it requires separate approval after backup/
restore confidence and verifier success.

## Demo/QA data

The Stage 6 QA identities, groups, restaurants and behavior records and the clearly named Stage 7B
production-smoke identity/group remain as Demo fixtures. They are isolated by group and preserve
active Admin invariants. Stage 7B does not run a production cleanup script. Re-evaluate before
expanding beyond the first beta cohort.

## Logging and monitoring

Fastify emits structured, allowlisted request logs. Recommendation refresh failures include safe
group/date/operation/retry/classified-database context. Headers, bodies, queries, display names,
Tokens, invite/link codes, raw Prisma messages and database URLs are forbidden. Stage 7D still owns
alerting and privacy-bounded reminder delivery/failure observation.

## Stage 7B rollout and support

The two-step Stage 7B production rollout completed successfully on 2026-07-16:

1. The two old Railway variables were retained while the new Server and migration were deployed.
2. Health/readiness, Admin static hosting, identity session/link endpoints, closed old APIs, Origin
   matrix, same-identity Admin/Extension linking and a no-write invalid-code rate-limit probe passed.
3. The Stage 7B migration and all six live read-only database verifier checks passed.
4. A separately approved variable change set `ALLOW_PUBLIC_GROUP_CREATION=false` and removed
   `TEAM_INVITE_CODE` plus `EXTENSION_READ_TOKEN`.
5. The final deployment repeated health/readiness, verifier, Admin hosting, Origin, legacy 404 and
   same-identity Admin/Extension smoke. A sanitized create-group probe returned
   `group_creation_disabled` without creating a group or membership.

Do not run real anonymization apply in production during 7B. Use Demo dry-run and a temporary
PostgreSQL database for write-command verification.

Operator commands and confirmation syntax are documented in
[`../apps/server/README.md`](../apps/server/README.md). Every command, including export, is dry-run
until `--apply` plus the exact printed confirmation; export then creates a new `0600` file. The default support target
for an export/anonymization request is seven days.

## Incident entry points

- [Rollback](runbooks/rollback.md)
- [Reminder not firing](runbooks/reminder-not-firing.md)
- [Migration failure](runbooks/migration-failure.md)
- [Suspected group-isolation breach](runbooks/suspected-isolation-breach.md)
