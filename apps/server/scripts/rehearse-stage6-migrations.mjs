import { readFileSync } from "node:fs";
import { setTimeout as wait } from "node:timers/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(serverRoot, "../..");
const migrationsRoot = join(serverRoot, "prisma", "migrations");
const containerName = `lunch-stage6-migration-${process.pid}`;
const databasePassword = "stage6-local-rehearsal";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? workspaceRoot,
    env: options.env ?? process.env,
    input: options.input,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: options.stdio ?? "pipe"
  });
  if (result.error || (!options.allowFailure && result.status !== 0)) {
    const detail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
      .replaceAll(databasePassword, "[redacted]")
      .replace(/postgresql:\/\/\S+/g, "[redacted-database-url]")
      .trim()
      .slice(-4000);
    throw new Error(`${options.errorCode ?? "stage6_rehearsal_command_failed"}${detail ? `: ${detail}` : ""}`);
  }
  return result;
}

function dockerPsql(database, sql) {
  return run(
    "docker",
    ["exec", "-i", containerName, "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database, "-At"],
    { input: sql, errorCode: "stage6_rehearsal_sql_failed" }
  ).stdout.trim();
}

function migrationSql(name) {
  return readFileSync(join(migrationsRoot, name, "migration.sql"), "utf8");
}

function databaseUrl(port, database) {
  return `postgresql://postgres:${databasePassword}@127.0.0.1:${port}/${database}`;
}

function prisma(port, database, args, options = {}) {
  return run(
    "pnpm",
    ["--filter", "@lunch/server", "exec", "prisma", ...args],
    {
      env: { ...process.env, DATABASE_URL: databaseUrl(port, database) },
      allowFailure: options.allowFailure,
      errorCode: options.errorCode ?? "stage6_rehearsal_prisma_failed"
    }
  );
}

function verifier(port, database) {
  const output = run(
    "pnpm",
    ["--filter", "@lunch/server", "exec", "tsx", "src/verifyDatabase.ts"],
    {
      env: { ...process.env, DATABASE_URL: databaseUrl(port, database) },
      errorCode: "stage6_rehearsal_verifier_failed"
    }
  ).stdout.trim();
  const jsonLine = output.split("\n").reverse().find((line) => line.trim().startsWith("{"));
  if (!jsonLine) {
    throw new Error("stage6_rehearsal_verifier_output_invalid");
  }
  return jsonLine.trim();
}

function assertJson(actual, expected, errorCode) {
  const parsed = JSON.parse(actual);
  for (const [key, value] of Object.entries(expected)) {
    if (parsed[key] !== value) {
      throw new Error(errorCode);
    }
  }
}

const legacyFixture = `
  INSERT INTO "teammates" ("id", "name", "created_at")
  VALUES ('legacy-teammate-1', 'Legacy Teammate', '2026-07-01T01:00:00Z');

  INSERT INTO "restaurants" (
    "id", "name", "area", "tags", "status", "created_at", "updated_at"
  ) VALUES (
    'legacy-restaurant-1', 'Legacy Restaurant', 'Office', ARRAY['legacy'], 'active',
    '2026-07-01T01:00:00Z', '2026-07-01T01:00:00Z'
  );

  INSERT INTO "recommendations" (
    "id", "restaurant_id", "teammate_id", "dish", "reason",
    "weather_tags", "weekday_tags", "mood_tags", "created_at", "updated_at"
  ) VALUES (
    'legacy-recommendation-1', 'legacy-restaurant-1', 'legacy-teammate-1', 'Legacy Dish',
    'Legacy reason', ARRAY['sunny'], ARRAY['Wednesday'], ARRAY['quick'],
    '2026-07-01T01:00:00Z', '2026-07-01T01:00:00Z'
  );

  INSERT INTO "daily_recommendations" (
    "id", "date", "batch_id", "restaurant_id", "recommendation_id",
    "score", "reason", "is_current", "created_at"
  ) VALUES
    ('legacy-daily-b', '2026-07-01', 'legacy-batch-a', 'legacy-restaurant-1', 'legacy-recommendation-1', 38, 'Second stable item', TRUE, '2026-07-01T02:00:00Z'),
    ('legacy-daily-a', '2026-07-01', 'legacy-batch-a', 'legacy-restaurant-1', 'legacy-recommendation-1', 42, 'First stable item', TRUE, '2026-07-01T02:00:00Z'),
    ('legacy-daily-c', '2026-07-01', 'legacy-batch-b', 'legacy-restaurant-1', 'legacy-recommendation-1', 50, 'Third item', TRUE, '2026-07-01T03:00:00Z'),
    ('legacy-daily-d', '2026-07-01', 'legacy-batch-b', 'legacy-restaurant-1', 'legacy-recommendation-1', 45, 'Fourth item', TRUE, '2026-07-01T03:01:00Z');

  INSERT INTO "weather_snapshots" (
    "id", "date", "city", "condition", "created_at"
  ) VALUES ('legacy-weather-1', '2026-07-01', 'Shanghai', 'sunny', '2026-07-01T01:00:00Z');

  INSERT INTO "feedback" (
    "id", "date", "restaurant_id", "recommendation_id", "teammate_id", "type", "created_at"
  ) VALUES (
    'legacy-feedback-1', '2026-07-01', 'legacy-restaurant-1', 'legacy-recommendation-1',
    'legacy-teammate-1', 'blocked', '2026-07-01T04:00:00Z'
  );
`;

async function waitForPostgres() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = run(
      "docker",
      ["exec", containerName, "pg_isready", "-U", "postgres"],
      { allowFailure: true }
    );
    if (result.status === 0) {
      return;
    }
    await wait(500);
  }
  throw new Error("stage6_rehearsal_postgres_not_ready");
}

function prepareLegacyBase(port, database) {
  dockerPsql("postgres", `CREATE DATABASE "${database}";`);
  dockerPsql(database, migrationSql("20260708015407_init"));
  dockerPsql(database, legacyFixture);
  prisma(port, database, ["migrate", "resolve", "--applied", "20260708015407_init"]);
}

let summary;
try {
  run("docker", [
    "run", "--rm", "-d",
    "--name", containerName,
    "-e", `POSTGRES_PASSWORD=${databasePassword}`,
    "-p", "127.0.0.1::5432",
    "postgres:16-alpine"
  ], { errorCode: "stage6_rehearsal_container_failed" });
  await waitForPostgres();

  const portOutput = run("docker", ["port", containerName, "5432/tcp"]).stdout.trim();
  const port = Number(portOutput.split(":").at(-1));
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("stage6_rehearsal_port_failed");
  }

  dockerPsql("postgres", 'CREATE DATABASE "fresh";');
  prisma(port, "fresh", ["migrate", "deploy"]);
  const freshVerification = verifier(port, "fresh");
  assertJson(freshVerification, { ok: true }, "stage6_fresh_verifier_failed");
  assertJson(
    dockerPsql("fresh", `SELECT JSON_BUILD_OBJECT(
      'groups', (SELECT COUNT(*) FROM "lunch_groups"),
      'identities', (SELECT COUNT(*) FROM "identities")
    )::TEXT;`),
    { groups: 0, identities: 0 },
    "stage6_fresh_scaffold_cleanup_failed"
  );

  prepareLegacyBase(port, "legacy");
  prisma(port, "legacy", ["migrate", "deploy"]);
  const legacyVerificationFirst = verifier(port, "legacy");
  const legacyVerificationSecond = verifier(port, "legacy");
  if (legacyVerificationFirst !== legacyVerificationSecond) {
    throw new Error("stage6_verifier_not_repeatable");
  }
  assertJson(legacyVerificationFirst, { ok: true }, "stage6_legacy_verifier_failed");
  assertJson(
    dockerPsql("legacy", `SELECT JSON_BUILD_OBJECT(
      'restaurants', (SELECT COUNT(*) FROM "restaurants"),
      'recommendations', (SELECT COUNT(*) FROM "recommendations"),
      'feedback', (SELECT COUNT(*) FROM "feedback"),
      'avoid_feedback', (SELECT COUNT(*) FROM "feedback" WHERE "type" = 'avoid'),
      'weather', (SELECT COUNT(*) FROM "weather_snapshots"),
      'daily_rows', (SELECT COUNT(*) FROM "daily_recommendations"),
      'legacy_batches', (SELECT COUNT(*) FROM "daily_recommendation_batches" WHERE "source" = 'legacy'),
      'legacy_items', (
        SELECT COUNT(*) FROM "daily_recommendation_items" item
        INNER JOIN "daily_recommendation_batches" batch ON batch."id" = item."batch_id"
        WHERE batch."source" = 'legacy'
      ),
      'current_legacy_batches', (SELECT COUNT(*) FROM "daily_recommendation_batches" WHERE "source" = 'legacy' AND "is_current"),
      'bad_totals', (
        SELECT COUNT(*) FROM "daily_recommendation_items" item
        INNER JOIN "daily_recommendation_batches" batch ON batch."id" = item."batch_id"
        WHERE batch."source" = 'legacy' AND (item."score_breakdown"->>'total')::INTEGER <> item."score"
      ),
      'migrated_snapshots', (
        SELECT COUNT(*) FROM "daily_recommendation_batches"
        WHERE "source" = 'legacy' AND "scoring_weights_snapshot"->>'migrated' = 'true'
      ),
      'ranked_scores', (
        SELECT STRING_AGG(item."rank"::TEXT || ':' || item."score"::TEXT, ',' ORDER BY batch."batch_no", item."rank")
        FROM "daily_recommendation_items" item
        INNER JOIN "daily_recommendation_batches" batch ON batch."id" = item."batch_id"
        WHERE batch."source" = 'legacy'
      ),
      'teammates', (SELECT COUNT(*) FROM "teammates"),
      'memberships', (SELECT COUNT(*) FROM "group_memberships")
    )::TEXT;`),
    {
      restaurants: 1,
      recommendations: 1,
      feedback: 1,
      avoid_feedback: 1,
      weather: 1,
      daily_rows: 4,
      legacy_batches: 2,
      legacy_items: 4,
      current_legacy_batches: 0,
      bad_totals: 0,
      migrated_snapshots: 2,
      ranked_scores: "1:42,2:38,1:50,2:45",
      teammates: 1,
      memberships: 1
    },
    "stage6_legacy_fixture_invariant_failed"
  );

  prepareLegacyBase(port, "overlap");
  dockerPsql("overlap", migrationSql("20260708195726_multi_group_foundation"));
  prisma(port, "overlap", ["migrate", "resolve", "--applied", "20260708195726_multi_group_foundation"]);
  dockerPsql("overlap", migrationSql("20260709120000_stage3_current_batch_invariant"));
  prisma(port, "overlap", ["migrate", "resolve", "--applied", "20260709120000_stage3_current_batch_invariant"]);
  dockerPsql("overlap", `
    INSERT INTO "daily_recommendation_batches" (
      "id", "group_id", "office_date", "batch_no", "source",
      "scoring_weights_snapshot", "algorithm_version", "is_current", "created_at"
    ) VALUES (
      'overlap-batch', 'seed-group-default', '2026-07-01', 1, 'manual',
      '{}'::JSONB, 'group-v1', FALSE, '2026-07-01T05:00:00Z'
    );
  `);
  const overlapDeploy = prisma(port, "overlap", ["migrate", "deploy"], { allowFailure: true });
  if (overlapDeploy.status === 0) {
    throw new Error("stage6_overlap_migration_unexpected_success");
  }
  const overlapLog = dockerPsql("overlap", `
    SELECT COALESCE("logs", '') FROM "_prisma_migrations"
    WHERE "migration_name" = '20260715120000_stage6_legacy_batch_history'
    ORDER BY "started_at" DESC LIMIT 1;
  `);
  if (!overlapLog.includes("stage6_legacy_migration_overlap")) {
    throw new Error("stage6_overlap_migration_missing_report");
  }
  assertJson(
    dockerPsql("overlap", `SELECT JSON_BUILD_OBJECT(
      'daily_rows', (SELECT COUNT(*) FROM "daily_recommendations"),
      'legacy_batches', (SELECT COUNT(*) FROM "daily_recommendation_batches" WHERE "source" = 'legacy')
    )::TEXT;`),
    { daily_rows: 4, legacy_batches: 0 },
    "stage6_overlap_migration_not_atomic"
  );

  summary = {
    ok: true,
    freshMigration: "passed",
    legacyFixtureMigration: "passed",
    verifierRepeatability: "passed",
    overlapAbort: "passed"
  };
} finally {
  run("docker", ["rm", "-f", containerName], { allowFailure: true, stdio: "ignore" });
}

console.log(JSON.stringify(summary));
