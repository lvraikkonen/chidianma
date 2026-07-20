import type { FastifyInstance } from "fastify";
import type { AppEnv } from "../env.js";
import { prisma } from "../plugins/prisma.js";
import { buildGroupCapabilities } from "../services/features/groupCapabilities.js";
import { requireActiveMembership } from "../services/groups/memberships.js";
import { authErrorResponse } from "./routeErrors.js";

export async function registerGroupCapabilitiesRoutes(
  app: FastifyInstance,
  env: AppEnv
) {
  app.get<{ Params: { groupId: string } }>(
    "/api/groups/:groupId/capabilities",
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
        return buildGroupCapabilities(env, request.params.groupId);
      } catch (error) {
        return authErrorResponse(reply, error);
      }
    }
  );
}
