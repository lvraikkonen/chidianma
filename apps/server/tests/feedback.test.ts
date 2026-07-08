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
  },
  feedback: {
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

describe("feedback route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    for (const key of Object.keys(env)) {
      delete process.env[key];
    }
  });

  it("requires a read token or admin session before writing feedback", async () => {
    prisma.feedback.create.mockResolvedValue({
      id: "feedback-1",
      date: "2026-07-07",
      restaurantId: "restaurant-1",
      recommendationId: null,
      type: "want"
    });

    const app = await buildTestApp();
    const unauthorized = await app.inject({
      method: "POST",
      url: "/api/feedback",
      payload: {
        date: "2026-07-07",
        restaurantId: "restaurant-1",
        type: "want"
      }
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(prisma.feedback.create).not.toHaveBeenCalled();

    const authorized = await app.inject({
      method: "POST",
      url: "/api/feedback",
      headers: { "x-lunch-read-token": "read-token" },
      payload: {
        date: "2026-07-07",
        restaurantId: "restaurant-1",
        type: "want"
      }
    });

    expect(authorized.statusCode).toBe(200);
    expect(prisma.feedback.create).toHaveBeenCalledWith({
      data: {
        date: "2026-07-07",
        restaurantId: "restaurant-1",
        recommendationId: null,
        type: "want"
      }
    });

    await app.close();
  });

  it("accepts a valid admin session bearer token for feedback writes", async () => {
    prisma.teammate.upsert.mockResolvedValue({ id: "teammate-1", name: "Demo 同事" });
    prisma.feedback.create.mockResolvedValue({
      id: "feedback-2",
      date: "2026-07-07",
      restaurantId: "restaurant-1",
      recommendationId: "recommendation-1",
      type: "ate"
    });

    const app = await buildTestApp();
    const session = await app.inject({
      method: "POST",
      url: "/api/session",
      payload: { inviteCode: "team-code", name: "Demo 同事" }
    });
    const { token } = session.json() as { token: string };

    const response = await app.inject({
      method: "POST",
      url: "/api/feedback",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        date: "2026-07-07",
        restaurantId: "restaurant-1",
        recommendationId: "recommendation-1",
        type: "ate"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.feedback.create).toHaveBeenLastCalledWith({
      data: {
        date: "2026-07-07",
        restaurantId: "restaurant-1",
        recommendationId: "recommendation-1",
        type: "ate"
      }
    });

    await app.close();
  });
});
