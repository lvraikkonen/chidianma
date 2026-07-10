import type {
  CreateRecommendationRequest,
  CreateRestaurantRequest,
  RecommendationMutationResponse,
  RestaurantMutationResponse,
  WeatherTag,
  WeekdayTag
} from "@lunch/shared";

export type QuickAddState =
  | { kind: "idle" }
  | { kind: "submitting-restaurant" }
  | { kind: "submitting-recommendation"; restaurantId: string }
  | { kind: "restaurant-error"; message: string }
  | { kind: "recommendation-error"; restaurantId: string; message: string }
  | { kind: "complete"; restaurantId: string };

export interface QuickAddInput {
  name: string;
  area?: string | undefined;
  cuisine?: string | undefined;
  averagePriceCents?: number | undefined;
  distanceMinutes?: number | undefined;
  tags: string[];
  dish: string;
  reason: string;
  weatherTags: WeatherTag[];
  weekdayTags: WeekdayTag[];
  moodTags: string[];
}

export function createQuickAddController(dependencies: {
  createRestaurant: (input: CreateRestaurantRequest) => Promise<RestaurantMutationResponse>;
  createRecommendation: (input: CreateRecommendationRequest) => Promise<RecommendationMutationResponse>;
}) {
  let state: QuickAddState = { kind: "idle" };
  let pendingRecommendation: CreateRecommendationRequest | null = null;

  async function saveRecommendation(input: CreateRecommendationRequest): Promise<QuickAddState> {
    state = { kind: "submitting-recommendation", restaurantId: input.restaurantId };
    try {
      await dependencies.createRecommendation(input);
      pendingRecommendation = null;
      state = { kind: "complete", restaurantId: input.restaurantId };
    } catch {
      pendingRecommendation = input;
      state = {
        kind: "recommendation-error",
        restaurantId: input.restaurantId,
        message: "餐厅已保存，推荐尚未保存。"
      };
    }
    return state;
  }

  async function submit(input: QuickAddInput): Promise<QuickAddState> {
    state = { kind: "submitting-restaurant" };
    pendingRecommendation = null;
    try {
      const response = await dependencies.createRestaurant({
        name: input.name.trim(),
        ...(input.area?.trim() ? { area: input.area.trim() } : {}),
        ...(input.cuisine?.trim() ? { cuisine: input.cuisine.trim() } : {}),
        ...(input.averagePriceCents === undefined ? {} : { averagePriceCents: input.averagePriceCents }),
        ...(input.distanceMinutes === undefined ? {} : { distanceMinutes: input.distanceMinutes }),
        tags: input.tags
      });
      return saveRecommendation({
        restaurantId: response.restaurant.id,
        dish: input.dish.trim(),
        reason: input.reason.trim(),
        weatherTags: input.weatherTags,
        weekdayTags: input.weekdayTags,
        moodTags: input.moodTags
      });
    } catch {
      state = { kind: "restaurant-error", message: "餐厅没有保存，请重试。" };
      return state;
    }
  }

  async function retryRecommendation(): Promise<QuickAddState> {
    if (!pendingRecommendation) throw new Error("quick_add_retry_unavailable");
    return saveRecommendation(pendingRecommendation);
  }

  return { submit, retryRecommendation, getState: () => state };
}
