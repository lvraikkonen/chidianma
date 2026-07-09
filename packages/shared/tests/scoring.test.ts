import { describe, expect, it } from "vitest";
import {
  DEFAULT_GROUP_SCORING_WEIGHTS,
  LEGACY_SCORING_WEIGHTS,
  calculateRestaurantScore
} from "../src/scoring";

describe("calculateRestaurantScore", () => {
  it("rewards weekday, weather, distance, and teammate recommendations", () => {
    const result = calculateRestaurantScore({
      weekdayMatch: 1,
      weatherMatch: 1,
      distanceMinutes: 8,
      teammateRecommendationCount: 3,
      recentlyRecommended: false,
      negativeFeedbackCount: 0
    });

    expect(result.score).toBe(20 + 25 + 20 + 10);
    expect(result.reasons).toEqual([
      "适合今天",
      "适合当前天气",
      "离办公室近",
      "多人推荐"
    ]);
  });

  it("penalizes recent duplicates and negative feedback", () => {
    const result = calculateRestaurantScore({
      weekdayMatch: 0,
      weatherMatch: 0,
      distanceMinutes: 25,
      teammateRecommendationCount: 1,
      recentlyRecommended: true,
      negativeFeedbackCount: 2
    });

    expect(result.score).toBe(-45);
    expect(result.reasons).toContain("最近推荐过，降权");
    expect(result.reasons).toContain("有人不想吃，降权");
  });

  it("supports explicit scoring weights and returns a numeric breakdown", () => {
    const result = calculateRestaurantScore({
      weekdayMatch: 1,
      weatherMatch: 0,
      distanceMinutes: 8,
      teammateRecommendationCount: 2,
      recentlyRecommended: true,
      negativeFeedbackCount: 1,
      weights: {
        weekdayMatch: 30,
        weatherMatch: 40,
        distance: 12,
        teammateRecommendation: 8,
        recentDuplicatePenalty: 5,
        negativeFeedbackPenalty: 7
      }
    });

    expect(LEGACY_SCORING_WEIGHTS.recentDuplicatePenalty).toBe(25);
    expect(DEFAULT_GROUP_SCORING_WEIGHTS.recentDuplicatePenalty).toBe(12);
    expect(result.score).toBe(38);
    expect(result.breakdown).toEqual({
      weekdayMatch: 30,
      weatherMatch: 0,
      distance: 12,
      teammateRecommendation: 8,
      recentDuplicatePenalty: -5,
      negativeFeedbackPenalty: -7,
      total: 38
    });
  });
});
