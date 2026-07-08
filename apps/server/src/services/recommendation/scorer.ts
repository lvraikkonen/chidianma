import { calculateRestaurantScore, type RecommendationItem } from "@lunch/shared";

export interface Candidate {
  restaurantId: string;
  recommendationId?: string | undefined;
  name: string;
  dish?: string | undefined;
  distanceMinutes?: number | undefined;
  tags: string[];
  weekdayMatch: 0 | 1;
  weatherMatch: 0 | 1;
  teammateRecommendationCount: number;
  recentlyRecommended: boolean;
  negativeFeedbackCount: number;
}

export interface RankedRecommendation extends RecommendationItem {
  score: number;
}

export function rankRestaurantCandidates(input: {
  candidates: Candidate[];
  limit: number;
}): RankedRecommendation[] {
  const ranked = input.candidates
    .map((candidate) => {
      const result = calculateRestaurantScore({
        weekdayMatch: candidate.weekdayMatch,
        weatherMatch: candidate.weatherMatch,
        distanceMinutes: candidate.distanceMinutes,
        teammateRecommendationCount: candidate.teammateRecommendationCount,
        recentlyRecommended: candidate.recentlyRecommended,
        negativeFeedbackCount: candidate.negativeFeedbackCount
      });

      return {
        restaurantId: candidate.restaurantId,
        recommendationId: candidate.recommendationId,
        restaurantName: candidate.name,
        dish: candidate.dish,
        reason: result.reasons.length ? result.reasons.join("，") : "今天也适合来点稳妥的。",
        distanceMinutes: candidate.distanceMinutes,
        tags: candidate.tags,
        score: result.score
      };
    })
    .sort((a, b) => b.score - a.score);

  const byRestaurant = new Map<string, RankedRecommendation>();
  for (const item of ranked) {
    if (!byRestaurant.has(item.restaurantId)) {
      byRestaurant.set(item.restaurantId, item);
    }
  }

  return [...byRestaurant.values()].slice(0, input.limit);
}
