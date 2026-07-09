import type { PrismaClient } from "@prisma/client";
import type { GroupRole } from "@lunch/shared";
import type { AppEnv } from "../../env.js";
import { AuthError } from "../auth/errors.js";
import { verifyGroupSessionToken } from "../auth/tokens.js";

export interface MembershipContext {
  identityId: string;
  groupId: string;
  membershipId: string;
  role: GroupRole;
}

export async function requireActiveMembership(input: {
  prisma: PrismaClient;
  env: AppEnv;
  groupId: string;
  authorization?: string;
  requiredRole?: GroupRole;
}): Promise<MembershipContext> {
  const token = input.authorization?.startsWith("Bearer ") ? input.authorization.slice("Bearer ".length) : "";
  if (!token) {
    throw new AuthError("unauthorized", "missing_token", "Authorization bearer token is required");
  }

  const claims = verifyGroupSessionToken(token, input.env.SESSION_SECRET);
  if (claims.groupId !== input.groupId) {
    throw new AuthError("forbidden", "group_session_mismatch", "Group session does not match route group");
  }

  const membership = await input.prisma.groupMembership.findUnique({
    where: { id: claims.membershipId }
  });
  if (!membership || membership.groupId !== input.groupId || membership.status !== "active") {
    throw new AuthError("forbidden", "active_membership_required", "Active membership is required");
  }
  if (input.requiredRole === "admin" && membership.role !== "admin") {
    throw new AuthError("forbidden", "admin_membership_required", "Admin membership is required");
  }

  return {
    identityId: membership.identityId,
    groupId: membership.groupId,
    membershipId: membership.id,
    role: membership.role
  };
}

export async function assertNotLastActiveAdmin(input: {
  prisma: PrismaClient;
  groupId: string;
  membershipId: string;
}): Promise<void> {
  const membership = await input.prisma.groupMembership.findUnique({ where: { id: input.membershipId } });
  if (!membership) {
    return;
  }
  if (membership.groupId !== input.groupId) {
    throw new AuthError("bad_request", "membership_group_mismatch", "Membership does not belong to route group");
  }
  if (membership.role !== "admin" || membership.status !== "active") {
    return;
  }

  const activeAdminCount = await input.prisma.groupMembership.count({
    where: { groupId: input.groupId, role: "admin", status: "active" }
  });
  if (activeAdminCount <= 1) {
    throw new AuthError("bad_request", "last_admin", "Cannot remove or downgrade the last active admin");
  }
}
