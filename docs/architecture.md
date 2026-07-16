# Architecture

Status: current as of 2026-07-16.

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

- `Identity` owns a display name, authorization version and optional anonymization timestamp.
- `IdentityLinkCode` stores only a one-time HMAC hash plus expiry/consumption state.
- `LunchGroup` owns settings, restaurants, recommendations, history and invite state.
- `GroupMembership` joins identity/group and carries role/status.
- `Restaurant` and `Recommendation` preserve group knowledge.
- `DailyRecommendationBatch` and items preserve ranked snapshots and exactly one current batch per
  group/office date through a partial PostgreSQL unique index.
- `DailyParticipation` and `Feedback` capture the decision loop.
- `WeatherSnapshot` caches Server-only weather.
- `Teammate` remains a legacy attribution record; it is not the current identity model.

## Authentication and tenancy

The flow signs a versioned identity Token, then issues a group-session Token containing identity,
group, membership, current role and the same authorization version. Protected routes verify
signature/expiry, route group, membership ownership, database identity/version/anonymization,
active status and current database role. Old unversioned Tokens map to version zero only.

Legacy unscoped routes, shared read-token auth and the default-group runtime are no longer
registered in production. Historical tables, migrations and legacy batch attribution remain.

## Recommendation flow

`GET /api/groups/:groupId/today-recommendations` reads the existing current batch. `POST .../refresh`
creates a new current batch inside a serializable transaction, demotes the previous batch, snapshots
weights/weather/algorithm and retries recognized serialization/unique conflicts. Ranking remains
explainable; weather unavailability contributes zero rather than fabricated rainy data.

## Extension state and scheduling

Identity/group sessions with expiries, active group, per-group cache, reminder overrides and alarm
claims live in `chrome.storage.local`. A one-time storage migration removes legacy read-token/global
cache/alarm context. Long-term scheduling uses `chrome.alarms`; without an active group the runtime
clears alarms and performs no network/notification work. Group 401s share one renewal flight and
retry once.

## Deployment and data confidence

`railway.json` defines build, pre-deploy, start, readiness, restart and draining behavior. Pre-deploy
validates production environment values, applies migrations and runs six read-only consistency
queries. `/api/ready` checks PostgreSQL and reports the deployed Git revision without returning
database details.

See [operations](operations.md), [identity and security](identity-and-security.md), and
[testing and release](testing-and-release.md).
