import type {
  RecommendationSummary,
  RestaurantSummary
} from "../src/types";
import { describe, expect, it, vi } from "vitest";
import {
  createRestaurantEntryRecoveryController,
  type RestaurantEntrySubmission
} from "../src/entryRecovery";

const membershipId = "membership-1";
const submission: RestaurantEntrySubmission = {
  restaurant: {
    name: " 新餐厅 ",
    area: " B 楼 ",
    cuisine: "面食",
    tags: ["近", "近"]
  },
  recommendation: {
    dish: " 牛肉面 ",
    reason: " 出餐快 ",
    weatherTags: [],
    weekdayTags: [],
    moodTags: ["赶时间"]
  }
};

function recommendation(
  overrides: Partial<RecommendationSummary> = {}
): RecommendationSummary {
  return {
    id: "recommendation-1",
    groupId: "group-1",
    restaurantId: "restaurant-new",
    dish: "牛肉面",
    reason: "出餐快",
    weatherTags: [],
    weekdayTags: [],
    moodTags: ["赶时间"],
    createdByMembershipId: membershipId,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    ...overrides
  };
}

function restaurant(
  overrides: Partial<RestaurantSummary> = {}
): RestaurantSummary {
  return {
    id: "restaurant-new",
    groupId: "group-1",
    name: "新餐厅",
    area: "B 楼",
    cuisine: "面食",
    supportsDineIn: true,
    supportsTakeout: false,
    tags: ["近"],
    status: "active",
    createdByMembershipId: membershipId,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    recommendations: [],
    ...overrides
  };
}

function list(restaurants: RestaurantSummary[]) {
  return { groupId: "group-1", restaurants };
}

function controller(overrides: Partial<Parameters<
  typeof createRestaurantEntryRecoveryController
>[0]> = {}) {
  return createRestaurantEntryRecoveryController({
    membershipId,
    listRestaurants: vi.fn()
      .mockResolvedValueOnce(list([]))
      .mockResolvedValue(list([])),
    createRestaurant: vi.fn().mockResolvedValue({
      groupId: "group-1",
      restaurant: restaurant()
    }),
    createRecommendation: vi.fn().mockResolvedValue({
      groupId: "group-1",
      recommendation: recommendation()
    }),
    ...overrides
  });
}

describe("restaurant entry lost-response recovery", () => {
  it("completes the normal two-step write", async () => {
    await expect(controller().submit(submission)).resolves.toEqual({
      kind: "complete",
      restaurantId: "restaurant-new"
    });
  });

  it("continues with one newly persisted restaurant after a lost response", async () => {
    const createRestaurant = vi.fn().mockRejectedValue(new Error("lost response"));
    const createRecommendation = vi.fn().mockResolvedValue({
      groupId: "group-1",
      recommendation: recommendation()
    });
    const subject = controller({
      listRestaurants: vi.fn()
        .mockResolvedValueOnce(list([]))
        .mockResolvedValueOnce(list([restaurant()])),
      createRestaurant,
      createRecommendation
    });

    await expect(subject.submit(submission)).resolves.toEqual({
      kind: "complete",
      restaurantId: "restaurant-new"
    });
    expect(createRestaurant).toHaveBeenCalledOnce();
    expect(createRecommendation).toHaveBeenCalledOnce();
  });

  it("confirms a lost recommendation response without a duplicate POST", async () => {
    const createRecommendation = vi.fn().mockRejectedValue(new Error("lost response"));
    const subject = controller({
      listRestaurants: vi.fn()
        .mockResolvedValueOnce(list([]))
        .mockResolvedValueOnce(list([
          restaurant({ recommendations: [recommendation()] })
        ])),
      createRecommendation
    });

    await expect(subject.submit(submission)).resolves.toEqual({
      kind: "complete",
      restaurantId: "restaurant-new"
    });
    expect(createRecommendation).toHaveBeenCalledOnce();
  });

  it("allows a safe retry only after confirming the recommendation is missing", async () => {
    const createRecommendation = vi.fn()
      .mockRejectedValueOnce(new Error("not saved"))
      .mockResolvedValueOnce({
        groupId: "group-1",
        recommendation: recommendation()
      });
    const subject = controller({
      listRestaurants: vi.fn()
        .mockResolvedValueOnce(list([]))
        .mockResolvedValueOnce(list([restaurant()])),
      createRecommendation
    });

    await expect(subject.submit(submission)).resolves.toMatchObject({
      kind: "recovery",
      target: "recommendation",
      verdict: "confirmed-missing"
    });
    await expect(subject.retry()).resolves.toEqual({
      kind: "complete",
      restaurantId: "restaurant-new"
    });
    expect(createRecommendation).toHaveBeenCalledTimes(2);
  });

  it("allows a safe restaurant retry only after confirming the first POST did not persist", async () => {
    const createRestaurant = vi.fn()
      .mockRejectedValueOnce(new Error("not saved"))
      .mockResolvedValueOnce({
        groupId: "group-1",
        restaurant: restaurant()
      });
    const subject = controller({
      listRestaurants: vi.fn()
        .mockResolvedValueOnce(list([]))
        .mockResolvedValueOnce(list([]))
        .mockResolvedValueOnce(list([])),
      createRestaurant
    });

    await expect(subject.submit(submission)).resolves.toMatchObject({
      kind: "recovery",
      target: "restaurant",
      verdict: "confirmed-missing"
    });
    await expect(subject.retry()).resolves.toEqual({
      kind: "complete",
      restaurantId: "restaurant-new"
    });
    expect(createRestaurant).toHaveBeenCalledTimes(2);
  });

  it("blocks retry when reconciliation fails or has multiple candidates", async () => {
    const readFailure = controller({
      listRestaurants: vi.fn()
        .mockResolvedValueOnce(list([]))
        .mockRejectedValueOnce(new Error("offline")),
      createRestaurant: vi.fn().mockRejectedValue(new Error("unknown"))
    });
    await expect(readFailure.submit(submission)).resolves.toMatchObject({
      kind: "recovery",
      verdict: "uncertain"
    });
    await expect(readFailure.retry()).rejects.toThrow(
      "entry_recovery_retry_unavailable"
    );

    const multiple = controller({
      listRestaurants: vi.fn()
        .mockResolvedValueOnce(list([]))
        .mockResolvedValueOnce(list([
          restaurant({ id: "restaurant-a" }),
          restaurant({ id: "restaurant-b" })
        ])),
      createRestaurant: vi.fn().mockRejectedValue(new Error("unknown"))
    });
    await expect(multiple.submit(submission)).resolves.toMatchObject({
      kind: "recovery",
      verdict: "uncertain"
    });
  });

  it("does not treat another membership's matching write as this operation", async () => {
    const subject = controller({
      listRestaurants: vi.fn()
        .mockResolvedValueOnce(list([]))
        .mockResolvedValueOnce(list([
          restaurant({ createdByMembershipId: "membership-other" })
        ])),
      createRestaurant: vi.fn().mockRejectedValue(new Error("unknown"))
    });

    await expect(subject.submit(submission)).resolves.toMatchObject({
      kind: "recovery",
      target: "restaurant",
      verdict: "confirmed-missing"
    });
  });

  it("does not confirm another membership's matching recommendation", async () => {
    const createRecommendation = vi.fn().mockRejectedValue(new Error("unknown"));
    const subject = controller({
      listRestaurants: vi.fn()
        .mockResolvedValueOnce(list([]))
        .mockResolvedValueOnce(list([
          restaurant({
            recommendations: [
              recommendation({ createdByMembershipId: "membership-other" })
            ]
          })
        ])),
      createRecommendation
    });

    await expect(subject.submit(submission)).resolves.toMatchObject({
      kind: "recovery",
      target: "recommendation",
      verdict: "confirmed-missing"
    });
    expect(createRecommendation).toHaveBeenCalledOnce();
  });

  it("matches trimmed strings and de-duplicated tag sets after a lost response", async () => {
    const persisted = restaurant({
      name: " 新餐厅 ",
      area: "B   楼",
      tags: ["近", "近"],
      recommendations: [
        recommendation({
          dish: "牛肉面 ",
          reason: " 出餐快",
          moodTags: ["赶时间", "赶时间"]
        })
      ]
    });
    const subject = controller({
      listRestaurants: vi.fn()
        .mockResolvedValueOnce(list([]))
        .mockResolvedValueOnce(list([persisted]))
        .mockResolvedValueOnce(list([persisted])),
      createRestaurant: vi.fn().mockRejectedValue(new Error("lost response")),
      createRecommendation: vi.fn().mockRejectedValue(new Error("lost response"))
    });

    await expect(subject.submit(submission)).resolves.toEqual({
      kind: "complete",
      restaurantId: "restaurant-new"
    });
  });

  it("stops before POST when a same-name same-area restaurant already exists", async () => {
    const createRestaurant = vi.fn();
    const subject = controller({
      listRestaurants: vi.fn().mockResolvedValue(list([
        restaurant({ id: "existing" })
      ])),
      createRestaurant
    });

    await expect(subject.submit(submission)).resolves.toMatchObject({
      kind: "recovery",
      target: "restaurant",
      verdict: "uncertain"
    });
    expect(createRestaurant).not.toHaveBeenCalled();
  });
});
