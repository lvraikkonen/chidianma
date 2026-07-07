export interface ScoreInput {
  weekdayMatch: 0 | 1;
  weatherMatch: 0 | 1;
  distanceMinutes?: number | undefined;
  teammateRecommendationCount: number;
  recentlyRecommended: boolean;
  negativeFeedbackCount: number;
}

export interface ScoreResult {
  score: number;
  reasons: string[];
}

export function calculateRestaurantScore(input: ScoreInput): ScoreResult {
  let score = 0;
  const reasons: string[] = [];

  if (input.weekdayMatch) {
    score += 20;
    reasons.push("适合今天");
  }

  if (input.weatherMatch) {
    score += 25;
    reasons.push("适合当前天气");
  }

  const distanceScore = getDistanceScore(input.distanceMinutes);
  score += distanceScore;
  if (distanceScore === 20) reasons.push("离办公室近");
  if (distanceScore === 10) reasons.push("距离适中");

  if (input.teammateRecommendationCount >= 2) {
    score += 10;
    reasons.push("多人推荐");
  }

  if (input.recentlyRecommended) {
    score -= 25;
    reasons.push("最近推荐过，降权");
  }

  if (input.negativeFeedbackCount > 0) {
    score -= input.negativeFeedbackCount * 10;
    reasons.push("有人不想吃，降权");
  }

  return { score, reasons };
}

function getDistanceScore(distanceMinutes?: number): number {
  if (typeof distanceMinutes !== "number") return 0;
  if (distanceMinutes <= 10) return 20;
  if (distanceMinutes <= 20) return 10;
  return 0;
}
