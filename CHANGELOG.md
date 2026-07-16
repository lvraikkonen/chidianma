# Changelog

All notable user-facing changes to the internal product are recorded here.

## Stage 7B — 2026-07-16

### Identity and safety

- Added one-time cross-device identity link codes, sliding Identity Token renewal, Token expiries,
  disconnect-this-device and identity-wide reset-all-connections.
- Admin and Extension now preserve the same identity/membership/role across linking and renew an
  expired group session through one shared flight before retrying once.
- Closed legacy unscoped Server/Extension runtime paths; no-active-group Extension state performs
  no recommendation request or reminder.
- Added per-risk rate limits, strict CORS, validated Railway client IP handling, fixed 500 responses
  and allowlisted safe error context.
- Added operator export/anonymization/Admin recovery/session revoke support while preserving history
  and the last-active-Admin invariant.

### Reliability

- Added identity authorization versions and HMAC-only link-code storage through a Prisma migration.
- Upgraded `@fastify/static` to the fixed 9.x line and added Fastify 5 rate limiting.
- Extended the PostgreSQL 16 rehearsal with two real concurrent refreshes producing two batches and
  exactly one current batch.

Stage 7B is deployed and production-verified. Public group creation is disabled and the two legacy
compatibility variables are removed. This is still not a colleague distribution release;
`v0.1.0-internal` remains the Stage 6 audit baseline and Stage 7C owns the next version boundary.

## v0.1.0-internal — 2026-07-15

Production-QA baseline:
`1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9`.

### Product

- Multi-group lightweight identities, memberships, roles, invite rotation and group isolation.
- Group-scoped restaurant and recommendation knowledge with member contribution and feedback.
- Explainable daily ranking with weather, weekday, distance, teammate knowledge, recent history
  and negative-feedback signals.
- Participation, final lunch decision, personal/group history, Dashboard metrics and scoring
  weight settings.
- Chrome MV3 popup, settings, detail page, cached recommendations, primary reminder and
  conditional 20-minute second reminder.
- React Admin served from the same Railway/Fastify origin as the API.

### Reliability and operations

- PostgreSQL migrations, legacy history preservation and a six-check read-only database verifier.
- Railway build, pre-deploy, readiness/revision, graceful shutdown and rollback path.
- Production Admin, Extension, cross-group isolation, notifications and reminder suppression
  verified in Stage 6 QA.

### Known pre-beta blockers

- Legacy unscoped API/shared-auth compatibility and Extension fallback remain reachable.
- Public API rate limiting and the final Origin policy are not implemented.
- Extension distribution, brand/visual consistency, accessible Modal behavior and QuickAdd
  idempotency are not complete.
- This tag records the verified baseline; it is not the hardened colleague-beta distribution.
