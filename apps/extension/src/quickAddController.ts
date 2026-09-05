import {
  createRestaurantEntryRecoveryController,
  type CreateRecommendationRequest,
  type CreateRestaurantRequest,
  type RecommendationMutationResponse,
  type RestaurantEntryRecoveryState,
  type RestaurantListResponse,
  type RestaurantMutationResponse
} from "@lunch/shared";

export type QuickAddState = RestaurantEntryRecoveryState;

export interface QuickAddInput {
  name: string;
  address?: string | undefined;
  area?: string | undefined;
  cuisine?: string | undefined;
  averagePriceCents?: number | undefined;
  distanceMinutes?: number | undefined;
  tags: string[];
  recommendation?: Omit<CreateRecommendationRequest, "restaurantId"> | undefined;
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
          ...(input.address?.trim() ? { address: input.address } : {}),
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
        ...(input.recommendation
          ? { recommendation: input.recommendation }
          : {})
      });
    },
    retry: controller.retry,
    recheck: controller.recheck,
    getState: controller.getState
  };
}
