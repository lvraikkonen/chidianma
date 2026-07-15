import type { FastifyInstance } from "fastify";
import type { AppEnv } from "../env.js";
import { prisma } from "../plugins/prisma.js";
import { AuthError } from "../services/auth/errors.js";
import {
  DashboardGroupNotFoundError,
  getGroupDashboard
} from "../services/analytics/dashboard.js";
import { requireActiveMembership } from "../services/groups/memberships.js";

export async function registerGroupDashboardRoutes(app: FastifyInstance, env: AppEnv) {
  app.get<{ Params: { groupId: string } }>(
    "/api/groups/:groupId/dashboard",
    async (request, reply) => {
      try {
        await requireActiveMembership({
          prisma,
          env,
          groupId: request.params.groupId,
          ...(request.headers.authorization
            ? { authorization: request.headers.authorization }
            : {})
        });
        return await getGroupDashboard({ prisma, groupId: request.params.groupId });
      } catch (error) {
        if (error instanceof AuthError) {
          reply.code(error.code === "unauthorized" ? 401 : error.code === "forbidden" ? 403 : 400);
          return { error: error.error, message: error.message };
        }
        if (error instanceof DashboardGroupNotFoundError) {
          reply.code(404);
          return { error: "group_not_found", message: error.message };
        }
        throw error;
      }
    }
  );
}
