import { describe, expect, it } from "vitest";
import { rankRestaurantCandidates } from "../src/services/recommendation/scorer";

describe("rankRestaurantCandidates", () => {
  it("returns top three active candidates with readable reasons", () => {
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
        },
        {
          restaurantId: "r2",
          recommendationId: "rec2",
          name: "远处火锅",
          dish: "番茄锅",
          distanceMinutes: 30,
          tags: ["热乎"],
          weekdayMatch: 0,
          weatherMatch: 1,
          teammateRecommendationCount: 1,
          recentlyRecommended: true,
          negativeFeedbackCount: 1
        }
      ],
      limit: 3
    });

    expect(ranked).toHaveLength(2);
    expect(ranked[0]).toMatchObject({
      restaurantName: "拉面小馆",
      dish: "叉烧拉面",
      distanceMinutes: 8
    });
    expect(ranked[0]?.reason).toContain("适合今天");
  });
});
