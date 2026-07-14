import {
  GROUP_ROUTES,
  type CreateRecommendationRequest,
  type CreateRestaurantRequest,
  type PatchRecommendationRequest,
  type PatchRestaurantRequest,
  type RecommendationMutationResponse,
  type RestaurantListResponse,
  type RestaurantMutationResponse
} from "@lunch/shared";
import { requestJson } from "../api";
import type { AdminGroupContext } from "./today";

export function listRestaurants(context: AdminGroupContext) {
  return requestJson<RestaurantListResponse>(
    GROUP_ROUTES.restaurants(context.groupId),
    context
  );
}

export function createRestaurant(
  context: AdminGroupContext,
  input: CreateRestaurantRequest
) {
  return requestJson<RestaurantMutationResponse>(
    GROUP_ROUTES.restaurants(context.groupId),
    context,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function patchRestaurant(
  context: AdminGroupContext,
  restaurantId: string,
  input: PatchRestaurantRequest
) {
  return requestJson<RestaurantMutationResponse>(
    GROUP_ROUTES.restaurant(context.groupId, restaurantId),
    context,
    { method: "PATCH", body: JSON.stringify(input) }
  );
}

export function createRecommendation(
  context: AdminGroupContext,
  input: CreateRecommendationRequest
) {
  return requestJson<RecommendationMutationResponse>(
    GROUP_ROUTES.recommendations(context.groupId),
    context,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function patchRecommendation(
  context: AdminGroupContext,
  recommendationId: string,
  input: PatchRecommendationRequest
) {
  return requestJson<RecommendationMutationResponse>(
    GROUP_ROUTES.recommendation(context.groupId, recommendationId),
    context,
    { method: "PATCH", body: JSON.stringify(input) }
  );
}
