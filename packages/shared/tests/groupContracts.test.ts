import { describe, expect, it } from "vitest";
import { DEFAULT_GROUP_SCORING_WEIGHTS, GROUP_ROUTES } from "../src";
import type {
  CreateGroupFeedbackRequest,
  CreateRecommendationRequest,
  CreateRestaurantRequest,
  FeedbackType,
  GroupCapabilitiesResponse,
  GroupTodayRecommendationsResponse,
  GroupRole,
  MembershipStatus,
  PatchRestaurantRequest,
  ParticipationStatus,
  PutParticipationTodayRequest,
  RecommendationBatchSource,
  RestaurantStatus,
  ScoreBreakdown,
  ScoringWeightsSnapshot
} from "../src";

describe("multi-group shared contracts", () => {
  it("locks group role and membership status strings", () => {
    const role: GroupRole = "admin";
    const memberRole: GroupRole = "member";
    const status: MembershipStatus = "active";
    const removed: MembershipStatus = "removed";

    expect([role, memberRole, status, removed]).toEqual(["admin", "member", "active", "removed"]);
  });

  it("uses avoid feedback for member-level avoid actions", () => {
    const types: FeedbackType[] = ["want", "skip", "ate", "avoid"];
    expect(types).toContain("avoid");
    expect(types).not.toContain("blocked" as FeedbackType);
  });

  it("locks restaurant status as an admin-governed field", () => {
    const statuses: RestaurantStatus[] = ["active", "paused", "blocked"];
    expect(statuses).toEqual(["active", "paused", "blocked"]);
  });

  it("defines group route builders for Stage 2 knowledge APIs", () => {
    expect(GROUP_ROUTES.restaurants("group-1")).toBe("/api/groups/group-1/restaurants");
    expect(GROUP_ROUTES.restaurant("group-1", "restaurant-1")).toBe(
      "/api/groups/group-1/restaurants/restaurant-1"
    );
    expect(GROUP_ROUTES.recommendations("group-1")).toBe("/api/groups/group-1/recommendations");
    expect(GROUP_ROUTES.recommendation("group-1", "recommendation-1")).toBe(
      "/api/groups/group-1/recommendations/recommendation-1"
    );
    expect(GROUP_ROUTES.feedback("group-1")).toBe("/api/groups/group-1/feedback");
  });

  it("defines group route builders without forceRefresh writes", () => {
    expect(GROUP_ROUTES.todayRecommendations("group-1")).toBe("/api/groups/group-1/today-recommendations");
    expect(GROUP_ROUTES.refreshTodayRecommendations("group-1")).toBe(
      "/api/groups/group-1/today-recommendations/refresh"
    );
  });

  it("defines the group-scoped beta capabilities contract", () => {
    const response: GroupCapabilitiesResponse = {
      groupId: "group-1",
      features: {
        luckyRestaurantWheel: false,
        poiReferenceSearch: false,
        poiReferenceDraft: false,
        poiOfficePreset: false,
        poiProvider: null
      }
    };

    expect(GROUP_ROUTES.capabilities("group-1")).toBe(
      "/api/groups/group-1/capabilities"
    );
    expect(response.features).toEqual({
      luckyRestaurantWheel: false,
      poiReferenceSearch: false,
      poiReferenceDraft: false,
      poiOfficePreset: false,
      poiProvider: null
    });
  });

  it("defines request contracts for group restaurant knowledge", () => {
    const createRestaurant: CreateRestaurantRequest = {
      name: "米饭小馆",
      area: "公司楼下",
      distanceMinutes: 8,
      cuisine: "家常菜",
      priceBand: "30-40",
      averagePriceCents: 3500,
      supportsDineIn: true,
      supportsTakeout: true,
      tags: ["下饭", "近"]
    };
    const patchRestaurant: PatchRestaurantRequest = {
      name: "米饭小馆",
      status: "paused"
    };
    const createRecommendation: CreateRecommendationRequest = {
      restaurantId: "restaurant-1",
      dish: "卤肉饭",
      reason: "稳定下饭",
      weatherTags: ["rainy"],
      weekdayTags: ["friday"],
      moodTags: ["想吃饭"]
    };
    const feedback: CreateGroupFeedbackRequest = {
      officeDate: "2026-07-09",
      restaurantId: "restaurant-1",
      recommendationId: "recommendation-1",
      type: "avoid"
    };

    expect(createRestaurant.tags).toContain("近");
    expect(patchRestaurant.status).toBe("paused");
    expect(createRecommendation.restaurantId).toBe("restaurant-1");
    expect(feedback.type).toBe("avoid");
  });
});

describe("Stage 3 shared contracts", () => {
  it("defines group today recommendation routes", () => {
    expect(GROUP_ROUTES.todayRecommendations("group-1")).toBe(
      "/api/groups/group-1/today-recommendations"
    );
    expect(GROUP_ROUTES.refreshTodayRecommendations("group-1")).toBe(
      "/api/groups/group-1/today-recommendations/refresh"
    );
    expect(GROUP_ROUTES.participationToday("group-1")).toBe(
      "/api/groups/group-1/participation/today"
    );
  });

  it("locks Stage 3 batch and participation literals", () => {
    const sources: RecommendationBatchSource[] = ["auto", "manual", "legacy"];
    const statuses: ParticipationStatus[] = ["undecided", "joining", "away", "decided"];

    expect(sources).toEqual(["auto", "manual", "legacy"]);
    expect(statuses).toEqual(["undecided", "joining", "away", "decided"]);
  });

  it("defines scoring snapshot and response shape for group today recommendations", () => {
    const weights: ScoringWeightsSnapshot = {
      weekdayMatch: 20,
      weatherMatch: 25,
      distance: 20,
      teammateRecommendation: 10,
      recentDuplicatePenalty: 12,
      negativeFeedbackPenalty: 10
    };
    const breakdown: ScoreBreakdown = {
      weekdayMatch: 20,
      weatherMatch: 0,
      distance: 20,
      teammateRecommendation: 10,
      recentDuplicatePenalty: 0,
      negativeFeedbackPenalty: -10,
      total: 40
    };
    const response: GroupTodayRecommendationsResponse = {
      groupId: "group-1",
      officeDate: "2026-07-09",
      batchId: "batch-1",
      batchNo: 2,
      generatedAt: "2026-07-09T03:30:00.000Z",
      weatherUnavailable: true,
      participationSummary: {
        joiningCount: 1,
        decidedCount: 1,
        awayCount: 0,
        undecidedCount: 2
      },
      items: [
        {
          rank: 1,
          restaurantId: "restaurant-1",
          recommendationId: "recommendation-1",
          restaurantName: "米饭小馆",
          dish: "卤肉饭",
          reason: "离办公室近，多人推荐",
          distanceMinutes: 8,
          priceBand: "30-40",
          averagePriceCents: 3500,
          tags: ["近", "下饭"],
          score: 40,
          scoreBreakdown: breakdown
        }
      ]
    };

    expect(weights.weatherMatch).toBe(25);
    expect(response.items[0]?.scoreBreakdown.total).toBe(40);
  });

  it("defines participation update request shape", () => {
    const joining: PutParticipationTodayRequest = { status: "joining" };
    const decided: PutParticipationTodayRequest = {
      status: "decided",
      restaurantId: "restaurant-1",
      recommendationId: "recommendation-1"
    };

    expect(joining.status).toBe("joining");
    expect(decided.restaurantId).toBe("restaurant-1");
  });

  it("exports Stage 3 contracts from the shared package barrel", () => {
    expect(GROUP_ROUTES.participationToday("group-1")).toBe(
      "/api/groups/group-1/participation/today"
    );
    expect(DEFAULT_GROUP_SCORING_WEIGHTS.recentDuplicatePenalty).toBe(12);
  });
});
