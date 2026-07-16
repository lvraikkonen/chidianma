# Server

Fastify API and production Admin host for 中午吃点啥. PostgreSQL through Prisma
is the source of truth.

## Local development

```bash
cp apps/server/.env.example apps/server/.env
pnpm --filter @lunch/shared build
pnpm --filter @lunch/server prisma:generate
pnpm --filter @lunch/server prisma:migrate
pnpm --filter @lunch/server dev
```

The example values are development-only. Never copy them into Railway.

## Environment

The schema is defined in `src/env.ts`.

| Variable | Purpose | Requirement |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection | Required |
| `TEAM_INVITE_CODE` | Legacy single-team compatibility only | Required until Stage 7B removes the legacy surface |
| `SESSION_SECRET` | Signs identity and group-session tokens | Required; at least 32 characters in production |
| `EXTENSION_READ_TOKEN` | Legacy unscoped read compatibility only | Required until Stage 7B removes the legacy surface |
| `ALLOW_PUBLIC_GROUP_CREATION` | Enables identity holders to create groups | Explicitly required in production |
| `IDENTITY_TOKEN_TTL_DAYS` | Identity-token lifetime | Explicitly required in production |
| `GROUP_SESSION_TTL_DAYS` | Group-session lifetime | Explicitly required in production |
| `WEATHER_API_BASE_URL` | Server-side weather endpoint | Explicitly required in production |
| `OFFICE_CITY` | Office-weather label | Explicitly required in production |
| `OFFICE_LATITUDE`, `OFFICE_LONGITUDE` | Office-weather coordinates | Explicitly required in production |
| `OFFICE_TIMEZONE` | Recommendation and reporting date boundary | Explicitly required in production |
| `PUBLIC_API_BASE_URL` | Public Server/Admin origin | Explicitly required and HTTPS in production |
| `NODE_ENV` | Runtime mode | Use `production` on Railway |
| `PORT` | Listener port | Optional; defaults to `3000` and Railway injects it |
| `RAILWAY_GIT_COMMIT_SHA` | Revision reported by readiness | Optional; Railway supplies it |

Do not print or commit real values for the database URL, invite code, session
secret, or legacy read token.

## Railway release contract

```bash
pnpm build:railway
pnpm predeploy:railway
pnpm start:railway
```

The pre-deploy gate validates the environment, runs `prisma migrate deploy`,
then verifies database invariants. Fastify listens on `::` and the Railway
`PORT`. In production it serves `apps/admin/dist` at the same origin while API
routes keep precedence.

- Liveness: `GET /api/health`
- Readiness: `GET /api/ready`
- Deployment config: `railway.json`
- Operations and rollback: [`../../docs/operations.md`](../../docs/operations.md)

Do not seed production. Use migrations and the read-only verifier.

## Current identity boundary

Group-scoped routes require a bearer group-session token and revalidate active
membership and role. Identity is still lightweight and local to a browser;
display names are not verified accounts. The unscoped routes and
`X-Lunch-Read-Token` remain only as known compatibility surfaces and block
ordinary colleague beta until Stage 7B removes or disables them.
