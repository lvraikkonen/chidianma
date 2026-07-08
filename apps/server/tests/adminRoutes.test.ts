import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  teammate: {
    upsert: vi.fn()
  },
  restaurant: {
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  },
  recommendation: {
    create: vi.fn()
  }
}));

vi.mock("../src/plugins/prisma", () => ({ prisma }));

const env = {
  DATABASE_URL: "postgresql://example",
  TEAM_INVITE_CODE: "team-code",
  SESSION_SECRET: "session-secret",
  EXTENSION_READ_TOKEN: "read-token",
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

describe("admin routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const key of Object.keys(env)) {
      delete process.env[key];
    }
  });

  it("creates a short-lived admin session for a valid invite and name", async () => {
    prisma.teammate.upsert.mockResolvedValue({
      id: "teammate-1",
      name: "Demo 同事",
      lastSeenAt: new Date("2026-07-07T04:00:00.000Z")
    });

    const app = await buildTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/session",
      payload: { inviteCode: "team-code", name: "  Demo 同事  " }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      token: expect.any(String),
      teammate: { id: "teammate-1", name: "Demo 同事" }
    });
    expect(prisma.teammate.upsert).toHaveBeenCalledWith({
      where: { name: "Demo 同事" },
      update: { lastSeenAt: expect.any(Date) },
      create: { name: "Demo 同事", lastSeenAt: expect.any(Date) }
    });

    await app.close();
  });

  it("rejects invalid invite codes and blank names", async () => {
    const app = await buildTestApp();

    const invalidInvite = await app.inject({
      method: "POST",
      url: "/api/session",
      payload: { inviteCode: "wrong", name: "Demo 同事" }
    });
    const blankName = await app.inject({
      method: "POST",
      url: "/api/session",
      payload: { inviteCode: "team-code", name: "  " }
    });

    expect(invalidInvite.statusCode).toBe(401);
    expect(invalidInvite.json()).toEqual({ error: "Invalid invite code" });
    expect(blankName.statusCode).toBe(400);
    expect(blankName.json()).toEqual({ error: "Name is required" });
    expect(prisma.teammate.upsert).not.toHaveBeenCalled();

    await app.close();
  });

  it("protects restaurant and recommendation writes with a bearer session token", async () => {
    prisma.teammate.upsert.mockResolvedValue({ id: "teammate-1", name: "Demo 同事" });
    prisma.restaurant.create.mockResolvedValue({ id: "restaurant-1", name: "米饭小馆", tags: ["新推荐"] });
    prisma.recommendation.create.mockResolvedValue({
      id: "recommendation-1",
      restaurantId: "restaurant-1",
      teammateId: "teammate-1",
      reason: "稳定下饭"
    });

    const app = await buildTestApp();
    const unauthorized = await app.inject({
      method: "POST",
      url: "/api/restaurants",
      payload: { name: "米饭小馆", tags: ["新推荐"] }
    });
    expect(unauthorized.statusCode).toBe(401);

    const session = await app.inject({
      method: "POST",
      url: "/api/session",
      payload: { inviteCode: "team-code", name: "Demo 同事" }
    });
    const { token } = session.json() as { token: string };

    const restaurant = await app.inject({
      method: "POST",
      url: "/api/restaurants",
      headers: { authorization: `Bearer ${token}` },
      payload: { name: "米饭小馆", tags: ["新推荐"] }
    });
    const recommendation = await app.inject({
      method: "POST",
      url: "/api/recommendations",
      headers: { authorization: `Bearer ${token}` },
      payload: { restaurantId: "restaurant-1", reason: "稳定下饭" }
    });

    expect(restaurant.statusCode).toBe(200);
    expect(prisma.restaurant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "米饭小馆",
        tags: ["新推荐"],
        status: "active"
      })
    });
    expect(recommendation.statusCode).toBe(200);
    expect(prisma.recommendation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        restaurantId: "restaurant-1",
        teammateId: "teammate-1",
        reason: "稳定下饭"
      })
    });

    await app.close();
  });
});
