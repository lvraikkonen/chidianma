import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("default group migration", () => {
  it("backfills legacy rows before enforcing non-null group ids", () => {
    const migrationsDir = join(process.cwd(), "prisma", "migrations");
    const migrationDir = readdirSync(migrationsDir).find((name) => name.endsWith("_multi_group_foundation"));
    expect(migrationDir).toBeTruthy();

    const migrationPath = join(migrationsDir, migrationDir!, "migration.sql");
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("seed-group-default");
    expect(sql).toMatch(/UPDATE\s+"?restaurants"?\s+SET\s+"?group_id"?/i);
    expect(sql).toMatch(/UPDATE\s+"?recommendations"?\s+SET\s+"?group_id"?/i);
    expect(sql).toMatch(/UPDATE\s+"?feedback"?\s+SET\s+"?group_id"?/i);
    expect(sql).toMatch(/UPDATE\s+"?daily_recommendations"?\s+SET\s+"?group_id"?/i);
    expect(sql).toMatch(/blocked/i);
    expect(sql).toMatch(/avoid/i);

    const firstBackfill = sql.search(/UPDATE\s+"?restaurants"?\s+SET\s+"?group_id"?/i);
    const firstNotNull = sql.search(/ALTER\s+COLUMN\s+"?group_id"?\s+SET\s+NOT\s+NULL/i);
    expect(firstBackfill).toBeGreaterThanOrEqual(0);
    expect(firstNotNull).toBeGreaterThan(firstBackfill);
  });

  it("keeps dev seed data inside the deterministic default group", () => {
    const seedPath = join(process.cwd(), "prisma", "seed.ts");
    const seed = readFileSync(seedPath, "utf8");

    expect(seed).toContain("hashInviteCode");
    expect(seed).toContain('hashInviteCode("LUNCH-2026AA"');
    expect(seed).toContain("prisma.lunchGroup.upsert");
    expect(seed).toContain('id: "seed-group-default"');
    expect(seed).toContain('name: "Dev团队"');
    expect(seed).toContain('subtitle: "干饭小分队"');
    expect(seed).toContain("prisma.groupMembership.upsert");
    expect(seed).toContain("prisma.groupSettings.upsert");
    expect(seed).toContain("prisma.scoringWeights.upsert");
    expect(seed).toMatch(/groupId:\s*defaultGroup\.id/g);
  });
});
