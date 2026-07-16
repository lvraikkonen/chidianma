# Architecture

Status: current as of 2026-07-15.

## Runtime topology

```text
Chrome Extension ─┐
                  ├─ HTTPS ─ Fastify Server ─ Prisma ─ PostgreSQL
Browser Admin ────┘                 │
                                    └─ Open-Meteo-style weather API
```

Railway runs one Fastify service and one active PostgreSQL service. In production Fastify serves
the built React Admin at `/`, immutable hashed assets at `/assets/`, and JSON APIs under `/api/`.
The Admin uses same-origin API paths. The Extension uses explicit host permissions.

## Repository boundaries

- `packages/shared`: route builders, request/response types and scoring contracts.
- `apps/server`: environment validation, API/auth, recommendation services, Prisma and operations.
- `apps/admin`: React pages and browser-local identity/group session state.
- `apps/extension`: MV3 pages, storage, API clients, cache and `chrome.alarms` reminder runtime.

Shared contracts prevent each client from inventing a different route or response shape.

## Data model

- `Identity` owns a display name and represents a generated lightweight identity ID.
- `LunchGroup` owns settings, restaurants, recommendations, history and invite state.
- `GroupMembership` joins identity/group and carries role/status.
- `Restaurant` and `Recommendation` preserve group knowledge.
- `DailyRecommendationBatch` and items preserve ranked snapshots and exactly one current batch per
  group/office date through a partial PostgreSQL unique index.
- `DailyParticipation` and `Feedback` capture the decision loop.
- `WeatherSnapshot` caches Server-only weather.
- `Teammate` remains a legacy attribution record; it is not the current identity model.

## Authentication and tenancy

The new flow signs an identity token, then issues a group-session token containing identity,
group, membership and role claims. Every protected group route verifies signature/expiry, route
group equality and the current active membership in PostgreSQL. Role-sensitive operations use the
database membership, including the last-admin invariant.

Legacy unscoped routes still use a shared invite/read-token compatibility model and a hard-coded
default group. They are isolated from the normal client flow only imperfectly because the current
Extension has a no-group fallback. Stage 7B must remove or disable this surface before beta.

## Recommendation flow

`GET /api/groups/:groupId/today-recommendations` reads the existing current batch. `POST .../refresh`
creates a new current batch inside a serializable transaction, demotes the previous batch, snapshots
weights/weather/algorithm and retries recognized serialization/unique conflicts. Ranking remains
explainable; weather unavailability contributes zero rather than fabricated rainy data.

## Extension state and scheduling

Identity/group sessions, active group, per-group cache, reminder overrides and alarm claims live in
`chrome.storage.local`. Long-term scheduling uses `chrome.alarms`; service-worker globals are never
the source of truth. Cache fallback is scoped to the active group.

## Deployment and data confidence

`railway.json` defines build, pre-deploy, start, readiness, restart and draining behavior. Pre-deploy
validates production environment values, applies migrations and runs six read-only consistency
queries. `/api/ready` checks PostgreSQL and reports the deployed Git revision without returning
database details.

See [operations](operations.md), [identity and security](identity-and-security.md), and
[testing and release](testing-and-release.md).
