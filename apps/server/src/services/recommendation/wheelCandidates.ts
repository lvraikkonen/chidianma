import type { PrismaClient } from "@prisma/client";
import type {
  GroupWheelCandidatesResponse,
  ScoringWeightsSnapshot
} from "@lunch/shared";
import { getOfficeCalendarWindows, getOfficeWeekdayTag } from "../dates.js";
import type { MembershipContext } from "../groups/memberships.js";
import { buildRankedRecommendationCandidates } from "./candidates.js";
import { NoCurrentBatchError } from "./groupToday.js";

export async function getGroupWheelCandidates(input: {
  prisma: PrismaClient;
  groupId: string;
  membership: MembershipContext;
}): Promise<GroupWheelCandidatesResponse> {
  const group = await input.prisma.lunchGroup.findUnique({
    where: { id: input.groupId },
    select: { id: true, officeTimezone: true }
  });
  if (!group) {
    throw new Error(`Lunch group ${input.groupId} does not exist`);
  }

  const now = new Date();
  const calendar = getOfficeCalendarWindows(now, group.officeTimezone);
  const batch = await input.prisma.dailyRecommendationBatch.findFirst({
    where: {
      groupId: input.groupId,
      officeDate: calendar.officeDate,
      isCurrent: true
    },
    select: {
      id: true,
      officeDate: true,
      weatherSnapshotId: true,
      scoringWeightsSnapshot: true,
      algorithmVersion: true
    }
  });
  if (!batch) {
    throw new NoCurrentBatchError(input.groupId, calendar.officeDate);
  }

  const [weatherSnapshot, recentDecisions] = await Promise.all([
    batch.weatherSnapshotId
      ? input.prisma.weatherSnapshot.findUnique({
          where: { id: batch.weatherSnapshotId }
        })
      : Promise.resolve(null),
    input.prisma.dailyParticipation.findMany({
      where: {
        groupId: input.groupId,
        membershipId: input.membership.membershipId,
        status: "decided",
        officeDate: {
          gte: calendar.rolling7.startDate,
          lte: batch.officeDate
        },
        restaurantId: { not: null }
      },
      select: { restaurantId: true }
    })
  ]);
  const ranked = await buildRankedRecommendationCandidates({
    prisma: input.prisma,
    groupId: input.groupId,
    officeDate: batch.officeDate,
    weekdayTag: getOfficeWeekdayTag(now, group.officeTimezone),
    weatherCondition: weatherSnapshot?.condition ?? null,
    weights:
      batch.scoringWeightsSnapshot as unknown as ScoringWeightsSnapshot,
    limit: 8,
    hardExcludedMembershipId: input.membership.membershipId
  });
  const recentlySelectedRestaurantIds = new Set(
    recentDecisions.flatMap((decision) =>
      decision.restaurantId ? [decision.restaurantId] : []
    )
  );

  return {
    groupId: input.groupId,
    officeDate: batch.officeDate,
    batchId: batch.id,
    algorithmVersion: batch.algorithmVersion,
    candidates: ranked.map((candidate) => ({
      restaurantId: candidate.restaurantId,
      ...(candidate.recommendationId
        ? { recommendationId: candidate.recommendationId }
        : {}),
      name: candidate.restaurantName,
      ...(candidate.dish ? { dish: candidate.dish } : {}),
      reason: candidate.reason,
      ...(candidate.distanceMinutes === undefined
        ? {}
        : { distanceMinutes: candidate.distanceMinutes }),
      tags: candidate.tags,
      recommendationScore: candidate.score,
      selectedWithinLast7Days: recentlySelectedRestaurantIds.has(
        candidate.restaurantId
      )
    }))
  };
}
