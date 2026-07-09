import type { ScoreBreakdown, ScoringWeightsSnapshot } from "./types";

export const LEGACY_SCORING_WEIGHTS: ScoringWeightsSnapshot = {
  weekdayMatch: 20,
  weatherMatch: 25,
  distance: 20,
  teammateRecommendation: 10,
  recentDuplicatePenalty: 25,
  negativeFeedbackPenalty: 10
};

export const DEFAULT_GROUP_SCORING_WEIGHTS: ScoringWeightsSnapshot = {
  weekdayMatch: 20,
  weatherMatch: 25,
  distance: 20,
  teammateRecommendation: 10,
  recentDuplicatePenalty: 12,
  negativeFeedbackPenalty: 10
};

export interface ScoreInput {
  weekdayMatch: 0 | 1;
  weatherMatch: 0 | 1;
  distanceMinutes?: number | undefined;
  teammateRecommendationCount: number;
  recentlyRecommended: boolean;
  negativeFeedbackCount: number;
  weights?: ScoringWeightsSnapshot | undefined;
}

export interface ScoreResult {
  score: number;
  reasons: string[];
  breakdown: ScoreBreakdown;
}

export function calculateRestaurantScore(input: ScoreInput): ScoreResult {
  const weights = input.weights ?? LEGACY_SCORING_WEIGHTS;
  const reasons: string[] = [];
  const weekdayScore = input.weekdayMatch ? weights.weekdayMatch : 0;
  const weatherScore = input.weatherMatch ? weights.weatherMatch : 0;
  const distanceScore = getDistanceScore(input.distanceMinutes, weights.distance);
  const teammateScore = input.teammateRecommendationCount >= 2 ? weights.teammateRecommendation : 0;
  const duplicatePenalty = input.recentlyRecommended ? -weights.recentDuplicatePenalty : 0;
  const negativePenalty = input.negativeFeedbackCount > 0
    ? -(input.negativeFeedbackCount * weights.negativeFeedbackPenalty)
    : 0;
  const total = weekdayScore
    + weatherScore
    + distanceScore
    + teammateScore
    + duplicatePenalty
    + negativePenalty;

  if (input.weekdayMatch) {
    reasons.push("适合今天");
  }

  if (input.weatherMatch) {
    reasons.push("适合当前天气");
  }

  if (distanceScore === weights.distance && distanceScore > 0) reasons.push("离办公室近");
  if (distanceScore === weights.distance / 2 && distanceScore > 0) reasons.push("距离适中");

  if (input.teammateRecommendationCount >= 2) {
    reasons.push("多人推荐");
  }

  if (input.recentlyRecommended) {
    reasons.push("最近推荐过，降权");
  }

  if (input.negativeFeedbackCount > 0) {
    reasons.push("有人不想吃，降权");
  }

  return {
    score: total,
    reasons,
    breakdown: {
      weekdayMatch: weekdayScore,
      weatherMatch: weatherScore,
      distance: distanceScore,
      teammateRecommendation: teammateScore,
      recentDuplicatePenalty: duplicatePenalty,
      negativeFeedbackPenalty: negativePenalty,
      total
    }
  };
}

function getDistanceScore(distanceMinutes: number | undefined, maxScore: number): number {
  if (typeof distanceMinutes !== "number") return 0;
  if (distanceMinutes <= 10) return maxScore;
  if (distanceMinutes <= 20) return maxScore / 2;
  return 0;
}
