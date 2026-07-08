import type { FastifyInstance } from "fastify";
import type { AppEnv } from "../env.js";
import { prisma } from "../plugins/prisma.js";
import { requireAdminSession } from "../services/auth/sessionToken.js";

export async function registerRestaurantRoutes(app: FastifyInstance, env: AppEnv) {
  app.get("/api/restaurants", async () => {
    return prisma.restaurant.findMany({ orderBy: { createdAt: "desc" } });
  });

  app.post<{
    Body: {
      name: string;
      area?: string;
      address?: string;
      distanceMinutes?: number | undefined;
      cuisine?: string;
      priceBand?: string;
      tags?: string[];
    };
  }>("/api/restaurants", async (request, reply) => {
    requireAdminSession(request, reply, env);
    return prisma.restaurant.create({
      data: {
        name: request.body.name,
        area: request.body.area ?? null,
        address: request.body.address ?? null,
        distanceMinutes: request.body.distanceMinutes ?? null,
        cuisine: request.body.cuisine ?? null,
        priceBand: request.body.priceBand ?? null,
        tags: request.body.tags ?? [],
        status: "active"
      }
    });
  });

  app.patch<{ Params: { id: string }; Body: { status: "active" | "paused" | "blocked" } }>(
    "/api/restaurants/:id",
    async (request, reply) => {
      requireAdminSession(request, reply, env);
      return prisma.restaurant.update({
        where: { id: request.params.id },
        data: { status: request.body.status }
      });
    }
  );
}
