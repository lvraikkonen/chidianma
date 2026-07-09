import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { AppEnv } from "../env.js";
import { prisma } from "../plugins/prisma.js";
import { requireAdminSession } from "../services/auth/sessionToken.js";
import { DEFAULT_GROUP_ID } from "../services/groups/defaultGroup.js";

export async function registerRestaurantRoutes(app: FastifyInstance, env: AppEnv) {
  app.get("/api/restaurants", async () => {
    return prisma.restaurant.findMany({
      where: { groupId: DEFAULT_GROUP_ID },
      orderBy: { createdAt: "desc" }
    });
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
        groupId: DEFAULT_GROUP_ID,
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
      try {
        return await prisma.restaurant.update({
          where: { id: request.params.id, groupId: DEFAULT_GROUP_ID },
          data: { status: request.body.status }
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          return reply.code(404).send({ error: "Restaurant not found" });
        }
        throw error;
      }
    }
  );
}
