# Internal Release Record

Status: `Baseline frozen; not approved for colleague distribution`

Date: 2026-07-16

## Version and deployment

- Local annotated tag: `v0.1.0-internal`.
- Peeled commit: `1eb7dbb1b26341b5f50d830d5d168ab3700cb1d9`.
- Tag push / remote release: not performed.
- Railway project/service: `remarkable-reverence / @lunch/server`.
- Current Railway deployment: `6d80eb52-d35a-4554-9d66-aa44dd2d6b1c` (`SUCCESS`).
- Current Railway image digest:
  `sha256:dba6964449d3f8627c4188855fae15935e3c065313bccb074b664ce5a52133c7`.
- Immediate pre-variable-change rollback deployment:
  `2d3db6db-e1ab-41c2-86c0-edd2138dcc1a`.
- Pre-7B rollback deployment: `371242e7-9783-4866-aaa5-f4f26218ddcf`
  (`ad0260b4abf12b48bbc64e73020858ff316227f3`).
- Stage 6 production-QA deployment: `10f427de-858e-42f1-8c0c-23194180d4d8`
  (historical record; now `REMOVED` after the later deployment).
- Production URL: `https://lunchserver-production.up.railway.app`.
- Runtime: Node `22.23.1`, pnpm `9.15.0`.

The current deployment is a Railway CLI upload of the approved Stage 7B workspace, so `/api/ready`
reports revision `local`. It is identified by the deployment ID and image digest above and is not
represented by a Git commit. The `v0.1.0-internal` tag remains only the Stage 6 audit baseline; it
does not represent the current production runtime or a distributable Stage 7 release.

## Database and migrations

- Active PostgreSQL service: `Postgres-W12K`.
- Retained rollback service: `Postgres`.
- Production seed: never run.
- Pre-deploy: environment check → `prisma migrate deploy` → read-only database verifier.
- Applied migrations: fresh schema, Stage 6 legacy-history migration and
  `20260715180000_stage7b_identity_links`.
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
repository-recorded invite/token values. The clearly named Stage 7B production-smoke identity and
group are retained as Demo evidence; no cleanup script will run during Stage 7B. Revisit the
decision before expanding Stage 7D beyond the first cohort.

## Known issues and accepted dispositions

- **Stage 7B complete:** legacy closure, identity linking/reset, rate limits, Origin policy, safe
  logging, operator tools and real PostgreSQL concurrency are deployed. Both production deployments,
  migration/verifier gates, external smoke, same-identity Admin/Extension checks and Demo dry-run
  pass. Production group creation is disabled and both legacy variables are removed. Stage 7C is
  Ready for Planning, but no colleague distribution artifact exists yet.
- **Blocks colleague distribution (7C):** final Extension distribution/upgrade contract,
  detail-page/brand consistency, Modal focus behavior and QuickAdd retry idempotency.
- **Operated beta (7D):** error alerting and privacy-bounded reminder delivery observation.
- **Dependency audit:** OSV-Scanner `v2.4.0` (official SHA-256
  `088119325156321c34c456ac3703d6013538fd71cbac82b891ab34db491e4d66`)
  found no critical/high/medium/low findings across the 122-package current production tree.
  The deployed candidate resolves `@fastify/static` to `9.3.0`, above the `9.1.1` fix floor for both
  registered advisories.
- **Development dependencies:** the full lockfile scan also reports one critical
  Vitest, one high plus two medium Vite, and one medium esbuild finding; none are
  present in `pnpm --filter @lunch/server list --prod`. Upgrade them in a
  separately tested maintenance slice before the next distributable build.
- **Git repository:** approximately 14,507 loose objects / 159 MiB with unreachable-object and
  `.git/gc.log` warnings. A verified bundle recovery point exists at
  `/private/tmp/chidianma-stage7a-pre-maintenance-2026-07-15.bundle`; destructive prune is deferred.
- **Identity:** no formal account, verified personal identity, long-term recovery credential,
  single-device remote revoke or account merge. Link codes require one still-connected device.

Evidence: [Stage 6 production QA](docs/archive/stages/stage-6/2026-07-15-deploy-hardening-stage6-qa.md),
[Stage 7 review triage](qa/2026-07-15-production-baseline-review-triage.md) and
[Stage 7B QA](qa/2026-07-15-internal-beta-productization-stage7b.md).
