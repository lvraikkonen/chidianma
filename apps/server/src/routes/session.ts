import type { FastifyInstance } from "fastify";
import type { AppEnv } from "../env.js";
import { prisma } from "../plugins/prisma.js";
import { signSessionToken } from "../services/auth/sessionToken.js";

export async function registerSessionRoutes(app: FastifyInstance, env: AppEnv) {
  app.post<{ Body: { inviteCode: string; name: string } }>("/api/session", async (request, reply) => {
    // Keep this route as legacy compatibility until admin is rewired to group sessions.
    if (request.body.inviteCode !== env.TEAM_INVITE_CODE) {
      reply.code(401);
      return { error: "Invalid invite code" };
    }

    const name = request.body.name.trim();
    if (!name) {
      reply.code(400);
      return { error: "Name is required" };
    }

    const teammate = await prisma.teammate.upsert({
      where: { name },
      update: { lastSeenAt: new Date() },
      create: { name, lastSeenAt: new Date() }
    });

    return {
      token: signSessionToken(
        {
          teammateId: teammate.id,
          name: teammate.name,
          exp: Date.now() + 1000 * 60 * 60 * 12
        },
        env.SESSION_SECRET
      ),
      teammate
    };
  });
}
