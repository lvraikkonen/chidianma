import type { FastifyInstance } from "fastify";
import type { AppEnv } from "../env.js";
import { prisma } from "../plugins/prisma.js";
import { requireAdminSession } from "../services/auth/sessionToken.js";

export async function registerRecommendationAdminRoutes(app: FastifyInstance, env: AppEnv) {
  app.post<{
    Body: {
      restaurantId: string;
      dish?: string | undefined;
      reason: string;
      weatherTags?: string[];
      weekdayTags?: string[];
      moodTags?: string[];
    };
  }>("/api/recommendations", async (request, reply) => {
    const session = requireAdminSession(request, reply, env);
    return prisma.recommendation.create({
      data: {
        restaurantId: request.body.restaurantId,
        teammateId: session.teammateId,
        dish: request.body.dish ?? null,
        reason: request.body.reason,
        weatherTags: request.body.weatherTags ?? [],
        weekdayTags: request.body.weekdayTags ?? [],
        moodTags: request.body.moodTags ?? []
      }
    });
  });
}
