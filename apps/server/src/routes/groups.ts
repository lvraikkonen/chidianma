import type {
  CreateGroupRequest,
  CreateGroupResponse,
  GroupSessionResponse,
  MemberMutationResponse,
  PatchMemberRequest
} from "@lunch/shared";
import type { FastifyInstance } from "fastify";
import type { AppEnv } from "../env.js";
import { prisma } from "../plugins/prisma.js";
import { AuthError } from "../services/auth/errors.js";
import { requireActiveIdentity } from "../services/auth/identity.js";
import { addDays, expiryIso, signGroupSessionToken, signIdentityToken } from "../services/auth/tokens.js";
import { generateInviteCode, hashInviteCode } from "../services/groups/inviteCodes.js";
import { assertNotLastActiveAdmin, requireActiveMembership } from "../services/groups/memberships.js";
import { getGroupMembers } from "../services/groups/operations.js";
import { authErrorResponse } from "./routeErrors.js";

function stringField(body: unknown, field: string): string {
  if (!body || typeof body !== "object") return "";
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string" ? value.trim() : "";
}

function groupSummary(membership: {
  id: string;
  role: "admin" | "member";
  group: { id: string; name: string; subtitle: string | null };
}) {
  return {
    groupId: membership.group.id,
    name: membership.group.name,
    ...(membership.group.subtitle ? { subtitle: membership.group.subtitle } : {}),
    role: membership.role,
    membershipId: membership.id
  };
}

function signTokens(input: {
  identityId: string;
  authVersion: number;
  groupId: string;
  membershipId: string;
  role: "admin" | "member";
  env: AppEnv;
}): {
  identityToken: string;
  identityTokenExpiresAt: string;
  groupSessionToken: string;
  groupSessionTokenExpiresAt: string;
} {
  const now = new Date();
  const identityExp = addDays(now, input.env.IDENTITY_TOKEN_TTL_DAYS);
  const groupExp = addDays(now, input.env.GROUP_SESSION_TTL_DAYS);
  return {
    identityToken: signIdentityToken(
      { identityId: input.identityId, authVersion: input.authVersion, exp: identityExp },
      input.env.SESSION_SECRET
    ),
    identityTokenExpiresAt: expiryIso(identityExp),
    groupSessionToken: signGroupSessionToken(
      {
        identityId: input.identityId,
        authVersion: input.authVersion,
        groupId: input.groupId,
        membershipId: input.membershipId,
        role: input.role,
        exp: groupExp
      },
      input.env.SESSION_SECRET
    ),
    groupSessionTokenExpiresAt: expiryIso(groupExp)
  };
}

export async function registerGroupRoutes(app: FastifyInstance, env: AppEnv) {
  app.post<{ Body: CreateGroupRequest }>("/api/groups", {
    config: { rateLimit: { max: 3, timeWindow: 60 * 60 * 1000 } }
  }, async (request, reply) => {
    try {
      if (!env.ALLOW_PUBLIC_GROUP_CREATION) {
        reply.code(403);
        return { error: "group_creation_disabled", message: "Group creation is disabled" };
      }
      const groupName = stringField(request.body, "groupName");
      if (!groupName) {
        reply.code(400);
        return { error: "invalid_group_create_request", message: "Group name is required" };
      }

      const { identity } = await requireActiveIdentity({
        prisma,
        env,
        ...(request.headers.authorization ? { authorization: request.headers.authorization } : {})
      });

      const inviteCode = generateInviteCode();
      const result = await prisma.$transaction(async (tx) => {
        const group = await tx.lunchGroup.create({
          data: {
            name: groupName,
            subtitle: stringField(request.body, "subtitle") || null,
            inviteCodeHash: hashInviteCode(inviteCode, env.SESSION_SECRET),
            createdByIdentityId: identity.id,
            officeTimezone: env.OFFICE_TIMEZONE,
            officeCity: env.OFFICE_CITY,
            officeLatitude: env.OFFICE_LATITUDE,
            officeLongitude: env.OFFICE_LONGITUDE
          }
        });
        const membership = await tx.groupMembership.create({
          data: { groupId: group.id, identityId: identity.id, role: "admin", status: "active" },
          include: { group: true }
        });
        await tx.groupSettings.create({ data: { groupId: group.id, notificationGroupLabel: group.name } });
        await tx.scoringWeights.create({ data: { groupId: group.id } });
        return { group, membership };
      });

      const tokens = signTokens({
        identityId: identity.id,
        authVersion: identity.authVersion,
        groupId: result.group.id,
        membershipId: result.membership.id,
        role: result.membership.role,
        env
      });
      return { ...tokens, group: groupSummary(result.membership), inviteCode } satisfies CreateGroupResponse;
    } catch (error) {
      return authErrorResponse(reply, error);
    }
  });

  app.get("/api/groups", async (request, reply) => {
    try {
      const { identity } = await requireActiveIdentity({
        prisma,
        env,
        ...(request.headers.authorization ? { authorization: request.headers.authorization } : {})
      });
      const memberships = await prisma.groupMembership.findMany({
        where: { identityId: identity.id, status: "active" },
        include: { group: true },
        orderBy: { joinedAt: "asc" }
      });
      return { groups: memberships.map(groupSummary) };
    } catch (error) {
      return authErrorResponse(reply, error);
    }
  });

  app.post<{ Body: { inviteCode: string } }>("/api/groups/join", {
    config: { rateLimit: { max: 10, timeWindow: 10 * 60 * 1000 } }
  }, async (request, reply) => {
    try {
      const inviteCode = stringField(request.body, "inviteCode");
      if (!inviteCode) {
        reply.code(400);
        return { error: "invalid_group_join_request", message: "Invite code is required" };
      }
      const { identity } = await requireActiveIdentity({
        prisma,
        env,
        ...(request.headers.authorization ? { authorization: request.headers.authorization } : {})
      });
      const group = await prisma.lunchGroup.findFirst({
        where: { inviteCodeHash: hashInviteCode(inviteCode, env.SESSION_SECRET) }
      });
      if (!group) {
        reply.code(401);
        return { error: "invalid_invite_code", message: "Invite code is invalid" };
      }

      const membership = await prisma.$transaction(async (tx) => {
        const existing = await tx.groupMembership.findUnique({
          where: { groupId_identityId: { groupId: group.id, identityId: identity.id } },
          include: { group: true }
        });

        if (existing?.status === "removed") {
          throw new AuthError("forbidden", "removed_member", "Removed member must be restored by an admin");
        }
        if (existing?.status === "active") {
          return existing;
        }

        return tx.groupMembership.create({
          data: { groupId: group.id, identityId: identity.id, role: "member", status: "active" },
          include: { group: true }
        });
      });

      const tokens = signTokens({
        identityId: identity.id,
        authVersion: identity.authVersion,
        groupId: membership.groupId,
        membershipId: membership.id,
        role: membership.role,
        env
      });
      return { ...tokens, group: groupSummary(membership) } satisfies GroupSessionResponse;
    } catch (error) {
      return authErrorResponse(reply, error);
    }
  });

  app.post<{ Params: { groupId: string } }>("/api/groups/:groupId/session", {
    config: { rateLimit: { max: 30, timeWindow: 60 * 1000 } }
  }, async (request, reply) => {
    try {
      const { identity } = await requireActiveIdentity({
        prisma,
        env,
        ...(request.headers.authorization ? { authorization: request.headers.authorization } : {})
      });
      const membership = await prisma.groupMembership.findUnique({
        where: { groupId_identityId: { groupId: request.params.groupId, identityId: identity.id } },
        include: { group: true }
      });
      if (!membership || membership.status !== "active") {
        throw new AuthError("forbidden", "active_membership_required", "Active membership is required");
      }
      const tokens = signTokens({
        identityId: membership.identityId,
        authVersion: identity.authVersion,
        groupId: membership.groupId,
        membershipId: membership.id,
        role: membership.role,
        env
      });
      return { ...tokens, group: groupSummary(membership) } satisfies GroupSessionResponse;
    } catch (error) {
      return authErrorResponse(reply, error);
    }
  });

  app.patch<{
    Params: { groupId: string; membershipId: string };
    Body: PatchMemberRequest;
  }>("/api/groups/:groupId/members/:membershipId", async (request, reply) => {
    try {
      await requireActiveMembership({
        prisma,
        env,
        groupId: request.params.groupId,
        ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
        requiredRole: "admin"
      });

      if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) {
        reply.code(400);
        return { error: "invalid_member_update", message: "Member update must be an object" };
      }
      const body = request.body;
      const fields = Object.keys(body);
      if (fields.length === 0 || fields.some((field) => field !== "role" && field !== "status")) {
        reply.code(400);
        return { error: "invalid_member_update", message: "Member update must include only role or status" };
      }
      if (body.role && body.role !== "admin" && body.role !== "member") {
        reply.code(400);
        return { error: "invalid_member_role", message: "Role must be admin or member" };
      }
      if (body.status && body.status !== "active" && body.status !== "removed") {
        reply.code(400);
        return { error: "invalid_membership_status", message: "Status must be active or removed" };
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "group_memberships"
          WHERE "id" = ${request.params.membershipId}
          FOR UPDATE
        `;
        const target = await tx.groupMembership.findUnique({ where: { id: request.params.membershipId } });
        if (!target || target.groupId !== request.params.groupId) {
          return null;
        }

        if ((body.role === "member" || body.status === "removed") && target.role === "admin") {
          await tx.$queryRaw`
            SELECT "id"
            FROM "group_memberships"
            WHERE "group_id" = ${request.params.groupId}
              AND "role" = 'admin'
              AND "status" = 'active'
            FOR UPDATE
          `;
          await assertNotLastActiveAdmin({ prisma: tx, groupId: request.params.groupId, membershipId: target.id });
        }

        return tx.groupMembership.update({
          where: { id: target.id },
          data: {
            ...(body.role ? { role: body.role } : {}),
            ...(body.status
              ? { status: body.status, removedAt: body.status === "removed" ? new Date() : null }
              : {})
          }
        });
      });

      if (!updated) {
        reply.code(404);
        return { error: "member_not_found", message: "Member not found" };
      }
      const members = await getGroupMembers({ prisma, groupId: request.params.groupId });
      const member = members.members.find((candidate) => candidate.membershipId === updated.id);
      if (!member) {
        reply.code(404);
        return { error: "member_not_found", message: "Member not found" };
      }
      return { groupId: request.params.groupId, member } satisfies MemberMutationResponse;
    } catch (error) {
      return authErrorResponse(reply, error);
    }
  });
}
