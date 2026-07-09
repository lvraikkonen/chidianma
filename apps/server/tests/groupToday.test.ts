import type { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../src/env";
import {
  buildParticipationSummary,
  NoCurrentBatchError,
  getCurrentGroupTodayRecommendations,
  refreshGroupTodayRecommendations
} from "../src/services/recommendation/groupToday";

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
  vi.unstubAllGlobals();
});

describe("group today recommendation service", () => {
  it("returns 404 service error without creating a batch when no current batch exists", async () => {
    const prisma = {
      lunchGroup: {
        findUnique: vi.fn().mockResolvedValue({
          id: "group-1",
          officeTimezone: "Asia/Shanghai"
        })
      },
      dailyRecommendationBatch: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      groupMembership: { count: vi.fn().mockResolvedValue(2) },
      dailyParticipation: { groupBy: vi.fn().mockResolvedValue([]) }
    } as unknown as PrismaClient;

    await expect(
      getCurrentGroupTodayRecommendations({ prisma, env, groupId: "group-1" })
    ).rejects.toBeInstanceOf(NoCurrentBatchError);

    expect(prisma.dailyRecommendationBatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: "group-1", officeDate: "2026-07-09", isCurrent: true }
      })
    );
  });

  it("ignores removed memberships when building participation summary", async () => {
    const prisma = {
      groupMembership: {
        findMany: vi.fn().mockResolvedValue([
          { id: "membership-active", status: "active" }
        ])
      },
      dailyParticipation: {
        findMany: vi.fn().mockResolvedValue([
          { membershipId: "membership-active", status: "joining" },
          { membershipId: "membership-removed", status: "joining" }
        ])
      }
    } as unknown as PrismaClient;

    await expect(
      buildParticipationSummary({ prisma, groupId: "group-1", officeDate: "2026-07-09" })
    ).resolves.toEqual({
      joiningCount: 1,
      decidedCount: 0,
      awayCount: 0,
      undecidedCount: 0
    });

    expect(prisma.groupMembership.findMany).toHaveBeenCalledWith({
      where: { groupId: "group-1", status: "active" },
      select: { id: true }
    });
  });

  it("creates a manual batch with active group restaurants, score breakdown, and weights snapshot", async () => {
    const prisma = buildPrismaForRefreshTest();
    const response = await refreshGroupTodayRecommendations({
      prisma: prisma as unknown as PrismaClient,
      env,
      groupId: "group-1",
      membership: {
        identityId: "identity-1",
        groupId: "group-1",
        membershipId: "membership-1",
        role: "member"
      }
    });

    expect(response.groupId).toBe("group-1");
    expect(response.officeDate).toBe("2026-07-09");
    expect(response.batchNo).toBe(1);
    expect(response.weather).toMatchObject({
      city: "Shanghai",
      condition: "rainy",
      windLevel: "light"
    });
    expect(response.items[0]).toMatchObject({
      rank: 1,
      restaurantId: "restaurant-1",
      recommendationId: "recommendation-1",
      scoreBreakdown: expect.objectContaining({ total: expect.any(Number) })
    });
    expect(prisma.restaurant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          groupId: "group-1",
          status: "active"
        })
      })
    );
    expect(prisma.dailyRecommendationBatch.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: "manual",
          scoringWeightsSnapshot: expect.objectContaining({
            recentDuplicatePenalty: 12
          })
        })
      })
    );
    expect(prisma.weatherSnapshot.findUnique).toHaveBeenCalledWith({
      where: {
        groupId_date_city: {
          groupId: "group-1",
          date: "2026-07-09",
          city: "Shanghai"
        }
      }
    });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("retries refresh after a serializable transaction conflict", async () => {
    const prisma = buildPrismaForRefreshTest();
    const conflict = Object.assign(new Error("serialization failure"), {
      code: "P2034",
      clientVersion: "6.1.0"
    });
    prisma.$transaction
      .mockRejectedValueOnce(conflict)
      .mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma));

    const response = await refreshGroupTodayRecommendations({
      prisma: prisma as unknown as PrismaClient,
      env,
      groupId: "group-1",
      membership: {
        identityId: "identity-1",
        groupId: "group-1",
        membershipId: "membership-1",
        role: "member"
      }
    });

    expect(response.batchNo).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["camelCase current-batch target", ["groupId", "officeDate"]],
    ["snake_case current-batch target", ["group_id", "office_date"]],
    ["camelCase batch-number target", ["groupId", "officeDate", "batchNo"]],
    ["snake_case batch-number target", ["group_id", "office_date", "batch_no"]]
  ])("retries refresh for %s", async (_label, target) => {
    const prisma = buildPrismaForRefreshTest();
    const conflict = Object.assign(new Error("unique constraint conflict"), {
      code: "P2002",
      clientVersion: "6.1.0",
      meta: { target }
    });
    prisma.$transaction
      .mockRejectedValueOnce(conflict)
      .mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma));

    const response = await refreshGroupTodayRecommendations({
      prisma: prisma as unknown as PrismaClient,
      env,
      groupId: "group-1",
      membership: {
        identityId: "identity-1",
        groupId: "group-1",
        membershipId: "membership-1",
        role: "member"
      }
    });

    expect(response.batchNo).toBe(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("uses weatherMatch 0 when weather is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const prisma = buildPrismaForRefreshTest({ weatherSnapshot: null });

    const response = await refreshGroupTodayRecommendations({
      prisma: prisma as unknown as PrismaClient,
      env,
      groupId: "group-1",
      membership: {
        identityId: "identity-1",
        groupId: "group-1",
        membershipId: "membership-1",
        role: "member"
      }
    });

    expect(response.weatherUnavailable).toBe(true);
    expect(response.items[0]?.scoreBreakdown.weatherMatch).toBe(0);
  });
});

function buildPrismaForRefreshTest(options: {
  weatherSnapshot?: Record<string, unknown> | null;
} = {}) {
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
    area: "静安寺",
    address: "南京西路",
    distanceMinutes: 8,
    cuisine: "面食",
    priceBand: "¥¥",
    averagePriceCents: 4200,
    supportsDineIn: true,
    supportsTakeout: true,
    tags: ["近", "热乎"],
    status: "active",
    recommendations: [
      {
        id: "recommendation-1",
        dish: "叉烧拉面",
        reason: "汤热面香",
        weatherTags: ["rainy"],
        weekdayTags: ["thursday"],
        moodTags: ["想吃面"]
      }
    ],
    feedback: []
  };
  const defaultSnapshot = {
    id: "weather-1",
    groupId: "group-1",
    date: "2026-07-09",
    city: "Shanghai",
    temperatureC: 22,
    condition: "rainy",
    precipitationProbability: 70,
    windLevel: "light",
    rawPayload: { source: "open-meteo" }
  };
  const snapshot = Object.prototype.hasOwnProperty.call(options, "weatherSnapshot")
    ? options.weatherSnapshot
    : defaultSnapshot;

  const prisma = {
    lunchGroup: {
      findUnique: vi.fn().mockResolvedValue(group)
    },
    scoringWeights: {
      findUnique: vi.fn().mockResolvedValue(null)
    },
    weatherSnapshot: {
      findUnique: vi.fn().mockResolvedValue(snapshot),
      upsert: vi.fn().mockResolvedValue(defaultSnapshot)
    },
    restaurant: {
      findMany: vi.fn().mockResolvedValue([restaurant])
    },
    dailyRecommendationItem: {
      findMany: vi.fn().mockResolvedValue([])
    },
    dailyRecommendationBatch: {
      aggregate: vi.fn().mockResolvedValue({ _max: { batchNo: null } }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn(async ({ data }: { data: Record<string, any> }) => ({
        id: "batch-1",
        ...data,
        createdAt: new Date("2026-07-09T04:00:00.000Z"),
        items: data.items.create.map((item: Record<string, unknown>, index: number) => ({
          id: `item-${index + 1}`,
          ...item,
          restaurant,
          recommendation: restaurant.recommendations.find(
            (recommendation) => recommendation.id === item.recommendationId
          ) ?? null,
          createdAt: new Date("2026-07-09T04:00:00.000Z")
        }))
      }))
    },
    groupMembership: {
      findMany: vi.fn().mockResolvedValue([{ id: "membership-1" }]),
      count: vi.fn().mockResolvedValue(1)
    },
    dailyParticipation: {
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([])
    },
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma))
  };

  return prisma;
}
