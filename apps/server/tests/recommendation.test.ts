import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../src/env";
import { rankRestaurantCandidates } from "../src/services/recommendation/scorer";
import { getTodayRecommendations } from "../src/services/recommendation/today";

const env: AppEnv = {
  DATABASE_URL: "postgresql://example",
  TEAM_INVITE_CODE: "team-code",
  SESSION_SECRET: "session-secret",
  EXTENSION_READ_TOKEN: "read-token",
  WEATHER_API_BASE_URL: "https://api.open-meteo.com/v1",
  OFFICE_CITY: "Shanghai",
  OFFICE_LATITUDE: 31.2304,
  OFFICE_LONGITUDE: 121.4737,
  OFFICE_TIMEZONE: "Asia/Shanghai",
  PUBLIC_API_BASE_URL: "http://localhost:3000",
  NODE_ENV: "test",
  PORT: 3000
};

afterEach(() => {
  vi.useRealTimers();
});

describe("rankRestaurantCandidates", () => {
  it("returns top three active candidates with readable reasons", () => {
    const ranked = rankRestaurantCandidates({
      candidates: [
        {
          restaurantId: "r1",
          recommendationId: "rec1",
          name: "拉面小馆",
          dish: "叉烧拉面",
          distanceMinutes: 8,
          tags: ["热乎", "雨天"],
          weekdayMatch: 1,
          weatherMatch: 1,
          teammateRecommendationCount: 2,
          recentlyRecommended: false,
          negativeFeedbackCount: 0
        },
        {
          restaurantId: "r2",
          recommendationId: "rec2",
          name: "远处火锅",
          dish: "番茄锅",
          distanceMinutes: 30,
          tags: ["热乎"],
          weekdayMatch: 0,
          weatherMatch: 1,
          teammateRecommendationCount: 1,
          recentlyRecommended: true,
          negativeFeedbackCount: 1
        }
      ],
      limit: 3
    });

    expect(ranked).toHaveLength(2);
    expect(ranked[0]).toMatchObject({
      restaurantName: "拉面小馆",
      dish: "叉烧拉面",
      distanceMinutes: 8
    });
    expect(ranked[0]?.reason).toContain("适合今天");
  });
});

describe("getTodayRecommendations", () => {
  it("reuses an existing current batch with restaurant and recommendation mood tags", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-07T04:00:00.000Z"));

    const tx = {
      dailyRecommendation: {
        findMany: vi.fn().mockResolvedValue([
          {
            restaurantId: "restaurant-1",
            recommendationId: "recommendation-1",
            score: 42,
            reason: "适合今天，也离办公室近。",
            restaurant: {
              name: "拉面小馆",
              distanceMinutes: 8,
              tags: ["热乎", "近"]
            },
            recommendation: {
              dish: "叉烧拉面",
              moodTags: ["想吃面"]
            }
          }
        ]),
        updateMany: vi.fn(),
        createMany: vi.fn()
      },
      restaurant: {
        findMany: vi.fn()
      }
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof tx) => Promise<unknown>) => callback(tx))
    } as unknown as PrismaClient;

    const response = await getTodayRecommendations({ prisma, env, forceRefresh: false });

    expect(response.items).toHaveLength(1);
    expect(response.items[0]).toMatchObject({
      restaurantId: "restaurant-1",
      recommendationId: "recommendation-1",
      restaurantName: "拉面小馆",
      dish: "叉烧拉面",
      tags: ["热乎", "近", "想吃面"]
    });
    expect(tx.restaurant.findMany).not.toHaveBeenCalled();
    expect(tx.dailyRecommendation.updateMany).not.toHaveBeenCalled();
    expect(tx.dailyRecommendation.createMany).not.toHaveBeenCalled();
  });

  it("force refresh demotes existing current rows and creates a new current batch", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-07T04:00:00.000Z"));

    const tx = {
      dailyRecommendation: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              restaurantId: "old-restaurant",
              recommendationId: "old-recommendation",
              score: 12,
              reason: "之前的推荐",
              restaurant: { name: "旧推荐", distanceMinutes: 10, tags: [] },
              recommendation: { dish: "旧菜", moodTags: [] }
            }
          ])
          .mockResolvedValueOnce([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      restaurant: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "restaurant-2",
            name: "米饭小馆",
            distanceMinutes: 7,
            tags: ["近"],
            recommendations: [
              {
                id: "recommendation-2",
                dish: "卤肉饭",
                weatherTags: ["rainy"],
                weekdayTags: ["tuesday"],
                moodTags: ["下饭"]
              }
            ],
            feedback: []
          }
        ])
      }
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof tx) => Promise<unknown>) => callback(tx))
    } as unknown as PrismaClient;

    const response = await getTodayRecommendations({ prisma, env, forceRefresh: true });

    expect(tx.dailyRecommendation.updateMany).toHaveBeenCalledWith({
      where: { date: "2026-07-07", isCurrent: true },
      data: { isCurrent: false }
    });
    expect(tx.dailyRecommendation.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          date: "2026-07-07",
          batchId: expect.any(String),
          restaurantId: "restaurant-2",
          recommendationId: "recommendation-2",
          score: expect.any(Number),
          reason: expect.any(String),
          isCurrent: true
        })
      ]
    });
    expect(response.items).toHaveLength(1);
    expect(response.items[0]).toMatchObject({
      restaurantId: "restaurant-2",
      recommendationId: "recommendation-2",
      tags: ["近", "下饭"]
    });
  });
});
