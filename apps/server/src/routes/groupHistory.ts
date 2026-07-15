import type { FastifyInstance } from "fastify";
import type { AppEnv } from "../env.js";
import { prisma } from "../plugins/prisma.js";
import { AuthError } from "../services/auth/errors.js";
import {
  getGroupRecommendationHistory,
  getPersonalLunchHistory,
  HistoryGroupNotFoundError,
  HistoryValidationError,
  parseHistoryLimit
} from "../services/analytics/history.js";
import { requireActiveMembership } from "../services/groups/memberships.js";

export async function registerGroupHistoryRoutes(app: FastifyInstance, env: AppEnv) {
  app.get<{
    Params: { groupId: string };
    Querystring: { cursor?: string; limit?: string };
  }>("/api/groups/:groupId/history", async (request, reply) => {
    try {
      await requireActiveMembership({
        prisma,
        env,
        groupId: request.params.groupId,
        ...(request.headers.authorization ? { authorization: request.headers.authorization } : {})
      });
      return await getGroupRecommendationHistory({
        prisma,
        groupId: request.params.groupId,
        limit: parseHistoryLimit(request.query.limit),
        ...(request.query.cursor ? { cursor: request.query.cursor } : {})
      });
    } catch (error) {
      return sendHistoryError(reply, error);
    }
  });

  app.get<{ Params: { groupId: string } }>(
    "/api/groups/:groupId/history/me",
    async (request, reply) => {
      try {
        const membership = await requireActiveMembership({
          prisma,
          env,
          groupId: request.params.groupId,
          ...(request.headers.authorization ? { authorization: request.headers.authorization } : {})
        });
        return await getPersonalLunchHistory({
          prisma,
          groupId: request.params.groupId,
          membershipId: membership.membershipId
        });
      } catch (error) {
        return sendHistoryError(reply, error);
      }
    }
  );
}

function sendHistoryError(reply: { code(statusCode: number): unknown }, error: unknown) {
  if (error instanceof AuthError) {
    reply.code(error.code === "unauthorized" ? 401 : error.code === "forbidden" ? 403 : 400);
    return { error: error.error, message: error.message };
  }
  if (error instanceof HistoryValidationError) {
    reply.code(400);
    return { error: error.error, message: error.message };
  }
  if (error instanceof HistoryGroupNotFoundError) {
    reply.code(404);
    return { error: "group_not_found", message: error.message };
  }
  throw error;
}
