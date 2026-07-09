import type { GroupRole, MembershipStatus } from "@lunch/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signGroupSessionToken } from "../src/services/auth/tokens";

type MockMembership = {
  id: string;
  groupId: string;
  identityId: string;
  role: GroupRole;
  status: MembershipStatus;
};

type MockRestaurant = {
  id: string;
  groupId: string;
  name: string;
  area: string | null;
  address: string | null;
  distanceMinutes: number | null;
  cuisine: string | null;
  priceBand: string | null;
  averagePriceCents: number | null;
  supportsDineIn: boolean;
  supportsTakeout: boolean;
  tags: string[];
  status: "active" | "paused" | "blocked";
  createdByMembershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
  recommendations?: MockRecommendation[];
};

type MockRecommendation = {
  id: string;
  groupId: string;
  restaurantId: string;
  dish: string | null;
  reason: string;
  weatherTags: string[];
  weekdayTags: string[];
  moodTags: string[];
  createdByMembershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const prisma = vi.hoisted(() => {
  const store = {
    memberships: [] as MockMembership[],
    restaurants: [] as MockRestaurant[],
    recommendations: [] as MockRecommendation[],
    nextRestaurantId: 1,
    nextRecommendationId: 1
  };

  const withRecommendations = (restaurant: MockRestaurant) => ({
    ...restaurant,
    recommendations: store.recommendations.filter((candidate) => candidate.restaurantId === restaurant.id)
  });

  const client = {
    __reset: () => {
      store.memberships = [];
      store.restaurants = [];
      store.recommendations = [];
      store.nextRestaurantId = 1;
      store.nextRecommendationId = 1;
    },
    __seedMembership: (membership: MockMembership) => {
      store.memberships.push(membership);
    },
    __seedRestaurant: (restaurant: MockRestaurant) => {
      store.restaurants.push(restaurant);
    },
    __seedRecommendation: (recommendation: MockRecommendation) => {
      store.recommendations.push(recommendation);
    },
    groupMembership: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return store.memberships.find((membership) => membership.id === where.id) ?? null;
      })
    },
    restaurant: {
      findMany: vi.fn(async ({ where }: { where: { groupId: string } }) => {
        return store.restaurants
          .filter((restaurant) => restaurant.groupId === where.groupId)
          .map(withRecommendations)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
      }),
      findFirst: vi.fn(async ({ where }: { where: { id: string; groupId: string } }) => {
        const restaurant = store.restaurants.find(
          (candidate) => candidate.id === where.id && candidate.groupId === where.groupId
        );
        return restaurant ? withRecommendations(restaurant) : null;
      }),
      create: vi.fn(async ({ data }: { data: Omit<MockRestaurant, "id" | "createdAt" | "updatedAt"> }) => {
        const now = new Date("2026-07-09T04:00:00.000Z");
        const restaurant = {
          id: `restaurant-${store.nextRestaurantId++}`,
          createdAt: now,
          updatedAt: now,
          ...data
        };
        store.restaurants.push(restaurant);
        return withRecommendations(restaurant);
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MockRestaurant> }) => {
        const restaurant = store.restaurants.find((candidate) => candidate.id === where.id);
        if (!restaurant) throw new Error(`Missing restaurant ${where.id}`);
        Object.assign(restaurant, data, { updatedAt: new Date("2026-07-09T05:00:00.000Z") });
        return withRecommendations(restaurant);
      })
    },
    recommendation: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; groupId: string; restaurantId?: string } }) => {
        return (
          store.recommendations.find(
            (candidate) =>
              candidate.id === where.id &&
              candidate.groupId === where.groupId &&
              (where.restaurantId === undefined || candidate.restaurantId === where.restaurantId)
          ) ?? null
        );
      }),
      create: vi.fn(async ({ data }: { data: Omit<MockRecommendation, "id" | "createdAt" | "updatedAt"> }) => {
        const now = new Date("2026-07-09T04:10:00.000Z");
        const recommendation = {
          id: `recommendation-${store.nextRecommendationId++}`,
          createdAt: now,
          updatedAt: now,
          ...data
        };
        store.recommendations.push(recommendation);
        return recommendation;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MockRecommendation> }) => {
        const recommendation = store.recommendations.find((candidate) => candidate.id === where.id);
        if (!recommendation) throw new Error(`Missing recommendation ${where.id}`);
        Object.assign(recommendation, data, { updatedAt: new Date("2026-07-09T05:10:00.000Z") });
        return recommendation;
      })
    },
    feedback: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "feedback-1",
        createdAt: new Date("2026-07-09T06:00:00.000Z"),
        ...data
      }))
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

const baseRestaurant = {
  id: "restaurant-1",
  groupId: "group-1",
  name: "米饭小馆",
  area: "公司楼下",
  address: null,
  distanceMinutes: 8,
  cuisine: "家常菜",
  priceBand: "30-40",
  averagePriceCents: 3500,
  supportsDineIn: true,
  supportsTakeout: true,
  tags: ["下饭", "近"],
  status: "active" as const,
  createdByMembershipId: "membership-1",
  createdAt: new Date("2026-07-09T03:00:00.000Z"),
  updatedAt: new Date("2026-07-09T03:00:00.000Z")
};

describe("group knowledge restaurant routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    prisma.__reset();
    prisma.__seedMembership({
      id: "membership-1",
      groupId: "group-1",
      identityId: "identity-1",
      role: "member",
      status: "active"
    });
    prisma.__seedMembership({
      id: "admin-membership",
      groupId: "group-1",
      identityId: "identity-admin",
      role: "admin",
      status: "active"
    });
  });

  afterEach(() => {
    for (const key of Object.keys(env)) {
      delete process.env[key];
    }
  });

  it("lists only restaurants for the session group", async () => {
    prisma.__seedRestaurant(baseRestaurant);
    prisma.__seedRestaurant({ ...baseRestaurant, id: "restaurant-other", groupId: "group-2", name: "别组餐厅" });
    prisma.__seedRecommendation({
      id: "recommendation-1",
      groupId: "group-1",
      restaurantId: "restaurant-1",
      dish: "卤肉饭",
      reason: "稳定下饭",
      weatherTags: ["rainy"],
      weekdayTags: ["thursday"],
      moodTags: ["想吃饭"],
      createdByMembershipId: "membership-1",
      createdAt: new Date("2026-07-09T03:10:00.000Z"),
      updatedAt: new Date("2026-07-09T03:10:00.000Z")
    });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/groups/group-1/restaurants",
      headers: { authorization: `Bearer ${groupToken()}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      groupId: "group-1",
      restaurants: [
        {
          id: "restaurant-1",
          groupId: "group-1",
          name: "米饭小馆",
          recommendations: [{ id: "recommendation-1", dish: "卤肉饭" }]
        }
      ]
    });

    await app.close();
  });

  it("creates a restaurant for the active membership group", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/restaurants",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: {
        name: "热汤面",
        area: "园区北门",
        distanceMinutes: 9,
        cuisine: "面",
        priceBand: "25-35",
        averagePriceCents: 3000,
        supportsDineIn: true,
        supportsTakeout: false,
        tags: ["热乎"]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.restaurant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        groupId: "group-1",
        name: "热汤面",
        status: "active",
        createdByMembershipId: "membership-1"
      }),
      include: expect.any(Object)
    });

    await app.close();
  });

  it("lets a member edit their own base restaurant fields but not status", async () => {
    prisma.__seedRestaurant(baseRestaurant);
    const app = await buildTestApp();

    const ownEdit = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/restaurants/restaurant-1",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { area: "二楼", tags: ["下饭", "快"] }
    });
    const statusEdit = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/restaurants/restaurant-1",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { status: "blocked" }
    });

    expect(ownEdit.statusCode).toBe(200);
    expect(statusEdit.statusCode).toBe(403);
    expect(statusEdit.json()).toEqual({
      error: "admin_membership_required",
      message: "Admin membership is required to change restaurant status"
    });

    await app.close();
  });

  it("returns stable 400 errors for missing or null restaurant patch bodies", async () => {
    prisma.__seedRestaurant(baseRestaurant);
    const app = await buildTestApp();

    const missingBody = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/restaurants/restaurant-1",
      headers: { authorization: `Bearer ${groupToken()}` }
    });
    const nullBody = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/restaurants/restaurant-1",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: null
    });

    expect(missingBody.statusCode).toBe(400);
    expect(missingBody.json()).toEqual({
      error: "empty_restaurant_patch",
      message: "At least one restaurant field is required"
    });
    expect(nullBody.statusCode).toBe(400);
    expect(nullBody.json()).toEqual({
      error: "empty_restaurant_patch",
      message: "At least one restaurant field is required"
    });

    await app.close();
  });

  it("validates restaurant status before member status permissions", async () => {
    prisma.__seedRestaurant(baseRestaurant);
    const app = await buildTestApp();

    const response = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/restaurants/restaurant-1",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { status: "not-a-status" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "invalid_restaurant_status",
      message: "Restaurant status is invalid"
    });

    await app.close();
  });

  it("blocks a member from editing another member's restaurant", async () => {
    prisma.__seedMembership({
      id: "membership-2",
      groupId: "group-1",
      identityId: "identity-2",
      role: "member",
      status: "active"
    });
    prisma.__seedRestaurant({ ...baseRestaurant, createdByMembershipId: "membership-1" });
    const app = await buildTestApp();

    const response = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/restaurants/restaurant-1",
      headers: {
        authorization: `Bearer ${groupToken({
          identityId: "identity-2",
          membershipId: "membership-2",
          role: "member"
        })}`
      },
      payload: { area: "偷改别人餐厅" }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "restaurant_owner_required",
      message: "Only the creator or an admin can edit restaurant"
    });

    await app.close();
  });

  it("lets an admin edit status on any group restaurant", async () => {
    prisma.__seedRestaurant({ ...baseRestaurant, createdByMembershipId: "membership-1" });
    const app = await buildTestApp();

    const response = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/restaurants/restaurant-1",
      headers: {
        authorization: `Bearer ${groupToken({
          identityId: "identity-admin",
          membershipId: "admin-membership",
          role: "admin"
        })}`
      },
      payload: { status: "paused" }
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.restaurant.update).toHaveBeenCalledWith({
      where: { id: "restaurant-1" },
      data: expect.objectContaining({ status: "paused" }),
      include: expect.any(Object)
    });

    await app.close();
  });

  it("blocks read-token auth and cross-group restaurant IDs", async () => {
    prisma.__seedRestaurant({ ...baseRestaurant, id: "restaurant-2", groupId: "group-2" });
    const app = await buildTestApp();

    const readToken = await app.inject({
      method: "GET",
      url: "/api/groups/group-1/restaurants",
      headers: { "x-lunch-read-token": "read-token" }
    });
    const crossGroupPatch = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/restaurants/restaurant-2",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { area: "偷看别组" }
    });

    expect(readToken.statusCode).toBe(401);
    expect(crossGroupPatch.statusCode).toBe(404);
    expect(crossGroupPatch.json()).toEqual({ error: "restaurant_not_found", message: "Restaurant not found" });

    await app.close();
  });
});

describe("group knowledge recommendation routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    prisma.__reset();
    prisma.__seedMembership({
      id: "membership-1",
      groupId: "group-1",
      identityId: "identity-1",
      role: "member",
      status: "active"
    });
    prisma.__seedMembership({
      id: "membership-2",
      groupId: "group-1",
      identityId: "identity-2",
      role: "member",
      status: "active"
    });
    prisma.__seedMembership({
      id: "admin-membership",
      groupId: "group-1",
      identityId: "identity-admin",
      role: "admin",
      status: "active"
    });
    prisma.__seedRestaurant(baseRestaurant);
    prisma.__seedRestaurant({ ...baseRestaurant, id: "restaurant-2", groupId: "group-2", name: "别组餐厅" });
  });

  afterEach(() => {
    for (const key of Object.keys(env)) {
      delete process.env[key];
    }
  });

  it("creates a recommendation for a restaurant in the active membership group", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/recommendations",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: {
        restaurantId: "restaurant-1",
        dish: "卤肉饭",
        reason: "稳定下饭",
        weatherTags: ["rainy"],
        weekdayTags: ["thursday"],
        moodTags: ["想吃饭"]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.recommendation.create).toHaveBeenCalledWith({
      data: {
        groupId: "group-1",
        restaurantId: "restaurant-1",
        createdByMembershipId: "membership-1",
        dish: "卤肉饭",
        reason: "稳定下饭",
        weatherTags: ["rainy"],
        weekdayTags: ["thursday"],
        moodTags: ["想吃饭"]
      }
    });

    await app.close();
  });

  it("rejects recommendation creation with a restaurant from another group", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/recommendations",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: {
        restaurantId: "restaurant-2",
        reason: "不能跨组写推荐"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "restaurant_group_mismatch",
      message: "Restaurant does not belong to route group"
    });
    expect(prisma.recommendation.create).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects structurally invalid recommendation creation bodies before writing", async () => {
    const app = await buildTestApp();

    const missingRestaurantId = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/recommendations",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { reason: "少了餐厅" }
    });
    const nullBody = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/recommendations",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: null
    });
    const typoField = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/recommendations",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { restaurantId: "restaurant-1", reason: "字段写错", moodTag: ["想吃饭"] }
    });

    expect(missingRestaurantId.statusCode).toBe(400);
    expect(missingRestaurantId.json()).toEqual({
      error: "invalid_recommendation_request",
      message: "Recommendation request body is invalid"
    });
    expect(nullBody.statusCode).toBe(400);
    expect(nullBody.json()).toEqual({
      error: "invalid_recommendation_request",
      message: "Recommendation request body is invalid"
    });
    expect(typoField.statusCode).toBe(400);
    expect(typoField.json()).toEqual({
      error: "invalid_recommendation_request",
      message: "Recommendation request body is invalid"
    });
    expect(prisma.recommendation.create).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects invalid recommendation creation tags before writing", async () => {
    const app = await buildTestApp();

    const invalidMoodTags = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/recommendations",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { restaurantId: "restaurant-1", reason: "标签形状不对", moodTags: "想吃饭" }
    });
    const invalidWeatherTags = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/recommendations",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { restaurantId: "restaurant-1", reason: "天气枚举不对", weatherTags: ["snowy"] }
    });
    const invalidWeekdayTags = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/recommendations",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { restaurantId: "restaurant-1", reason: "工作日枚举不对", weekdayTags: ["saturday"] }
    });

    expect(invalidMoodTags.statusCode).toBe(400);
    expect(invalidMoodTags.json()).toEqual({ error: "invalid_tags", message: "Tags must be an array of strings" });
    expect(invalidWeatherTags.statusCode).toBe(400);
    expect(invalidWeatherTags.json()).toEqual({
      error: "invalid_weather_tags",
      message: "Tags include unsupported values"
    });
    expect(invalidWeekdayTags.statusCode).toBe(400);
    expect(invalidWeekdayTags.json()).toEqual({
      error: "invalid_weekday_tags",
      message: "Tags include unsupported values"
    });
    expect(prisma.recommendation.create).not.toHaveBeenCalled();

    await app.close();
  });

  it("lets a member patch their own recommendation and blocks another member", async () => {
    prisma.__seedRecommendation({
      id: "recommendation-1",
      groupId: "group-1",
      restaurantId: "restaurant-1",
      dish: "卤肉饭",
      reason: "稳定下饭",
      weatherTags: [],
      weekdayTags: [],
      moodTags: [],
      createdByMembershipId: "membership-1",
      createdAt: new Date("2026-07-09T03:10:00.000Z"),
      updatedAt: new Date("2026-07-09T03:10:00.000Z")
    });
    const app = await buildTestApp();

    const ownPatch = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/recommendations/recommendation-1",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { reason: "今天特别适合", moodTags: ["想吃饭"] }
    });
    const otherPatch = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/recommendations/recommendation-1",
      headers: {
        authorization: `Bearer ${groupToken({
          identityId: "identity-2",
          membershipId: "membership-2",
          role: "member"
        })}`
      },
      payload: { reason: "改别人的推荐" }
    });

    expect(ownPatch.statusCode).toBe(200);
    expect(otherPatch.statusCode).toBe(403);
    expect(otherPatch.json()).toEqual({
      error: "recommendation_owner_required",
      message: "Only the creator or an admin can edit recommendation"
    });

    await app.close();
  });

  it("lets an admin patch any recommendation in the group", async () => {
    prisma.__seedRecommendation({
      id: "recommendation-1",
      groupId: "group-1",
      restaurantId: "restaurant-1",
      dish: "卤肉饭",
      reason: "稳定下饭",
      weatherTags: [],
      weekdayTags: [],
      moodTags: [],
      createdByMembershipId: "membership-1",
      createdAt: new Date("2026-07-09T03:10:00.000Z"),
      updatedAt: new Date("2026-07-09T03:10:00.000Z")
    });
    const app = await buildTestApp();

    const response = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/recommendations/recommendation-1",
      headers: {
        authorization: `Bearer ${groupToken({
          identityId: "identity-admin",
          membershipId: "admin-membership",
          role: "admin"
        })}`
      },
      payload: { dish: "鸡腿饭", reason: "管理员补充口味信息" }
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.recommendation.update).toHaveBeenCalledWith({
      where: { id: "recommendation-1" },
      data: { dish: "鸡腿饭", reason: "管理员补充口味信息" }
    });

    await app.close();
  });

  it("rejects invalid recommendation patches before writing", async () => {
    prisma.__seedRecommendation({
      id: "recommendation-1",
      groupId: "group-1",
      restaurantId: "restaurant-1",
      dish: "卤肉饭",
      reason: "稳定下饭",
      weatherTags: [],
      weekdayTags: [],
      moodTags: [],
      createdByMembershipId: "membership-1",
      createdAt: new Date("2026-07-09T03:10:00.000Z"),
      updatedAt: new Date("2026-07-09T03:10:00.000Z")
    });
    const app = await buildTestApp();

    const emptyPatch = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/recommendations/recommendation-1",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: {}
    });
    const nullPatch = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/recommendations/recommendation-1",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: null
    });
    const unknownPatch = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/recommendations/recommendation-1",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { restaurantId: "restaurant-2", reason: "不能换餐厅" }
    });

    expect(emptyPatch.statusCode).toBe(400);
    expect(emptyPatch.json()).toEqual({
      error: "empty_recommendation_patch",
      message: "At least one recommendation field is required"
    });
    expect(nullPatch.statusCode).toBe(400);
    expect(nullPatch.json()).toEqual({
      error: "invalid_recommendation_request",
      message: "Recommendation request body is invalid"
    });
    expect(unknownPatch.statusCode).toBe(400);
    expect(unknownPatch.json()).toEqual({
      error: "invalid_recommendation_request",
      message: "Recommendation request body is invalid"
    });
    expect(prisma.recommendation.update).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects invalid recommendation patch tags before writing", async () => {
    prisma.__seedRecommendation({
      id: "recommendation-1",
      groupId: "group-1",
      restaurantId: "restaurant-1",
      dish: "卤肉饭",
      reason: "稳定下饭",
      weatherTags: [],
      weekdayTags: [],
      moodTags: [],
      createdByMembershipId: "membership-1",
      createdAt: new Date("2026-07-09T03:10:00.000Z"),
      updatedAt: new Date("2026-07-09T03:10:00.000Z")
    });
    const app = await buildTestApp();

    const invalidMoodTags = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/recommendations/recommendation-1",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { moodTags: [42] }
    });
    const invalidWeatherTags = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/recommendations/recommendation-1",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { weatherTags: ["snowy"] }
    });
    const invalidWeekdayTags = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/recommendations/recommendation-1",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { weekdayTags: ["saturday"] }
    });

    expect(invalidMoodTags.statusCode).toBe(400);
    expect(invalidMoodTags.json()).toEqual({ error: "invalid_tags", message: "Tags must be an array of strings" });
    expect(invalidWeatherTags.statusCode).toBe(400);
    expect(invalidWeatherTags.json()).toEqual({
      error: "invalid_weather_tags",
      message: "Tags include unsupported values"
    });
    expect(invalidWeekdayTags.statusCode).toBe(400);
    expect(invalidWeekdayTags.json()).toEqual({
      error: "invalid_weekday_tags",
      message: "Tags include unsupported values"
    });
    expect(prisma.recommendation.update).not.toHaveBeenCalled();

    await app.close();
  });

  it("returns not found for a recommendation outside the route group", async () => {
    prisma.__seedRecommendation({
      id: "recommendation-2",
      groupId: "group-2",
      restaurantId: "restaurant-2",
      dish: null,
      reason: "别组推荐",
      weatherTags: [],
      weekdayTags: [],
      moodTags: [],
      createdByMembershipId: null,
      createdAt: new Date("2026-07-09T03:10:00.000Z"),
      updatedAt: new Date("2026-07-09T03:10:00.000Z")
    });
    const app = await buildTestApp();

    const response = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/recommendations/recommendation-2",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { reason: "跨组更新" }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "recommendation_not_found", message: "Recommendation not found" });

    await app.close();
  });

  it("blocks read-token-only auth for recommendation writes", async () => {
    prisma.__seedRecommendation({
      id: "recommendation-1",
      groupId: "group-1",
      restaurantId: "restaurant-1",
      dish: "卤肉饭",
      reason: "稳定下饭",
      weatherTags: [],
      weekdayTags: [],
      moodTags: [],
      createdByMembershipId: "membership-1",
      createdAt: new Date("2026-07-09T03:10:00.000Z"),
      updatedAt: new Date("2026-07-09T03:10:00.000Z")
    });
    const app = await buildTestApp();

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/recommendations",
      headers: { "x-lunch-read-token": "read-token" },
      payload: { restaurantId: "restaurant-1", reason: "read token cannot write" }
    });
    const patchResponse = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/recommendations/recommendation-1",
      headers: { "x-lunch-read-token": "read-token" },
      payload: { reason: "read token cannot patch" }
    });

    expect(createResponse.statusCode).toBe(401);
    expect(patchResponse.statusCode).toBe(401);
    expect(prisma.recommendation.create).not.toHaveBeenCalled();
    expect(prisma.recommendation.update).not.toHaveBeenCalled();

    await app.close();
  });
});

describe("group knowledge feedback route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    prisma.__reset();
    prisma.__seedMembership({
      id: "membership-1",
      groupId: "group-1",
      identityId: "identity-1",
      role: "member",
      status: "active"
    });
    prisma.__seedRestaurant(baseRestaurant);
    prisma.__seedRestaurant({ ...baseRestaurant, id: "restaurant-2", groupId: "group-2", name: "别组餐厅" });
    prisma.__seedRecommendation({
      id: "recommendation-1",
      groupId: "group-1",
      restaurantId: "restaurant-1",
      dish: "卤肉饭",
      reason: "稳定下饭",
      weatherTags: [],
      weekdayTags: [],
      moodTags: [],
      createdByMembershipId: "membership-1",
      createdAt: new Date("2026-07-09T03:10:00.000Z"),
      updatedAt: new Date("2026-07-09T03:10:00.000Z")
    });
    prisma.__seedRecommendation({
      id: "recommendation-2",
      groupId: "group-2",
      restaurantId: "restaurant-2",
      dish: null,
      reason: "别组推荐",
      weatherTags: [],
      weekdayTags: [],
      moodTags: [],
      createdByMembershipId: null,
      createdAt: new Date("2026-07-09T03:10:00.000Z"),
      updatedAt: new Date("2026-07-09T03:10:00.000Z")
    });
  });

  afterEach(() => {
    for (const key of Object.keys(env)) {
      delete process.env[key];
    }
  });

  it("writes avoid feedback for the active group without blocking the restaurant", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/feedback",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: {
        officeDate: "2026-07-09",
        restaurantId: "restaurant-1",
        recommendationId: "recommendation-1",
        type: "avoid"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.feedback.create).toHaveBeenCalledWith({
      data: {
        groupId: "group-1",
        officeDate: "2026-07-09",
        restaurantId: "restaurant-1",
        recommendationId: "recommendation-1",
        membershipId: "membership-1",
        type: "avoid"
      }
    });
    expect(prisma.restaurant.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "blocked" }) })
    );

    await app.close();
  });

  it("rejects feedback for a restaurant from another group", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/feedback",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: {
        officeDate: "2026-07-09",
        restaurantId: "restaurant-2",
        type: "skip"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "restaurant_group_mismatch",
      message: "Restaurant does not belong to route group"
    });
    expect(prisma.feedback.create).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects feedback when recommendation does not belong to the route group or restaurant", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/feedback",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: {
        officeDate: "2026-07-09",
        restaurantId: "restaurant-1",
        recommendationId: "recommendation-2",
        type: "ate"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "recommendation_group_mismatch",
      message: "Recommendation does not belong to route group and restaurant"
    });
    expect(prisma.feedback.create).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects read-token-only auth on group feedback", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/feedback",
      headers: { "x-lunch-read-token": "read-token" },
      payload: {
        officeDate: "2026-07-09",
        restaurantId: "restaurant-1",
        type: "want"
      }
    });

    expect(response.statusCode).toBe(401);
    expect(prisma.feedback.create).not.toHaveBeenCalled();

    await app.close();
  });
});

describe("group knowledge route auth and validation matrix", () => {
  const routeCases = [
    { method: "GET", url: "/api/groups/group-1/restaurants" },
    { method: "POST", url: "/api/groups/group-1/restaurants", payload: { name: "新餐厅" } },
    {
      method: "POST",
      url: "/api/groups/group-1/recommendations",
      payload: { restaurantId: "restaurant-1", reason: "推荐" }
    },
    {
      method: "POST",
      url: "/api/groups/group-1/feedback",
      payload: { officeDate: "2026-07-09", restaurantId: "restaurant-1", type: "want" }
    }
  ] as const;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    prisma.__reset();
    prisma.__seedMembership({
      id: "membership-1",
      groupId: "group-1",
      identityId: "identity-1",
      role: "member",
      status: "active"
    });
    prisma.__seedMembership({
      id: "membership-removed",
      groupId: "group-1",
      identityId: "identity-removed",
      role: "member",
      status: "removed"
    });
    prisma.__seedMembership({
      id: "admin-membership",
      groupId: "group-1",
      identityId: "identity-admin",
      role: "admin",
      status: "active"
    });
    prisma.__seedRestaurant(baseRestaurant);
    prisma.__seedRecommendation({
      id: "recommendation-1",
      groupId: "group-1",
      restaurantId: "restaurant-1",
      dish: "卤肉饭",
      reason: "稳定下饭",
      weatherTags: [],
      weekdayTags: [],
      moodTags: [],
      createdByMembershipId: "membership-1",
      createdAt: new Date("2026-07-09T03:10:00.000Z"),
      updatedAt: new Date("2026-07-09T03:10:00.000Z")
    });
  });

  afterEach(() => {
    for (const key of Object.keys(env)) {
      delete process.env[key];
    }
  });

  async function injectRoute(
    app: Awaited<ReturnType<typeof buildTestApp>>,
    route: (typeof routeCases)[number],
    headers?: Record<string, string>
  ) {
    return app.inject({
      method: route.method,
      url: route.url,
      ...(headers ? { headers } : {}),
      ...("payload" in route ? { payload: route.payload } : {})
    });
  }

  it.each(routeCases)("rejects missing group session for $method $url", async (route) => {
    const app = await buildTestApp();
    const response = await injectRoute(app, route);

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "missing_token" });

    await app.close();
  });

  it.each(routeCases)("rejects read-token-only auth for $method $url", async (route) => {
    const app = await buildTestApp();
    const response = await injectRoute(app, route, { "x-lunch-read-token": "read-token" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "missing_token" });

    await app.close();
  });

  it.each(routeCases)("rejects mismatched group sessions for $method $url", async (route) => {
    const app = await buildTestApp();
    const response = await injectRoute(app, route, {
      authorization: `Bearer ${groupToken({ groupId: "group-2", membershipId: "membership-1" })}`
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "group_session_mismatch" });

    await app.close();
  });

  it.each(routeCases)("rejects removed memberships for $method $url", async (route) => {
    const app = await buildTestApp();
    const response = await injectRoute(app, route, {
      authorization: `Bearer ${groupToken({
        identityId: "identity-removed",
        membershipId: "membership-removed",
        role: "member"
      })}`
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "active_membership_required" });

    await app.close();
  });

  it("rejects invalid restaurant body fields before writing", async () => {
    const app = await buildTestApp();

    const badDistance = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/restaurants",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { name: "坏距离", distanceMinutes: -1 }
    });
    const badTags = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/restaurants",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { name: "坏标签", tags: "近" }
    });
    const badStatus = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-1/restaurants/restaurant-1",
      headers: {
        authorization: `Bearer ${groupToken({
          identityId: "identity-admin",
          membershipId: "admin-membership",
          role: "admin"
        })}`
      },
      payload: { status: "retired" }
    });

    expect(badDistance.statusCode).toBe(400);
    expect(badDistance.json()).toMatchObject({ error: "invalid_distance_minutes" });
    expect(badTags.statusCode).toBe(400);
    expect(badTags.json()).toMatchObject({ error: "invalid_tags" });
    expect(badStatus.statusCode).toBe(400);
    expect(badStatus.json()).toMatchObject({ error: "invalid_restaurant_status" });

    await app.close();
  });

  it("rejects invalid recommendation tags and blank reasons before writing", async () => {
    const app = await buildTestApp();

    const badReason = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/recommendations",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { restaurantId: "restaurant-1", reason: "   " }
    });
    const badWeather = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/recommendations",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { restaurantId: "restaurant-1", reason: "推荐", weatherTags: ["snowy"] }
    });
    const badWeekday = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/recommendations",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { restaurantId: "restaurant-1", reason: "推荐", weekdayTags: ["sunday"] }
    });

    expect(badReason.statusCode).toBe(400);
    expect(badReason.json()).toMatchObject({ error: "recommendation_reason_required" });
    expect(badWeather.statusCode).toBe(400);
    expect(badWeather.json()).toMatchObject({ error: "invalid_weather_tags" });
    expect(badWeekday.statusCode).toBe(400);
    expect(badWeekday.json()).toMatchObject({ error: "invalid_weekday_tags" });

    await app.close();
  });

  it("rejects invalid feedback type and malformed office date before writing", async () => {
    const app = await buildTestApp();

    const badType = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/feedback",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { officeDate: "2026-07-09", restaurantId: "restaurant-1", type: "blocked" }
    });
    const badDate = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/feedback",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: { officeDate: "07/09/2026", restaurantId: "restaurant-1", type: "want" }
    });

    expect(badType.statusCode).toBe(400);
    expect(badType.json()).toMatchObject({ error: "invalid_feedback_type" });
    expect(badDate.statusCode).toBe(400);
    expect(badDate.json()).toMatchObject({ error: "invalid_office_date" });
    expect(prisma.feedback.create).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects unknown feedback fields before writing", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/groups/group-1/feedback",
      headers: { authorization: `Bearer ${groupToken()}` },
      payload: {
        officeDate: "2026-07-09",
        restaurantId: "restaurant-1",
        type: "want",
        moodTag: "typo"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "invalid_feedback_request",
      message: "Feedback request body is invalid"
    });
    expect(prisma.feedback.create).not.toHaveBeenCalled();

    await app.close();
  });
});
