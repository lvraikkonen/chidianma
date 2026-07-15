import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/env";

const baseEnv: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/lunch",
  TEAM_INVITE_CODE: "stage6-team-code",
  SESSION_SECRET: "stage6-session-secret",
  EXTENSION_READ_TOKEN: "read-token",
  ALLOW_PUBLIC_GROUP_CREATION: "true",
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

describe("Stage 6 environment validation", () => {
  it("parses explicit false without JavaScript truthiness", () => {
    expect(loadEnv({ ...baseEnv, ALLOW_PUBLIC_GROUP_CREATION: "false" }))
      .toMatchObject({ ALLOW_PUBLIC_GROUP_CREATION: false });
  });

  it.each(["", "off", "yes", "FALSE "])(
    "rejects ambiguous boolean value %j",
    (value) => {
      expect(() => loadEnv({ ...baseEnv, ALLOW_PUBLIC_GROUP_CREATION: value }))
        .toThrow();
    }
  );

  it.each([
    ["PORT", "0"],
    ["PORT", "65536"],
    ["IDENTITY_TOKEN_TTL_DAYS", "1.5"],
    ["GROUP_SESSION_TTL_DAYS", "0"],
    ["OFFICE_LATITUDE", "91"],
    ["OFFICE_LONGITUDE", "-181"],
    ["OFFICE_TIMEZONE", "Mars/Olympus"],
    ["PUBLIC_API_BASE_URL", "not-a-url"]
  ])("rejects invalid %s", (key, value) => {
    expect(() => loadEnv({ ...baseEnv, [key]: value })).toThrow();
  });

  it("requires a strong session secret and HTTPS public URL in production", () => {
    expect(() => loadEnv({
      ...baseEnv,
      NODE_ENV: "production",
      SESSION_SECRET: "short-production-secret",
      PUBLIC_API_BASE_URL: "https://lunch.example.com"
    })).toThrow(/SESSION_SECRET/);

    expect(() => loadEnv({
      ...baseEnv,
      NODE_ENV: "production",
      SESSION_SECRET: "x".repeat(32),
      PUBLIC_API_BASE_URL: "http://lunch.example.com"
    })).toThrow(/PUBLIC_API_BASE_URL/);
  });

  it("keeps Railway release identity optional and defaults outside Railway", () => {
    expect(loadEnv(baseEnv).RAILWAY_GIT_COMMIT_SHA).toBeUndefined();
    expect(loadEnv({ ...baseEnv, RAILWAY_GIT_COMMIT_SHA: "abc123" }))
      .toMatchObject({ RAILWAY_GIT_COMMIT_SHA: "abc123" });
  });

  it("requires deployment-sensitive defaults to be explicit in production", () => {
    const productionEnv: NodeJS.ProcessEnv = {
      ...baseEnv,
      NODE_ENV: "production",
      SESSION_SECRET: "x".repeat(32),
      PUBLIC_API_BASE_URL: "https://lunch.example.com"
    };
    delete productionEnv.ALLOW_PUBLIC_GROUP_CREATION;

    expect(() => loadEnv(productionEnv)).toThrow(/ALLOW_PUBLIC_GROUP_CREATION/);
  });
});
