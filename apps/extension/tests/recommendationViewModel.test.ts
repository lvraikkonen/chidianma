import { describe, expect, it } from "vitest";
import {
  scoreBreakdownRows,
  toRecommendationCardModel
} from "../src/recommendationViewModel";

describe("recommendation view models", () => {
  const item = {
    rank: 1,
    restaurantId: "restaurant-1",
    recommendationId: "recommendation-1",
    restaurantName: "巷口砂锅",
    dish: "番茄肥牛砂锅",
    reason: "下雨天热乎且离得近",
    distanceMinutes: 6,
    averagePriceCents: 2800,
    supportsDineIn: true,
    supportsTakeout: true,
    tags: ["热乎", "近"],
    score: 55,
    scoreBreakdown: {
      weekdayMatch: 10,
      weatherMatch: 20,
      distance: 20,
      teammateRecommendation: 10,
      recentDuplicatePenalty: -5,
      negativeFeedbackPenalty: 0,
      total: 55
    }
  };

  it("formats only real item data", () => {
    expect(toRecommendationCardModel(item)).toEqual({
      restaurantId: "restaurant-1",
      recommendationId: "recommendation-1",
      rankLabel: "今日第 1 选",
      name: "巷口砂锅",
      dish: "番茄肥牛砂锅",
      reason: "下雨天热乎且离得近",
      distanceLabel: "步行 6 分钟",
      priceLabel: "人均 ¥28",
      modeLabel: "堂食 · 外带",
      tags: ["热乎", "近"],
      scoreLabel: "55 分"
    });
  });

  it("keeps penalties visible in the score rows", () => {
    expect(scoreBreakdownRows(item)).toContainEqual({
      key: "recentDuplicatePenalty",
      label: "近期重复",
      value: -5
    });
  });
});
