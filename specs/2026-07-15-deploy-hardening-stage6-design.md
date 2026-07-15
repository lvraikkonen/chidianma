# Stage 6 Deploy Hardening Design

Status: `Approved for Execution`

Date: 2026-07-15

## Overview

Stage 6 closes the Stage 1-5 product into a repeatable internal release. It
adds production Admin hosting, deployment/readiness contracts, migration
confidence, Railway configuration, and a final cross-product smoke test. It
does not add lunch-product behavior or Chrome Web Store distribution work.

The Stage 5 Server is already deployed at the existing Railway domain. The
Stage 6 baseline has the current group APIs but returns 404 at `/` because the
Admin production build is not yet hosted.

## Confirmed Decisions

- The current Railway database contains disposable QA data. Stage 6 deploys a
  fresh PostgreSQL service and keeps the old service only as a temporary
  rollback point until validation finishes.
- Production never runs the development seed because its deterministic Demo
  data and invite code are not production-safe.
- Legacy `teammates` remain attribution records. Stage 6 does not synthesize
  active or removed memberships from them because doing so would distort the
  current member list and today's undecided count.
- Legacy `daily_recommendations` are copied into historical batch/item rows.
  Migrated batches are never made current; a current recommendation must be
  generated explicitly through the current group API.
- Admin is served by the existing Fastify service at the same origin as the
  API. A second frontend Railway service is not added.
- Chrome Developer Mode remains the internal distribution target. Store
  listing assets, review, privacy copy, and automatic updates remain out of
  scope.

This legacy teammate decision replaces the earlier broad statement in
`specs/2026-07-08-multi-group-prototype-implementation-design.md` that every
old teammate becomes an identity and membership. Existing identity,
membership, recommendation-attribution, and historical display behavior stay
unchanged.

## Production Hosting And Lifecycle

In production, Fastify serves the compiled Admin at `/` and its hashed assets
under `/assets/`. `index.html` is not long-lived in caches; hashed assets are
immutable. Admin continues to use hash routing, so Stage 6 adds no catch-all
history fallback. Unknown routes, including unknown `/api/*` routes, remain
404 and never receive Admin HTML.

The Admin bundle uses an empty `VITE_API_BASE_URL` and calls same-origin API
paths. Production startup fails if the Admin build is missing. Development
keeps the Vite server and does not require `apps/admin/dist`.

The Server handles `SIGTERM` and `SIGINT` once, closes Fastify, and disconnects
Prisma before exiting. Railway deploy configuration supplies deterministic
build, pre-deploy, start, readiness, draining, and restart behavior.

## Health, Environment, And Release Identity

`GET /api/health` remains the shallow unauthenticated liveness response
`{ "ok": true }`.

`GET /api/ready` is an unauthenticated deployment/readiness probe:

- HTTP 200: `{ "ok": true, "database": "ready", "revision": string }`.
- HTTP 503: `{ "ok": false, "error": "not_ready" }`.

The probe verifies a real PostgreSQL query. Failures are logged by Fastify but
database details are not returned. `revision` is
`RAILWAY_GIT_COMMIT_SHA` in Railway and `local` elsewhere.

Environment parsing rejects ambiguous booleans, invalid ports, coordinates,
URLs, timezones, token TTLs, and weak production session secrets. The
Extension read token remains only a lightweight public API guard. Release
commands must not print secret values.

## Legacy Migration Contract

A forward SQL migration groups legacy recommendation rows by
`group_id + date + batch_id` and inserts deterministic batch/item history:

- `source=legacy`
- `algorithm_version=legacy-v1`
- `weather_snapshot_id=NULL`
- legacy scoring-weight snapshot plus `migrated=true`
- stable item rank by `created_at, id`
- the original score and reason retained
- unavailable breakdown components set to zero and `total` set to the old score
- `is_current=false`

If a group/date already contains a new batch, the migration aborts rather than
guessing a mixed ordering or mutating verified batch numbers. The Admin labels
legacy records and explains that only the old total score and reason are
faithful; it does not display invented component detail.

A read-only database verifier checks migration success, group ownership across
relations, the one-current-batch invariant, legacy row/batch/item counts, and
the active-Admin invariant. It emits only named checks and aggregate counts.

## Release And Rollback

The Railway image builds Shared, generates Prisma, builds Admin, then builds
Server. Pre-deploy validates environment, applies Prisma migrations, and runs
the read-only database verifier. Readiness must pass before the release is
accepted.

The initial Stage 6 release points the Server at a new empty PostgreSQL
service. No seed runs. The first real group is created through the production
Admin. Until final QA passes, rollback means restoring the prior application
deployment and its prior database reference. Deleting the old database is a
separate destructive action after explicit approval.

## Acceptance

- Production `/` serves the complete Admin and `/api/*` behavior is unchanged.
- `/api/ready` proves both database connectivity and the deployed Git revision.
- Fresh and legacy-fixture migration rehearsals pass on disposable PostgreSQL.
- No production bundle contains invite codes, session secrets, read tokens,
  localhost API configuration, or a hardcoded Railway API base URL.
- Shared, Server, Admin, and Extension tests, typechecks, and builds pass.
- The production Admin and unpacked Extension complete the group, restaurant,
  recommendation, participation, feedback, history, settings, and reminder
  smoke scenarios recorded in `qa/`.
