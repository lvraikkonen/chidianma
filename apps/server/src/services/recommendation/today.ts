import { LUNCH_HEADLINE, type TodayRecommendationResponse } from "@lunch/shared";
import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type { AppEnv } from "../../env.js";
import { getOfficeDate, getOfficeWeekdayTag } from "../dates.js";
import { getWeatherForOfficeDate } from "../weather/officeWeather.js";
import { rankRestaurantCandidates } from "./scorer.js";

export async function getTodayRecommendations(input: {
  prisma: PrismaClient;
  env: AppEnv;
  forceRefresh: boolean;
}): Promise<TodayRecommendationResponse> {
  const now = new Date();
  const date = getOfficeDate(now, input.env.OFFICE_TIMEZONE);
  const weatherResult = await getWeatherForOfficeDate({
    prisma: input.prisma,
    env: input.env,
    date
  });
  const weatherCondition = weatherResult.weather?.condition ?? null;
  const weatherSummary = weatherResult.weather
    ? weatherResult.weather.summary
    : "现在拿不到天气，先按距离、星期和同事推荐来挑。";
  const todayWeekday = getOfficeWeekdayTag(now, input.env.OFFICE_TIMEZONE);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await input.prisma.$transaction(async (tx) => {
        const existing = await tx.dailyRecommendation.findMany({
          where: { date, isCurrent: true },
          include: { restaurant: true, recommendation: true },
          orderBy: { score: "desc" }
        });

        if (!input.forceRefresh && existing.length > 0) {
          return {
            date,
            headline: LUNCH_HEADLINE,
            weatherSummary,
            weatherUnavailable: weatherResult.weatherUnavailable,
            items: existing.map((item) => ({
              restaurantId: item.restaurantId,
              recommendationId: item.recommendationId ?? undefined,
              restaurantName: item.restaurant.name,
              dish: item.recommendation?.dish ?? undefined,
              reason: item.reason,
              distanceMinutes: item.restaurant.distanceMinutes ?? undefined,
              tags: [...new Set([...item.restaurant.tags, ...(item.recommendation?.moodTags ?? [])])]
            }))
          };
        }

        const restaurants = await tx.restaurant.findMany({
          where: { status: "active" },
          include: {
            recommendations: true,
            feedback: { where: { date, type: { in: ["skip", "blocked"] } } }
          }
        });

        const recent = await tx.dailyRecommendation.findMany({
          where: { date: { not: date } },
          take: 20,
          orderBy: { createdAt: "desc" }
        });
        const recentIds = new Set(recent.map((item) => item.restaurantId));

        const ranked = rankRestaurantCandidates({
          limit: 3,
          candidates: restaurants.flatMap((restaurant) => {
            const recommendations: Array<{
              id?: string | undefined;
              dish?: string | null | undefined;
              weatherTags: string[];
              weekdayTags: string[];
              moodTags: string[];
            }> = restaurant.recommendations.length
              ? restaurant.recommendations
              : [{ id: undefined, dish: undefined, weatherTags: [], weekdayTags: [], moodTags: [] }];

            return recommendations.map((recommendation) => ({
              restaurantId: restaurant.id,
              recommendationId: recommendation.id,
              name: restaurant.name,
              dish: recommendation.dish ?? undefined,
              distanceMinutes: restaurant.distanceMinutes ?? undefined,
              tags: [...new Set([...restaurant.tags, ...recommendation.moodTags])],
              weekdayMatch: todayWeekday && recommendation.weekdayTags.includes(todayWeekday) ? 1 : 0,
              weatherMatch: weatherCondition && recommendation.weatherTags.includes(weatherCondition) ? 1 : 0,
              teammateRecommendationCount: restaurant.recommendations.length,
              recentlyRecommended: recentIds.has(restaurant.id),
              negativeFeedbackCount: restaurant.feedback.length
            }));
          })
        });

        const batchId = randomUUID();
        await tx.dailyRecommendation.updateMany({
          where: { date, isCurrent: true },
          data: { isCurrent: false }
        });

        await tx.dailyRecommendation.createMany({
          data: ranked.map((item) => ({
            date,
            batchId,
            restaurantId: item.restaurantId,
            recommendationId: item.recommendationId ?? null,
            score: item.score,
            reason: item.reason,
            isCurrent: true
          }))
        });

        return {
          date,
          headline: LUNCH_HEADLINE,
          weatherSummary,
          weatherUnavailable: weatherResult.weatherUnavailable,
          items: ranked.map(({ score: _score, ...item }) => item)
        };
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      });
    } catch (error) {
      if (attempt === 2 || !isRetryableTransactionError(error)) throw error;
    }
  }

  throw new Error("Could not create daily recommendations");
}

function isRetryableTransactionError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}
