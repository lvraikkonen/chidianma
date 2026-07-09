import {
  DEFAULT_GROUP_SCORING_WEIGHTS,
  type GroupTodayRecommendationsResponse,
  type ParticipationSummary,
  type ScoreBreakdown,
  type ScoringWeightsSnapshot,
  type WeatherSummary as SharedWeatherSummary
} from "@lunch/shared";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { AppEnv } from "../../env.js";
import { getOfficeDate, getOfficeWeekdayTag } from "../dates.js";
import type { MembershipContext } from "../groups/memberships.js";
import type { WeatherSummary } from "../weather/mockWeather.js";
import { getWeatherForGroupOfficeDate } from "../weather/officeWeather.js";
import { rankRestaurantCandidates } from "./scorer.js";

export const GROUP_RECOMMENDATION_ALGORITHM_VERSION = "group-v1";

export class NoCurrentBatchError extends Error {
  constructor(public readonly groupId: string, public readonly officeDate: string) {
    super("No current recommendation batch exists");
    this.name = "NoCurrentBatchError";
  }
}

export async function getCurrentGroupTodayRecommendations(input: {
  prisma: PrismaClient;
  env: AppEnv;
  groupId: string;
}): Promise<GroupTodayRecommendationsResponse> {
  const group = await requireGroup(input.prisma, input.groupId);
  const officeDate = getOfficeDate(new Date(), group.officeTimezone);
  const batch = await input.prisma.dailyRecommendationBatch.findFirst({
    where: { groupId: input.groupId, officeDate, isCurrent: true },
    include: {
      items: {
        orderBy: { rank: "asc" },
        include: { restaurant: true, recommendation: true }
      }
    }
  });
  if (!batch) throw new NoCurrentBatchError(input.groupId, officeDate);

  const summary = await buildParticipationSummary({
    prisma: input.prisma,
    groupId: input.groupId,
    officeDate
  });
  return formatBatchResponse({ groupId: input.groupId, officeDate, batch, summary });
}

export async function refreshGroupTodayRecommendations(input: {
  prisma: PrismaClient;
  env: AppEnv;
  groupId: string;
  membership: MembershipContext;
}): Promise<GroupTodayRecommendationsResponse> {
  const group = await requireGroup(input.prisma, input.groupId);
  const now = new Date();
  const officeDate = getOfficeDate(now, group.officeTimezone);
  const todayWeekday = getOfficeWeekdayTag(now, group.officeTimezone);
  const weatherResult = await getWeatherForGroupOfficeDate({
    prisma: input.prisma,
    env: input.env,
    group,
    date: officeDate
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await input.prisma.$transaction(async (tx) => {
        const weights = await readWeightsSnapshot(tx, input.groupId);
        const ranked = await buildRankedItems({
          tx,
          groupId: input.groupId,
          officeDate,
          weekdayTag: todayWeekday,
          weatherCondition: weatherResult.weather?.condition ?? null,
          weights
        });
        const aggregate = await tx.dailyRecommendationBatch.aggregate({
          where: { groupId: input.groupId, officeDate },
          _max: { batchNo: true }
        });
        const batchNo = (aggregate._max.batchNo ?? 0) + 1;

        await tx.dailyRecommendationBatch.updateMany({
          where: { groupId: input.groupId, officeDate, isCurrent: true },
          data: { isCurrent: false }
        });
        const batch = await tx.dailyRecommendationBatch.create({
          data: {
            groupId: input.groupId,
            officeDate,
            batchNo,
            source: "manual",
            generatedByMembershipId: input.membership.membershipId,
            weatherSnapshotId: weatherResult.weatherSnapshotId ?? null,
            scoringWeightsSnapshot: weights as unknown as Prisma.InputJsonValue,
            algorithmVersion: GROUP_RECOMMENDATION_ALGORITHM_VERSION,
            isCurrent: true,
            items: {
              create: ranked.map((item, index) => ({
                rank: index + 1,
                restaurantId: item.restaurantId,
                recommendationId: item.recommendationId ?? null,
                score: item.score,
                scoreBreakdown: item.scoreBreakdown as unknown as Prisma.InputJsonValue,
                reason: item.reason
              }))
            }
          },
          include: {
            items: {
              orderBy: { rank: "asc" },
              include: { restaurant: true, recommendation: true }
            }
          }
        });
        const summary = await buildParticipationSummary({
          prisma: tx,
          groupId: input.groupId,
          officeDate
        });
        return formatBatchResponse({
          groupId: input.groupId,
          officeDate,
          batch,
          summary,
          weather: weatherToSharedWeather(group.officeCity, weatherResult.weather),
          weatherUnavailable: weatherResult.weatherUnavailable
        });
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      if (attempt === 2 || !isRetryableTransactionError(error)) throw error;
    }
  }

  throw new Error("Could not create group daily recommendation batch");
}

export async function buildParticipationSummary(input: {
  prisma: PrismaClient | Prisma.TransactionClient;
  groupId: string;
  officeDate: string;
}): Promise<ParticipationSummary> {
  const activeMemberships = await input.prisma.groupMembership.findMany({
    where: { groupId: input.groupId, status: "active" },
    select: { id: true }
  });
  const activeIds = new Set(activeMemberships.map((membership) => membership.id));
  const rows = await input.prisma.dailyParticipation.findMany({
    where: { groupId: input.groupId, officeDate: input.officeDate }
  });
  const counts = { joiningCount: 0, decidedCount: 0, awayCount: 0, undecidedCount: 0 };
  const seen = new Set<string>();

  for (const row of rows) {
    if (!activeIds.has(row.membershipId)) continue;
    seen.add(row.membershipId);
    if (row.status === "joining") counts.joiningCount += 1;
    if (row.status === "decided") counts.decidedCount += 1;
    if (row.status === "away") counts.awayCount += 1;
    if (row.status === "undecided") counts.undecidedCount += 1;
  }
  counts.undecidedCount += activeMemberships.length - seen.size;
  return counts;
}

async function requireGroup(prisma: PrismaClient, groupId: string) {
  const group = await prisma.lunchGroup.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      officeCity: true,
      officeLatitude: true,
      officeLongitude: true,
      officeTimezone: true
    }
  });
  if (!group) throw new Error(`Lunch group ${groupId} does not exist`);
  return group;
}

async function readWeightsSnapshot(
  prisma: Prisma.TransactionClient,
  groupId: string
): Promise<ScoringWeightsSnapshot> {
  const weights = await prisma.scoringWeights.findUnique({ where: { groupId } });
  if (!weights) return { ...DEFAULT_GROUP_SCORING_WEIGHTS };
  return {
    weekdayMatch: weights.weekdayMatch,
    weatherMatch: weights.weatherMatch,
    distance: weights.distance,
    teammateRecommendation: weights.teammateRecommendation,
    recentDuplicatePenalty: weights.recentDuplicatePenalty,
    negativeFeedbackPenalty: weights.negativeFeedbackPenalty
  };
}

async function buildRankedItems(input: {
  tx: Prisma.TransactionClient;
  groupId: string;
  officeDate: string;
  weekdayTag: string | null;
  weatherCondition: string | null;
  weights: ScoringWeightsSnapshot;
}) {
  const restaurants = await input.tx.restaurant.findMany({
    where: { groupId: input.groupId, status: "active" },
    include: {
      recommendations: true,
      feedback: { where: { officeDate: input.officeDate, type: { in: ["skip", "avoid"] } } }
    }
  });
  const recent = await input.tx.dailyRecommendationItem.findMany({
    where: {
      batch: { groupId: input.groupId, officeDate: { not: input.officeDate } }
    },
    select: { restaurantId: true },
    take: 20,
    orderBy: { createdAt: "desc" }
  });
  const recentIds = new Set(recent.map((item) => item.restaurantId));

  return rankRestaurantCandidates({
    limit: 3,
    weights: input.weights,
    candidates: restaurants.flatMap((restaurant) => {
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
        tags: [...new Set([...restaurant.tags, ...recommendation.moodTags])],
        weekdayMatch: input.weekdayTag && recommendation.weekdayTags.includes(input.weekdayTag) ? 1 : 0,
        weatherMatch: input.weatherCondition
          && recommendation.weatherTags.includes(input.weatherCondition) ? 1 : 0,
        teammateRecommendationCount: restaurant.recommendations.length,
        recentlyRecommended: recentIds.has(restaurant.id),
        negativeFeedbackCount: restaurant.feedback.length
      }));
    })
  });
}

function formatBatchResponse(input: {
  groupId: string;
  officeDate: string;
  batch: {
    id: string;
    batchNo: number;
    createdAt: Date;
    items: Array<{
      rank: number;
      restaurantId: string;
      recommendationId: string | null;
      score: number;
      scoreBreakdown: Prisma.JsonValue;
      reason: string;
      restaurant: {
        name: string;
        distanceMinutes: number | null;
        priceBand: string | null;
        averagePriceCents: number | null;
        supportsDineIn: boolean;
        supportsTakeout: boolean;
        tags: string[];
      };
      recommendation: {
        dish: string | null;
        moodTags: string[];
      } | null;
    }>;
  };
  summary: ParticipationSummary;
  weather?: SharedWeatherSummary | undefined;
  weatherUnavailable?: boolean | undefined;
}): GroupTodayRecommendationsResponse {
  return {
    groupId: input.groupId,
    officeDate: input.officeDate,
    batchId: input.batch.id,
    batchNo: input.batch.batchNo,
    generatedAt: input.batch.createdAt.toISOString(),
    ...(input.weather ? { weather: input.weather } : {}),
    ...(input.weatherUnavailable !== undefined
      ? { weatherUnavailable: input.weatherUnavailable }
      : {}),
    participationSummary: input.summary,
    items: input.batch.items.map((item) => ({
      rank: item.rank,
      restaurantId: item.restaurantId,
      recommendationId: item.recommendationId ?? undefined,
      restaurantName: item.restaurant.name,
      dish: item.recommendation?.dish ?? undefined,
      reason: item.reason,
      distanceMinutes: item.restaurant.distanceMinutes ?? undefined,
      tags: [...new Set([...item.restaurant.tags, ...(item.recommendation?.moodTags ?? [])])],
      priceBand: item.restaurant.priceBand ?? undefined,
      averagePriceCents: item.restaurant.averagePriceCents ?? undefined,
      supportsDineIn: item.restaurant.supportsDineIn,
      supportsTakeout: item.restaurant.supportsTakeout,
      score: item.score,
      scoreBreakdown: item.scoreBreakdown as unknown as ScoreBreakdown
    }))
  };
}

function weatherToSharedWeather(
  city: string,
  weather: WeatherSummary | null
): SharedWeatherSummary | undefined {
  if (!weather) return undefined;
  return {
    city,
    condition: weather.condition,
    temperatureC: weather.temperatureC,
    precipitationProbability: weather.precipitationProbability,
    windLevel: weather.windLevel ?? undefined,
    summary: weather.summary
  };
}

function isRetryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  if (error.code === "P2034") return true;
  if (error.code !== "P2002") return false;

  const target = "meta" in error
    && error.meta
    && typeof error.meta === "object"
    && "target" in error.meta
    ? error.meta.target
    : undefined;
  const details = `${String(target ?? "")} ${"message" in error ? String(error.message) : ""}`;
  if (details.includes("daily_recommendation_batches_one_current_key")) return true;
  if (details.includes("daily_recommendation_batches_group_id_office_date_batch_no_key")) return true;

  const normalized = details.replaceAll("Id", "_id").replaceAll("No", "_no").toLowerCase();
  return normalized.includes("group_id")
    && normalized.includes("office_date")
    && normalized.includes("batch_no");
}
