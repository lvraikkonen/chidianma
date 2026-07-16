import {
  createRestaurantEntryRecoveryController,
  type CreateRecommendationRequest,
  type CreateRestaurantRequest,
  type RecommendationMutationResponse,
  type RestaurantEntryRecoveryState,
  type RestaurantListResponse,
  type RestaurantMutationResponse,
  type WeatherTag,
  type WeekdayTag
} from "@lunch/shared";

export type QuickAddState = RestaurantEntryRecoveryState;

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

  return {
    submit(input: QuickAddInput) {
      return controller.submit({
        restaurant: {
          name: input.name,
          ...(input.area?.trim() ? { area: input.area } : {}),
          ...(input.cuisine?.trim() ? { cuisine: input.cuisine } : {}),
          ...(input.averagePriceCents === undefined
            ? {}
            : { averagePriceCents: input.averagePriceCents }),
          ...(input.distanceMinutes === undefined
            ? {}
            : { distanceMinutes: input.distanceMinutes }),
          tags: input.tags
        },
        recommendation: {
          dish: input.dish,
          reason: input.reason,
          weatherTags: input.weatherTags,
          weekdayTags: input.weekdayTags,
          moodTags: input.moodTags
        }
      });
    },
    retry: controller.retry,
    recheck: controller.recheck,
    getState: controller.getState
  };
}
