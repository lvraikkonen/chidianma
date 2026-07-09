# Server

Fastify API for lunch recommendations.

## Railway

Required variables:

- `DATABASE_URL`
- `TEAM_INVITE_CODE`
- `SESSION_SECRET`
- `EXTENSION_READ_TOKEN`
- `WEATHER_API_BASE_URL`
- `OFFICE_CITY`
- `OFFICE_LATITUDE`
- `OFFICE_LONGITUDE`
- `OFFICE_TIMEZONE`
- `PUBLIC_API_BASE_URL`
- `NODE_ENV`

Fastify must listen with:

```ts
await app.listen({
  port: Number(process.env.PORT ?? 3000),
  host: "::"
});
```

Migration command for deploy:

```bash
pnpm --filter @lunch/server exec prisma migrate deploy
```

## Multi-Group Foundation

The multi-group foundation migrates old single-team data into a default group:

- group name: `Dev团队`
- group subtitle: `干饭小分队`
- legacy daily recommendation rows keep `groupId` for compatibility during the foundation slice
- later recommendation-batch migration copies legacy rows into `daily_recommendation_batches/items`
- copied legacy batch source: `legacy`
- copied legacy algorithm version: `legacy-v1`
- legacy feedback type `blocked` is migrated to member feedback type `avoid`
- migration SQL must backfill legacy `group_id` values before setting `group_id NOT NULL`

New `/api/groups/:groupId/*` routes require group session tokens. `EXTENSION_READ_TOKEN` is retained only for legacy read compatibility and readiness/debug use.
