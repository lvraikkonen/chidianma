import type { GroupRole, MembershipStatus } from "@lunch/shared";
import { DEFAULT_GROUP_SCORING_WEIGHTS } from "@lunch/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signGroupSessionToken } from "../src/services/auth/tokens";

const prisma = vi.hoisted(() => {
  const client = {
    groupMembership: { findUnique: vi.fn() },
    lunchGroup: { findUnique: vi.fn() },
    dailyRecommendationBatch: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn()
    },
    weatherSnapshot: { findUnique: vi.fn(), upsert: vi.fn() },
    restaurant: { findMany: vi.fn() },
    feedback: { findMany: vi.fn() },
    dailyRecommendationItem: { findMany: vi.fn() },
    dailyParticipation: { findMany: vi.fn() },
    scoringWeights: { findUnique: vi.fn() },
    $transaction: vi.fn()
  };

  return {
    ...client,
    __reset: () => {
      for (const model of [
        client.groupMembership,
        client.lunchGroup,
        client.dailyRecommendationBatch,
        client.weatherSnapshot,
        client.restaurant,
        client.feedback,
        client.dailyRecommendationItem,
        client.dailyParticipation,
        client.scoringWeights
      ]) {
        for (const method of Object.values(model)) method.mockReset();
      }
      client.$transaction.mockReset();
    }
  };
});

vi.mock("../src/plugins/prisma", () => ({ prisma }));

const env: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgresql://example",
  SESSION_SECRET: "session-secret",
  ALLOW_PUBLIC_GROUP_CREATION: "true",
  LUCKY_RESTAURANT_WHEEL_ENABLED: "false",
  LUCKY_RESTAURANT_WHEEL_GROUP_IDS: "",
  IDENTITY_TOKEN_TTL_DAYS: "90",
  GROUP_SESSION_TTL_DAYS: "14",
  WEATHER_API_BASE_URL: "https://api.open-meteo.com/v1",
  OFFICE_CITY: "Shanghai",
  OFFICE_LATITUDE: "31.2304",
  OFFICE_LONGITUDE: "121.4737",
  OFFICE_TIMEZONE: "Asia/Shanghai",
  PUBLIC_API_BASE_URL: "http://localhost:3000",
  NODE_ENV: "test",
  PORT: "3000"
};

const wheelUrl = "/api/groups/group-1/today-recommendations/wheel-candidates";

async function buildTestApp(overrides: NodeJS.ProcessEnv = {}) {
  Object.assign(process.env, env, overrides);
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

function restaurant(index: number) {
  const suffix = String(index).padStart(2, "0");
  return {
    id: `restaurant-${suffix}`,
    groupId: "group-1",
    name: `餐厅 ${suffix}`,
    distanceMinutes: 8,
    tags: ["近"],
    status: "active",
    recommendations: [{
      id: `recommendation-${suffix}`,
      dish: `招牌菜 ${suffix}`,
      weatherTags: [],
      weekdayTags: [],
      moodTags: ["稳妥"]
    }],
    feedback: []
  };
}

function seedEnabledSuccess() {
  prisma.lunchGroup.findUnique.mockResolvedValue({
    id: "group-1",
    officeTimezone: "America/Los_Angeles"
  });
  prisma.dailyRecommendationBatch.findFirst.mockResolvedValue({
    id: "batch-1",
    officeDate: "2026-07-08",
    weatherSnapshotId: null,
    scoringWeightsSnapshot: DEFAULT_GROUP_SCORING_WEIGHTS,
    algorithmVersion: "group-v1"
  });
  prisma.feedback.findMany.mockResolvedValue([]);
  prisma.dailyParticipation.findMany.mockResolvedValue([
    { restaurantId: "restaurant-02" }
  ]);
  prisma.restaurant.findMany.mockResolvedValue([restaurant(2), restaurant(1)]);
  prisma.dailyRecommendationItem.findMany.mockResolvedValue([]);
}

describe("group wheel candidate route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-09T04:00:00.000Z"));
    prisma.__reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const key of Object.keys(env)) delete process.env[key];
  });

  it.each([
    ["without authorization", {}],
    ["with only the removed read token", {
      "x-lunch-read-token": "removed-read-token"
    }]
  ] as const)("returns 401/missing_token %s", async (_case, headers) => {
    const app = await buildTestApp();
    const response = await app.inject({ method: "GET", url: wheelUrl, headers });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "missing_token" });
    expect(prisma.dailyRecommendationBatch.findFirst).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects a session token for another group before membership lookup", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: wheelUrl,
      headers: {
        authorization: `Bearer ${groupToken({ groupId: "group-2" })}`
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "group_session_mismatch" });
    expect(prisma.groupMembership.findUnique).not.toHaveBeenCalled();
    expect(prisma.dailyRecommendationBatch.findFirst).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects a removed membership", async () => {
    seedMembership("removed");
    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: wheelUrl,
      headers: { authorization: `Bearer ${groupToken()}` }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "active_membership_required" });
    expect(prisma.dailyRecommendationBatch.findFirst).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([
    ["global off", "false", "group-1"],
    ["group not allowlisted", "true", "group-2"]
  ])("returns a fail-closed 404 when %s", async (_case, enabled, groupIds) => {
    seedMembership();
    const app = await buildTestApp({
      LUCKY_RESTAURANT_WHEEL_ENABLED: enabled,
      LUCKY_RESTAURANT_WHEEL_GROUP_IDS: groupIds
    });
    const response = await app.inject({
      method: "GET",
      url: wheelUrl,
      headers: { authorization: `Bearer ${groupToken()}` }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: "lucky_restaurant_wheel_not_enabled",
      message: "Lucky restaurant wheel is not enabled for this group"
    });
    expect(prisma.lunchGroup.findUnique).not.toHaveBeenCalled();
    expect(prisma.dailyRecommendationBatch.findFirst).not.toHaveBeenCalled();
    expect(prisma.restaurant.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns no_current_batch without creating one", async () => {
    seedMembership();
    prisma.lunchGroup.findUnique.mockResolvedValue({
      id: "group-1",
      officeTimezone: "Asia/Shanghai"
    });
    prisma.dailyRecommendationBatch.findFirst.mockResolvedValue(null);
    const app = await buildTestApp({
      LUCKY_RESTAURANT_WHEEL_ENABLED: "true",
      LUCKY_RESTAURANT_WHEEL_GROUP_IDS: "group-1"
    });
    const response = await app.inject({
      method: "GET",
      url: wheelUrl,
      headers: { authorization: `Bearer ${groupToken()}` }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "no_current_batch" });
    expect(prisma.dailyRecommendationBatch.create).not.toHaveBeenCalled();
    expect(prisma.dailyRecommendationBatch.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    await app.close();
  });

  it("returns group-scoped candidates from the current office-date batch", async () => {
    seedMembership();
    seedEnabledSuccess();
    const app = await buildTestApp({
      LUCKY_RESTAURANT_WHEEL_ENABLED: "true",
      LUCKY_RESTAURANT_WHEEL_GROUP_IDS: "group-1"
    });
    const response = await app.inject({
      method: "GET",
      url: wheelUrl,
      headers: { authorization: `Bearer ${groupToken()}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      groupId: "group-1",
      officeDate: "2026-07-08",
      batchId: "batch-1",
      algorithmVersion: "group-v1",
      candidates: [
        { restaurantId: "restaurant-01", selectedWithinLast7Days: false },
        { restaurantId: "restaurant-02", selectedWithinLast7Days: true }
      ]
    });
    expect(prisma.dailyRecommendationBatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          groupId: "group-1",
          officeDate: "2026-07-08",
          isCurrent: true
        }
      })
    );
    expect(prisma.feedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          groupId: "group-1",
          membershipId: "membership-1"
        })
      })
    );
    expect(prisma.dailyParticipation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          groupId: "group-1",
          membershipId: "membership-1",
          officeDate: { gte: "2026-07-02", lte: "2026-07-08" }
        })
      })
    );
    expect(prisma.restaurant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: "group-1", status: "active" }
      })
    );
    expect(prisma.dailyRecommendationItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          batch: {
            groupId: "group-1",
            officeDate: { not: "2026-07-08" }
          }
        }
      })
    );
    expect(prisma.dailyRecommendationBatch.create).not.toHaveBeenCalled();
    expect(prisma.dailyRecommendationBatch.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    await app.close();
  });
});
