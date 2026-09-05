-- Additive and nullable: existing restaurants retain no invented provider provenance.
ALTER TABLE "lunch_groups"
  ADD COLUMN "search_center_label" TEXT,
  ADD COLUMN "search_center_latitude" DOUBLE PRECISION,
  ADD COLUMN "search_center_longitude" DOUBLE PRECISION;
ALTER TABLE "restaurants"
  ADD COLUMN "source_provider" TEXT,
  ADD COLUMN "source_place_id" TEXT,
  ADD COLUMN "source_category" TEXT,
  ADD COLUMN "source_latitude" DOUBLE PRECISION,
  ADD COLUMN "source_longitude" DOUBLE PRECISION,
  ADD COLUMN "source_coordinate_system" TEXT,
  ADD COLUMN "source_imported_at" TIMESTAMP(3);
CREATE UNIQUE INDEX "restaurants_group_id_source_provider_source_place_id_key"
  ON "restaurants"("group_id", "source_provider", "source_place_id");
CREATE TABLE "restaurant_import_receipts" (
  "id" TEXT NOT NULL,
  "group_id" TEXT NOT NULL,
  "membership_id" TEXT NOT NULL,
  "request_id" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_import_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "restaurant_import_receipts_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "lunch_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "restaurant_import_receipts_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "group_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "restaurant_import_receipts_group_id_membership_id_request_id_key"
  ON "restaurant_import_receipts"("group_id", "membership_id", "request_id");
