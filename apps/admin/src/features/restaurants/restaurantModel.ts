import type {
  CreateRecommendationRequest,
  CreateRestaurantRequest,
  GroupSummary,
  RecommendationMutationResponse,
  RecommendationSummary,
  RestaurantMutationResponse,
  RestaurantStatus,
  RestaurantSummary,
  WeatherTag,
  WeekdayTag
} from "@lunch/shared";

export interface RestaurantFilter {
  query: string;
  cuisine: string;
  status: "all" | RestaurantStatus;
}

export function normalizeRestaurantText(value?: string): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

export function filterRestaurants(
  restaurants: RestaurantSummary[],
  filter: RestaurantFilter
): RestaurantSummary[] {
  const query = normalizeRestaurantText(filter.query);
  return restaurants.filter((restaurant) => {
    const searchable = [
      restaurant.name,
      restaurant.area,
      restaurant.cuisine,
      ...restaurant.recommendations.flatMap((recommendation) => [
        recommendation.dish,
        recommendation.reason
      ])
    ].map(normalizeRestaurantText).join("|");
    return (!query || searchable.includes(query))
      && (!filter.cuisine || restaurant.cuisine === filter.cuisine)
      && (filter.status === "all" || restaurant.status === filter.status);
  });
}

export function findDuplicateRestaurant(
  restaurants: RestaurantSummary[],
  input: { name: string; area?: string | undefined }
): RestaurantSummary | undefined {
  const name = normalizeRestaurantText(input.name);
  const area = normalizeRestaurantText(input.area);
  return restaurants.find((restaurant) =>
    normalizeRestaurantText(restaurant.name) === name
    && normalizeRestaurantText(restaurant.area) === area
  );
}

export function restaurantPermissions(
  group: GroupSummary,
  restaurant: RestaurantSummary
) {
  return {
    canEdit: group.role === "admin"
      || restaurant.createdByMembershipId === group.membershipId,
    canManageStatus: group.role === "admin"
  };
}

export function recommendationPermissions(
  group: GroupSummary,
  recommendation: RecommendationSummary
) {
  return {
    canEdit: group.role === "admin"
      || recommendation.createdByMembershipId === group.membershipId
  };
}

export interface CreateRestaurantEntryInput {
  restaurant: CreateRestaurantRequest;
  dish: string;
  reason: string;
  weatherTags: WeatherTag[];
  weekdayTags: WeekdayTag[];
  moodTags: string[];
}

export type RestaurantEntryState =
  | { kind: "idle" }
  | { kind: "submitting-restaurant" }
  | { kind: "submitting-recommendation"; restaurantId: string }
  | { kind: "restaurant-error"; message: string }
  | { kind: "recommendation-error"; restaurantId: string; message: string }
  | { kind: "complete"; restaurantId: string };

export function createRestaurantEntryController(dependencies: {
  createRestaurant: (
    input: CreateRestaurantRequest
  ) => Promise<RestaurantMutationResponse>;
  createRecommendation: (
    input: CreateRecommendationRequest
  ) => Promise<RecommendationMutationResponse>;
}) {
  let state: RestaurantEntryState = { kind: "idle" };
  let pendingRecommendation: CreateRecommendationRequest | null = null;

  async function saveRecommendation(input: CreateRecommendationRequest) {
    state = {
      kind: "submitting-recommendation",
      restaurantId: input.restaurantId
    };
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

  async function submit(input: CreateRestaurantEntryInput) {
    state = { kind: "submitting-restaurant" };
    pendingRecommendation = null;
    try {
      const response = await dependencies.createRestaurant(input.restaurant);
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

  async function retryRecommendation() {
    if (!pendingRecommendation) {
      throw new Error("restaurant_entry_retry_unavailable");
    }
    return saveRecommendation(pendingRecommendation);
  }

  return {
    submit,
    retryRecommendation,
    getState: () => state
  };
}
