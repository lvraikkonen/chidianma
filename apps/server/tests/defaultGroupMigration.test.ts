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

  it("updates the migrated default group placeholder invite hash during dev seed", () => {
    const seedPath = join(process.cwd(), "prisma", "seed.ts");
    const seed = readFileSync(seedPath, "utf8");

    expect(seed).toContain('const defaultInviteCodeHash = hashInviteCode("LUNCH-2026AA"');
    expect(seed).not.toContain('where: { id: "seed-group-default" },\n    update: {},');
    expect(seed).toMatch(
      /prisma\.lunchGroup\.upsert\(\{[\s\S]*where:\s*\{\s*id:\s*"seed-group-default"\s*\}[\s\S]*update:\s*\{[\s\S]*inviteCodeHash:\s*defaultInviteCodeHash/
    );
    expect(seed).toMatch(/update:\s*\{[\s\S]*name:\s*"Dev团队"[\s\S]*subtitle:\s*"干饭小分队"/);
    expect(seed).toMatch(/update:\s*\{[\s\S]*officeTimezone:\s*defaultOfficeTimezone/);
  });

  it("does not upsert restaurants by non-unique global name in the dev seed", () => {
    const seedPath = join(process.cwd(), "prisma", "seed.ts");
    const seed = readFileSync(seedPath, "utf8");

    expect(seed).not.toContain("prisma.restaurant.upsert");
    expect(seed).toContain("prisma.restaurant.findFirst");
    expect(seed).toContain("prisma.restaurant.update");
    expect(seed).toContain("prisma.restaurant.create");
    expect(seed).toMatch(/where:\s*{\s*groupId:\s*defaultGroup\.id,[\s\S]*name:\s*item\.name/);
  });
});
