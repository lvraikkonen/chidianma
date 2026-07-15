import type { FastifyInstance } from "fastify";
import { prisma } from "../plugins/prisma.js";

export interface HealthRouteDependencies {
  databaseProbe: () => Promise<void>;
  revision: string;
}

const defaultDependencies: HealthRouteDependencies = {
  databaseProbe: async () => {
    await prisma.$queryRawUnsafe("SELECT 1");
  },
  revision: "local"
};

export async function registerHealthRoutes(
  app: FastifyInstance,
  dependencies: HealthRouteDependencies = defaultDependencies
) {
  app.get("/api/health", async () => ({ ok: true }));

  app.get("/api/ready", async (_request, reply) => {
    try {
      await dependencies.databaseProbe();
      return {
        ok: true,
        database: "ready",
        revision: dependencies.revision
      };
    } catch (error) {
      app.log.error({ err: error }, "database readiness probe failed");
      return reply.code(503).send({ ok: false, error: "not_ready" });
    }
  });
}
