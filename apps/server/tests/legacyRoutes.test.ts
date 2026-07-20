import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import type { AppEnv } from "../src/env";

vi.mock("../src/plugins/prisma", () => ({ prisma: {} }));

const env = {
  DATABASE_URL: "postgresql://example",
  SESSION_SECRET: "session-secret",
  ALLOW_PUBLIC_GROUP_CREATION: true,
  LUCKY_RESTAURANT_WHEEL_ENABLED: false,
  LUCKY_RESTAURANT_WHEEL_GROUP_IDS: [],
  IDENTITY_TOKEN_TTL_DAYS: 90,
  GROUP_SESSION_TTL_DAYS: 14,
  WEATHER_API_BASE_URL: "https://api.open-meteo.com/v1",
  OFFICE_CITY: "Shanghai",
  OFFICE_LATITUDE: 31.2304,
  OFFICE_LONGITUDE: 121.4737,
  OFFICE_TIMEZONE: "Asia/Shanghai",
  PUBLIC_API_BASE_URL: "http://localhost:3000",
  NODE_ENV: "test",
  PORT: 3000
} satisfies AppEnv;

describe("closed legacy API surface", () => {
  it.each([
    ["POST", "/api/session"],
    ["GET", "/api/restaurants"],
    ["POST", "/api/restaurants"],
    ["POST", "/api/recommendations"],
    ["POST", "/api/feedback"],
    ["GET", "/api/today-recommendations"]
  ] as const)("returns a JSON 404 for %s %s", async (method, url) => {
    const app = await buildApp({ env });
    const response = await app.inject({ method, url });

    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toMatchObject({ error: "Not Found", statusCode: 404 });
    await app.close();
  });
});
