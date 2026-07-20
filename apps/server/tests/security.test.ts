import type { FastifyBaseLogger, FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import type { AppEnv } from "../src/env";
import {
  classifiedDatabaseErrorCode,
  irreversibleAuthorizationKey,
  isAllowedCorsOrigin,
  rateLimitClientIp,
  safeRequestLogContext
} from "../src/security/requestSecurity";

const prisma = vi.hoisted(() => ({
  identity: {
    create: vi.fn(async () => {
      throw new Error("postgresql://user:password@host/db token-secret 小林");
    })
  }
}));

vi.mock("../src/plugins/prisma", () => ({ prisma }));

const env = {
  DATABASE_URL: "postgresql://example",
  SESSION_SECRET: "stage7b-session-secret",
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
  PUBLIC_API_BASE_URL: "https://lunch.example/path",
  NODE_ENV: "production",
  PORT: 3000
} satisfies AppEnv;

describe("Stage 7B edge security", () => {
  it("uses an explicit origin matrix without treating CORS as authentication", () => {
    expect(isAllowedCorsOrigin(undefined, env)).toBe(true);
    expect(isAllowedCorsOrigin("https://lunch.example", env)).toBe(true);
    expect(isAllowedCorsOrigin(`chrome-extension://${"a".repeat(32)}`, env)).toBe(true);
    expect(isAllowedCorsOrigin(`chrome-extension://${"q".repeat(32)}`, env)).toBe(false);
    expect(isAllowedCorsOrigin("https://evil.example", env)).toBe(false);
    expect(isAllowedCorsOrigin("http://localhost:5173", env)).toBe(false);
    expect(isAllowedCorsOrigin("http://localhost:5173", { ...env, NODE_ENV: "test" })).toBe(true);
  });

  it("returns CORS headers only for allowed origins and methods", async () => {
    const app = await buildApp({ env });
    const allowed = await app.inject({
      method: "OPTIONS",
      url: "/api/identities",
      headers: {
        origin: `chrome-extension://${"p".repeat(32)}`,
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type"
      }
    });
    expect(allowed.headers["access-control-allow-origin"]).toBe(`chrome-extension://${"p".repeat(32)}`);
    expect(allowed.headers["access-control-allow-methods"]).toBe("GET, POST, PUT, PATCH, OPTIONS");
    expect(allowed.headers["access-control-max-age"]).toBe("600");
    expect(allowed.headers["access-control-allow-credentials"]).toBeUndefined();

    const denied = await app.inject({
      method: "OPTIONS",
      url: "/api/identities",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" }
    });
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });

  it("trusts only a validated Railway X-Real-IP in production", () => {
    const request = {
      ip: "10.0.0.1",
      headers: { "x-real-ip": "203.0.113.7" },
      socket: { remoteAddress: "10.0.0.2" }
    } as unknown as FastifyRequest;
    expect(rateLimitClientIp(request, env)).toBe("203.0.113.7");
    request.headers["x-real-ip"] = "203.0.113.7, 198.51.100.1";
    expect(rateLimitClientIp(request, env)).toBe("10.0.0.2");
    expect(rateLimitClientIp(request, { ...env, NODE_ENV: "test" })).toBe("10.0.0.1");
  });

  it("uses irreversible authorization keys and whitelisted log context", () => {
    const request = {
      id: "req-1",
      method: "POST",
      headers: {
        authorization: "Bearer token-secret",
        "x-railway-request-id": "railway-1"
      },
      params: { groupId: "group-1" },
      query: { token: "query-secret" },
      body: { displayName: "小林" },
      routeOptions: { url: "/api/groups/:groupId/session" }
    } as unknown as FastifyRequest;
    const key = irreversibleAuthorizationKey(request);
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain("token-secret");
    const serialized = JSON.stringify(safeRequestLogContext(request));
    expect(serialized).toContain("group-1");
    expect(serialized).not.toContain("token-secret");
    expect(serialized).not.toContain("query-secret");
    expect(serialized).not.toContain("小林");
    expect(classifiedDatabaseErrorCode({ code: "P2002", message: "secret" })).toBe("P2002");
    expect(classifiedDatabaseErrorCode({ code: "42P01" })).toBe("unknown");
  });

  it("returns a fixed 500 and never logs request or database secrets", async () => {
    const entries: unknown[] = [];
    const logger = {
      level: "info",
      fatal: vi.fn((value: unknown) => entries.push(value)),
      error: vi.fn((value: unknown) => entries.push(value)),
      warn: vi.fn((value: unknown) => entries.push(value)),
      info: vi.fn((value: unknown) => entries.push(value)),
      debug: vi.fn(),
      trace: vi.fn(),
      silent: vi.fn(),
      child() { return this; }
    } as unknown as FastifyBaseLogger;
    const app = await buildApp({ env, loggerInstance: logger });
    const response = await app.inject({
      method: "POST",
      url: "/api/identities?token=query-secret",
      headers: { authorization: "Bearer token-secret" },
      payload: { displayName: "小林" }
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "internal_error", message: "Internal server error" });
    const serialized = JSON.stringify(entries);
    for (const secret of ["token-secret", "query-secret", "小林", "postgresql://user:password@host/db"]) {
      expect(serialized).not.toContain(secret);
    }
    await app.close();
  });
});
