import { writeFile } from "node:fs/promises";
import { Prisma, type PrismaClient } from "@prisma/client";

const ANONYMIZED_DISPLAY_NAME = "匿名身份";

export async function collectIdentityExport(prisma: PrismaClient, identityId: string) {
  const identity = await prisma.identity.findUnique({
    where: { id: identityId },
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      lastSeenAt: true,
      anonymizedAt: true,
      memberships: {
        orderBy: { joinedAt: "asc" },
        select: {
          id: true,
          role: true,
          status: true,
          joinedAt: true,
          removedAt: true,
          group: { select: { id: true, name: true, subtitle: true } }
        }
      },
      createdGroups: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          subtitle: true,
          officeTimezone: true,
          officeCity: true,
          createdAt: true,
          updatedAt: true
        }
      }
    }
  });
  if (!identity) throw new Error("identity_not_found");

  const membershipIds = identity.memberships.map((membership) => membership.id);
  const membershipWhere = { in: membershipIds };
  const [createdRestaurants, createdRecommendations, participation, feedback, generatedBatches] =
    await Promise.all([
      prisma.restaurant.findMany({
        where: { createdByMembershipId: membershipWhere },
        orderBy: { createdAt: "asc" },
        select: {
          id: true, groupId: true, name: true, area: true, address: true,
          distanceMinutes: true, cuisine: true, priceBand: true,
          averagePriceCents: true, supportsDineIn: true, supportsTakeout: true,
          tags: true, status: true, createdByMembershipId: true,
          createdAt: true, updatedAt: true
        }
      }),
      prisma.recommendation.findMany({
        where: { createdByMembershipId: membershipWhere },
        orderBy: { createdAt: "asc" },
        select: {
          id: true, groupId: true, restaurantId: true, createdByMembershipId: true,
          dish: true, reason: true, weatherTags: true, weekdayTags: true,
          moodTags: true, createdAt: true, updatedAt: true
        }
      }),
      prisma.dailyParticipation.findMany({
        where: { membershipId: membershipWhere },
        orderBy: [{ officeDate: "asc" }, { updatedAt: "asc" }],
        select: {
          id: true, groupId: true, officeDate: true, membershipId: true,
          status: true, restaurantId: true, recommendationId: true,
          decidedAt: true, updatedAt: true
        }
      }),
      prisma.feedback.findMany({
        where: { membershipId: membershipWhere },
        orderBy: { createdAt: "asc" },
        select: {
          id: true, groupId: true, officeDate: true, restaurantId: true,
          recommendationId: true, membershipId: true, type: true, createdAt: true
        }
      }),
      prisma.dailyRecommendationBatch.findMany({
        where: { generatedByMembershipId: membershipWhere },
        orderBy: [{ officeDate: "asc" }, { batchNo: "asc" }],
        select: {
          id: true, groupId: true, officeDate: true, batchNo: true, source: true,
          generatedByMembershipId: true, weatherSnapshotId: true,
          scoringWeightsSnapshot: true, algorithmVersion: true,
          isCurrent: true, createdAt: true
        }
      })
    ]);

  return {
    exportedAt: new Date().toISOString(),
    identity,
    createdRestaurants,
    createdRecommendations,
    participation,
    feedback,
    generatedBatches
  };
}

export async function exportIdentityToFile(
  prisma: PrismaClient,
  identityId: string,
  outputPath: string
): Promise<void> {
  const data = await collectIdentityExport(prisma, identityId);
  await writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600
  });
}

export async function inspectAnonymizeIdentity(prisma: PrismaClient, identityId: string) {
  const identity = await prisma.identity.findUnique({
    where: { id: identityId },
    select: {
      id: true,
      anonymizedAt: true,
      memberships: {
        where: { status: "active" },
        select: { id: true, groupId: true, role: true }
      }
    }
  });
  if (!identity) throw new Error("identity_not_found");
  const adminGroups = identity.memberships
    .filter((membership) => membership.role === "admin")
    .map((membership) => membership.groupId);
  const counts = await Promise.all(adminGroups.map(async (groupId) => ({
    groupId,
    activeAdminCount: await prisma.groupMembership.count({
      where: { groupId, role: "admin", status: "active" }
    })
  })));
  return {
    identityId,
    alreadyAnonymized: identity.anonymizedAt !== null,
    activeMembershipCount: identity.memberships.length,
    blockingLastAdminGroupIds: counts
      .filter((entry) => entry.activeAdminCount <= 1)
      .map((entry) => entry.groupId)
  };
}

export async function anonymizeIdentity(prisma: PrismaClient, identityId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT "id" FROM "group_memberships"
      WHERE "identity_id" = ${identityId} AND "status" = 'active'
      FOR UPDATE
    `);
    const identity = await tx.identity.findUnique({
      where: { id: identityId },
      select: {
        id: true,
        anonymizedAt: true,
        memberships: {
          where: { status: "active" },
          select: { id: true, groupId: true, role: true }
        }
      }
    });
    if (!identity) throw new Error("identity_not_found");
    if (identity.anonymizedAt) throw new Error("identity_already_anonymized");

    const adminGroups = identity.memberships
      .filter((membership) => membership.role === "admin")
      .map((membership) => membership.groupId);
    for (const groupId of adminGroups) {
      await tx.$queryRaw(Prisma.sql`
        SELECT "id" FROM "group_memberships"
        WHERE "group_id" = ${groupId} AND "role" = 'admin' AND "status" = 'active'
        FOR UPDATE
      `);
      const count = await tx.groupMembership.count({
        where: { groupId, role: "admin", status: "active" }
      });
      if (count <= 1) throw new Error(`last_admin:${groupId}`);
    }

    const now = new Date();
    await tx.groupMembership.updateMany({
      where: { identityId, status: "active" },
      data: { status: "removed", removedAt: now }
    });
    await tx.identityLinkCode.deleteMany({ where: { identityId } });
    const updated = await tx.identity.update({
      where: { id: identityId },
      data: {
        displayName: ANONYMIZED_DISPLAY_NAME,
        anonymizedAt: now,
        lastSeenAt: null,
        authVersion: { increment: 1 }
      },
      select: { id: true, anonymizedAt: true, authVersion: true }
    });
    return { ...updated, removedMembershipCount: identity.memberships.length };
  }, { isolationLevel: "Serializable" });
}

export async function inspectRecoverAdmin(
  prisma: PrismaClient,
  groupId: string,
  oldIdentityId: string,
  replacementIdentityId: string
) {
  if (oldIdentityId === replacementIdentityId) throw new Error("replacement_identity_must_differ");
  const [oldMembership, replacementMembership] = await Promise.all([
    prisma.groupMembership.findUnique({
      where: { groupId_identityId: { groupId, identityId: oldIdentityId } }
    }),
    prisma.groupMembership.findUnique({
      where: { groupId_identityId: { groupId, identityId: replacementIdentityId } },
      include: { identity: true }
    })
  ]);
  if (!oldMembership || oldMembership.status !== "active" || oldMembership.role !== "admin") {
    throw new Error("old_admin_membership_required");
  }
  if (!replacementMembership || replacementMembership.status !== "active"
    || replacementMembership.identity.anonymizedAt) {
    throw new Error("active_replacement_membership_required");
  }
  return {
    groupId,
    oldMembershipId: oldMembership.id,
    replacementMembershipId: replacementMembership.id,
    replacementAlreadyAdmin: replacementMembership.role === "admin"
  };
}

export async function recoverAdmin(
  prisma: PrismaClient,
  groupId: string,
  oldIdentityId: string,
  replacementIdentityId: string
) {
  return prisma.$transaction(async (tx) => {
    if (oldIdentityId === replacementIdentityId) throw new Error("replacement_identity_must_differ");
    const oldMembership = await tx.groupMembership.findUnique({
      where: { groupId_identityId: { groupId, identityId: oldIdentityId } }
    });
    const replacementMembership = await tx.groupMembership.findUnique({
      where: { groupId_identityId: { groupId, identityId: replacementIdentityId } },
      include: { identity: true }
    });
    if (!oldMembership || oldMembership.status !== "active" || oldMembership.role !== "admin") {
      throw new Error("old_admin_membership_required");
    }
    if (!replacementMembership || replacementMembership.status !== "active"
      || replacementMembership.identity.anonymizedAt) {
      throw new Error("active_replacement_membership_required");
    }
    await tx.groupMembership.update({
      where: { id: replacementMembership.id },
      data: { role: "admin" }
    });
    await tx.groupMembership.update({
      where: { id: oldMembership.id },
      data: { status: "removed", removedAt: new Date() }
    });
    return {
      groupId,
      oldMembershipId: oldMembership.id,
      replacementMembershipId: replacementMembership.id
    };
  }, { isolationLevel: "Serializable" });
}

export async function inspectRevokeSessions(prisma: PrismaClient, identityId: string) {
  const identity = await prisma.identity.findUnique({
    where: { id: identityId },
    select: { id: true, authVersion: true, anonymizedAt: true }
  });
  if (!identity) throw new Error("identity_not_found");
  return identity;
}

export async function revokeIdentitySessions(prisma: PrismaClient, identityId: string) {
  return prisma.$transaction(async (tx) => {
    const identity = await tx.identity.update({
      where: { id: identityId },
      data: { authVersion: { increment: 1 } },
      select: { id: true, authVersion: true }
    });
    const deleted = await tx.identityLinkCode.deleteMany({ where: { identityId } });
    return { ...identity, deletedLinkCodeCount: deleted.count };
  });
}
