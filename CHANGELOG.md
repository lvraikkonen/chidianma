# Changelog

All notable user-facing changes to the internal product are recorded here.

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
