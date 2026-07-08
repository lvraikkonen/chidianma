import type { FastifyInstance } from "fastify";
import type { AppEnv } from "../env.js";
import { prisma } from "../plugins/prisma.js";
import { requireReadToken } from "../services/auth/readToken.js";
import { getTodayRecommendations } from "../services/recommendation/today.js";

export async function registerRecommendationRoutes(app: FastifyInstance, env: AppEnv) {
  app.get<{ Querystring: { forceRefresh?: string } }>("/api/today-recommendations", async (request, reply) => {
    requireReadToken(request, reply, env);
    const forceRefresh = request.query && typeof request.query === "object" &&
      "forceRefresh" in request.query &&
      String(request.query.forceRefresh) === "true";

    return getTodayRecommendations({ prisma, env, forceRefresh });
  });
}
