# Operations

Status: current as of 2026-07-15.

## Production inventory

- Railway project/service: `remarkable-reverence / @lunch/server`.
- Production URL: `https://lunchserver-production.up.railway.app`.
- Runtime implementation baseline: `1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9`.
- Current Railway revision: `32d414a289c57d6ce0488448e612e8943b446a31`
  (only Stage 6 documentation differs from the runtime baseline).
- Current Railway deployment: `c85ac2ab-b43a-42d6-9b55-cf75322ff993`.
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

The Stage 6 QA identities, groups, restaurants and behavior records remain as clearly named Demo/
smoke fixtures. They are isolated by group and preserve active Admin invariants. Stage 7A does not
run a production cleanup script. Re-evaluate before expanding beyond the first beta cohort.

## Logging and monitoring

Fastify already emits structured Pino request logs and readiness failures without request headers.
Stage 7B adds safe business context to important Server failures. Stage 7D adds alerting and
privacy-bounded reminder delivery/failure observation. Never log Authorization headers, identity/
group tokens, invite values, session secrets or database URLs.

## Incident entry points

- [Rollback](runbooks/rollback.md)
- [Reminder not firing](runbooks/reminder-not-firing.md)
- [Migration failure](runbooks/migration-failure.md)
- [Suspected group-isolation breach](runbooks/suspected-isolation-breach.md)
