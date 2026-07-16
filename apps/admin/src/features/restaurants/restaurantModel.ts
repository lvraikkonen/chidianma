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
import {
  createRestaurantEntryRecoveryController,
  type RestaurantEntryRecoveryState,
  type RestaurantListResponse
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

export type RestaurantEntryState = RestaurantEntryRecoveryState;

export function createRestaurantEntryController(dependencies: {
  membershipId: string;
  listRestaurants: () => Promise<RestaurantListResponse>;
  createRestaurant: (
    input: CreateRestaurantRequest
  ) => Promise<RestaurantMutationResponse>;
  createRecommendation: (
    input: CreateRecommendationRequest
  ) => Promise<RecommendationMutationResponse>;
}) {
  const controller = createRestaurantEntryRecoveryController(dependencies);

  async function submit(input: CreateRestaurantEntryInput) {
    return controller.submit({
      restaurant: input.restaurant,
      recommendation: {
        dish: input.dish.trim(),
        reason: input.reason.trim(),
        weatherTags: input.weatherTags,
        weekdayTags: input.weekdayTags,
        moodTags: input.moodTags
      }
    });
  }

  return {
    submit,
    retry: controller.retry,
    recheck: controller.recheck,
    getState: controller.getState
  };
}
