# Stage 6 Deploy Hardening Implementation Plan

Status: `Done`

Date: 2026-07-15

## Goal And Boundary

Turn the deployed Stage 5 product into a repeatable internal Railway release
with same-origin Admin hosting, verified migrations, explicit readiness,
graceful shutdown, deterministic build/deploy configuration, and final Chrome
Developer Mode QA.

- Preserve all Stage 1-5 product contracts.
- Add no account system, discovery platform, framework, broad Chrome
  permission, Store release work, or production seed.
- Use TDD for environment, readiness, hosting, migration, and verification
  behavior.
- Do not delete the existing Railway database during implementation.

Baseline: 562 monorepo tests and all package typechecks/builds passed at the
Stage 5 handoff.

## Task 1: Source Of Truth And Baseline

- Add the Stage 6 design, this plan, and Roadmap status before runtime code.
- Record a clean worktree and run focused baseline checks when the first slice
  is ready.
- Keep the legacy teammate attribution decision explicit in spec and tests.

## Task 2: Environment, Readiness, And Lifecycle

- First add tests for strict boolean parsing, environment bounds, IANA
  timezones, production secrets, and optional Railway revision.
- Keep `/api/health` stable and add dependency-injected `/api/ready` tests for
  success, database failure, generic public errors, and revision.
- Add a compiled environment-check entry point that prints only success or a
  sanitized failure.
- Add one-shot SIGTERM/SIGINT shutdown and Prisma close behavior with tests.

## Task 3: Production Admin Hosting

- Add `@fastify/static` 8.x.
- First test production `/`, `/index.html`, hashed assets, cache headers, API
  precedence, unknown-route 404, missing-build failure, and development mode.
- Register Admin static hosting after API routes and resolve the Admin build
  relative to the compiled Server module, not `process.cwd()`.
- Verify the production Admin uses same-origin API paths and contains no
  sensitive or environment-specific residue.

## Task 4: Legacy Migration And Database Verifier

- Add a forward SQL migration that copies non-overlapping legacy daily rows
  into deterministic non-current `legacy-v1` batch/items.
- Add SQL-shape tests before the migration and integration assertions after it.
- Add a read-only verifier for migration state, cross-group relations, current
  batches, migrated counts, and active Admins.
- Add an opt-in Docker rehearsal command covering both an empty Prisma deploy
  and a populated legacy MVP fixture; always clean up its disposable database.
- Prove overlap with already-created group batches aborts without partial
  writes and prove no teammate membership is created.
- Render a truthful legacy-history explanation in Admin and hide unavailable
  component rows.

## Task 5: Railway Build And Deploy Contract

- Pin the Railway Node runtime to 22 and preserve pnpm 9.15.0.
- Add a root Railway build script: Shared, Prisma generate, Admin, Server.
- Add `railway.json` with Railpack, pre-deploy environment check, Prisma deploy,
  database verifier, Server start, `/api/ready`, draining, and failure restart.
- Update root/Server/Extension deployment documentation. Explicitly forbid
  production `prisma:seed`.
- Run a production dependency audit. Resolve high/critical findings only with
  compatible patch/minor upgrades; do not introduce a breaking framework
  upgrade in Stage 6.

## Task 6: Automated Completion Gate

Run focused suites after each slice, then:

```bash
pnpm --filter @lunch/shared test
pnpm --filter @lunch/server test
pnpm --filter @lunch/server typecheck
pnpm --filter @lunch/admin test
pnpm --filter @lunch/admin typecheck
pnpm --filter @lunch/extension test
pnpm --filter @lunch/extension typecheck
pnpm test
pnpm typecheck
pnpm build
pnpm audit --prod
```

Also run the Stage 6 migration rehearsal and built-artifact scans. Test totals
must not fall below the Stage 5 baseline.

## Task 7: Railway Fresh Release

- Confirm Railway project/service linkage without changing state.
- Create a sibling empty PostgreSQL service and keep the old database intact.
- Configure the Server to reference the new database and validate every
  production variable without revealing values.
- Deploy the tested commit. Confirm pre-deploy checks, Admin root, readiness,
  revision, protected API 401s, application logs, and no production seed data.
- Do not delete the old database. Record rollback steps and request separate
  approval only after all QA passes.

## Task 8: Production Admin And Extension QA

- Create the first production group through Admin, then validate Admin today,
  restaurants, records, settings, members, weights, invite rotation, and 390px.
- Load the final `apps/extension/dist` unpacked, join with a second identity,
  test another group and cross-group isolation, quick-add, recommendation,
  participation, decision, feedback, history, and Admin reflection.
- Verify a suspended-worker primary reminder, the real 20-minute no-decision
  second reminder, and the decided suppression branch.
- Record Chrome version, Railway deployment/revision, tested scenarios,
  cleanup, untested cases, and known issues without tokens or invite codes.

## Completion Gate

- Write the Stage 6 QA handoff with automated, migration, Railway, Admin, and
  Chrome evidence.
- Mark this plan and Roadmap `Done` only when every required gate passes.
- If external access prevents Railway or Chrome QA, leave Stage 6 In Progress
  and report the exact remaining gate rather than claiming completion.

Completion date: 2026-07-15

QA handoff:
[`qa/2026-07-15-deploy-hardening-stage6.md`](../qa/2026-07-15-deploy-hardening-stage6.md)
