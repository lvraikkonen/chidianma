import { describe, expect, it } from "vitest";
import { rankRestaurantCandidates } from "../src/services/recommendation/scorer";

describe("rankRestaurantCandidates", () => {
  it("identifies a newly listed restaurant while preserving real score reasons", () => {
    const [ranked] = rankRestaurantCandidates({
      candidates: [{
        restaurantId: "restaurant-new",
        name: "新餐厅",
        distanceMinutes: 8,
        tags: [],
        weekdayMatch: 0,
        weatherMatch: 0,
        teammateRecommendationCount: 0,
        recentlyRecommended: false,
        negativeFeedbackCount: 0
      }],
      limit: 3
    });

    expect(ranked).toMatchObject({
      restaurantId: "restaurant-new",
      score: 20,
      reason: "新收录，尚无同事推荐，离办公室近"
    });
  });

  it("does not award a distance score when walking time is unknown", () => {
    const [ranked] = rankRestaurantCandidates({
      candidates: [{
        restaurantId: "restaurant-new",
        name: "新餐厅",
        tags: [],
        weekdayMatch: 0,
        weatherMatch: 0,
        teammateRecommendationCount: 0,
        recentlyRecommended: false,
        negativeFeedbackCount: 0
      }],
      limit: 3
    });

    expect(ranked).toMatchObject({
      score: 0,
      reason: "新收录，尚无同事推荐",
      scoreBreakdown: {
        distance: 0,
        teammateRecommendation: 0,
        total: 0
      }
    });
  });

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

  it("preserves input order for equal scores by default", () => {
    const base = {
      name: "同分餐厅",
      distanceMinutes: 8,
      tags: [] as string[],
      weekdayMatch: 0 as const,
      weatherMatch: 0 as const,
      teammateRecommendationCount: 1,
      recentlyRecommended: false,
      negativeFeedbackCount: 0
    };
    const ranked = rankRestaurantCandidates({
      candidates: [
        { ...base, restaurantId: "restaurant-03", recommendationId: "rec-03" },
        { ...base, restaurantId: "restaurant-01", recommendationId: "rec-z" },
        { ...base, restaurantId: "restaurant-02", recommendationId: "rec-02" },
        { ...base, restaurantId: "restaurant-01", recommendationId: "rec-a" }
      ],
      limit: 3
    });

    expect(ranked.map((item) => [
      item.restaurantId,
      item.recommendationId
    ])).toEqual([
      ["restaurant-03", "rec-03"],
      ["restaurant-01", "rec-z"],
      ["restaurant-02", "rec-02"]
    ]);
  });

  it("sorts equal scores by ids when explicitly enabled", () => {
    const base = {
      name: "同分餐厅",
      distanceMinutes: 8,
      tags: [] as string[],
      weekdayMatch: 0 as const,
      weatherMatch: 0 as const,
      teammateRecommendationCount: 1,
      recentlyRecommended: false,
      negativeFeedbackCount: 0
    };
    const ranked = rankRestaurantCandidates({
      candidates: [
        { ...base, restaurantId: "restaurant-03", recommendationId: "rec-03" },
        { ...base, restaurantId: "restaurant-01", recommendationId: "rec-z" },
        { ...base, restaurantId: "restaurant-02", recommendationId: "rec-02" },
        { ...base, restaurantId: "restaurant-01", recommendationId: "rec-a" },
        { ...base, restaurantId: "restaurant-04", recommendationId: "rec-04" }
      ],
      limit: 3,
      tieBreakEqualScoresById: true
    });

    expect(ranked.map((item) => [
      item.restaurantId,
      item.recommendationId
    ])).toEqual([
      ["restaurant-01", "rec-a"],
      ["restaurant-02", "rec-02"],
      ["restaurant-03", "rec-03"]
    ]);
  });
});
