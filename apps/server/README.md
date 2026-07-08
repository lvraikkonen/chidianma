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
