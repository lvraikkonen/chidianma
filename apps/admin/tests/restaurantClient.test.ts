import type {
  RecommendationMutationResponse,
  RestaurantListResponse,
  RestaurantMutationResponse
} from "@lunch/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRecommendation,
  createRestaurant,
  listRestaurants,
  patchRecommendation,
  patchRestaurant
} from "../src/clients/restaurants";
import type { AdminGroupContext } from "../src/clients/today";

function restaurantMutation(): RestaurantMutationResponse {
  return {
    groupId: "group-1",
    restaurant: {
      id: "restaurant-1",
      groupId: "group-1",
      name: "巷口砂锅",
      supportsDineIn: true,
      supportsTakeout: true,
      tags: [],
      status: "active",
      createdAt: "2026-07-14T18:00:00.000Z",
      updatedAt: "2026-07-14T18:00:00.000Z",
      recommendations: []
    }
  };
}

function recommendationMutation(): RecommendationMutationResponse {
  return {
    groupId: "group-1",
    recommendation: {
      id: "recommendation-1",
      groupId: "group-1",
      restaurantId: "restaurant-1",
      dish: "番茄肥牛砂锅",
      reason: "热乎，出餐快",
      weatherTags: [],
      weekdayTags: [],
      moodTags: [],
      createdAt: "2026-07-14T18:00:00.000Z",
      updatedAt: "2026-07-14T18:00:00.000Z"
    }
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("restaurant client", () => {
  it("uses exact group routes and only the captured group session", async () => {
    const list: RestaurantListResponse = {
      groupId: "group-1",
      restaurants: [restaurantMutation().restaurant]
    };
    const responses = [
      list,
      restaurantMutation(),
      restaurantMutation(),
      recommendationMutation(),
      recommendationMutation()
    ];
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => responses.shift()
    }));
    vi.stubGlobal("fetch", fetchMock);
    const context: AdminGroupContext = {
      apiBaseUrl: "https://lunch.example",
      groupId: "group-1",
      token: "group-session-token"
    };

    await listRestaurants(context);
    await createRestaurant(context, { name: "巷口砂锅" });
    await patchRestaurant(context, "restaurant-1", { area: "A 楼底商" });
    await createRecommendation(context, {
      restaurantId: "restaurant-1",
      reason: "热乎，出餐快"
    });
    await patchRecommendation(context, "recommendation-1", { reason: "雨天很合适" });

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ["https://lunch.example/api/groups/group-1/restaurants", undefined],
      ["https://lunch.example/api/groups/group-1/restaurants", "POST"],
      ["https://lunch.example/api/groups/group-1/restaurants/restaurant-1", "PATCH"],
      ["https://lunch.example/api/groups/group-1/recommendations", "POST"],
      ["https://lunch.example/api/groups/group-1/recommendations/recommendation-1", "PATCH"]
    ]);
    expect(fetchMock.mock.calls.every(([, init]) =>
      (init?.headers as Record<string, string>).authorization === "Bearer group-session-token"
    )).toBe(true);
  });
});
