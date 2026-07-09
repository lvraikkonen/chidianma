-- Multi-group foundation.
-- Legacy rows are assigned to seed-group-default before group_id becomes required.

-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('admin', 'member');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'removed');

-- CreateEnum
CREATE TYPE "RecommendationBatchSource" AS ENUM ('auto', 'manual', 'legacy');

-- CreateEnum
CREATE TYPE "ParticipationStatus" AS ENUM ('undecided', 'joining', 'away', 'decided');

-- CreateTable
CREATE TABLE "identities" (
    "id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3),

    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lunch_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT,
    "invite_code_hash" TEXT NOT NULL,
    "invite_code_rotated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invite_code_version" INTEGER NOT NULL DEFAULT 1,
    "created_by_identity_id" TEXT NOT NULL,
    "office_timezone" TEXT NOT NULL,
    "office_city" TEXT NOT NULL,
    "office_latitude" DOUBLE PRECISION NOT NULL,
    "office_longitude" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lunch_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_memberships" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "identity_id" TEXT NOT NULL,
    "role" "GroupRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_settings" (
    "group_id" TEXT NOT NULL,
    "reminder_time" TEXT NOT NULL DEFAULT '11:30',
    "weekday_reminder_enabled" BOOLEAN NOT NULL DEFAULT true,
    "second_reminder_enabled" BOOLEAN NOT NULL DEFAULT false,
    "notification_title" TEXT NOT NULL DEFAULT '吃饭才是正事，中午吃点啥呢？',
    "notification_group_label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_settings_pkey" PRIMARY KEY ("group_id")
);

-- CreateTable
CREATE TABLE "scoring_weights" (
    "group_id" TEXT NOT NULL,
    "weekday_match" INTEGER NOT NULL DEFAULT 20,
    "weather_match" INTEGER NOT NULL DEFAULT 25,
    "distance" INTEGER NOT NULL DEFAULT 20,
    "teammate_recommendation" INTEGER NOT NULL DEFAULT 10,
    "recent_duplicate_penalty" INTEGER NOT NULL DEFAULT 12,
    "negative_feedback_penalty" INTEGER NOT NULL DEFAULT 10,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scoring_weights_pkey" PRIMARY KEY ("group_id")
);

-- CreateTable
CREATE TABLE "daily_participation" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "office_date" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "status" "ParticipationStatus" NOT NULL DEFAULT 'undecided',
    "restaurant_id" TEXT,
    "recommendation_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_participation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_recommendation_batches" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "office_date" TEXT NOT NULL,
    "batch_no" INTEGER NOT NULL,
    "source" "RecommendationBatchSource" NOT NULL,
    "generated_by_membership_id" TEXT,
    "weather_snapshot_id" TEXT,
    "scoring_weights_snapshot" JSONB NOT NULL,
    "algorithm_version" TEXT NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_recommendation_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_recommendation_items" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "recommendation_id" TEXT,
    "score" INTEGER NOT NULL,
    "score_breakdown" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_recommendation_items_pkey" PRIMARY KEY ("id")
);

-- Seed default identity/group/membership/settings/weights for legacy data.
INSERT INTO "identities" ("id", "display_name", "last_seen_at")
VALUES ('seed-identity-admin', 'Demo 同事', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "lunch_groups" (
    "id",
    "name",
    "subtitle",
    "invite_code_hash",
    "created_by_identity_id",
    "office_timezone",
    "office_city",
    "office_latitude",
    "office_longitude",
    "updated_at"
)
VALUES (
    'seed-group-default',
    'Dev团队',
    '干饭小分队',
    'seed-invite-code-hash',
    'seed-identity-admin',
    'Asia/Shanghai',
    'Shanghai',
    31.2304,
    121.4737,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "group_memberships" ("id", "group_id", "identity_id", "role")
VALUES ('seed-membership-admin', 'seed-group-default', 'seed-identity-admin', 'admin')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "group_settings" ("group_id", "updated_at")
VALUES ('seed-group-default', CURRENT_TIMESTAMP)
ON CONFLICT ("group_id") DO NOTHING;

INSERT INTO "scoring_weights" ("group_id", "updated_at")
VALUES ('seed-group-default', CURRENT_TIMESTAMP)
ON CONFLICT ("group_id") DO NOTHING;

-- Add nullable group_id columns and other new legacy-link fields before backfill.
ALTER TABLE "restaurants" ADD COLUMN "group_id" TEXT;
ALTER TABLE "restaurants" ADD COLUMN "average_price_cents" INTEGER;
ALTER TABLE "restaurants" ADD COLUMN "created_by_membership_id" TEXT;

ALTER TABLE "recommendations" ADD COLUMN "group_id" TEXT;
ALTER TABLE "recommendations" ADD COLUMN "created_by_membership_id" TEXT;
ALTER TABLE "recommendations" ALTER COLUMN "teammate_id" DROP NOT NULL;

ALTER TABLE "daily_recommendations" ADD COLUMN "group_id" TEXT;

ALTER TABLE "weather_snapshots" ADD COLUMN "group_id" TEXT;

ALTER TABLE "feedback" ADD COLUMN "group_id" TEXT;
ALTER TABLE "feedback" RENAME COLUMN "date" TO "office_date";
ALTER TABLE "feedback" ADD COLUMN "membership_id" TEXT;

-- Backfill old rows with the deterministic default group.
UPDATE "restaurants" SET "group_id" = 'seed-group-default' WHERE "group_id" IS NULL;
UPDATE "recommendations" SET "group_id" = 'seed-group-default' WHERE "group_id" IS NULL;
UPDATE "daily_recommendations" SET "group_id" = 'seed-group-default' WHERE "group_id" IS NULL;
UPDATE "weather_snapshots" SET "group_id" = 'seed-group-default' WHERE "group_id" IS NULL;
UPDATE "feedback" SET "group_id" = 'seed-group-default' WHERE "group_id" IS NULL;

-- Migrate legacy feedback.type = 'blocked' to 'avoid' and remove blocked from FeedbackType.
ALTER TYPE "FeedbackType" RENAME TO "FeedbackType_old";
CREATE TYPE "FeedbackType" AS ENUM ('want', 'skip', 'ate', 'avoid');
ALTER TABLE "feedback" ALTER COLUMN "type" TYPE "FeedbackType"
USING (
    CASE
        WHEN "type"::text = 'blocked' THEN 'avoid'
        ELSE "type"::text
    END
)::"FeedbackType";
DROP TYPE "FeedbackType_old";

-- Drop legacy indexes/constraints that no longer match the grouped schema.
DROP INDEX IF EXISTS "restaurants_name_key";
DROP INDEX IF EXISTS "daily_recommendations_date_is_current_idx";
DROP INDEX IF EXISTS "weather_snapshots_date_city_key";
DROP INDEX IF EXISTS "feedback_date_type_idx";
ALTER TABLE "recommendations" DROP CONSTRAINT IF EXISTS "recommendations_teammate_id_fkey";

-- Add indexes and unique constraints for grouped data.
CREATE UNIQUE INDEX "group_memberships_group_id_identity_id_key" ON "group_memberships"("group_id", "identity_id");
CREATE INDEX "group_memberships_identity_id_idx" ON "group_memberships"("identity_id");
CREATE INDEX "restaurants_group_id_name_area_idx" ON "restaurants"("group_id", "name", "area");
CREATE INDEX "recommendations_group_id_restaurant_id_idx" ON "recommendations"("group_id", "restaurant_id");
CREATE INDEX "recommendations_group_id_created_by_membership_id_idx" ON "recommendations"("group_id", "created_by_membership_id");
CREATE INDEX "daily_recommendations_group_id_date_is_current_idx" ON "daily_recommendations"("group_id", "date", "is_current");
CREATE UNIQUE INDEX "weather_snapshots_group_id_date_city_key" ON "weather_snapshots"("group_id", "date", "city");
CREATE INDEX "feedback_group_id_office_date_restaurant_id_idx" ON "feedback"("group_id", "office_date", "restaurant_id");
CREATE INDEX "feedback_group_id_office_date_type_idx" ON "feedback"("group_id", "office_date", "type");
CREATE UNIQUE INDEX "daily_participation_group_id_office_date_membership_id_key" ON "daily_participation"("group_id", "office_date", "membership_id");
CREATE UNIQUE INDEX "daily_recommendation_batches_group_id_office_date_batch_no_key" ON "daily_recommendation_batches"("group_id", "office_date", "batch_no");
CREATE INDEX "daily_recommendation_batches_group_id_office_date_is_curren_idx" ON "daily_recommendation_batches"("group_id", "office_date", "is_current");
CREATE UNIQUE INDEX "daily_recommendation_items_batch_id_rank_key" ON "daily_recommendation_items"("batch_id", "rank");
CREATE INDEX "daily_recommendation_items_batch_id_idx" ON "daily_recommendation_items"("batch_id");

-- Add foreign keys after legacy group_id values have been backfilled.
ALTER TABLE "lunch_groups" ADD CONSTRAINT "lunch_groups_created_by_identity_id_fkey" FOREIGN KEY ("created_by_identity_id") REFERENCES "identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "lunch_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "group_settings" ADD CONSTRAINT "group_settings_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "lunch_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scoring_weights" ADD CONSTRAINT "scoring_weights_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "lunch_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "lunch_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_created_by_membership_id_fkey" FOREIGN KEY ("created_by_membership_id") REFERENCES "group_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "lunch_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_teammate_id_fkey" FOREIGN KEY ("teammate_id") REFERENCES "teammates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_created_by_membership_id_fkey" FOREIGN KEY ("created_by_membership_id") REFERENCES "group_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "daily_recommendations" ADD CONSTRAINT "daily_recommendations_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "lunch_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "weather_snapshots" ADD CONSTRAINT "weather_snapshots_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "lunch_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "lunch_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "group_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "daily_participation" ADD CONSTRAINT "daily_participation_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "lunch_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_participation" ADD CONSTRAINT "daily_participation_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "group_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_recommendation_batches" ADD CONSTRAINT "daily_recommendation_batches_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "lunch_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_recommendation_batches" ADD CONSTRAINT "daily_recommendation_batches_generated_by_membership_id_fkey" FOREIGN KEY ("generated_by_membership_id") REFERENCES "group_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "daily_recommendation_items" ADD CONSTRAINT "daily_recommendation_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "daily_recommendation_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_recommendation_items" ADD CONSTRAINT "daily_recommendation_items_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_recommendation_items" ADD CONSTRAINT "daily_recommendation_items_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enforce non-null group_id only after backfill and FK validation.
ALTER TABLE "restaurants" ALTER COLUMN "group_id" SET NOT NULL;
ALTER TABLE "recommendations" ALTER COLUMN "group_id" SET NOT NULL;
ALTER TABLE "daily_recommendations" ALTER COLUMN "group_id" SET NOT NULL;
ALTER TABLE "weather_snapshots" ALTER COLUMN "group_id" SET NOT NULL;
ALTER TABLE "feedback" ALTER COLUMN "group_id" SET NOT NULL;
