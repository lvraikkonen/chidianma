-- Stage 3 lunch loop hardening.
-- Prisma cannot model partial unique indexes; this enforces one current batch
-- per group office date while allowing old non-current batches to remain.
CREATE UNIQUE INDEX IF NOT EXISTS "daily_recommendation_batches_one_current_key"
ON "daily_recommendation_batches"("group_id", "office_date")
WHERE "is_current" = true;
