import type { Prisma, PrismaClient } from "@prisma/client";
import type { ScoringWeightsSnapshot } from "@lunch/shared";
import { rankRestaurantCandidates } from "./scorer.js";

type CandidatePrisma = PrismaClient | Prisma.TransactionClient;

export async function buildRankedRecommendationCandidates(input: {
  prisma: CandidatePrisma;
  groupId: string;
  officeDate: string;
  weekdayTag: string | null;
  weatherCondition: string | null;
  weights: ScoringWeightsSnapshot;
  limit: number;
  hardExcludedMembershipId?: string | undefined;
  tieBreakEqualScoresById?: boolean | undefined;
}) {
  const [restaurants, recentRecommendations, hardExcludedFeedback] =
    await Promise.all([
      input.prisma.restaurant.findMany({
        where: { groupId: input.groupId, status: "active" },
        include: {
          recommendations: { where: { groupId: input.groupId } },
          feedback: {
            where: {
              groupId: input.groupId,
              officeDate: input.officeDate,
              type: { in: ["skip", "avoid"] }
            }
          }
        }
      }),
      input.prisma.dailyRecommendationItem.findMany({
        where: {
          batch: {
            groupId: input.groupId,
            officeDate: { not: input.officeDate }
          }
        },
        select: { restaurantId: true },
        take: 20,
        orderBy: { createdAt: "desc" }
      }),
      input.hardExcludedMembershipId
        ? input.prisma.feedback.findMany({
            where: {
              groupId: input.groupId,
              officeDate: input.officeDate,
              membershipId: input.hardExcludedMembershipId,
              type: { in: ["skip", "avoid"] }
            },
            select: { restaurantId: true }
          })
        : Promise.resolve([])
    ]);
  const recentlyRecommendedIds = new Set(
    recentRecommendations.map((item) => item.restaurantId)
  );
  const hardExcludedRestaurantIds = new Set(
    hardExcludedFeedback.map((item) => item.restaurantId)
  );

  return rankRestaurantCandidates({
    limit: input.limit,
    weights: input.weights,
    tieBreakEqualScoresById: input.tieBreakEqualScoresById,
    candidates: restaurants
      .filter(
        (restaurant) => !hardExcludedRestaurantIds.has(restaurant.id)
      )
      .flatMap((restaurant) => {
        const recommendations = restaurant.recommendations.length > 0
          ? restaurant.recommendations
          : [{
              id: undefined,
              dish: undefined,
              weatherTags: [] as string[],
              weekdayTags: [] as string[],
              moodTags: [] as string[]
            }];
        return recommendations.map((recommendation) => ({
          restaurantId: restaurant.id,
          recommendationId: recommendation.id,
          name: restaurant.name,
          dish: recommendation.dish ?? undefined,
          distanceMinutes: restaurant.distanceMinutes ?? undefined,
          tags: [
            ...new Set([...restaurant.tags, ...recommendation.moodTags])
          ],
          weekdayMatch:
            input.weekdayTag
            && recommendation.weekdayTags.includes(input.weekdayTag)
              ? 1
              : 0,
          weatherMatch:
            input.weatherCondition
            && recommendation.weatherTags.includes(input.weatherCondition)
              ? 1
              : 0,
          teammateRecommendationCount: restaurant.recommendations.length,
          recentlyRecommended: recentlyRecommendedIds.has(restaurant.id),
          negativeFeedbackCount: restaurant.feedback.length
        }));
      })
  });
}
