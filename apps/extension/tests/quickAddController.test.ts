import { describe, expect, it, vi } from "vitest";
import { createQuickAddController } from "../src/quickAddController";

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

describe("extension quick add controller", () => {
  it("creates the restaurant before its first recommendation", async () => {
    const createRestaurant = vi.fn().mockResolvedValue({
      restaurant: { id: "restaurant-1" }
    });
    const createRecommendation = vi.fn().mockResolvedValue({
      recommendation: { id: "recommendation-1" }
    });
    const controller = createQuickAddController({ createRestaurant, createRecommendation });

    await expect(controller.submit(input)).resolves.toMatchObject({ kind: "complete" });
    expect(createRecommendation).toHaveBeenCalledWith(expect.objectContaining({
      restaurantId: "restaurant-1",
      dish: "番茄肥牛砂锅"
    }));
  });

  it("does not call recommendation creation when restaurant creation fails", async () => {
    const createRecommendation = vi.fn();
    const controller = createQuickAddController({
      createRestaurant: vi.fn().mockRejectedValue(new Error("restaurant failed")),
      createRecommendation
    });

    await expect(controller.submit(input)).resolves.toMatchObject({ kind: "restaurant-error" });
    expect(createRecommendation).not.toHaveBeenCalled();
  });

  it("retries only the recommendation after partial success", async () => {
    const createRestaurant = vi.fn().mockResolvedValue({ restaurant: { id: "restaurant-1" } });
    const createRecommendation = vi.fn()
      .mockRejectedValueOnce(new Error("recommendation failed"))
      .mockResolvedValueOnce({ recommendation: { id: "recommendation-1" } });
    const controller = createQuickAddController({ createRestaurant, createRecommendation });

    await expect(controller.submit(input)).resolves.toMatchObject({
      kind: "recommendation-error",
      restaurantId: "restaurant-1"
    });
    await expect(controller.retryRecommendation()).resolves.toMatchObject({ kind: "complete" });
    expect(createRestaurant).toHaveBeenCalledTimes(1);
    expect(createRecommendation).toHaveBeenCalledTimes(2);
  });
});
