import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260715120000_stage6_legacy_batch_history",
  "migration.sql"
);

describe("Stage 6 legacy recommendation migration contract", () => {
  const sql = readFileSync(migrationPath, "utf8");

  it("aborts on overlapping new batches instead of inventing batch numbers", () => {
    expect(sql).toContain("stage6_legacy_migration_overlap");
    expect(sql).toMatch(/daily_recommendations[\s\S]+daily_recommendation_batches/);
    expect(sql).toContain("RAISE EXCEPTION");
  });

  it("preserves legacy history as deterministic non-current batches and items", () => {
    expect(sql).toContain("'legacy'::\"RecommendationBatchSource\"");
    expect(sql).toContain("'legacy-v1'");
    expect(sql).toContain("FALSE");
    expect(sql).toContain("ROW_NUMBER() OVER");
    expect(sql).toContain("ORDER BY legacy.\"created_at\", legacy.\"id\"");
    expect(sql).toContain("'total', legacy.\"score\"");
    expect(sql).toContain("'migrated', TRUE");
  });

  it("does not manufacture memberships from historical teammates", () => {
    expect(sql).not.toMatch(/INSERT\s+INTO\s+"group_memberships"/i);
    expect(sql).not.toMatch(/UPDATE\s+"teammates"/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+"teammates"/i);
  });

  it("removes only the untouched compatibility scaffold on an empty database", () => {
    expect(sql).toContain("seed-invite-code-hash");
    expect(sql).toContain("DELETE FROM \"lunch_groups\" WHERE \"id\" = 'seed-group-default'");
    expect(sql).toContain("SELECT 1 FROM \"daily_recommendations\"");
  });
});
