import { DEFAULT_GROUP_SCORING_WEIGHTS, LUNCH_HEADLINE } from "@lunch/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import { signGroupSessionToken } from "../src/services/auth/tokens";
import { hashInviteCode, verifyInviteCode } from "../src/services/groups/inviteCodes";

const prisma = vi.hoisted(() => {
  const group = {
    id: "group-a",
    name: "A Team",
    subtitle: null as string | null,
    officeTimezone: "Asia/Shanghai",
    officeCity: "Shanghai",
    officeLatitude: 31.23,
    officeLongitude: 121.47,
    inviteCodeHash: "",
    inviteCodeVersion: 1,
    inviteCodeRotatedAt: new Date("2026-07-01T00:00:00.000Z")
  };
  const memberships = [
    {
      id: "admin-a",
      groupId: "group-a",
      identityId: "identity-admin",
      role: "admin" as "admin" | "member",
      status: "active" as "active" | "removed",
      joinedAt: new Date("2026-06-01T00:00:00.000Z"),
      removedAt: null as Date | null,
      identity: { displayName: "Admin" }
    },
    {
      id: "member-a",
      groupId: "group-a",
      identityId: "identity-member",
      role: "member" as "admin" | "member",
      status: "active" as "active" | "removed",
      joinedAt: new Date("2026-06-02T00:00:00.000Z"),
      removedAt: null as Date | null,
      identity: { displayName: "Member" }
    }
  ];
  let settings: null | {
    reminderTime: string;
    weekdayReminderEnabled: boolean;
    secondReminderEnabled: boolean;
    notificationTitle: string;
    notificationGroupLabel: string | null;
  } = null;
  let weights: null | typeof DEFAULT_GROUP_SCORING_WEIGHTS = null;

  const client = {
    __reset: () => {
      Object.assign(group, {
        name: "A Team",
        subtitle: null,
        officeTimezone: "Asia/Shanghai",
        officeCity: "Shanghai",
        officeLatitude: 31.23,
        officeLongitude: 121.47,
        inviteCodeHash: hashInviteCode("LUNCH-OLD123", "session-secret"),
        inviteCodeVersion: 1,
        inviteCodeRotatedAt: new Date("2026-07-01T00:00:00.000Z")
      });
      memberships[0]!.role = "admin";
      memberships[0]!.status = "active";
      memberships[1]!.role = "member";
      memberships[1]!.status = "active";
      settings = null;
      weights = null;
    },
    __setRole: (membershipId: string, role: "admin" | "member") => {
      const membership = memberships.find((candidate) => candidate.id === membershipId);
      if (membership) membership.role = role;
    },
    __setStatus: (membershipId: string, status: "active" | "removed") => {
      const membership = memberships.find((candidate) => candidate.id === membershipId);
      if (membership) membership.status = status;
    },
    __group: group,
    groupMembership: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        memberships.find((membership) => membership.id === where.id) ?? null),
      findMany: vi.fn(async ({ where }: { where: { status?: string } }) =>
        memberships
          .filter((membership) => !where.status || membership.status === where.status)
          .map((membership) => where.status ? { id: membership.id } : membership)),
      update: vi.fn()
    },
    lunchGroup: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => where.id === group.id ? group : null),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        if (where.id !== group.id) throw new Error("Missing group");
        Object.assign(group, data);
        return group;
      }),
      updateMany: vi.fn(async ({ where, data }: {
        where: { id: string };
        data: { inviteCodeHash: string; inviteCodeVersion: { increment: number }; inviteCodeRotatedAt: Date };
      }) => {
        if (where.id !== group.id) return { count: 0 };
        group.inviteCodeHash = data.inviteCodeHash;
        group.inviteCodeVersion += data.inviteCodeVersion.increment;
        group.inviteCodeRotatedAt = data.inviteCodeRotatedAt;
        return { count: 1 };
      })
    },
    groupSettings: {
      findUnique: vi.fn(async () => settings),
      upsert: vi.fn(async ({ create, update }: { create: typeof settings; update: Partial<NonNullable<typeof settings>> }) => {
        settings = settings ? { ...settings, ...update } : {
          reminderTime: "11:30",
          weekdayReminderEnabled: true,
          secondReminderEnabled: false,
          notificationTitle: LUNCH_HEADLINE,
          notificationGroupLabel: group.name,
          ...create
        };
        return settings;
      })
    },
    scoringWeights: {
      findUnique: vi.fn(async () => weights),
      upsert: vi.fn(async ({ create, update }: {
        create: typeof DEFAULT_GROUP_SCORING_WEIGHTS;
        update: Partial<typeof DEFAULT_GROUP_SCORING_WEIGHTS>;
      }) => {
        weights = weights ? { ...weights, ...update } : { ...DEFAULT_GROUP_SCORING_WEIGHTS, ...create };
        return weights;
      })
    },
    dailyParticipation: { findMany: vi.fn(async () => []) },
    restaurant: { findMany: vi.fn(async () => []) },
    recommendation: { findMany: vi.fn(async () => []) },
    feedback: { findMany: vi.fn(async () => []) },
    $queryRaw: vi.fn(async () => []),
    $transaction: vi.fn(async (callback: (tx: typeof client) => Promise<unknown>) => callback(client))
  };
  return client;
});

vi.mock("../src/plugins/prisma", () => ({ prisma }));

const routeEnv = {
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

function session(input: {
  groupId?: string;
  membershipId?: string;
  identityId?: string;
  role?: "admin" | "member";
} = {}) {
  return signGroupSessionToken({
    groupId: input.groupId ?? "group-a",
    membershipId: input.membershipId ?? "admin-a",
    identityId: input.identityId ?? "identity-admin",
    role: input.role ?? "admin",
    exp: Date.now() + 60_000
  }, "session-secret");
}

beforeEach(() => {
  Object.assign(process.env, routeEnv);
  prisma.__reset();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Stage 5 group routes", () => {
  it.each([
    ["GET", "/api/groups/group-b/dashboard"],
    ["GET", "/api/groups/group-b/history"],
    ["GET", "/api/groups/group-b/history/me"],
    ["GET", "/api/groups/group-b/settings"],
    ["PATCH", "/api/groups/group-b/settings"],
    ["GET", "/api/groups/group-b/members"],
    ["PATCH", "/api/groups/group-b/members/member-a"],
    ["POST", "/api/groups/group-b/invite-code/rotate"]
  ])("isolates groups for %s %s", async (method, url) => {
    const app = await buildApp();
    const response = await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${session()}` },
      ...(method === "PATCH" ? { payload: { group: { name: "Nope" }, role: "admin" } } : {})
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("group_session_mismatch");
    await app.close();
  });

  it("lets an active member read dashboard, settings, and members without creating defaults", async () => {
    const app = await buildApp();
    const authorization = `Bearer ${session({
      membershipId: "member-a",
      identityId: "identity-member",
      role: "member"
    })}`;

    const dashboard = await app.inject({ method: "GET", url: "/api/groups/group-a/dashboard", headers: { authorization } });
    const settings = await app.inject({ method: "GET", url: "/api/groups/group-a/settings", headers: { authorization } });
    const members = await app.inject({ method: "GET", url: "/api/groups/group-a/members", headers: { authorization } });
    const personalHistory = await app.inject({ method: "GET", url: "/api/groups/group-a/history/me", headers: { authorization } });

    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json().groupId).toBe("group-a");
    expect(settings.statusCode).toBe(200);
    expect(settings.json().scoringWeights).toEqual(DEFAULT_GROUP_SCORING_WEIGHTS);
    expect(members.statusCode).toBe(200);
    expect(members.json().members).toHaveLength(2);
    expect(personalHistory.statusCode).toBe(200);
    expect(personalHistory.json().membershipId).toBe("member-a");
    expect(prisma.groupSettings.upsert).not.toHaveBeenCalled();
    expect(prisma.scoringWeights.upsert).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([
    ["PATCH", "/api/groups/group-a/settings", { group: { name: "Nope" } }],
    ["PATCH", "/api/groups/group-a/members/admin-a", { role: "member" }],
    ["POST", "/api/groups/group-a/invite-code/rotate", undefined]
  ])("does not let a member mutate operations with %s %s", async (method, url, payload) => {
    const app = await buildApp();
    const response = await app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${session({ membershipId: "member-a", identityId: "identity-member", role: "member" })}` },
      ...(payload ? { payload } : {})
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("admin_membership_required");
    await app.close();
  });

  it("checks current database status and role instead of trusting an old token", async () => {
    const app = await buildApp();
    const staleAdminToken = session();
    prisma.__setRole("admin-a", "member");
    const staleRole = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-a/settings",
      headers: { authorization: `Bearer ${staleAdminToken}` },
      payload: { group: { name: "Nope" } }
    });
    expect(staleRole.statusCode).toBe(403);
    expect(staleRole.json().error).toBe("admin_membership_required");

    prisma.__setStatus("admin-a", "removed");
    const removed = await app.inject({
      method: "GET",
      url: "/api/groups/group-a/dashboard",
      headers: { authorization: `Bearer ${staleAdminToken}` }
    });
    expect(removed.statusCode).toBe(403);
    expect(removed.json().error).toBe("active_membership_required");
    await app.close();
  });

  it.each([
    ["?limit=0", "invalid_history_limit"],
    ["?limit=51", "invalid_history_limit"],
    ["?cursor=not-a-cursor", "invalid_history_cursor"]
  ])("returns a stable 400 for invalid history query %s", async (query, error) => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: `/api/groups/group-a/history${query}`,
      headers: { authorization: `Bearer ${session()}` }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe(error);
    await app.close();
  });

  it("rejects invalid settings before starting a transaction", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-a/settings",
      headers: { authorization: `Bearer ${session()}` },
      payload: { scoringWeights: { weatherMatch: 100.5 } }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_settings_request");
    expect(prisma.$transaction).not.toHaveBeenCalled();
    await app.close();
  });

  it("applies a partial settings update atomically without replacing omitted fields", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/groups/group-a/settings",
      headers: { authorization: `Bearer ${session()}` },
      payload: {
        group: { name: "  New Team  " },
        reminder: { reminderTime: "12:05" },
        scoringWeights: { weatherMatch: 40 }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      groupId: "group-a",
      group: { name: "New Team", officeCity: "Shanghai" },
      reminder: { reminderTime: "12:05", weekdayReminderEnabled: true },
      scoringWeights: { weatherMatch: 40, distance: DEFAULT_GROUP_SCORING_WEIGHTS.distance }
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("rotates the invite hash in one transaction and only returns the new plaintext once", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T04:00:00.000Z"));
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/groups/group-a/invite-code/rotate",
      headers: { authorization: `Bearer ${session()}` }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({ groupId: "group-a", version: 2, rotatedAt: "2026-07-14T04:00:00.000Z" });
    expect(verifyInviteCode("LUNCH-OLD123", prisma.__group.inviteCodeHash, "session-secret")).toBe(false);
    expect(verifyInviteCode(body.inviteCode, prisma.__group.inviteCodeHash, "session-secret")).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
