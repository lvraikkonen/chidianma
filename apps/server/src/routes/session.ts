import type { FastifyInstance } from "fastify";
import type { AppEnv } from "../env.js";
import { prisma } from "../plugins/prisma.js";
import { signSessionToken } from "../services/auth/sessionToken.js";
import { DEFAULT_GROUP_ID } from "../services/groups/defaultGroup.js";
import { hashInviteCode } from "../services/groups/inviteCodes.js";

const DEFAULT_IDENTITY_ID = "seed-identity-admin";
const DEFAULT_MEMBERSHIP_ID = "seed-membership-admin";
const DEFAULT_GROUP_NAME = "Dev团队";
const DEFAULT_GROUP_SUBTITLE = "干饭小分队";

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

    await prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.identity.upsert({
        where: { id: DEFAULT_IDENTITY_ID },
        update: { displayName: name, lastSeenAt: now },
        create: { id: DEFAULT_IDENTITY_ID, displayName: name, lastSeenAt: now }
      });
      await tx.lunchGroup.upsert({
        where: { id: DEFAULT_GROUP_ID },
        update: {
          name: DEFAULT_GROUP_NAME,
          subtitle: DEFAULT_GROUP_SUBTITLE,
          inviteCodeHash: hashInviteCode(env.TEAM_INVITE_CODE, env.SESSION_SECRET),
          createdByIdentityId: DEFAULT_IDENTITY_ID,
          officeTimezone: env.OFFICE_TIMEZONE,
          officeCity: env.OFFICE_CITY,
          officeLatitude: env.OFFICE_LATITUDE,
          officeLongitude: env.OFFICE_LONGITUDE
        },
        create: {
          id: DEFAULT_GROUP_ID,
          name: DEFAULT_GROUP_NAME,
          subtitle: DEFAULT_GROUP_SUBTITLE,
          inviteCodeHash: hashInviteCode(env.TEAM_INVITE_CODE, env.SESSION_SECRET),
          createdByIdentityId: DEFAULT_IDENTITY_ID,
          officeTimezone: env.OFFICE_TIMEZONE,
          officeCity: env.OFFICE_CITY,
          officeLatitude: env.OFFICE_LATITUDE,
          officeLongitude: env.OFFICE_LONGITUDE
        }
      });
      await tx.groupMembership.upsert({
        where: { id: DEFAULT_MEMBERSHIP_ID },
        update: { role: "admin", status: "active", removedAt: null },
        create: {
          id: DEFAULT_MEMBERSHIP_ID,
          groupId: DEFAULT_GROUP_ID,
          identityId: DEFAULT_IDENTITY_ID,
          role: "admin",
          status: "active"
        }
      });
      await tx.groupSettings.upsert({
        where: { groupId: DEFAULT_GROUP_ID },
        update: { notificationGroupLabel: DEFAULT_GROUP_NAME },
        create: { groupId: DEFAULT_GROUP_ID, notificationGroupLabel: DEFAULT_GROUP_NAME }
      });
      await tx.scoringWeights.upsert({
        where: { groupId: DEFAULT_GROUP_ID },
        update: {},
        create: { groupId: DEFAULT_GROUP_ID }
      });
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
