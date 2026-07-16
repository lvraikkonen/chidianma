import type { GroupRole, MembershipStatus } from "@lunch/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import type { AppEnv } from "../src/env";
import { AuthError } from "../src/services/auth/errors";
import { signGroupSessionToken, signIdentityToken } from "../src/services/auth/tokens";
import { generateInviteCode, hashInviteCode, verifyInviteCode } from "../src/services/groups/inviteCodes";
import { assertNotLastActiveAdmin, requireActiveMembership } from "../src/services/groups/memberships";

type MockIdentity = {
  id: string;
  displayName: string;
  authVersion: number;
  anonymizedAt: Date | null;
  lastSeenAt: Date | null;
};

type MockLunchGroup = {
  id: string;
  name: string;
  subtitle: string | null;
  inviteCodeHash: string;
  createdByIdentityId: string;
  officeTimezone: string;
  officeCity: string;
  officeLatitude: number;
  officeLongitude: number;
};

type MockGroupMembership = {
  id: string;
  groupId: string;
  identityId: string;
  role: GroupRole;
  status: MembershipStatus;
  joinedAt: Date;
  removedAt?: Date | null;
  group?: MockLunchGroup;
};

const prisma = vi.hoisted(() => {
  const store = {
    identities: [] as MockIdentity[],
    groups: [] as MockLunchGroup[],
    memberships: [] as MockGroupMembership[],
    nextIdentityId: 1,
    nextGroupId: 1,
    nextMembershipId: 1
  };

  const includeGroup = (membership: MockGroupMembership) => ({
    ...membership,
    group: store.groups.find((group) => group.id === membership.groupId) ?? membership.group,
    identity: store.identities.find((identity) => identity.id === membership.identityId)
  });

  const client = {
    __reset: () => {
      store.identities = [];
      store.groups = [];
      store.memberships = [];
      store.nextIdentityId = 1;
      store.nextGroupId = 1;
      store.nextMembershipId = 1;
    },
    __setMembershipStatus: (membershipId: string, status: MembershipStatus) => {
      const membership = store.memberships.find((candidate) => candidate.id === membershipId);
      if (!membership) {
        throw new Error(`Missing membership ${membershipId}`);
      }
      membership.status = status;
    },
    identity: {
      create: vi.fn(async ({ data }: { data: { displayName: string; lastSeenAt: Date } }) => {
        const identity = {
          id: `identity-${store.nextIdentityId++}`,
          authVersion: 0,
          anonymizedAt: null,
          ...data
        };
        store.identities.push(identity);
        return identity;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return store.identities.find((identity) => identity.id === where.id) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { lastSeenAt: Date } }) => {
        const identity = store.identities.find((candidate) => candidate.id === where.id);
        if (!identity) {
          throw new Error(`Missing identity ${where.id}`);
        }
        Object.assign(identity, data);
        return identity;
      })
    },
    lunchGroup: {
      create: vi.fn(async ({ data }: { data: Omit<MockLunchGroup, "id"> }) => {
        const group = { id: `group-${store.nextGroupId++}`, ...data };
        store.groups.push(group);
        return group;
      }),
      findMany: vi.fn(async () => store.groups),
      findFirst: vi.fn(async ({ where }: { where: { inviteCodeHash: string } }) => {
        return store.groups.find((group) => group.inviteCodeHash === where.inviteCodeHash) ?? null;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return store.groups.find((group) => group.id === where.id) ?? null;
      })
    },
    groupMembership: {
      create: vi.fn(async ({ data }: { data: Omit<MockGroupMembership, "id" | "joinedAt"> }) => {
        const membership = { id: `membership-${store.nextMembershipId++}`, joinedAt: new Date(), ...data };
        store.memberships.push(membership);
        return includeGroup(membership);
      }),
      findMany: vi.fn(
        async ({
          where
        }: {
          where: { identityId?: string; status?: MembershipStatus };
          include?: { group: true };
          orderBy?: { joinedAt: "asc" };
        }) => {
          return store.memberships
            .filter((membership) => {
              return Object.entries(where).every(
                ([key, value]) => membership[key as keyof MockGroupMembership] === value
              );
            })
            .map(includeGroup);
        }
      ),
      findUnique: vi.fn(
        async ({
          where
        }: {
          where:
            | { id: string }
            | { groupId_identityId: { groupId: string; identityId: string } };
          include?: { group: true };
        }) => {
          const membership =
            "id" in where
              ? store.memberships.find((candidate) => candidate.id === where.id)
              : store.memberships.find(
                  (candidate) =>
                    candidate.groupId === where.groupId_identityId.groupId &&
                    candidate.identityId === where.groupId_identityId.identityId
                );
          return membership ? includeGroup(membership) : null;
        }
      ),
      count: vi.fn(async ({ where }: { where: Partial<MockGroupMembership> }) => {
        return store.memberships.filter((membership) => {
          return Object.entries(where).every(([key, value]) => membership[key as keyof MockGroupMembership] === value);
        }).length;
      }),
      update: vi.fn(
        async ({
          where,
          data
        }: {
          where: { id: string };
          data: { role?: GroupRole; status?: MembershipStatus; removedAt?: Date | null };
        }) => {
          const membership = store.memberships.find((candidate) => candidate.id === where.id);
          if (!membership) {
            throw new Error(`Missing membership ${where.id}`);
          }
          Object.assign(membership, data);
          return includeGroup(membership);
        }
      )
    },
    groupSettings: {
      create: vi.fn(async ({ data }: { data: { groupId: string; notificationGroupLabel: string } }) => data)
    },
    scoringWeights: {
      create: vi.fn(async ({ data }: { data: { groupId: string } }) => data)
    },
    restaurant: {
      findMany: vi.fn(async () => [])
    },
    recommendation: {
      findMany: vi.fn(async () => [])
    },
    feedback: {
      findMany: vi.fn(async () => [])
    },
    $queryRaw: vi.fn(async () => []),
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(client))
  };

  return client;
});

vi.mock("../src/plugins/prisma", () => ({ prisma }));

interface MembershipRecord {
  id: string;
  groupId: string;
  identityId: string;
  role: GroupRole;
  status: MembershipStatus;
}

const env = { SESSION_SECRET: "session-secret" } as AppEnv;

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

beforeEach(() => {
  Object.assign(process.env, routeEnv);
  prisma.__reset();
  vi.clearAllMocks();
});

afterEach(() => {
  for (const key of Object.keys(routeEnv)) {
    delete process.env[key];
  }
});

function signMembershipToken(input: {
  identityId?: string;
  groupId?: string;
  membershipId?: string;
  role?: GroupRole;
  authVersion?: number;
}): string {
  return signGroupSessionToken(
    {
      identityId: input.identityId ?? "identity-1",
      groupId: input.groupId ?? "group-1",
      membershipId: input.membershipId ?? "membership-1",
      role: input.role ?? "member",
      ...(input.authVersion === undefined ? {} : { authVersion: input.authVersion }),
      exp: Date.now() + 60_000
    },
    env.SESSION_SECRET
  );
}

function prismaWithMemberships(memberships: MembershipRecord[]) {
  return {
    groupMembership: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const membership = memberships.find((candidate) => candidate.id === where.id);
        return membership
          ? { ...membership, identity: { authVersion: 0, anonymizedAt: null } }
          : null;
      }),
      count: vi.fn(async ({ where }: { where: Partial<MembershipRecord> }) => {
        return memberships.filter((membership) => {
          return Object.entries(where).every(([key, value]) => membership[key as keyof MembershipRecord] === value);
        }).length;
      })
    }
  };
}

async function expectAuthError(
  fn: () => Promise<unknown>,
  code: AuthError["code"],
  error: string
): Promise<void> {
  let thrown: unknown;
  try {
    await fn();
  } catch (err) {
    thrown = err;
  }

  expect(thrown).toBeInstanceOf(AuthError);
  expect(thrown).toMatchObject({ code, error });
}

describe("group invite codes", () => {
  it("hashes and verifies invite codes without storing plaintext", () => {
    const code = generateInviteCode();
    const hash = hashInviteCode(code, "session-secret");

    expect(code).toMatch(/^LUNCH-[A-Z0-9]{6}$/);
    expect(hash).not.toContain(code);
    expect(verifyInviteCode(code, hash, "session-secret")).toBe(true);
    expect(verifyInviteCode("LUNCH-BAD123", hash, "session-secret")).toBe(false);
  });
});

describe("group membership authorization", () => {
  it("uses the current database role and status for active membership context", async () => {
    const prisma = prismaWithMemberships([
      { id: "membership-1", groupId: "group-1", identityId: "identity-1", role: "admin", status: "active" }
    ]);
    const authorization = `Bearer ${signMembershipToken({ role: "member" })}`;

    await expect(
      requireActiveMembership({
        prisma: prisma as never,
        env,
        groupId: "group-1",
        authorization,
        requiredRole: "admin"
      })
    ).resolves.toEqual({
      identityId: "identity-1",
      groupId: "group-1",
      membershipId: "membership-1",
      role: "admin"
    });
  });

  it("rejects a group session token for a different route group", async () => {
    const prisma = prismaWithMemberships([
      { id: "membership-1", groupId: "group-1", identityId: "identity-1", role: "admin", status: "active" }
    ]);
    const authorization = `Bearer ${signMembershipToken({ groupId: "group-2" })}`;

    await expectAuthError(
      () => requireActiveMembership({ prisma: prisma as never, env, groupId: "group-1", authorization }),
      "forbidden",
      "group_session_mismatch"
    );
  });

  it("rejects requests without a bearer token", async () => {
    const prisma = prismaWithMemberships([]);

    await expectAuthError(
      () => requireActiveMembership({ prisma: prisma as never, env, groupId: "group-1" }),
      "unauthorized",
      "missing_token"
    );
  });

  it("rejects removed memberships", async () => {
    const prisma = prismaWithMemberships([
      { id: "membership-1", groupId: "group-1", identityId: "identity-1", role: "admin", status: "removed" }
    ]);
    const authorization = `Bearer ${signMembershipToken({ role: "admin" })}`;

    await expectAuthError(
      () => requireActiveMembership({ prisma: prisma as never, env, groupId: "group-1", authorization }),
      "forbidden",
      "active_membership_required"
    );
  });

  it("rejects a token whose identity claim does not own the membership", async () => {
    const prisma = prismaWithMemberships([
      { id: "membership-1", groupId: "group-1", identityId: "identity-2", role: "member", status: "active" }
    ]);
    await expectAuthError(
      () => requireActiveMembership({
        prisma: prisma as never,
        env,
        groupId: "group-1",
        authorization: `Bearer ${signMembershipToken({ identityId: "identity-1" })}`
      }),
      "forbidden",
      "active_membership_required"
    );
  });

  it("rejects version-mismatched and anonymized identity sessions", async () => {
    const membership = {
      id: "membership-1",
      groupId: "group-1",
      identityId: "identity-1",
      role: "member" as const,
      status: "active" as const
    };
    for (const identity of [
      { authVersion: 1, anonymizedAt: null },
      { authVersion: 0, anonymizedAt: new Date() }
    ]) {
      const prisma = {
        groupMembership: {
          findUnique: vi.fn(async () => ({ ...membership, identity }))
        }
      };
      await expectAuthError(
        () => requireActiveMembership({
          prisma: prisma as never,
          env,
          groupId: "group-1",
          authorization: `Bearer ${signMembershipToken({ authVersion: 0 })}`
        }),
        "unauthorized",
        "invalid_token"
      );
    }
  });

  it("rejects member sessions when an admin role is required", async () => {
    const prisma = prismaWithMemberships([
      { id: "membership-1", groupId: "group-1", identityId: "identity-1", role: "member", status: "active" }
    ]);
    const authorization = `Bearer ${signMembershipToken({ role: "admin" })}`;

    await expectAuthError(
      () =>
        requireActiveMembership({
          prisma: prisma as never,
          env,
          groupId: "group-1",
          authorization,
          requiredRole: "admin"
        }),
      "forbidden",
      "admin_membership_required"
    );
  });

  it("rejects removing or downgrading the last active admin", async () => {
    const prisma = prismaWithMemberships([
      { id: "membership-1", groupId: "group-1", identityId: "identity-1", role: "admin", status: "active" },
      { id: "membership-2", groupId: "group-1", identityId: "identity-2", role: "member", status: "active" },
      { id: "membership-3", groupId: "group-1", identityId: "identity-3", role: "admin", status: "removed" }
    ]);

    await expectAuthError(
      () => assertNotLastActiveAdmin({ prisma: prisma as never, groupId: "group-1", membershipId: "membership-1" }),
      "bad_request",
      "last_admin"
    );
  });

  it("rejects last-admin checks for memberships outside the route group before counting admins", async () => {
    const prisma = prismaWithMemberships([
      { id: "membership-1", groupId: "group-2", identityId: "identity-1", role: "admin", status: "active" },
      { id: "membership-2", groupId: "group-1", identityId: "identity-2", role: "admin", status: "active" },
      { id: "membership-3", groupId: "group-1", identityId: "identity-3", role: "admin", status: "active" }
    ]);

    await expectAuthError(
      () => assertNotLastActiveAdmin({ prisma: prisma as never, groupId: "group-1", membershipId: "membership-1" }),
      "bad_request",
      "membership_group_mismatch"
    );
    expect(prisma.groupMembership.count).not.toHaveBeenCalled();
  });
});

describe("group routes", () => {
  async function createIdentityFor(app: Awaited<ReturnType<typeof buildApp>>, displayName: string) {
    const response = await app.inject({
      method: "POST",
      url: "/api/identities",
      payload: { displayName }
    });
    expect(response.statusCode).toBe(200);
    return response.json();
  }

  async function createGroupFor(
    app: Awaited<ReturnType<typeof buildApp>>,
    displayName: string,
    groupName: string,
    subtitle?: string
  ) {
    const identity = await createIdentityFor(app, displayName);
    const response = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers: { authorization: `Bearer ${identity.identityToken}` },
      payload: { groupName, ...(subtitle ? { subtitle } : {}) }
    });
    expect(response.statusCode).toBe(200);
    return response.json();
  }

  async function joinGroupFor(
    app: Awaited<ReturnType<typeof buildApp>>,
    displayName: string,
    inviteCode: string
  ) {
    const identity = await createIdentityFor(app, displayName);
    const response = await app.inject({
      method: "POST",
      url: "/api/groups/join",
      headers: { authorization: `Bearer ${identity.identityToken}` },
      payload: { inviteCode }
    });
    expect(response.statusCode).toBe(200);
    return response.json();
  }

  it("isolates create and join rate-limit buckets by route and client IP", async () => {
    const app = await buildApp();
    const identity = await createIdentityFor(app, "限流成员");
    const createResponses = [];
    for (let index = 0; index < 4; index += 1) {
      createResponses.push(await app.inject({
        method: "POST",
        url: "/api/groups",
        remoteAddress: "203.0.113.30",
        headers: { authorization: `Bearer ${identity.identityToken}` },
        payload: { groupName: `小组${index}` }
      }));
    }
    expect(createResponses.at(-1)?.statusCode).toBe(429);
    expect((await app.inject({
      method: "POST",
      url: "/api/groups",
      remoteAddress: "203.0.113.31",
      headers: { authorization: `Bearer ${identity.identityToken}` },
      payload: { groupName: "另一 IP" }
    })).statusCode).toBe(200);

    const joinResponses = [];
    for (let index = 0; index < 11; index += 1) {
      joinResponses.push(await app.inject({
        method: "POST",
        url: "/api/groups/join",
        remoteAddress: "203.0.113.30",
        headers: { authorization: `Bearer ${identity.identityToken}` },
        payload: { inviteCode: `LUNCH-BAD${index}` }
      }));
    }
    expect(joinResponses.at(-1)?.statusCode).toBe(429);

    const sessionResponses = [];
    for (let index = 0; index < 31; index += 1) {
      sessionResponses.push(await app.inject({
        method: "POST",
        url: "/api/groups/group-1/session",
        remoteAddress: "203.0.113.30",
        headers: { authorization: "Bearer stable-invalid-token" }
      }));
    }
    expect(sessionResponses.at(-1)?.statusCode).toBe(429);
    await app.close();
  });

  it("returns 400 for missing and malformed identity creation bodies", async () => {
    const app = await buildApp();

    const missingBody = await app.inject({ method: "POST", url: "/api/identities" });
    expect(missingBody.statusCode).toBe(400);
    expect(missingBody.json()).toEqual({ error: "display_name_required", message: "Display name is required" });

    const malformedBody = await app.inject({
      method: "POST",
      url: "/api/identities",
      payload: { displayName: 123 }
    });
    expect(malformedBody.statusCode).toBe(400);
    expect(malformedBody.json()).toEqual({ error: "display_name_required", message: "Display name is required" });
  });

  it("returns 400 for missing and malformed group creation bodies", async () => {
    const app = await buildApp();

    const missingBody = await app.inject({ method: "POST", url: "/api/groups" });
    expect(missingBody.statusCode).toBe(400);
    expect(missingBody.json()).toEqual({ error: "invalid_group_create_request", message: "Group name is required" });

    const malformedBody = await app.inject({
      method: "POST",
      url: "/api/groups",
      payload: { displayName: "李雷", groupName: 123 }
    });
    expect(malformedBody.statusCode).toBe(400);
    expect(malformedBody.json()).toEqual({ error: "invalid_group_create_request", message: "Group name is required" });
  });

  it("returns 400 for missing and malformed group join bodies", async () => {
    const app = await buildApp();
    const missingBody = await app.inject({ method: "POST", url: "/api/groups/join" });
    expect(missingBody.statusCode).toBe(400);
    expect(missingBody.json()).toEqual({ error: "invalid_group_join_request", message: "Invite code is required" });

    const malformedBody = await app.inject({
      method: "POST",
      url: "/api/groups/join",
      payload: { displayName: "小赵", inviteCode: 123 }
    });
    expect(malformedBody.statusCode).toBe(400);
    expect(malformedBody.json()).toEqual({ error: "invalid_group_join_request", message: "Invite code is required" });
  });

  it("creates an identity and group, then lists active memberships", async () => {
    const app = await buildApp();

    const created = await createGroupFor(app, "李雷", "前端干饭组", "楼下约饭");
    expect(created.identityToken).toEqual(expect.any(String));
    expect(created.groupSessionToken).toEqual(expect.any(String));
    expect(created.group.name).toBe("前端干饭组");
    expect(created.inviteCode).toMatch(/^LUNCH-[A-Z0-9]{6}$/);

    const list = await app.inject({
      method: "GET",
      url: "/api/groups",
      headers: { authorization: `Bearer ${created.identityToken}` }
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().groups).toEqual([
      expect.objectContaining({ groupId: created.group.groupId, role: "admin", membershipId: expect.any(String) })
    ]);
  });

  it("reuses an existing identity when creating a second group", async () => {
    const app = await buildApp();

    const first = await createGroupFor(app, "李雷", "前端干饭组");

    const secondResponse = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers: { authorization: `Bearer ${first.identityToken}` },
      payload: { groupName: "后端干饭组" }
    });
    expect(secondResponse.statusCode).toBe(200);
    const second = secondResponse.json();
    expect(second.identityToken).toEqual(expect.any(String));
    expect(second.group.groupId).not.toBe(first.group.groupId);

    const list = await app.inject({
      method: "GET",
      url: "/api/groups",
      headers: { authorization: `Bearer ${second.identityToken}` }
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().groups.map((group: { groupId: string }) => group.groupId).sort()).toEqual(
      [first.group.groupId, second.group.groupId].sort()
    );
  });

  it("returns 401 for malformed optional authorization when creating a group", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers: { authorization: "Bearer   " },
      payload: { displayName: "李雷", groupName: "前端干饭组" }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("missing_token");
    expect(prisma.identity.create).not.toHaveBeenCalled();
  });

  it("returns 401 for missing and tampered identity tokens", async () => {
    const app = await buildApp();

    const missing = await app.inject({ method: "GET", url: "/api/groups" });
    expect(missing.statusCode).toBe(401);
    expect(missing.json().error).toBe("missing_token");

    const tampered = await app.inject({
      method: "GET",
      url: "/api/groups",
      headers: { authorization: "Bearer bad.token" }
    });
    expect(tampered.statusCode).toBe(401);
    expect(tampered.json().error).toBe("invalid_token");
  });

  it("returns 401 for expired identity tokens", async () => {
    const app = await buildApp();
    const expiredIdentityToken = signIdentityToken(
      { identityId: "identity-expired", exp: Date.now() - 1_000 },
      "session-secret"
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/groups",
      headers: { authorization: `Bearer ${expiredIdentityToken}` }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("expired_token");
  });

  it("rejects a group session token when listing groups with an identity token", async () => {
    const app = await buildApp();
    const created = await createGroupFor(app, "组长", "午饭组");

    const response = await app.inject({
      method: "GET",
      url: "/api/groups",
      headers: { authorization: `Bearer ${created.groupSessionToken}` }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("invalid_token");
  });

  it("rejects a group session token when creating a group with an identity token", async () => {
    const app = await buildApp();
    const created = await createGroupFor(app, "组长", "午饭组");

    const response = await app.inject({
      method: "POST",
      url: "/api/groups",
      headers: { authorization: `Bearer ${created.groupSessionToken}` },
      payload: { groupName: "夜宵组" }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("invalid_token");
  });

  it("rejects a group session token when joining a group with an identity token", async () => {
    const app = await buildApp();
    const created = await createGroupFor(app, "组长", "午饭组");

    const response = await app.inject({
      method: "POST",
      url: "/api/groups/join",
      headers: { authorization: `Bearer ${created.groupSessionToken}` },
      payload: { inviteCode: created.inviteCode }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("invalid_token");
  });

  it("returns 401 for malformed optional authorization when joining a group", async () => {
    const app = await buildApp();
    const created = await createGroupFor(app, "组长", "午饭组");
    vi.mocked(prisma.identity.create).mockClear();

    const response = await app.inject({
      method: "POST",
      url: "/api/groups/join",
      headers: { authorization: "Token bad" },
      payload: { displayName: "小赵", inviteCode: created.inviteCode }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("missing_token");
    expect(prisma.identity.create).not.toHaveBeenCalled();
  });

  it("rejects a group session token when exchanging an identity token for a group session", async () => {
    const app = await buildApp();
    const created = await createGroupFor(app, "组长", "午饭组");

    const response = await app.inject({
      method: "POST",
      url: `/api/groups/${created.group.groupId}/session`,
      headers: { authorization: `Bearer ${created.groupSessionToken}` }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("invalid_token");
  });

  it("joins a group with invite code and exchanges identity token for group session", async () => {
    const app = await buildApp();
    const created = await createGroupFor(app, "组长", "午饭组");

    const joined = await joinGroupFor(app, "小赵", created.inviteCode);
    expect(joined.group.groupId).toBe(created.group.groupId);
    expect(joined.group.role).toBe("member");

    const sessionResponse = await app.inject({
      method: "POST",
      url: `/api/groups/${created.group.groupId}/session`,
      headers: { authorization: `Bearer ${joined.identityToken}` }
    });
    expect(sessionResponse.statusCode).toBe(200);
    expect(sessionResponse.json().groupSessionToken).toEqual(expect.any(String));
  });

  it("reuses an existing identity when joining another group", async () => {
    const app = await buildApp();

    const groupA = await createGroupFor(app, "小王", "A 组");
    const groupB = await createGroupFor(app, "小张", "B 组");

    const join = await app.inject({
      method: "POST",
      url: "/api/groups/join",
      headers: { authorization: `Bearer ${groupA.identityToken}` },
      payload: { inviteCode: groupB.inviteCode }
    });
    expect(join.statusCode).toBe(200);

    const list = await app.inject({
      method: "GET",
      url: "/api/groups",
      headers: { authorization: `Bearer ${join.json().identityToken}` }
    });
    expect(list.json().groups.map((group: { groupId: string }) => group.groupId).sort()).toEqual(
      [groupA.group.groupId, groupB.group.groupId].sort()
    );
  });

  it("joining an already-active group is idempotent and returns a fresh session", async () => {
    const app = await buildApp();
    const created = await createGroupFor(app, "组长", "午饭组");

    const joinAgain = await app.inject({
      method: "POST",
      url: "/api/groups/join",
      headers: { authorization: `Bearer ${created.identityToken}` },
      payload: { inviteCode: created.inviteCode }
    });
    expect(joinAgain.statusCode).toBe(200);
    expect(joinAgain.json().group.membershipId).toBe(created.group.membershipId);
    expect(joinAgain.json().groupSessionToken).toEqual(expect.any(String));
  });

  it("rejects removed members when joining an existing group", async () => {
    const app = await buildApp();
    const created = await createGroupFor(app, "组长", "午饭组");
    prisma.__setMembershipStatus(created.group.membershipId, "removed");

    const joinAgain = await app.inject({
      method: "POST",
      url: "/api/groups/join",
      headers: { authorization: `Bearer ${created.identityToken}` },
      payload: { inviteCode: created.inviteCode }
    });

    expect(joinAgain.statusCode).toBe(403);
    expect(joinAgain.json().error).toBe("removed_member");
  });

  it("rejects removing or downgrading the last active admin", async () => {
    const app = await buildApp();
    const created = await createGroupFor(app, "组长", "午饭组");

    const response = await app.inject({
      method: "PATCH",
      url: `/api/groups/${created.group.groupId}/members/${created.group.membershipId}`,
      headers: { authorization: `Bearer ${created.groupSessionToken}` },
      payload: { role: "member" }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("last_admin");
  });

  it("returns 403 when a non-admin patches members", async () => {
    const app = await buildApp();
    const created = await createGroupFor(app, "组长", "午饭组");
    const joined = await joinGroupFor(app, "成员", created.inviteCode);

    const response = await app.inject({
      method: "PATCH",
      url: `/api/groups/${created.group.groupId}/members/${created.group.membershipId}`,
      headers: { authorization: `Bearer ${joined.groupSessionToken}` },
      payload: { role: "member" }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("admin_membership_required");
  });

  it("does not allow a removed membership to rejoin with the same identity token", async () => {
    const app = await buildApp();
    const created = await createGroupFor(app, "组长", "午饭组");
    const joined = await joinGroupFor(app, "成员", created.inviteCode);

    const remove = await app.inject({
      method: "PATCH",
      url: `/api/groups/${created.group.groupId}/members/${joined.group.membershipId}`,
      headers: { authorization: `Bearer ${created.groupSessionToken}` },
      payload: { status: "removed" }
    });
    expect(remove.statusCode).toBe(200);

    const rejoin = await app.inject({
      method: "POST",
      url: "/api/groups/join",
      headers: { authorization: `Bearer ${joined.identityToken}` },
      payload: { inviteCode: created.inviteCode }
    });
    expect(rejoin.statusCode).toBe(403);
    expect(rejoin.json().error).toBe("removed_member");

    const session = await app.inject({
      method: "POST",
      url: `/api/groups/${created.group.groupId}/session`,
      headers: { authorization: `Bearer ${joined.identityToken}` }
    });
    expect(session.statusCode).toBe(403);
    expect(session.json().error).toBe("active_membership_required");
  });

  it("does not trust stale admin role in an old group session token", async () => {
    const app = await buildApp();
    const created = await createGroupFor(app, "组长", "午饭组");
    const oldAdminSession = created.groupSessionToken;
    const joined = await joinGroupFor(app, "成员", created.inviteCode);

    const promote = await app.inject({
      method: "PATCH",
      url: `/api/groups/${created.group.groupId}/members/${joined.group.membershipId}`,
      headers: { authorization: `Bearer ${created.groupSessionToken}` },
      payload: { role: "admin" }
    });
    expect(promote.statusCode).toBe(200);

    const refreshedMemberSession = await app.inject({
      method: "POST",
      url: `/api/groups/${created.group.groupId}/session`,
      headers: { authorization: `Bearer ${joined.identityToken}` }
    });
    expect(refreshedMemberSession.statusCode).toBe(200);

    const downgradeOriginalAdmin = await app.inject({
      method: "PATCH",
      url: `/api/groups/${created.group.groupId}/members/${created.group.membershipId}`,
      headers: { authorization: `Bearer ${refreshedMemberSession.json().groupSessionToken}` },
      payload: { role: "member" }
    });
    expect(downgradeOriginalAdmin.statusCode).toBe(200);

    const staleAdminAttempt = await app.inject({
      method: "PATCH",
      url: `/api/groups/${created.group.groupId}/members/${joined.group.membershipId}`,
      headers: { authorization: `Bearer ${oldAdminSession}` },
      payload: { role: "member" }
    });
    expect(staleAdminAttempt.statusCode).toBe(403);
    expect(staleAdminAttempt.json().error).toBe("admin_membership_required");
  });

  it("locks active admin rows inside the member update transaction before downgrading an admin", async () => {
    const app = await buildApp();
    const created = await createGroupFor(app, "组长", "午饭组");
    const joined = await joinGroupFor(app, "成员", created.inviteCode);

    const promote = await app.inject({
      method: "PATCH",
      url: `/api/groups/${created.group.groupId}/members/${joined.group.membershipId}`,
      headers: { authorization: `Bearer ${created.groupSessionToken}` },
      payload: { role: "admin" }
    });
    expect(promote.statusCode).toBe(200);

    vi.mocked(prisma.$transaction).mockClear();
    vi.mocked(prisma.$queryRaw).mockClear();
    vi.mocked(prisma.groupMembership.update).mockClear();

    const response = await app.inject({
      method: "PATCH",
      url: `/api/groups/${created.group.groupId}/members/${created.group.membershipId}`,
      headers: { authorization: `Bearer ${created.groupSessionToken}` },
      payload: { role: "member" }
    });

    expect(response.statusCode).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    const targetLockSql = String(prisma.$queryRaw.mock.calls[0]?.[0]);
    expect(targetLockSql).toContain('FROM "group_memberships"');
    expect(targetLockSql).toContain('WHERE "id" =');
    expect(targetLockSql).toContain("FOR UPDATE");

    const activeAdminLockSql = String(prisma.$queryRaw.mock.calls[1]?.[0]);
    expect(activeAdminLockSql).toContain('FROM "group_memberships"');
    expect(activeAdminLockSql).toContain('WHERE "group_id" =');
    expect(activeAdminLockSql).toContain(`AND "role" = 'admin'`);
    expect(activeAdminLockSql).toContain(`AND "status" = 'active'`);
    expect(activeAdminLockSql).toContain("FOR UPDATE");

    expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.$queryRaw.mock.invocationCallOrder[1]
    );
    expect(prisma.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      prisma.groupMembership.update.mock.invocationCallOrder[0]
    );
  });

  it("returns 401 for expired group session tokens on group-scoped routes", async () => {
    const app = await buildApp();
    const created = await createGroupFor(app, "组长", "午饭组");
    const expiredGroupSessionToken = signGroupSessionToken(
      {
        identityId: "identity-expired",
        groupId: created.group.groupId,
        membershipId: created.group.membershipId,
        role: "admin",
        exp: Date.now() - 1_000
      },
      "session-secret"
    );

    const response = await app.inject({
      method: "PATCH",
      url: `/api/groups/${created.group.groupId}/members/${created.group.membershipId}`,
      headers: { authorization: `Bearer ${expiredGroupSessionToken}` },
      payload: { role: "member" }
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("expired_token");
  });

  it("does not accept EXTENSION_READ_TOKEN on new group routes", async () => {
    const app = await buildApp();
    const created = await createGroupFor(app, "组长", "午饭组");

    const response = await app.inject({
      method: "PATCH",
      url: `/api/groups/${created.group.groupId}/members/${created.group.membershipId}`,
      headers: { "x-lunch-read-token": "read-token" },
      payload: { role: "member" }
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("missing_token");
  });
});
