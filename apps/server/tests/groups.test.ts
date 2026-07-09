import type { GroupRole, MembershipStatus } from "@lunch/shared";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../src/env";
import { AuthError } from "../src/services/auth/errors";
import { signGroupSessionToken } from "../src/services/auth/tokens";
import { generateInviteCode, hashInviteCode, verifyInviteCode } from "../src/services/groups/inviteCodes";
import { assertNotLastActiveAdmin, requireActiveMembership } from "../src/services/groups/memberships";

interface MembershipRecord {
  id: string;
  groupId: string;
  identityId: string;
  role: GroupRole;
  status: MembershipStatus;
}

const env = { SESSION_SECRET: "session-secret" } as AppEnv;

function signMembershipToken(input: {
  identityId?: string;
  groupId?: string;
  membershipId?: string;
  role?: GroupRole;
}): string {
  return signGroupSessionToken(
    {
      identityId: input.identityId ?? "identity-1",
      groupId: input.groupId ?? "group-1",
      membershipId: input.membershipId ?? "membership-1",
      role: input.role ?? "member",
      exp: Date.now() + 60_000
    },
    env.SESSION_SECRET
  );
}

function prismaWithMemberships(memberships: MembershipRecord[]) {
  return {
    groupMembership: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return memberships.find((membership) => membership.id === where.id) ?? null;
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
});
