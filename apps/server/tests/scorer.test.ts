import { describe, expect, it } from "vitest";
import { rankRestaurantCandidates } from "../src/services/recommendation/scorer";

describe("rankRestaurantCandidates", () => {
  it("returns explainable ranked candidates", () => {
    const ranked = rankRestaurantCandidates({
      candidates: [
        {
          restaurantId: "r1",
          recommendationId: "rec1",
          name: "拉面小馆",
          dish: "叉烧拉面",
          distanceMinutes: 8,
          tags: ["热乎", "雨天"],
          weekdayMatch: 1,
          weatherMatch: 1,
          teammateRecommendationCount: 2,
          recentlyRecommended: false,
          negativeFeedbackCount: 0
        }
      ],
      limit: 3
    });

    expect(ranked[0]).toMatchObject({
      restaurantName: "拉面小馆",
      scoreBreakdown: { total: 75 }
    });
    expect(ranked[0]?.reason).toContain("适合今天");
  });
});
