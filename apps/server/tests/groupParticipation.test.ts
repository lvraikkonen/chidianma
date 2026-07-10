import type { GroupRole, ParticipationStatus } from "@lunch/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signGroupSessionToken } from "../src/services/auth/tokens";

type MockMembership = {
  id: string;
  groupId: string;
  identityId: string;
  role: GroupRole;
  status: "active" | "removed";
  joinedAt: Date;
  identity: { displayName: string };
};

type MockParticipation = {
  id: string;
  groupId: string;
  officeDate: string;
  membershipId: string;
  status: ParticipationStatus;
  restaurantId: string | null;
  recommendationId: string | null;
  decidedAt: Date | null;
  updatedAt: Date;
};

type MockRestaurant = {
  id: string;
  groupId: string;
  status: "active" | "paused" | "blocked";
};

type MockRecommendation = {
  id: string;
  groupId: string;
  restaurantId: string;
};

const prisma = vi.hoisted(() => {
  const store = {
    memberships: [] as MockMembership[],
    participation: [] as MockParticipation[],
    restaurants: [] as MockRestaurant[],
    recommendations: [] as MockRecommendation[],
    officeTimezone: "Asia/Shanghai"
  };

  const client = {
    __reset: () => {
      store.memberships = [];
      store.participation = [];
      store.restaurants = [];
      store.recommendations = [];
      store.officeTimezone = "Asia/Shanghai";
    },
    __setOfficeTimezone: (officeTimezone: string) => {
      store.officeTimezone = officeTimezone;
    },
    __seedMembership: (membership: MockMembership) => {
      store.memberships.push(membership);
    },
    __seedParticipation: (participation: MockParticipation) => {
      store.participation.push(participation);
    },
    __seedRestaurant: (restaurant: MockRestaurant) => {
      store.restaurants.push(restaurant);
    },
    __seedRecommendation: (recommendation: MockRecommendation) => {
      store.recommendations.push(recommendation);
    },
    lunchGroup: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return where.id === "group-1"
          ? { id: "group-1", officeTimezone: store.officeTimezone }
          : null;
      })
    },
    groupMembership: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return store.memberships.find((membership) => membership.id === where.id) ?? null;
      }),
      findMany: vi.fn(async ({ where }: { where: { groupId: string; status: string } }) => {
        return store.memberships
          .filter(
            (membership) =>
              membership.groupId === where.groupId && membership.status === where.status
          )
          .sort((left, right) => left.joinedAt.getTime() - right.joinedAt.getTime());
      })
    },
    dailyParticipation: {
      findMany: vi.fn(
        async ({ where }: { where: { groupId: string; officeDate: string } }) => {
          return store.participation.filter(
            (item) =>
              item.groupId === where.groupId && item.officeDate === where.officeDate
          );
        }
      ),
      upsert: vi.fn(
        async ({
          where,
          create,
          update
        }: {
          where: {
            groupId_officeDate_membershipId: {
              groupId: string;
              officeDate: string;
              membershipId: string;
            };
          };
          create: Omit<MockParticipation, "id" | "updatedAt">;
          update: Partial<MockParticipation>;
        }) => {
          const key = where.groupId_officeDate_membershipId;
          const existing = store.participation.find(
            (item) =>
              item.groupId === key.groupId &&
              item.officeDate === key.officeDate &&
              item.membershipId === key.membershipId
          );
          const updatedAt = new Date("2026-07-09T04:30:00.000Z");
          if (existing) {
            Object.assign(existing, update, { updatedAt });
            return existing;
          }
          const participation = {
            id: `participation-${store.participation.length + 1}`,
            updatedAt,
            ...create
          };
          store.participation.push(participation);
          return participation;
        }
      )
    },
    restaurant: {
      findFirst: vi.fn(
        async ({ where }: { where: { id: string; groupId: string } }) =>
          store.restaurants.find(
            (restaurant) =>
              restaurant.id === where.id && restaurant.groupId === where.groupId
          ) ?? null
      )
    },
    recommendation: {
      findFirst: vi.fn(
        async ({ where }: { where: { id: string; groupId: string; restaurantId: string } }) =>
          store.recommendations.find(
            (recommendation) =>
              recommendation.id === where.id &&
              recommendation.groupId === where.groupId &&
              recommendation.restaurantId === where.restaurantId
          ) ?? null
      )
    }
  };

  return client;
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

function seedActiveMemberships(memberships: Array<{ id: string; displayName: string }>) {
  memberships.forEach((membership, index) => {
    prisma.__seedMembership({
      id: membership.id,
      groupId: "group-1",
      identityId: `identity-${index + 1}`,
      role: "member",
      status: "active",
      joinedAt: new Date(`2026-07-0${index + 1}T00:00:00.000Z`),
      identity: { displayName: membership.displayName }
    });
  });
}

function seedRemovedMembership(membership: { id: string; displayName: string }) {
  prisma.__seedMembership({
    id: membership.id,
    groupId: "group-1",
    identityId: "identity-1",
    role: "member",
    status: "removed",
    joinedAt: new Date("2026-07-01T00:00:00.000Z"),
    identity: { displayName: membership.displayName }
  });
}

function seedParticipation(
  participation: Array<{
    membershipId: string;
    status: ParticipationStatus;
    restaurantId?: string;
    recommendationId?: string;
    decidedAt?: Date;
  }>
) {
  participation.forEach((item, index) => {
    prisma.__seedParticipation({
      id: `participation-${index + 1}`,
      groupId: "group-1",
      officeDate: "2026-07-09",
      membershipId: item.membershipId,
      status: item.status,
      restaurantId: item.restaurantId ?? null,
      recommendationId: item.recommendationId ?? null,
      decidedAt: item.decidedAt ?? null,
      updatedAt: new Date("2026-07-09T04:15:00.000Z")
    });
  });
}

function seedRestaurant(input: {
  id: string;
  groupId: string;
  status?: "active" | "paused" | "blocked";
}) {
  prisma.__seedRestaurant({ ...input, status: input.status ?? "active" });
}

function seedRecommendation(input: {
  id: string;
  groupId: string;
  restaurantId: string;
}) {
  prisma.__seedRecommendation(input);
}

describe("group participation routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-07-09T04:00:00.000Z"));
    prisma.__reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const key of Object.keys(env)) {
      delete process.env[key];
    }
  });

  it("returns active group members with undecided fallback", async () => {
    seedActiveMemberships([
      { id: "membership-1", displayName: "小陈" },
      { id: "membership-2", displayName: "小林" }
    ]);
    seedParticipation([{ membershipId: "membership-1", status: "joining" }]);

    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/groups/group-1/participation/today",
      headers: { authorization: `Bearer ${groupToken()}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      groupId: "group-1",
      officeDate: "2026-07-09",
      summary: {
        joiningCount: 1,
        decidedCount: 0,
        awayCount: 0,
        undecidedCount: 1
      },
      members: [
        { membershipId: "membership-1", displayName: "小陈", status: "joining" },
        { membershipId: "membership-2", displayName: "小林", status: "undecided" }
      ]
    });
    await app.close();
  });

  it("uses the group office timezone for today's participation date", async () => {
    seedActiveMemberships([{ id: "membership-1", displayName: "小陈" }]);
    prisma.__setOfficeTimezone("America/Los_Angeles");

    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/groups/group-1/participation/today",
      headers: { authorization: `Bearer ${groupToken()}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ officeDate: "2026-07-08" });
    await app.close();
  });

  it("requires restaurantId when deciding", async () => {
    seedActiveMemberships([{ id: "membership-1", displayName: "小陈" }]);

    const app = await buildTestApp();
    const response = await app.inject({
      method: "PUT",
      url: "/api/groups/group-1/participation/today",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { status: "decided" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "decision_restaurant_required" });
    await app.close();
  });

  it.each([
    ["GET", "/api/groups/group-1/participation/today", undefined],
    ["PUT", "/api/groups/group-1/participation/today", { status: "joining" }]
  ] as const)(
    "returns 401/missing_token without Authorization for participation %s %s",
    async (method, url, payload) => {
      const app = await buildTestApp();
      const response = await app.inject({
        method,
        url,
        ...(payload ? { payload } : {})
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: "missing_token" });
      await app.close();
    }
  );

  it.each([
    ["GET", "/api/groups/group-1/participation/today"],
    ["PUT", "/api/groups/group-1/participation/today"]
  ] as const)("rejects read-token-only participation %s %s requests", async (method, url) => {
    const app = await buildTestApp();
    const response = await app.inject({
      method,
      url,
      headers: { "x-lunch-read-token": "read-token" },
      ...(method === "PUT" ? { payload: { status: "joining" } } : {})
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "missing_token" });
    await app.close();
  });

  it.each([
    ["GET", "/api/groups/group-1/participation/today"],
    ["PUT", "/api/groups/group-1/participation/today"]
  ] as const)("rejects removed memberships for participation %s %s", async (method, url) => {
    seedRemovedMembership({ id: "membership-1", displayName: "小陈" });

    const app = await buildTestApp();
    const response = await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${groupToken()}` },
      ...(method === "PUT" ? { payload: { status: "joining" } } : {})
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "active_membership_required" });
    await app.close();
  });

  it.each([
    ["GET", "/api/groups/group-1/participation/today"],
    ["PUT", "/api/groups/group-1/participation/today"]
  ] as const)(
    "rejects group-mismatched participation sessions for %s %s",
    async (method, url) => {
      seedActiveMemberships([{ id: "membership-1", displayName: "小陈" }]);

      const app = await buildTestApp();
      const response = await app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${groupToken({ groupId: "group-2" })}` },
        ...(method === "PUT" ? { payload: { status: "joining" } } : {})
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ error: "group_session_mismatch" });
      await app.close();
    }
  );

  it("stores decided participation only for restaurant and recommendation in the path group", async () => {
    seedActiveMemberships([{ id: "membership-1", displayName: "小陈" }]);
    seedRestaurant({ id: "restaurant-1", groupId: "group-1" });
    seedRecommendation({
      id: "recommendation-1",
      groupId: "group-1",
      restaurantId: "restaurant-1"
    });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "PUT",
      url: "/api/groups/group-1/participation/today",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: {
        status: "decided",
        restaurantId: "restaurant-1",
        recommendationId: "recommendation-1"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      participation: {
        membershipId: "membership-1",
        status: "decided",
        restaurantId: "restaurant-1",
        recommendationId: "recommendation-1"
      }
    });
    expect(prisma.dailyParticipation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: "decided",
          restaurantId: "restaurant-1",
          recommendationId: "recommendation-1",
          decidedAt: expect.any(Date)
        })
      })
    );
    await app.close();
  });

  it.each(["paused", "blocked"] as const)(
    "rejects decided participation for %s restaurants",
    async (status) => {
      seedActiveMemberships([{ id: "membership-1", displayName: "小陈" }]);
      seedRestaurant({ id: "restaurant-1", groupId: "group-1", status });

      const app = await buildTestApp();
      const response = await app.inject({
        method: "PUT",
        url: "/api/groups/group-1/participation/today",
        headers: { authorization: `Bearer ${groupToken()}` },
        payload: {
          status: "decided",
          restaurantId: "restaurant-1"
        }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: "restaurant_not_active" });
      await app.close();
    }
  );

  it("rejects decided participation for a restaurant outside the path group", async () => {
    seedActiveMemberships([{ id: "membership-1", displayName: "小陈" }]);
    seedRestaurant({ id: "restaurant-2", groupId: "group-2" });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "PUT",
      url: "/api/groups/group-1/participation/today",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { status: "decided", restaurantId: "restaurant-2" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "restaurant_group_mismatch" });
    expect(prisma.dailyParticipation.upsert).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects a recommendation outside the selected path-group restaurant", async () => {
    seedActiveMemberships([{ id: "membership-1", displayName: "小陈" }]);
    seedRestaurant({ id: "restaurant-1", groupId: "group-1" });
    seedRecommendation({
      id: "recommendation-2",
      groupId: "group-1",
      restaurantId: "restaurant-2"
    });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "PUT",
      url: "/api/groups/group-1/participation/today",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: {
        status: "decided",
        restaurantId: "restaurant-1",
        recommendationId: "recommendation-2"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "recommendation_group_mismatch" });
    expect(prisma.dailyParticipation.upsert).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects non-decided participation with a restaurant outside the path group", async () => {
    seedActiveMemberships([{ id: "membership-1", displayName: "小陈" }]);
    seedRestaurant({ id: "restaurant-2", groupId: "group-2" });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "PUT",
      url: "/api/groups/group-1/participation/today",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { status: "joining", restaurantId: "restaurant-2" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "restaurant_group_mismatch" });
    expect(prisma.dailyParticipation.upsert).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects non-decided participation with a recommendation outside the path group", async () => {
    seedActiveMemberships([{ id: "membership-1", displayName: "小陈" }]);
    seedRestaurant({ id: "restaurant-1", groupId: "group-1" });
    seedRecommendation({
      id: "recommendation-2",
      groupId: "group-2",
      restaurantId: "restaurant-1"
    });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "PUT",
      url: "/api/groups/group-1/participation/today",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: {
        status: "away",
        restaurantId: "restaurant-1",
        recommendationId: "recommendation-2"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "recommendation_group_mismatch" });
    expect(prisma.dailyParticipation.upsert).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects non-decided participation with a recommendation for another restaurant", async () => {
    seedActiveMemberships([{ id: "membership-1", displayName: "小陈" }]);
    seedRestaurant({ id: "restaurant-1", groupId: "group-1" });
    seedRecommendation({
      id: "recommendation-2",
      groupId: "group-1",
      restaurantId: "restaurant-2"
    });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "PUT",
      url: "/api/groups/group-1/participation/today",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: {
        status: "undecided",
        restaurantId: "restaurant-1",
        recommendationId: "recommendation-2"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "recommendation_group_mismatch" });
    expect(prisma.dailyParticipation.upsert).not.toHaveBeenCalled();
    await app.close();
  });

  it("requires restaurantId when non-decided participation includes recommendationId", async () => {
    seedActiveMemberships([{ id: "membership-1", displayName: "小陈" }]);

    const app = await buildTestApp();
    const response = await app.inject({
      method: "PUT",
      url: "/api/groups/group-1/participation/today",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { status: "joining", recommendationId: "recommendation-1" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "recommendation_restaurant_required"
    });
    expect(prisma.dailyParticipation.upsert).not.toHaveBeenCalled();
    await app.close();
  });

  it("clears restaurant, recommendation, and decidedAt for non-decided participation", async () => {
    seedActiveMemberships([{ id: "membership-1", displayName: "小陈" }]);
    seedRestaurant({ id: "restaurant-1", groupId: "group-1" });
    seedRecommendation({
      id: "recommendation-1",
      groupId: "group-1",
      restaurantId: "restaurant-1"
    });
    seedParticipation([
      {
        membershipId: "membership-1",
        status: "decided",
        restaurantId: "restaurant-1",
        recommendationId: "recommendation-1",
        decidedAt: new Date("2026-07-09T04:10:00.000Z")
      }
    ]);

    const app = await buildTestApp();
    const response = await app.inject({
      method: "PUT",
      url: "/api/groups/group-1/participation/today",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: {
        status: "away",
        restaurantId: "restaurant-1",
        recommendationId: "recommendation-1"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().participation).toMatchObject({
      membershipId: "membership-1",
      status: "away"
    });
    expect(response.json().participation).not.toHaveProperty("restaurantId");
    expect(response.json().participation).not.toHaveProperty("recommendationId");
    expect(response.json().participation).not.toHaveProperty("decidedAt");
    expect(prisma.dailyParticipation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          status: "away",
          restaurantId: null,
          recommendationId: null,
          decidedAt: null
        })
      })
    );
    await app.close();
  });

  it("rejects invalid participation status before writing", async () => {
    seedActiveMemberships([{ id: "membership-1", displayName: "小陈" }]);

    const app = await buildTestApp();
    const response = await app.inject({
      method: "PUT",
      url: "/api/groups/group-1/participation/today",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { status: "maybe" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "invalid_participation_status" });
    expect(prisma.dailyParticipation.upsert).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects a structurally invalid participation request before writing", async () => {
    seedActiveMemberships([{ id: "membership-1", displayName: "小陈" }]);

    const app = await buildTestApp();
    const response = await app.inject({
      method: "PUT",
      url: "/api/groups/group-1/participation/today",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: []
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "invalid_participation_request" });
    expect(prisma.dailyParticipation.upsert).not.toHaveBeenCalled();
    await app.close();
  });
});
