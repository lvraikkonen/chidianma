import {
  calculateRestaurantScore,
  type RecommendationItem,
  type ScoreBreakdown,
  type ScoringWeightsSnapshot
} from "@lunch/shared";

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
  scoreBreakdown: ScoreBreakdown;
}

export function rankRestaurantCandidates(input: {
  candidates: Candidate[];
  limit: number;
  weights?: ScoringWeightsSnapshot | undefined;
  tieBreakEqualScoresById?: boolean | undefined;
}): RankedRecommendation[] {
  const ranked = input.candidates
    .map((candidate) => {
      const result = calculateRestaurantScore({
        weekdayMatch: candidate.weekdayMatch,
        weatherMatch: candidate.weatherMatch,
        distanceMinutes: candidate.distanceMinutes,
        teammateRecommendationCount: candidate.teammateRecommendationCount,
        recentlyRecommended: candidate.recentlyRecommended,
        negativeFeedbackCount: candidate.negativeFeedbackCount,
        weights: input.weights
      });

      return {
        restaurantId: candidate.restaurantId,
        recommendationId: candidate.recommendationId,
        restaurantName: candidate.name,
        dish: candidate.dish,
        reason: result.reasons.length ? result.reasons.join("，") : "今天也适合来点稳妥的。",
        distanceMinutes: candidate.distanceMinutes,
        tags: candidate.tags,
        score: result.score,
        scoreBreakdown: result.breakdown
      };
    })
    .sort((left, right) => {
      const scoreDifference = right.score - left.score;
      if (scoreDifference !== 0 || !input.tieBreakEqualScoresById) {
        return scoreDifference;
      }
      const restaurantDifference = compareIds(
        left.restaurantId,
        right.restaurantId
      );
      if (restaurantDifference !== 0) return restaurantDifference;
      return compareIds(
        left.recommendationId ?? "",
        right.recommendationId ?? ""
      );
    });

  const byRestaurant = new Map<string, RankedRecommendation>();
  for (const item of ranked) {
    if (!byRestaurant.has(item.restaurantId)) {
      byRestaurant.set(item.restaurantId, item);
    }
  }

  return [...byRestaurant.values()].slice(0, input.limit);
}

function compareIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
