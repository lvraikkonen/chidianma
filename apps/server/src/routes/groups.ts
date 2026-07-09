import type { CreateGroupRequest, CreateGroupResponse, GroupSessionResponse } from "@lunch/shared";
import type { FastifyInstance } from "fastify";
import type { AppEnv } from "../env.js";
import { prisma } from "../plugins/prisma.js";
import { AuthError } from "../services/auth/errors.js";
import { addDays, signGroupSessionToken, signIdentityToken, verifyIdentityToken } from "../services/auth/tokens.js";
import { generateInviteCode, hashInviteCode, verifyInviteCode } from "../services/groups/inviteCodes.js";
import { assertNotLastActiveAdmin, requireActiveMembership } from "../services/groups/memberships.js";

function bearerToken(authorization?: string): string | undefined {
  if (!authorization) return undefined;
  if (!authorization.startsWith("Bearer ")) {
    throw new AuthError("unauthorized", "invalid_token", "Authorization bearer token is invalid");
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    throw new AuthError("unauthorized", "invalid_token", "Authorization bearer token is invalid");
  }
  return token;
}

function authErrorResponse(reply: { code(statusCode: number): unknown }, error: unknown) {
  if (error instanceof AuthError) {
    const statusCode = error.code === "unauthorized" ? 401 : error.code === "forbidden" ? 403 : 400;
    reply.code(statusCode);
    return { error: error.error, message: error.message };
  }
  throw error;
}

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

async function resolveIdentityForRequest(input: {
  authorization?: string | undefined;
  displayName?: string | undefined;
  env: AppEnv;
}) {
  const token = bearerToken(input.authorization);
  if (token) {
    const claims = verifyIdentityToken(token, input.env.SESSION_SECRET);
    const identity = await prisma.identity.findUnique({ where: { id: claims.identityId } });
    if (!identity) {
      throw new AuthError("unauthorized", "invalid_token", "Identity token is no longer valid");
    }
    return prisma.identity.update({ where: { id: identity.id }, data: { lastSeenAt: new Date() } });
  }

  const displayName = input.displayName?.trim();
  if (!displayName) {
    throw new AuthError("bad_request", "display_name_required", "Display name is required");
  }
  return prisma.identity.create({ data: { displayName, lastSeenAt: new Date() } });
}

function signTokens(input: {
  identityId: string;
  groupId: string;
  membershipId: string;
  role: "admin" | "member";
  env: AppEnv;
}): { identityToken: string; groupSessionToken: string } {
  const now = new Date();
  return {
    identityToken: signIdentityToken(
      { identityId: input.identityId, exp: addDays(now, input.env.IDENTITY_TOKEN_TTL_DAYS) },
      input.env.SESSION_SECRET
    ),
    groupSessionToken: signGroupSessionToken(
      {
        identityId: input.identityId,
        groupId: input.groupId,
        membershipId: input.membershipId,
        role: input.role,
        exp: addDays(now, input.env.GROUP_SESSION_TTL_DAYS)
      },
      input.env.SESSION_SECRET
    )
  };
}

export async function registerGroupRoutes(app: FastifyInstance, env: AppEnv) {
  app.post<{ Body: { displayName: string } }>("/api/identities", async (request, reply) => {
    const displayName = stringField(request.body, "displayName");
    if (!displayName) {
      reply.code(400);
      return { error: "display_name_required", message: "Display name is required" };
    }
    const identity = await prisma.identity.create({ data: { displayName, lastSeenAt: new Date() } });
    return {
      identityId: identity.id,
      identityToken: signIdentityToken(
        { identityId: identity.id, exp: addDays(new Date(), env.IDENTITY_TOKEN_TTL_DAYS) },
        env.SESSION_SECRET
      )
    };
  });

  app.post<{ Body: CreateGroupRequest }>("/api/groups", async (request, reply) => {
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

      const identity = await resolveIdentityForRequest({
        authorization: request.headers.authorization,
        displayName: stringField(request.body, "displayName"),
        env
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
      const token = bearerToken(request.headers.authorization);
      if (!token) throw new AuthError("unauthorized", "missing_token", "Authorization bearer token is required");
      const claims = verifyIdentityToken(token, env.SESSION_SECRET);
      const memberships = await prisma.groupMembership.findMany({
        where: { identityId: claims.identityId, status: "active" },
        include: { group: true },
        orderBy: { joinedAt: "asc" }
      });
      return { groups: memberships.map(groupSummary) };
    } catch (error) {
      return authErrorResponse(reply, error);
    }
  });

  app.post<{ Body: { displayName?: string; inviteCode: string } }>("/api/groups/join", async (request, reply) => {
    try {
      const groups = await prisma.lunchGroup.findMany();
      const inviteCode = stringField(request.body, "inviteCode");
      if (!inviteCode) {
        reply.code(400);
        return { error: "invalid_group_join_request", message: "Invite code is required" };
      }
      const group = groups.find((candidate) =>
        verifyInviteCode(inviteCode, candidate.inviteCodeHash, env.SESSION_SECRET)
      );
      if (!group) {
        reply.code(401);
        return { error: "invalid_invite_code", message: "Invite code is invalid" };
      }

      const identity = await resolveIdentityForRequest({
        authorization: request.headers.authorization,
        displayName: stringField(request.body, "displayName"),
        env
      });

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

  app.post<{ Params: { groupId: string } }>("/api/groups/:groupId/session", async (request, reply) => {
    try {
      const token = bearerToken(request.headers.authorization);
      if (!token) throw new AuthError("unauthorized", "missing_token", "Authorization bearer token is required");
      const claims = verifyIdentityToken(token, env.SESSION_SECRET);
      const membership = await prisma.groupMembership.findUnique({
        where: { groupId_identityId: { groupId: request.params.groupId, identityId: claims.identityId } },
        include: { group: true }
      });
      if (!membership || membership.status !== "active") {
        throw new AuthError("forbidden", "active_membership_required", "Active membership is required");
      }
      const tokens = signTokens({
        identityId: membership.identityId,
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
    Body: { role?: "admin" | "member"; status?: "active" | "removed" };
  }>("/api/groups/:groupId/members/:membershipId", async (request, reply) => {
    try {
      const body = request.body ?? {};
      if (body.role && body.role !== "admin" && body.role !== "member") {
        reply.code(400);
        return { error: "invalid_member_role", message: "Role must be admin or member" };
      }
      if (body.status && body.status !== "active" && body.status !== "removed") {
        reply.code(400);
        return { error: "invalid_membership_status", message: "Status must be active or removed" };
      }

      await requireActiveMembership({
        prisma,
        env,
        groupId: request.params.groupId,
        ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
        requiredRole: "admin"
      });

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
      return updated;
    } catch (error) {
      return authErrorResponse(reply, error);
    }
  });
}
