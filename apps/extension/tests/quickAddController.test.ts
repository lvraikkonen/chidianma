import { describe, expect, it, vi } from "vitest";
import { createQuickAddController } from "../src/quickAddController";
import type { RestaurantSummary } from "@lunch/shared";

const input = {
  name: "巷口砂锅",
  area: "A 楼底商",
  cuisine: "砂锅",
  averagePriceCents: 2800,
  distanceMinutes: 6,
  tags: ["热乎", "近"],
  dish: "番茄肥牛砂锅",
  reason: "下雨天热乎且离得近",
  weatherTags: ["rainy" as const],
  weekdayTags: ["friday" as const],
  moodTags: ["热乎"]
};

function restaurant(
  recommendations: RestaurantSummary["recommendations"] = []
): RestaurantSummary {
  return {
    id: "restaurant-1",
    groupId: "group-1",
    name: "巷口砂锅",
    area: "A 楼底商",
    cuisine: "砂锅",
    averagePriceCents: 2800,
    distanceMinutes: 6,
    supportsDineIn: true,
    supportsTakeout: false,
    tags: ["热乎", "近"],
    status: "active",
    createdByMembershipId: "membership-1",
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    recommendations
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    membershipId: "membership-1",
    listRestaurants: vi.fn().mockResolvedValue({
      groupId: "group-1",
      restaurants: []
    }),
    createRestaurant: vi.fn().mockResolvedValue({
      groupId: "group-1",
      restaurant: restaurant()
    }),
    createRecommendation: vi.fn().mockResolvedValue({
      groupId: "group-1",
      recommendation: {
        id: "recommendation-1",
        groupId: "group-1",
        restaurantId: "restaurant-1",
        dish: input.dish,
        reason: input.reason,
        weatherTags: input.weatherTags,
        weekdayTags: input.weekdayTags,
        moodTags: input.moodTags,
        createdByMembershipId: "membership-1",
        createdAt: "2026-07-16T00:00:00.000Z",
        updatedAt: "2026-07-16T00:00:00.000Z"
      }
    }),
    ...overrides
  };
}

describe("extension quick add controller", () => {
  it("creates the restaurant before its first recommendation", async () => {
    const deps = dependencies();
    const controller = createQuickAddController(deps);

    await expect(controller.submit(input)).resolves.toMatchObject({ kind: "complete" });
    expect(deps.createRecommendation).toHaveBeenCalledWith(expect.objectContaining({
      restaurantId: "restaurant-1",
      dish: "番茄肥牛砂锅"
    }));
  });

  it("does not call recommendation creation when restaurant creation fails", async () => {
    const createRecommendation = vi.fn();
    const controller = createQuickAddController(dependencies({
      listRestaurants: vi.fn()
        .mockResolvedValueOnce({ groupId: "group-1", restaurants: [] })
        .mockResolvedValueOnce({ groupId: "group-1", restaurants: [] }),
      createRestaurant: vi.fn().mockRejectedValue(new Error("restaurant failed")),
      createRecommendation
    }));

    await expect(controller.submit(input)).resolves.toMatchObject({
      kind: "recovery",
      target: "restaurant",
      verdict: "confirmed-missing"
    });
    expect(createRecommendation).not.toHaveBeenCalled();
  });

  it("retries only the recommendation after partial success", async () => {
    const createRestaurant = vi.fn().mockResolvedValue({
      groupId: "group-1",
      restaurant: restaurant()
    });
    const createRecommendation = vi.fn()
      .mockRejectedValueOnce(new Error("recommendation failed"))
      .mockResolvedValueOnce({
        groupId: "group-1",
        recommendation: { id: "recommendation-1" }
      });
    const controller = createQuickAddController(dependencies({
      listRestaurants: vi.fn()
        .mockResolvedValueOnce({ groupId: "group-1", restaurants: [] })
        .mockResolvedValueOnce({
          groupId: "group-1",
          restaurants: [restaurant()]
        }),
      createRestaurant,
      createRecommendation
    }));

    await expect(controller.submit(input)).resolves.toMatchObject({
      kind: "recovery",
      target: "recommendation",
      verdict: "confirmed-missing",
      restaurantId: "restaurant-1"
    });
    await expect(controller.retry()).resolves.toMatchObject({ kind: "complete" });
    expect(createRestaurant).toHaveBeenCalledTimes(1);
    expect(createRecommendation).toHaveBeenCalledTimes(2);
  });
});
