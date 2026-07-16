# Internal Release Record

Status: `Baseline frozen; not approved for colleague distribution`

Date: 2026-07-15

## Version and deployment

- Local annotated tag: `v0.1.0-internal`.
- Peeled commit: `1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9`.
- Tag push / remote release: not performed.
- Railway project/service: `remarkable-reverence / @lunch/server`.
- Current Railway deployment: `c85ac2ab-b43a-42d6-9b55-cf75322ff993` (`SUCCESS`).
- Stage 6 production-QA deployment: `10f427de-858e-42f1-8c0c-23194180d4d8`
  (historical record; now `REMOVED` after the later deployment).
- Production URL: `https://lunchserver-production.up.railway.app`.
- Runtime: Node `22.23.1`, pnpm `9.15.0`.

The current deployment and `/api/ready` report revision
`32d414a289c57d6ce0488448e612e8943b446a31`. Its diff from the tagged
`1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9` baseline contains only Stage 6 QA,
plan and roadmap records, so the tagged commit remains the production-tested
runtime implementation boundary.

## Database and migrations

- Active PostgreSQL service: `Postgres-W12K`.
- Retained rollback service: `Postgres`.
- Production seed: never run.
- Pre-deploy: environment check → `prisma migrate deploy` → read-only database verifier.
- Applied baseline migrations: fresh schema plus Stage 6 legacy-history migration.
- Migration rollback is database-level: application rollback alone does not reverse forward SQL.

The rollback database is retained until Stage 7D completes plus a 14-day observation window,
with an operational review on 2026-08-15. There is no automatic deletion. Deletion requires a
verified current backup/restore path, passing database verification and separate destructive
approval.

## Rollback

1. Stop promotion or pause beta expansion.
2. Select the previously known-good Railway application deployment.
3. Restore the Server database reference to the retained `Postgres` service using Railway's
   secret/variable controls; do not copy credentials into commands or documents.
4. Wait for `/api/ready` to report HTTP 200 and the expected revision.
5. Verify `/`, `/api/health`, protected API 401 behavior and unknown API 404 behavior.
6. Run the read-only database verifier and record sanitized results.
7. Rebuild/reload the matching unpacked Extension if the client version changed.

Detailed procedure: [rollback runbook](docs/runbooks/rollback.md).

## Production data

The clearly named Stage 6 QA identities, groups, restaurants and behavior records are retained
as Demo/smoke fixtures. They are group-isolated, preserve active-admin invariants and contain no
repository-recorded invite/token values. No cleanup script will run during Stage 7A. Revisit the
decision before expanding Stage 7D beyond the first cohort.

## Known issues and accepted dispositions

- **Blocks colleague distribution (7B):** legacy unscoped routes/shared auth and Extension
  fallback; no rate limit; final Origin policy and group-creation policy not yet verified.
- **Blocks colleague distribution (7C):** final Extension distribution/upgrade contract,
  detail-page/brand consistency, Modal focus behavior and QuickAdd retry idempotency.
- **Operated beta (7D):** error alerting and privacy-bounded reminder delivery observation.
- **Dependency audit:** OSV-Scanner `v2.4.0` (official SHA-256
  `088119325156321c34c456ac3703d6013538fd71cbac82b891ab34db491e4d66`)
  found no high/critical vulnerabilities in the 121-version Server production
  tree. `@fastify/static@8.0.0` has two moderate findings:
  `GHSA-pr96-94w5-mx2h` (CVSS 5.3) and `GHSA-x428-ghpx-8j92` (CVSS 5.9), fixed
  in `9.1.1`. The current plugin does not enable directory listing and its root
  contains only public Admin build files, not protected data; this reduces the
  present exposure but does not remove the findings. Version `9.1.1` supports
  Fastify 5 but is a plugin-major/runtime change, so the repository maintainer
  accepts both only until the Stage 7B exit gate or 2026-07-22, whichever comes
  first. Re-review immediately if protected files are added below the static
  root, route guards begin protecting static files, or the Admin hosting model
  changes.
- **Development dependencies:** the full lockfile scan also reports one critical
  Vitest, one high plus two medium Vite, and one medium esbuild finding; none are
  present in `pnpm --filter @lunch/server list --prod`. Upgrade them in a
  separately tested maintenance slice before the next distributable build.
- **Git repository:** approximately 14,507 loose objects / 159 MiB with unreachable-object and
  `.git/gc.log` warnings. A verified bundle recovery point exists at
  `/private/tmp/chidianma-stage7a-pre-maintenance-2026-07-15.bundle`; destructive prune is deferred.
- **Identity:** no formal account, cross-device recovery or account merge.

Evidence: [Stage 6 production QA](docs/archive/stages/stage-6/2026-07-15-deploy-hardening-stage6-qa.md)
and [Stage 7 review triage](qa/2026-07-15-production-baseline-review-triage.md).
