import type { FastifyInstance } from "fastify";
import type { AppEnv } from "../env.js";
import { prisma } from "../plugins/prisma.js";
import { AuthError } from "../services/auth/errors.js";
import {
  getGroupMembers,
  getGroupSettings,
  GroupOperationsNotFoundError,
  GroupSettingsValidationError,
  parseGroupSettingsPatch,
  patchGroupSettings,
  rotateGroupInviteCode
} from "../services/groups/operations.js";
import { requireActiveMembership } from "../services/groups/memberships.js";

export async function registerGroupOperationsRoutes(app: FastifyInstance, env: AppEnv) {
  app.get<{ Params: { groupId: string } }>(
    "/api/groups/:groupId/settings",
    async (request, reply) => {
      try {
        await requireMembership(request.params.groupId, request.headers.authorization, env);
        return await getGroupSettings({ prisma, groupId: request.params.groupId });
      } catch (error) {
        return sendOperationsError(reply, error);
      }
    }
  );

  app.patch<{ Params: { groupId: string }; Body: unknown }>(
    "/api/groups/:groupId/settings",
    async (request, reply) => {
      try {
        await requireMembership(request.params.groupId, request.headers.authorization, env, "admin");
        const patch = parseGroupSettingsPatch(request.body);
        return await patchGroupSettings({ prisma, groupId: request.params.groupId, patch });
      } catch (error) {
        return sendOperationsError(reply, error);
      }
    }
  );

  app.get<{ Params: { groupId: string } }>(
    "/api/groups/:groupId/members",
    async (request, reply) => {
      try {
        await requireMembership(request.params.groupId, request.headers.authorization, env);
        return await getGroupMembers({ prisma, groupId: request.params.groupId });
      } catch (error) {
        return sendOperationsError(reply, error);
      }
    }
  );

  app.post<{ Params: { groupId: string } }>(
    "/api/groups/:groupId/invite-code/rotate",
    async (request, reply) => {
      try {
        await requireMembership(request.params.groupId, request.headers.authorization, env, "admin");
        return await rotateGroupInviteCode({ prisma, env, groupId: request.params.groupId });
      } catch (error) {
        return sendOperationsError(reply, error);
      }
    }
  );
}

function requireMembership(
  groupId: string,
  authorization: string | undefined,
  env: AppEnv,
  requiredRole?: "admin"
) {
  return requireActiveMembership({
    prisma,
    env,
    groupId,
    ...(authorization ? { authorization } : {}),
    ...(requiredRole ? { requiredRole } : {})
  });
}

function sendOperationsError(reply: { code(statusCode: number): unknown }, error: unknown) {
  if (error instanceof AuthError) {
    reply.code(error.code === "unauthorized" ? 401 : error.code === "forbidden" ? 403 : 400);
    return { error: error.error, message: error.message };
  }
  if (error instanceof GroupSettingsValidationError) {
    reply.code(400);
    return { error: error.error, message: error.message };
  }
  if (error instanceof GroupOperationsNotFoundError) {
    reply.code(404);
    return { error: "group_not_found", message: error.message };
  }
  throw error;
}
