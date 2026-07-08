-- CreateEnum
CREATE TYPE "RestaurantStatus" AS ENUM ('active', 'paused', 'blocked');

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('want', 'skip', 'ate', 'blocked');

-- CreateTable
CREATE TABLE "teammates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3),

    CONSTRAINT "teammates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" TEXT,
    "address" TEXT,
    "distance_minutes" INTEGER,
    "cuisine" TEXT,
    "price_band" TEXT,
    "supports_dine_in" BOOLEAN NOT NULL DEFAULT true,
    "supports_takeout" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT[],
    "status" "RestaurantStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "teammate_id" TEXT NOT NULL,
    "dish" TEXT,
    "reason" TEXT NOT NULL,
    "weather_tags" TEXT[],
    "weekday_tags" TEXT[],
    "mood_tags" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_recommendations" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "recommendation_id" TEXT,
    "score" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weather_snapshots" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "temperature_c" DOUBLE PRECISION,
    "condition" TEXT NOT NULL,
    "precipitation_probability" INTEGER,
    "wind_level" TEXT,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weather_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "recommendation_id" TEXT,
    "teammate_id" TEXT,
    "type" "FeedbackType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teammates_name_key" ON "teammates"("name");

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_name_key" ON "restaurants"("name");

-- CreateIndex
CREATE INDEX "daily_recommendations_date_is_current_idx" ON "daily_recommendations"("date", "is_current");

-- CreateIndex
CREATE UNIQUE INDEX "weather_snapshots_date_city_key" ON "weather_snapshots"("date", "city");

-- CreateIndex
CREATE INDEX "feedback_date_type_idx" ON "feedback"("date", "type");

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_teammate_id_fkey" FOREIGN KEY ("teammate_id") REFERENCES "teammates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_recommendations" ADD CONSTRAINT "daily_recommendations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_recommendations" ADD CONSTRAINT "daily_recommendations_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_recommendation_id_fkey" FOREIGN KEY ("recommendation_id") REFERENCES "recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_teammate_id_fkey" FOREIGN KEY ("teammate_id") REFERENCES "teammates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
