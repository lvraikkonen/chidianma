export interface DatabaseQueryClient {
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
}

interface DatabaseCheck {
  name: string;
  sql: string;
}

export interface DatabaseCheckResult {
  name: string;
  ok: boolean;
  count: number;
}

export interface DatabaseVerificationResult {
  ok: boolean;
  checks: DatabaseCheckResult[];
}

export const DATABASE_CHECKS: readonly DatabaseCheck[] = [
  {
    name: "unfinished_migrations",
    sql: `
      SELECT COUNT(*)::BIGINT AS count
      FROM "_prisma_migrations"
      WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL
    `
  },
  {
    name: "cross_group_relationships",
    sql: `
      SELECT COUNT(*)::BIGINT AS count
      FROM (
        SELECT recommendation."id"
        FROM "recommendations" recommendation
        INNER JOIN "restaurants" restaurant ON restaurant."id" = recommendation."restaurant_id"
        WHERE recommendation."group_id" <> restaurant."group_id"
        UNION ALL
        SELECT legacy."id"
        FROM "daily_recommendations" legacy
        INNER JOIN "restaurants" restaurant ON restaurant."id" = legacy."restaurant_id"
        WHERE legacy."group_id" <> restaurant."group_id"
        UNION ALL
        SELECT legacy."id"
        FROM "daily_recommendations" legacy
        INNER JOIN "recommendations" recommendation ON recommendation."id" = legacy."recommendation_id"
        WHERE legacy."group_id" <> recommendation."group_id"
        UNION ALL
        SELECT feedback."id"
        FROM "feedback" feedback
        INNER JOIN "restaurants" restaurant ON restaurant."id" = feedback."restaurant_id"
        WHERE feedback."group_id" <> restaurant."group_id"
        UNION ALL
        SELECT feedback."id"
        FROM "feedback" feedback
        INNER JOIN "recommendations" recommendation ON recommendation."id" = feedback."recommendation_id"
        WHERE feedback."group_id" <> recommendation."group_id"
        UNION ALL
        SELECT feedback."id"
        FROM "feedback" feedback
        INNER JOIN "group_memberships" membership ON membership."id" = feedback."membership_id"
        WHERE feedback."group_id" <> membership."group_id"
        UNION ALL
        SELECT participation."id"
        FROM "daily_participation" participation
        INNER JOIN "group_memberships" membership ON membership."id" = participation."membership_id"
        WHERE participation."group_id" <> membership."group_id"
        UNION ALL
        SELECT batch."id"
        FROM "daily_recommendation_batches" batch
        INNER JOIN "group_memberships" membership ON membership."id" = batch."generated_by_membership_id"
        WHERE batch."group_id" <> membership."group_id"
        UNION ALL
        SELECT item."id"
        FROM "daily_recommendation_items" item
        INNER JOIN "daily_recommendation_batches" batch ON batch."id" = item."batch_id"
        INNER JOIN "restaurants" restaurant ON restaurant."id" = item."restaurant_id"
        WHERE batch."group_id" <> restaurant."group_id"
        UNION ALL
        SELECT item."id"
        FROM "daily_recommendation_items" item
        INNER JOIN "daily_recommendation_batches" batch ON batch."id" = item."batch_id"
        INNER JOIN "recommendations" recommendation ON recommendation."id" = item."recommendation_id"
        WHERE batch."group_id" <> recommendation."group_id"
      ) AS mismatches
    `
  },
  {
    name: "duplicate_current_batches",
    sql: `
      SELECT COUNT(*)::BIGINT AS count
      FROM (
        SELECT "group_id", "office_date"
        FROM "daily_recommendation_batches"
        WHERE "is_current" = TRUE
        GROUP BY "group_id", "office_date"
        HAVING COUNT(*) > 1
      ) AS duplicates
    `
  },
  {
    name: "legacy_batch_count_delta",
    sql: `
      SELECT ABS(
        (SELECT COUNT(DISTINCT ("group_id", "date", "batch_id")) FROM "daily_recommendations") -
        (SELECT COUNT(*) FROM "daily_recommendation_batches" WHERE "source" = 'legacy')
      )::BIGINT AS count
    `
  },
  {
    name: "legacy_item_count_delta",
    sql: `
      SELECT ABS(
        (SELECT COUNT(*) FROM "daily_recommendations") -
        (
          SELECT COUNT(*)
          FROM "daily_recommendation_items" item
          INNER JOIN "daily_recommendation_batches" batch ON batch."id" = item."batch_id"
          WHERE batch."source" = 'legacy'
        )
      )::BIGINT AS count
    `
  },
  {
    name: "groups_without_active_admin",
    sql: `
      SELECT COUNT(*)::BIGINT AS count
      FROM "lunch_groups" group_row
      WHERE NOT EXISTS (
        SELECT 1
        FROM "group_memberships" membership
        WHERE membership."group_id" = group_row."id"
          AND membership."role" = 'admin'
          AND membership."status" = 'active'
      )
    `
  }
] as const;

function normalizeCount(value: bigint | number | string): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("database_verifier_invalid_count");
  }
  return count;
}

export async function verifyDatabase(client: DatabaseQueryClient): Promise<DatabaseVerificationResult> {
  const checks: DatabaseCheckResult[] = [];

  for (const check of DATABASE_CHECKS) {
    const rows = await client.$queryRawUnsafe<Array<{ count: bigint | number | string }>>(check.sql);
    if (rows.length !== 1 || rows[0]?.count === undefined) {
      throw new Error("database_verifier_invalid_result");
    }
    const count = normalizeCount(rows[0].count);
    checks.push({ name: check.name, ok: count === 0, count });
  }

  return {
    ok: checks.every((check) => check.ok),
    checks
  };
}
