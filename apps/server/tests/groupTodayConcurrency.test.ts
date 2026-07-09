import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../src/env";
import { refreshGroupTodayRecommendations } from "../src/services/recommendation/groupToday";

const env = {
  SESSION_SECRET: "session-secret",
  OFFICE_TIMEZONE: "Asia/Shanghai",
  OFFICE_CITY: "Shanghai",
  OFFICE_LATITUDE: 31.2304,
  OFFICE_LONGITUDE: 121.4737,
  WEATHER_API_BASE_URL: "https://api.open-meteo.com/v1"
} as AppEnv;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-09T04:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("group today refresh concurrency", () => {
  it("leaves exactly one current batch after concurrent refreshes", async () => {
    const prisma = buildConcurrentRefreshPrisma({ firstWaveSize: 5 });
    const membership = {
      identityId: "identity-1",
      groupId: "group-1",
      membershipId: "membership-1",
      role: "member" as const
    };

    await Promise.all(
      Array.from({ length: 5 }, () =>
        refreshGroupTodayRecommendations({
          prisma: prisma as unknown as PrismaClient,
          env,
          groupId: "group-1",
          membership
        })
      )
    );

    expect(prisma.__currentBatches("group-1", "2026-07-09")).toHaveLength(1);
  });

  it("retries duplicate batchNo 1 and makes batch 2 the only current batch", async () => {
    const prisma = buildConcurrentRefreshPrisma({ firstWaveSize: 2 });
    const membership = {
      identityId: "identity-1",
      groupId: "group-1",
      membershipId: "membership-1",
      role: "member" as const
    };

    await Promise.all([
      refreshGroupTodayRecommendations({
        prisma: prisma as unknown as PrismaClient,
        env,
        groupId: "group-1",
        membership
      }),
      refreshGroupTodayRecommendations({
        prisma: prisma as unknown as PrismaClient,
        env,
        groupId: "group-1",
        membership
      })
    ]);

    expect(prisma.__conflicts()).toContain(
      "daily_recommendation_batches_group_id_office_date_batch_no_key"
    );
    expect(prisma.__currentBatches("group-1", "2026-07-09")).toMatchObject([
      { batchNo: 2, isCurrent: true }
    ]);
  });

  it("retries the partial current-batch unique invariant", async () => {
    const prisma = buildConcurrentRefreshPrisma({ firstWaveSize: 2, preferCurrentConflict: true });
    const membership = {
      identityId: "identity-1",
      groupId: "group-1",
      membershipId: "membership-1",
      role: "member" as const
    };

    await Promise.all([
      refreshGroupTodayRecommendations({
        prisma: prisma as unknown as PrismaClient,
        env,
        groupId: "group-1",
        membership
      }),
      refreshGroupTodayRecommendations({
        prisma: prisma as unknown as PrismaClient,
        env,
        groupId: "group-1",
        membership
      })
    ]);

    expect(prisma.__conflicts()).toContain("daily_recommendation_batches_one_current_key");
    expect(prisma.__currentBatches("group-1", "2026-07-09")).toHaveLength(1);
  });
});

interface StoredBatch {
  id: string;
  groupId: string;
  officeDate: string;
  batchNo: number;
  isCurrent: boolean;
  source: string;
  generatedByMembershipId: string | null;
  weatherSnapshotId: string | null;
  scoringWeightsSnapshot: Record<string, number>;
  algorithmVersion: string;
  createdAt: Date;
  items: Array<Record<string, any>>;
}

function buildConcurrentRefreshPrisma(options: {
  firstWaveSize: number;
  preferCurrentConflict?: boolean;
}) {
  const group = {
    id: "group-1",
    officeCity: "Shanghai",
    officeLatitude: 31.2304,
    officeLongitude: 121.4737,
    officeTimezone: "Asia/Shanghai"
  };
  const restaurant = {
    id: "restaurant-1",
    groupId: "group-1",
    name: "拉面小馆",
    distanceMinutes: 8,
    priceBand: "¥¥",
    averagePriceCents: 4200,
    supportsDineIn: true,
    supportsTakeout: true,
    tags: ["近"],
    status: "active",
    recommendations: [
      {
        id: "recommendation-1",
        dish: "叉烧拉面",
        reason: "汤热面香",
        weatherTags: ["clear"],
        weekdayTags: ["thursday"],
        moodTags: ["想吃面"]
      }
    ],
    feedback: []
  };
  const weatherSnapshot = {
    id: "weather-1",
    groupId: "group-1",
    date: "2026-07-09",
    city: "Shanghai",
    temperatureC: 24,
    condition: "clear",
    precipitationProbability: 10,
    windLevel: "light"
  };

  let batches: StoredBatch[] = [];
  let transactionCalls = 0;
  let commitQueue = Promise.resolve();
  let retryQueue = Promise.resolve();
  const conflicts: string[] = [];

  const prisma = {
    lunchGroup: { findUnique: vi.fn().mockResolvedValue(group) },
    weatherSnapshot: {
      findUnique: vi.fn().mockResolvedValue(weatherSnapshot),
      upsert: vi.fn().mockResolvedValue(weatherSnapshot)
    },
    __currentBatches: (groupId: string, officeDate: string) =>
      batches.filter((batch) =>
        batch.groupId === groupId && batch.officeDate === officeDate && batch.isCurrent
      ),
    __conflicts: () => [...conflicts],
    $transaction: vi.fn(async (
      callback: (tx: Record<string, any>) => Promise<unknown>,
      transactionOptions: { isolationLevel?: string }
    ) => {
      const callNo = ++transactionCalls;
      expect(transactionOptions).toMatchObject({ isolationLevel: "Serializable" });

      let releaseRetry: (() => void) | undefined;
      if (callNo > options.firstWaveSize) {
        const previousRetry = retryQueue;
        retryQueue = new Promise<void>((resolve) => {
          releaseRetry = resolve;
        });
        await previousRetry;
      }

      const snapshot = batches.map(cloneBatch);
      const demotedIds = new Set<string>();
      let created: StoredBatch | null = null;
      const tx = {
        scoringWeights: { findUnique: vi.fn().mockResolvedValue(null) },
        restaurant: { findMany: vi.fn().mockResolvedValue([restaurant]) },
        dailyRecommendationItem: { findMany: vi.fn().mockResolvedValue([]) },
        dailyRecommendationBatch: {
          aggregate: vi.fn().mockImplementation(async ({ where }: { where: Record<string, string> }) => ({
            _max: {
              batchNo: snapshot
                .filter((batch) => batch.groupId === where.groupId && batch.officeDate === where.officeDate)
                .reduce<number | null>((maximum, batch) =>
                  maximum === null || batch.batchNo > maximum ? batch.batchNo : maximum, null)
            }
          })),
          updateMany: vi.fn().mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
            const visible = snapshot.filter((batch) =>
              batch.groupId === where.groupId
              && batch.officeDate === where.officeDate
              && batch.isCurrent === where.isCurrent
            );
            visible.forEach((batch) => demotedIds.add(batch.id));
            return { count: visible.length };
          }),
          create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, any> }) => {
            const itemCreates = data.items.create as Array<Record<string, any>>;
            created = {
              id: `batch-${callNo}`,
              groupId: data.groupId,
              officeDate: data.officeDate,
              batchNo: data.batchNo,
              source: data.source,
              generatedByMembershipId: data.generatedByMembershipId,
              weatherSnapshotId: data.weatherSnapshotId,
              scoringWeightsSnapshot: data.scoringWeightsSnapshot,
              algorithmVersion: data.algorithmVersion,
              isCurrent: data.isCurrent,
              createdAt: new Date("2026-07-09T04:00:00.000Z"),
              items: itemCreates.map((item, index) => ({
                id: `item-${callNo}-${index + 1}`,
                ...item,
                restaurant,
                recommendation: restaurant.recommendations.find(
                  (recommendation) => recommendation.id === item.recommendationId
                ) ?? null,
                createdAt: new Date("2026-07-09T04:00:00.000Z")
              }))
            };
            return created;
          })
        },
        groupMembership: {
          findMany: vi.fn().mockResolvedValue([{ id: "membership-1" }]),
          count: vi.fn().mockResolvedValue(1)
        },
        dailyParticipation: {
          findMany: vi.fn().mockResolvedValue([]),
          groupBy: vi.fn().mockResolvedValue([])
        }
      };

      try {
        const result = await callback(tx);
        const priorCommit = commitQueue;
        let releaseCommit: () => void = () => undefined;
        commitQueue = new Promise<void>((resolve) => {
          releaseCommit = resolve;
        });
        await priorCommit;
        try {
          if (!created) throw new Error("transaction did not create a batch");
          const nextBatches = batches.map((batch) =>
            demotedIds.has(batch.id) ? { ...batch, isCurrent: false } : cloneBatch(batch)
          );
          const currentConflict = nextBatches.some((batch) =>
            batch.groupId === created?.groupId
            && batch.officeDate === created?.officeDate
            && batch.isCurrent
            && created?.isCurrent
          );
          const batchNoConflict = nextBatches.some((batch) =>
            batch.groupId === created?.groupId
            && batch.officeDate === created?.officeDate
            && batch.batchNo === created?.batchNo
          );
          const currentKey = "daily_recommendation_batches_one_current_key";
          const batchNoKey = "daily_recommendation_batches_group_id_office_date_batch_no_key";

          if (options.preferCurrentConflict && currentConflict) {
            conflicts.push(currentKey);
            throw uniqueError(currentKey);
          }
          if (batchNoConflict) {
            conflicts.push(batchNoKey);
            throw uniqueError(batchNoKey);
          }
          if (currentConflict) {
            conflicts.push(currentKey);
            throw uniqueError(currentKey);
          }

          batches = [...nextBatches, cloneBatch(created)];
          return result;
        } finally {
          releaseCommit();
        }
      } finally {
        releaseRetry?.();
      }
    })
  };

  return prisma;
}

function cloneBatch(batch: StoredBatch): StoredBatch {
  return {
    ...batch,
    scoringWeightsSnapshot: { ...batch.scoringWeightsSnapshot },
    createdAt: new Date(batch.createdAt),
    items: batch.items.map((item) => ({ ...item }))
  };
}

function uniqueError(target: string) {
  return Object.assign(new Error(`Unique constraint failed on ${target}`), {
    code: "P2002",
    clientVersion: "6.1.0",
    meta: { target }
  });
}
