-- Preserve the legacy daily recommendation rows in the Stage 3 batch/item model.
-- Historical teammate rows remain attribution-only and are intentionally untouched.

DO $$
DECLARE
    overlap_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO overlap_count
    FROM (
        SELECT DISTINCT legacy."group_id", legacy."date"
        FROM "daily_recommendations" AS legacy
        INNER JOIN "daily_recommendation_batches" AS batch
            ON batch."group_id" = legacy."group_id"
           AND batch."office_date" = legacy."date"
    ) AS overlap_rows;

    IF overlap_count > 0 THEN
        RAISE EXCEPTION 'stage6_legacy_migration_overlap: % group/date pair(s) already contain new batches', overlap_count;
    END IF;
END $$;

WITH legacy_batches AS (
    SELECT
        legacy."group_id",
        legacy."date" AS "office_date",
        legacy."batch_id" AS "legacy_batch_id",
        MIN(legacy."created_at") AS "created_at",
        ROW_NUMBER() OVER (
            PARTITION BY legacy."group_id", legacy."date"
            ORDER BY MIN(legacy."created_at"), legacy."batch_id"
        )::INTEGER AS "batch_no"
    FROM "daily_recommendations" AS legacy
    GROUP BY legacy."group_id", legacy."date", legacy."batch_id"
)
INSERT INTO "daily_recommendation_batches" (
    "id",
    "group_id",
    "office_date",
    "batch_no",
    "source",
    "generated_by_membership_id",
    "weather_snapshot_id",
    "scoring_weights_snapshot",
    "algorithm_version",
    "is_current",
    "created_at"
)
SELECT
    'stage6-legacy-batch-' || MD5(
        legacy_batches."group_id" || CHR(31) ||
        legacy_batches."office_date" || CHR(31) ||
        legacy_batches."legacy_batch_id"
    ),
    legacy_batches."group_id",
    legacy_batches."office_date",
    legacy_batches."batch_no",
    'legacy'::"RecommendationBatchSource",
    NULL,
    NULL,
    JSONB_BUILD_OBJECT(
        'weekdayMatch', 20,
        'weatherMatch', 25,
        'distance', 20,
        'teammateRecommendation', 10,
        'recentDuplicatePenalty', 25,
        'negativeFeedbackPenalty', 10,
        'migrated', TRUE
    ),
    'legacy-v1',
    FALSE,
    legacy_batches."created_at"
FROM legacy_batches;

WITH ranked_items AS (
    SELECT
        legacy.*,
        ROW_NUMBER() OVER (
            PARTITION BY legacy."group_id", legacy."date", legacy."batch_id"
            ORDER BY legacy."created_at", legacy."id"
        )::INTEGER AS "stable_rank"
    FROM "daily_recommendations" AS legacy
)
INSERT INTO "daily_recommendation_items" (
    "id",
    "batch_id",
    "rank",
    "restaurant_id",
    "recommendation_id",
    "score",
    "score_breakdown",
    "reason",
    "created_at"
)
SELECT
    'stage6-legacy-item-' || MD5(legacy."id"),
    'stage6-legacy-batch-' || MD5(
        legacy."group_id" || CHR(31) || legacy."date" || CHR(31) || legacy."batch_id"
    ),
    legacy."stable_rank",
    legacy."restaurant_id",
    legacy."recommendation_id",
    legacy."score",
    JSONB_BUILD_OBJECT(
        'weekdayMatch', 0,
        'weatherMatch', 0,
        'distance', 0,
        'teammateRecommendation', 0,
        'recentDuplicatePenalty', 0,
        'negativeFeedbackPenalty', 0,
        'total', legacy."score"
    ),
    legacy."reason",
    legacy."created_at"
FROM ranked_items AS legacy;

-- The Stage 2 migration needed a deterministic group to backfill legacy rows.
-- On a genuinely empty database, remove that untouched compatibility scaffold
-- so the first production group is created through the Admin product flow.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "lunch_groups"
        WHERE "id" = 'seed-group-default'
          AND "created_by_identity_id" = 'seed-identity-admin'
          AND "invite_code_hash" = 'seed-invite-code-hash'
          AND "name" = 'Dev团队'
    ) AND NOT EXISTS (
        SELECT 1 FROM "restaurants" WHERE "group_id" = 'seed-group-default'
        UNION ALL
        SELECT 1 FROM "recommendations" WHERE "group_id" = 'seed-group-default'
        UNION ALL
        SELECT 1 FROM "daily_recommendations" WHERE "group_id" = 'seed-group-default'
        UNION ALL
        SELECT 1 FROM "weather_snapshots" WHERE "group_id" = 'seed-group-default'
        UNION ALL
        SELECT 1 FROM "feedback" WHERE "group_id" = 'seed-group-default'
        UNION ALL
        SELECT 1 FROM "daily_participation" WHERE "group_id" = 'seed-group-default'
        UNION ALL
        SELECT 1 FROM "daily_recommendation_batches" WHERE "group_id" = 'seed-group-default'
        UNION ALL
        SELECT 1 FROM "group_memberships"
        WHERE "group_id" = 'seed-group-default' AND "id" <> 'seed-membership-admin'
    ) THEN
        DELETE FROM "group_settings" WHERE "group_id" = 'seed-group-default';
        DELETE FROM "scoring_weights" WHERE "group_id" = 'seed-group-default';
        DELETE FROM "group_memberships" WHERE "id" = 'seed-membership-admin';
        DELETE FROM "lunch_groups" WHERE "id" = 'seed-group-default';
        DELETE FROM "identities"
        WHERE "id" = 'seed-identity-admin'
          AND NOT EXISTS (
              SELECT 1 FROM "group_memberships" WHERE "identity_id" = 'seed-identity-admin'
          );
    END IF;
END $$;
