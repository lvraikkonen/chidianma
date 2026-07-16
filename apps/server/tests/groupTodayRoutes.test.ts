import type { GroupRole, MembershipStatus } from "@lunch/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signGroupSessionToken } from "../src/services/auth/tokens";

const prisma = vi.hoisted(() => {
  const client = {
    groupMembership: {
      findUnique: vi.fn(),
      findMany: vi.fn()
    },
    lunchGroup: {
      findUnique: vi.fn()
    },
    scoringWeights: {
      findUnique: vi.fn()
    },
    weatherSnapshot: {
      findUnique: vi.fn(),
      upsert: vi.fn()
    },
    restaurant: {
      findMany: vi.fn()
    },
    dailyRecommendationItem: {
      findMany: vi.fn()
    },
    dailyRecommendationBatch: {
      findFirst: vi.fn(),
      aggregate: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn()
    },
    dailyParticipation: {
      findMany: vi.fn()
    },
    $transaction: vi.fn()
  };

  return {
    ...client,
    __reset: () => {
      for (const model of [
        client.groupMembership,
        client.lunchGroup,
        client.scoringWeights,
        client.weatherSnapshot,
        client.restaurant,
        client.dailyRecommendationItem,
        client.dailyRecommendationBatch,
        client.dailyParticipation
      ]) {
        for (const method of Object.values(model)) {
          method.mockReset();
        }
      }
      client.$transaction.mockReset();
      client.$transaction.mockImplementation(
        async (callback: (transaction: typeof client) => Promise<unknown>) => callback(client)
      );
    }
  };
});

vi.mock("../src/plugins/prisma", () => ({ prisma }));

const env = {
  DATABASE_URL: "postgresql://example",
  TEAM_INVITE_CODE: "team-code",
  SESSION_SECRET: "session-secret",
  EXTENSION_READ_TOKEN: "read-token",
  ALLOW_PUBLIC_GROUP_CREATION: true,
  IDENTITY_TOKEN_TTL_DAYS: 90,
  GROUP_SESSION_TTL_DAYS: 14,
  WEATHER_API_BASE_URL: "https://api.open-meteo.com/v1",
  OFFICE_CITY: "Shanghai",
  OFFICE_LATITUDE: "31.2304",
  OFFICE_LONGITUDE: "121.4737",
  OFFICE_TIMEZONE: "Asia/Shanghai",
  PUBLIC_API_BASE_URL: "http://localhost:3000",
  NODE_ENV: "test",
  PORT: "3000"
};

async function buildTestApp() {
  Object.assign(process.env, env);
  const { buildApp } = await import("../src/app");
  return buildApp();
}

function groupToken(input: {
  identityId?: string;
  groupId?: string;
  membershipId?: string;
  role?: GroupRole;
} = {}) {
  return signGroupSessionToken(
    {
      identityId: input.identityId ?? "identity-1",
      groupId: input.groupId ?? "group-1",
      membershipId: input.membershipId ?? "membership-1",
      role: input.role ?? "member",
      exp: Date.now() + 60_000
    },
    "session-secret"
  );
}

function seedMembership(status: MembershipStatus = "active") {
  prisma.groupMembership.findUnique.mockResolvedValue({
    id: "membership-1",
    groupId: "group-1",
    identityId: "identity-1",
    role: "member",
    status,
    identity: { authVersion: 0, anonymizedAt: null }
  });
}

function seedGroup() {
  prisma.lunchGroup.findUnique.mockResolvedValue({
    id: "group-1",
    officeTimezone: "Asia/Shanghai",
    officeCity: "Shanghai",
    officeLatitude: 31.2304,
    officeLongitude: 121.4737
  });
}

function seedRefreshPrisma() {
  const restaurant = {
    id: "restaurant-1",
    groupId: "group-1",
    name: "拉面小馆",
    distanceMinutes: 8,
    priceBand: "¥¥",
    averagePriceCents: 4200,
    supportsDineIn: true,
    supportsTakeout: true,
    tags: ["近", "热乎"],
    recommendations: [
      {
        id: "recommendation-1",
        dish: "叉烧拉面",
        weatherTags: ["rainy"],
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
    temperatureC: 22,
    condition: "rainy",
    precipitationProbability: 70,
    windLevel: "light",
    rawPayload: { source: "open-meteo" }
  };

  seedGroup();
  prisma.weatherSnapshot.findUnique.mockResolvedValue(weatherSnapshot);
  prisma.scoringWeights.findUnique.mockResolvedValue(null);
  prisma.restaurant.findMany.mockResolvedValue([restaurant]);
  prisma.dailyRecommendationItem.findMany.mockResolvedValue([]);
  prisma.dailyRecommendationBatch.aggregate.mockResolvedValue({ _max: { batchNo: null } });
  prisma.dailyRecommendationBatch.updateMany.mockResolvedValue({ count: 0 });
  prisma.dailyRecommendationBatch.create.mockImplementation(
    async ({ data }: { data: Record<string, any> }) => ({
      id: "batch-1",
      ...data,
      createdAt: new Date("2026-07-09T04:00:00.000Z"),
      items: data.items.create.map((item: Record<string, unknown>, index: number) => ({
        id: `item-${index + 1}`,
        ...item,
        restaurant,
        recommendation:
          restaurant.recommendations.find(
            (recommendation) => recommendation.id === item.recommendationId
          ) ?? null
      }))
    })
  );
  prisma.groupMembership.findMany.mockResolvedValue([{ id: "membership-1" }]);
  prisma.dailyParticipation.findMany.mockResolvedValue([]);
}

describe("group today recommendation routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-09T04:00:00.000Z"));
    prisma.__reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const key of Object.keys(env)) {
      delete process.env[key];
    }
  });

  it.each([
    ["GET", "/api/groups/group-1/today-recommendations"],
    ["POST", "/api/groups/group-1/today-recommendations/refresh"]
  ] as const)("returns 401/missing_token without Authorization for %s %s", async (method, url) => {
    const app = await buildTestApp();
    const response = await app.inject({ method, url });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "missing_token" });
    await app.close();
  });

  it.each([
    ["GET", "/api/groups/group-1/today-recommendations"],
    ["POST", "/api/groups/group-1/today-recommendations/refresh"]
  ] as const)("rejects read-token-only %s %s requests", async (method, url) => {
    const app = await buildTestApp();
    const response = await app.inject({
      method,
      url,
      headers: { "x-lunch-read-token": "read-token" }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "missing_token" });
    await app.close();
  });

  it.each([
    ["GET", "/api/groups/group-1/today-recommendations"],
    ["POST", "/api/groups/group-1/today-recommendations/refresh"]
  ] as const)("rejects removed memberships for %s %s", async (method, url) => {
    seedMembership("removed");

    const app = await buildTestApp();
    const response = await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${groupToken()}` }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "active_membership_required" });
    await app.close();
  });

  it("returns 404 and does not create a batch when no current batch exists", async () => {
    seedMembership();
    seedGroup();
    prisma.dailyRecommendationBatch.findFirst.mockResolvedValue(null);

    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/groups/group-1/today-recommendations",
      headers: { authorization: `Bearer ${groupToken()}` }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "no_current_batch" });
    expect(prisma.dailyRecommendationBatch.create).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([
    ["GET", "/api/groups/group-1/today-recommendations"],
    ["POST", "/api/groups/group-1/today-recommendations/refresh"]
  ] as const)("rejects a session token for another group on %s %s", async (method, url) => {
    seedMembership();
    const app = await buildTestApp();
    const response = await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${groupToken({ groupId: "group-2" })}` }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "group_session_mismatch" });
    await app.close();
  });

  it("creates a new current batch through POST refresh", async () => {
    seedMembership();
    seedRefreshPrisma();

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/today-recommendations/refresh",
      headers: { authorization: `Bearer ${groupToken()}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      groupId: "group-1",
      officeDate: "2026-07-09",
      batchNo: 1,
      items: [{ rank: 1, restaurantId: "restaurant-1" }]
    });
    expect(prisma.dailyRecommendationBatch.updateMany).toHaveBeenCalledWith({
      where: { groupId: "group-1", officeDate: "2026-07-09", isCurrent: true },
      data: { isCurrent: false }
    });
    await app.close();
  });
});
