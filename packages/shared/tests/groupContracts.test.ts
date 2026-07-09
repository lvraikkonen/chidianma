import { describe, expect, it } from "vitest";
import { GROUP_ROUTES } from "../src/api";
import type {
  CreateGroupFeedbackRequest,
  CreateRecommendationRequest,
  CreateRestaurantRequest,
  FeedbackType,
  GroupRole,
  MembershipStatus,
  PatchRestaurantRequest,
  RestaurantStatus
} from "../src/types";

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
