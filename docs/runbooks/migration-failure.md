# Runbook: Migration Or Pre-Deploy Failure

1. Do not bypass Railway pre-deploy or manually mark the release successful.
2. Capture the failing migration/check name and sanitized error; never copy `DATABASE_URL`.
3. Inspect `_prisma_migrations` for unfinished/failed state through approved database access.
4. Reproduce against a disposable PostgreSQL database with the migration rehearsal when possible.
5. If the migration made no committed change, fix forward and redeploy after tests.
6. If partial data/schema may exist, stop and design a reviewed recovery migration; do not edit the
   production migration history by hand.
7. Keep the current serving deployment/database unchanged or follow rollback if traffic moved.
8. Run the read-only verifier after recovery and record sanitized counts.
