import type {
  GroupSummary,
  RecommendationMutationResponse,
  RecommendationSummary,
  RestaurantMutationResponse,
  RestaurantSummary
} from "@lunch/shared";
import { describe, expect, it, vi } from "vitest";
import {
  createRestaurantEntryController,
  filterRestaurants,
  findDuplicateRestaurant,
  recommendationPermissions,
  restaurantPermissions,
  type CreateRestaurantEntryInput
} from "../src/features/restaurants/restaurantModel";

function recommendation(
  overrides: Partial<RecommendationSummary> = {}
): RecommendationSummary {
  return {
    id: "recommendation-1",
    groupId: "group-1",
    restaurantId: "restaurant-1",
    dish: "番茄肥牛砂锅",
    reason: "热乎，出餐快",
    weatherTags: [],
    weekdayTags: [],
    moodTags: [],
    createdByMembershipId: "membership-member",
    createdByName: "小林",
    createdAt: "2026-07-14T18:00:00.000Z",
    updatedAt: "2026-07-14T18:00:00.000Z",
    ...overrides
  };
}

function restaurant(
  overrides: Partial<RestaurantSummary> = {}
): RestaurantSummary {
  return {
    id: "restaurant-1",
    groupId: "group-1",
    name: "巷口砂锅",
    area: "A 楼底商",
    cuisine: "砂锅",
    distanceMinutes: 6,
    supportsDineIn: true,
    supportsTakeout: true,
    tags: ["热乎"],
    status: "active",
    createdByMembershipId: "membership-member",
    createdByName: "小林",
    createdAt: "2026-07-14T18:00:00.000Z",
    updatedAt: "2026-07-14T18:00:00.000Z",
    recommendations: [recommendation()],
    ...overrides
  };
}

function group(role: "admin" | "member", membershipId: string): GroupSummary {
  return {
    groupId: "group-1",
    name: "设计组",
    role,
    membershipId
  };
}

const createEntryInput: CreateRestaurantEntryInput = {
  restaurant: {
    name: "新餐厅",
    area: "B 楼",
    cuisine: "面食"
  },
  dish: "牛肉面",
  reason: "出餐快",
  weatherTags: [],
  weekdayTags: [],
  moodTags: ["赶时间"]
};

function restaurantMutation(id = "restaurant-new"): RestaurantMutationResponse {
  return {
    groupId: "group-1",
    restaurant: restaurant({ id, name: "新餐厅", recommendations: [] })
  };
}

function recommendationMutation(): RecommendationMutationResponse {
  return {
    groupId: "group-1",
    recommendation: recommendation({
      id: "recommendation-new",
      restaurantId: "restaurant-new"
    })
  };
}

describe("restaurant model", () => {
  it("filters by normalized search, cuisine, and status", () => {
    const restaurants = [
      restaurant(),
      restaurant({ id: "restaurant-2", name: "楼下轻食", cuisine: "轻食", status: "paused" })
    ];

    expect(filterRestaurants(restaurants, {
      query: "A楼",
      cuisine: "砂锅",
      status: "active"
    })).toEqual([expect.objectContaining({ id: "restaurant-1" })]);
  });

  it("warns on normalized same name and area without blocking", () => {
    expect(findDuplicateRestaurant([restaurant()], {
      name: " 巷口砂锅 ",
      area: "a 楼底商"
    })).toMatchObject({ id: "restaurant-1" });
  });

  it("derives member and admin controls from role and ownership", () => {
    const owned = restaurant();
    const other = restaurant({
      id: "restaurant-2",
      createdByMembershipId: "membership-other",
      recommendations: [recommendation({ createdByMembershipId: "membership-other" })]
    });
    const memberGroup = group("member", "membership-member");
    const adminGroup = group("admin", "membership-admin");

    expect(restaurantPermissions(memberGroup, owned)).toEqual({
      canEdit: true,
      canManageStatus: false
    });
    expect(restaurantPermissions(memberGroup, other)).toEqual({
      canEdit: false,
      canManageStatus: false
    });
    expect(restaurantPermissions(adminGroup, other)).toEqual({
      canEdit: true,
      canManageStatus: true
    });
    expect(recommendationPermissions(memberGroup, owned.recommendations[0]!)).toEqual({
      canEdit: true
    });
    expect(recommendationPermissions(memberGroup, other.recommendations[0]!)).toEqual({
      canEdit: false
    });
  });

  it("retries only recommendation creation after partial success", async () => {
    const createRestaurant = vi.fn().mockResolvedValue(restaurantMutation());
    const createRecommendation = vi.fn()
      .mockRejectedValueOnce(new Error("recommendation failed"))
      .mockResolvedValueOnce(recommendationMutation());
    const controller = createRestaurantEntryController({
      createRestaurant,
      createRecommendation
    });

    const first = await controller.submit(createEntryInput);
    const second = await controller.retryRecommendation();

    expect(first).toMatchObject({
      kind: "recommendation-error",
      restaurantId: "restaurant-new"
    });
    expect(second).toEqual({ kind: "complete", restaurantId: "restaurant-new" });
    expect(createRestaurant).toHaveBeenCalledTimes(1);
    expect(createRecommendation).toHaveBeenCalledTimes(2);
  });

  it("does not attempt a recommendation when restaurant creation fails", async () => {
    const createRecommendation = vi.fn();
    const controller = createRestaurantEntryController({
      createRestaurant: vi.fn().mockRejectedValue(new Error("restaurant failed")),
      createRecommendation
    });

    expect(await controller.submit(createEntryInput)).toEqual({
      kind: "restaurant-error",
      message: "餐厅没有保存，请重试。"
    });
    expect(createRecommendation).not.toHaveBeenCalled();
  });
});
