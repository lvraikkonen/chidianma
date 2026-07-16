# Operations

Status: current as of 2026-07-16.

## Production inventory

- Railway project/service: `remarkable-reverence / @lunch/server`.
- Production URL: `https://lunchserver-production.up.railway.app`.
- Current Railway deployment: `6d80eb52-d35a-4554-9d66-aa44dd2d6b1c`.
- Current Railway image digest:
  `sha256:dba6964449d3f8627c4188855fae15935e3c065313bccb074b664ce5a52133c7`.
- `/api/ready` reports revision `local` because the approved Stage 7B workspace was uploaded through
  Railway CLI before it was committed. The deployment ID and image digest are the artifact identity.
- Immediate pre-variable-change rollback deployment: `2d3db6db-e1ab-41c2-86c0-edd2138dcc1a`.
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

Never run `prisma:seed` in production.

## Database verification

The verifier checks unfinished migrations, cross-group relationships, duplicate current batches,
legacy batch/item count deltas and groups without an active Admin. It is read-only and emits named
checks/counts without connection details. It ran against fresh/legacy rehearsal databases and the
live database during Stage 6.

## Rollback and retained database

The forward Stage 6 migration is not reversed in place. Rollback restores the previous application
deployment and its previous database reference. See [rollback runbook](runbooks/rollback.md).

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
