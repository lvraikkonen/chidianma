import type { GroupRole, MembershipStatus } from "@lunch/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnv } from "../src/env";
import {
  buildGroupCapabilities,
  isLuckyRestaurantWheelEnabled
} from "../src/services/features/groupCapabilities";
import { signGroupSessionToken } from "../src/services/auth/tokens";

const prisma = vi.hoisted(() => ({
  groupMembership: {
    findUnique: vi.fn()
  }
}));

vi.mock("../src/plugins/prisma", () => ({ prisma }));

const env: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgresql://example",
  SESSION_SECRET: "session-secret",
  ALLOW_PUBLIC_GROUP_CREATION: "true",
  IDENTITY_TOKEN_TTL_DAYS: "90",
  GROUP_SESSION_TTL_DAYS: "14",
  WEATHER_API_BASE_URL: "https://api.open-meteo.com/v1",
  OFFICE_CITY: "Shanghai",
  OFFICE_LATITUDE: "31.2304",
  OFFICE_LONGITUDE: "121.4737",
  OFFICE_TIMEZONE: "Asia/Shanghai",
  PUBLIC_API_BASE_URL: "http://localhost:3000",
  LUCKY_RESTAURANT_WHEEL_ENABLED: "false",
  LUCKY_RESTAURANT_WHEEL_GROUP_IDS: "",
  NODE_ENV: "test",
  PORT: "3000"
};

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

function seedMembership(
  groupId = "group-1",
  status: MembershipStatus = "active"
) {
  prisma.groupMembership.findUnique.mockResolvedValue({
    id: "membership-1",
    groupId,
    identityId: "identity-1",
    role: "member",
    status,
    identity: { authVersion: 0, anonymizedAt: null }
  });
}

async function buildTestApp(overrides: NodeJS.ProcessEnv = {}) {
  Object.assign(process.env, env, overrides);
  const { buildApp } = await import("../src/app");
  return buildApp();
}

describe("group beta capabilities", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    prisma.groupMembership.findUnique.mockReset();
  });

  afterEach(() => {
    for (const key of Object.keys(env)) delete process.env[key];
  });

  it.each([
    [false, ["group-1"], "group-1", false],
    [true, ["group-2"], "group-1", false],
    [true, ["group-10"], "group-1", false],
    [true, ["group-1"], "group-1", true]
  ] as const)(
    "requires both the global flag and an exact group allowlist match",
    (enabled, groupIds, groupId, expected) => {
      const parsed = loadEnv({
        ...env,
        LUCKY_RESTAURANT_WHEEL_ENABLED: String(enabled),
        LUCKY_RESTAURANT_WHEEL_GROUP_IDS: groupIds.join(",")
      });

      expect(isLuckyRestaurantWheelEnabled(parsed, groupId)).toBe(expected);
    }
  );

  it("keeps all POI capabilities disabled in the wheel slice", () => {
    const parsed = loadEnv({
      ...env,
      LUCKY_RESTAURANT_WHEEL_ENABLED: "true",
      LUCKY_RESTAURANT_WHEEL_GROUP_IDS: "group-1"
    });

    expect(buildGroupCapabilities(parsed, "group-1")).toEqual({
      groupId: "group-1",
      features: {
        luckyRestaurantWheel: true,
        poiReferenceSearch: false,
        poiReferenceDraft: false,
        poiOfficePreset: false,
        poiProvider: null
      }
    });
  });

  it.each([
    ["without authorization", {}],
    ["with only the removed read token", {
      "x-lunch-read-token": "removed-read-token"
    }]
  ] as const)("requires a group bearer token %s", async (_case, headers) => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/groups/group-1/capabilities",
      headers
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: "missing_token" });
    expect(prisma.groupMembership.findUnique).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects a session token for another group before querying membership", async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/groups/group-1/capabilities",
      headers: {
        authorization: `Bearer ${groupToken({ groupId: "group-2" })}`
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "group_session_mismatch" });
    expect(prisma.groupMembership.findUnique).not.toHaveBeenCalled();
    await app.close();
  });

  it("rejects a removed membership", async () => {
    seedMembership("group-1", "removed");
    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/groups/group-1/capabilities",
      headers: { authorization: `Bearer ${groupToken()}` }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: "active_membership_required" });
    await app.close();
  });

  it("returns the complete default-off contract to an active member", async () => {
    seedMembership();
    const app = await buildTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/groups/group-1/capabilities",
      headers: { authorization: `Bearer ${groupToken()}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      groupId: "group-1",
      features: {
        luckyRestaurantWheel: false,
        poiReferenceSearch: false,
        poiReferenceDraft: false,
        poiOfficePreset: false,
        poiProvider: null
      }
    });
    await app.close();
  });

  it("enables the wheel only for an explicitly allowlisted active group", async () => {
    seedMembership();
    const app = await buildTestApp({
      LUCKY_RESTAURANT_WHEEL_ENABLED: "true",
      LUCKY_RESTAURANT_WHEEL_GROUP_IDS: "group-1"
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/groups/group-1/capabilities",
      headers: { authorization: `Bearer ${groupToken()}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      groupId: "group-1",
      features: { luckyRestaurantWheel: true }
    });
    await app.close();
  });

  it("keeps an active non-allowlisted group disabled when the global flag is on", async () => {
    seedMembership("group-2");
    const app = await buildTestApp({
      LUCKY_RESTAURANT_WHEEL_ENABLED: "true",
      LUCKY_RESTAURANT_WHEEL_GROUP_IDS: "group-1"
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/groups/group-2/capabilities",
      headers: {
        authorization: `Bearer ${groupToken({ groupId: "group-2" })}`
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      groupId: "group-2",
      features: { luckyRestaurantWheel: false }
    });
    await app.close();
  });
});
