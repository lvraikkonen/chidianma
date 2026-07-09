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
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    feedback: {
      create: vi.fn()
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
