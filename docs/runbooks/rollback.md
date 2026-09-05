# Runbook: Roll Back Production

Use when a deployment fails readiness, corrupts a core flow, creates an isolation risk, or meets a
Stage 7D stop condition.

1. Stop rollout/beta expansion and record time, observed revision and user impact without secrets.
2. Select the previously known-good Railway application deployment.
3. Check the release's migration compatibility before changing database references. The restaurant
   onboarding migration is additive: keep active `Postgres-W12K` when disabling its flags or rolling
   back the application, preserving imported restaurants and history. Application rollback does
   not reverse schema/data. A database restore requires a separately verified incident decision;
   never automatically switch to the retained, potentially stale `Postgres` snapshot.
4. Wait for `/api/ready` HTTP 200 with the expected revision.
5. Verify `/`, `/api/health`, protected API 401 and unknown `/api/*` JSON 404.
6. Run `pnpm --filter @lunch/server db:verify` inside an approved Railway context and record only
   sanitized named counts.
7. Confirm one representative group can read its own data and cannot access a different group.
8. Match/reload the compatible Extension build if client/server contracts changed.
9. Record cause, rollback revision/database, checks and remaining risk in `qa/`.

Never delete either database during rollback. Database deletion requires separate approval.
