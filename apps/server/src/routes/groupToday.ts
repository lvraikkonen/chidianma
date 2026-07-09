import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppEnv } from "../env.js";
import { prisma } from "../plugins/prisma.js";
import { AuthError } from "../services/auth/errors.js";
import { requireActiveMembership } from "../services/groups/memberships.js";
import {
  NoCurrentBatchError,
  getCurrentGroupTodayRecommendations,
  refreshGroupTodayRecommendations
} from "../services/recommendation/groupToday.js";

function membershipAuthInput(groupId: string, authorization: string | undefined) {
  return authorization ? { groupId, authorization } : { groupId };
}

function sendGroupTodayError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError) {
    const statusCode = error.code === "unauthorized" ? 401 : error.code === "forbidden" ? 403 : 400;
    reply.code(statusCode);
    return { error: error.error, message: error.message };
  }
  if (error instanceof NoCurrentBatchError) {
    reply.code(404);
    return {
      error: "no_current_batch",
      message: "No current recommendation batch exists for this group and office date"
    };
  }
  throw error;
}

export async function registerGroupTodayRoutes(app: FastifyInstance, env: AppEnv) {
  app.get<{ Params: { groupId: string } }>("/api/groups/:groupId/today-recommendations", async (request, reply) => {
    try {
      await requireActiveMembership({
        prisma,
        env,
        ...membershipAuthInput(request.params.groupId, request.headers.authorization)
      });
      return await getCurrentGroupTodayRecommendations({ prisma, env, groupId: request.params.groupId });
    } catch (error) {
      return sendGroupTodayError(reply, error);
    }
  });

  app.post<{ Params: { groupId: string } }>(
    "/api/groups/:groupId/today-recommendations/refresh",
    async (request, reply) => {
      try {
        const membership = await requireActiveMembership({
          prisma,
          env,
          ...membershipAuthInput(request.params.groupId, request.headers.authorization)
        });
        return refreshGroupTodayRecommendations({
          prisma,
          env,
          groupId: request.params.groupId,
          membership
        });
      } catch (error) {
        return sendGroupTodayError(reply, error);
      }
    }
  );
}
