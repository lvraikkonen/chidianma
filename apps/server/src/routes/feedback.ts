import type { FeedbackType } from "@lunch/shared";
import type { FastifyInstance } from "fastify";
import type { AppEnv } from "../env.js";
import { prisma } from "../plugins/prisma.js";
import { hasReadToken } from "../services/auth/readToken.js";
import { verifySessionToken } from "../services/auth/sessionToken.js";
import { DEFAULT_GROUP_ID } from "../services/groups/defaultGroup.js";

export async function registerFeedbackRoutes(app: FastifyInstance, env: AppEnv) {
  app.post<{
    Body: {
      date: string;
      restaurantId: string;
      recommendationId?: string | undefined;
      type: FeedbackType;
    };
  }>("/api/feedback", async (request, reply) => {
    if (!hasReadToken(request, env) && !hasAdminToken(request.headers.authorization, env)) {
      reply.code(401);
      throw new Error("Read token or admin session required");
    }

    return prisma.feedback.create({
      data: {
        groupId: DEFAULT_GROUP_ID,
        officeDate: request.body.date,
        restaurantId: request.body.restaurantId,
        recommendationId: request.body.recommendationId ?? null,
        type: request.body.type
      }
    });
  });
}

function hasAdminToken(authorization: string | undefined, env: AppEnv): boolean {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  if (!token) return false;
  try {
    verifySessionToken(token, env.SESSION_SECRET);
    return true;
  } catch {
    return false;
  }
}
