ALTER TABLE "identities"
  ADD COLUMN "auth_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "anonymized_at" TIMESTAMP(3);

CREATE TABLE "identity_link_codes" (
  "id" TEXT NOT NULL,
  "identity_id" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  CONSTRAINT "identity_link_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "identity_link_codes_code_hash_key"
  ON "identity_link_codes"("code_hash");
CREATE INDEX "identity_link_codes_identity_id_consumed_at_expires_at_idx"
  ON "identity_link_codes"("identity_id", "consumed_at", "expires_at");
CREATE INDEX "lunch_groups_invite_code_hash_idx"
  ON "lunch_groups"("invite_code_hash");

ALTER TABLE "identity_link_codes"
  ADD CONSTRAINT "identity_link_codes_identity_id_fkey"
  FOREIGN KEY ("identity_id") REFERENCES "identities"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
