import type {
  CreateRecommendationRequest,
  CreateRestaurantRequest,
  PatchRecommendationRequest,
  PatchRestaurantRequest,
  RecommendationMutationResponse,
  RestaurantMutationResponse,
  RestaurantSummary
} from "@lunch/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppEnv } from "../env.js";
import { prisma } from "../plugins/prisma.js";
import { AuthError } from "../services/auth/errors.js";
import { requireActiveMembership } from "../services/groups/memberships.js";

type IncludedRecommendation = {
  id: string;
  groupId: string;
  restaurantId: string;
  dish: string | null;
  reason: string;
  weatherTags: string[];
  weekdayTags: string[];
  moodTags: string[];
  createdByMembershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type IncludedRestaurant = {
  id: string;
  groupId: string;
  name: string;
  area: string | null;
  address: string | null;
  distanceMinutes: number | null;
  cuisine: string | null;
  priceBand: string | null;
  averagePriceCents: number | null;
  supportsDineIn: boolean;
  supportsTakeout: boolean;
  tags: string[];
  status: "active" | "paused" | "blocked";
  createdByMembershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
  recommendations?: IncludedRecommendation[];
};

const restaurantInclude = {
  recommendations: {
    orderBy: { createdAt: "desc" as const }
  }
};

class ValidationError extends Error {
  constructor(
    public readonly error: string,
    message: string
  ) {
    super(message);
  }
}

const restaurantStatuses = new Set(["active", "paused", "blocked"]);
const weatherTags = new Set(["rainy", "hot", "cold", "clear", "windy"]);
const weekdayTags = new Set(["monday", "tuesday", "wednesday", "thursday", "friday"]);

function membershipAuthInput(groupId: string, authorization: string | undefined) {
  return authorization ? { groupId, authorization } : { groupId };
}

function sendAuthError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError) {
    const statusCode = error.code === "unauthorized" ? 401 : error.code === "forbidden" ? 403 : 400;
    reply.code(statusCode);
    return { error: error.error, message: error.message };
  }
  if (error instanceof ValidationError) {
    reply.code(400);
    return { error: error.error, message: error.message };
  }
  throw error;
}

function requiredString(body: unknown, field: string): string {
  const value = body && typeof body === "object" ? (body as Record<string, unknown>)[field] : undefined;
  return typeof value === "string" ? value.trim() : "";
}

function requiredNonBlankString(body: unknown, field: string, error: string, message: string): string {
  const value = requiredString(body, field);
  if (!value) {
    throw new ValidationError(error, message);
  }
  return value;
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new ValidationError("invalid_string_field", "String field is invalid");
  }
  return value.trim() || null;
}

function optionalNonNegativeNumber(value: unknown, error: string, message: string): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ValidationError(error, message);
  }
  return value;
}

function optionalBoolean(value: unknown): boolean | undefined {
  if (value !== undefined && typeof value !== "boolean") {
    throw new ValidationError("invalid_boolean_field", "Boolean field is invalid");
  }
  return typeof value === "boolean" ? value : undefined;
}

function stringArray(value: unknown, error = "invalid_tags"): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ValidationError(error, "Tags must be an array of strings");
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function enumArray(value: unknown, allowed: Set<string>, error: string): string[] {
  const values = stringArray(value, error) ?? [];
  if (values.some((item) => !allowed.has(item))) {
    throw new ValidationError(error, "Tags include unsupported values");
  }
  return values;
}

function restaurantStatus(value: unknown): "active" | "paused" | "blocked" {
  if (typeof value !== "string" || !restaurantStatuses.has(value)) {
    throw new ValidationError("invalid_restaurant_status", "Restaurant status is invalid");
  }
  return value as "active" | "paused" | "blocked";
}

function restaurantPatchBody(body: unknown): PatchRestaurantRequest {
  return body && typeof body === "object" && !Array.isArray(body) ? (body as PatchRestaurantRequest) : {};
}

type RecommendationRow = IncludedRecommendation;

function moodTagArray(value: unknown): string[] {
  return stringArray(value, "invalid_tags") ?? [];
}

function weatherTagArray(value: unknown): string[] {
  return enumArray(value, weatherTags, "invalid_weather_tags");
}

function weekdayTagArray(value: unknown): string[] {
  return enumArray(value, weekdayTags, "invalid_weekday_tags");
}

function toRecommendationSummary(recommendation: IncludedRecommendation) {
  return {
    id: recommendation.id,
    groupId: recommendation.groupId,
    restaurantId: recommendation.restaurantId,
    ...(recommendation.dish ? { dish: recommendation.dish } : {}),
    reason: recommendation.reason,
    weatherTags: recommendation.weatherTags,
    weekdayTags: recommendation.weekdayTags,
    moodTags: recommendation.moodTags,
    ...(recommendation.createdByMembershipId ? { createdByMembershipId: recommendation.createdByMembershipId } : {}),
    createdAt: recommendation.createdAt.toISOString(),
    updatedAt: recommendation.updatedAt.toISOString()
  };
}

function toRestaurantSummary(restaurant: IncludedRestaurant): RestaurantSummary {
  return {
    id: restaurant.id,
    groupId: restaurant.groupId,
    name: restaurant.name,
    ...(restaurant.area ? { area: restaurant.area } : {}),
    ...(restaurant.address ? { address: restaurant.address } : {}),
    ...(restaurant.distanceMinutes === null ? {} : { distanceMinutes: restaurant.distanceMinutes }),
    ...(restaurant.cuisine ? { cuisine: restaurant.cuisine } : {}),
    ...(restaurant.priceBand ? { priceBand: restaurant.priceBand } : {}),
    ...(restaurant.averagePriceCents === null ? {} : { averagePriceCents: restaurant.averagePriceCents }),
    supportsDineIn: restaurant.supportsDineIn,
    supportsTakeout: restaurant.supportsTakeout,
    tags: restaurant.tags,
    status: restaurant.status,
    ...(restaurant.createdByMembershipId ? { createdByMembershipId: restaurant.createdByMembershipId } : {}),
    createdAt: restaurant.createdAt.toISOString(),
    updatedAt: restaurant.updatedAt.toISOString(),
    recommendations: (restaurant.recommendations ?? []).map(toRecommendationSummary)
  };
}

function recommendationPatch(body: unknown) {
  const patch = body && typeof body === "object" && !Array.isArray(body) ? (body as PatchRecommendationRequest) : {};
  const data: Record<string, unknown> = {};
  if (patch.dish !== undefined) data.dish = optionalString(patch.dish);
  if (patch.reason !== undefined) {
    data.reason = requiredNonBlankString(
      patch,
      "reason",
      "recommendation_reason_required",
      "Recommendation reason is required"
    );
  }
  if (patch.weatherTags !== undefined) data.weatherTags = weatherTagArray(patch.weatherTags);
  if (patch.weekdayTags !== undefined) data.weekdayTags = weekdayTagArray(patch.weekdayTags);
  if (patch.moodTags !== undefined) data.moodTags = moodTagArray(patch.moodTags);
  return data;
}

async function findRestaurantForWrite(groupId: string, restaurantId: string) {
  return prisma.restaurant.findFirst({
    where: { id: restaurantId, groupId },
    include: restaurantInclude
  });
}

function buildRestaurantPatch(body: PatchRestaurantRequest, allowStatus: boolean) {
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    data.name = requiredNonBlankString(body, "name", "restaurant_name_required", "Restaurant name is required");
  }
  if (body.area !== undefined) data.area = optionalString(body.area);
  if (body.address !== undefined) data.address = optionalString(body.address);
  if (body.distanceMinutes !== undefined) {
    data.distanceMinutes = optionalNonNegativeNumber(
      body.distanceMinutes,
      "invalid_distance_minutes",
      "distanceMinutes must be a non-negative number"
    );
  }
  if (body.cuisine !== undefined) data.cuisine = optionalString(body.cuisine);
  if (body.priceBand !== undefined) data.priceBand = optionalString(body.priceBand);
  if (body.averagePriceCents !== undefined) {
    data.averagePriceCents = optionalNonNegativeNumber(
      body.averagePriceCents,
      "invalid_average_price_cents",
      "averagePriceCents must be a non-negative number"
    );
  }
  if (body.supportsDineIn !== undefined) data.supportsDineIn = optionalBoolean(body.supportsDineIn);
  if (body.supportsTakeout !== undefined) data.supportsTakeout = optionalBoolean(body.supportsTakeout);
  if (body.tags !== undefined) data.tags = stringArray(body.tags) ?? [];
  if (body.status !== undefined) {
    const status = restaurantStatus(body.status);
    if (allowStatus) data.status = status;
  }
  return data;
}

export async function registerGroupKnowledgeRoutes(app: FastifyInstance, env: AppEnv) {
  app.get<{ Params: { groupId: string } }>("/api/groups/:groupId/restaurants", async (request, reply) => {
    try {
      await requireActiveMembership({
        prisma,
        env,
        ...membershipAuthInput(request.params.groupId, request.headers.authorization)
      });
      const restaurants = await prisma.restaurant.findMany({
        where: { groupId: request.params.groupId },
        include: restaurantInclude,
        orderBy: { createdAt: "desc" }
      });
      return { groupId: request.params.groupId, restaurants: restaurants.map(toRestaurantSummary) };
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  app.post<{ Params: { groupId: string }; Body: CreateRestaurantRequest }>(
    "/api/groups/:groupId/restaurants",
    async (request, reply) => {
      try {
        const membership = await requireActiveMembership({
          prisma,
          env,
          ...membershipAuthInput(request.params.groupId, request.headers.authorization)
        });
        const name = requiredNonBlankString(
          request.body,
          "name",
          "restaurant_name_required",
          "Restaurant name is required"
        );
        const restaurant = await prisma.restaurant.create({
          data: {
            groupId: request.params.groupId,
            name,
            area: optionalString(request.body.area) ?? null,
            address: optionalString(request.body.address) ?? null,
            distanceMinutes:
              optionalNonNegativeNumber(
                request.body.distanceMinutes,
                "invalid_distance_minutes",
                "distanceMinutes must be a non-negative number"
              ) ?? null,
            cuisine: optionalString(request.body.cuisine) ?? null,
            priceBand: optionalString(request.body.priceBand) ?? null,
            averagePriceCents:
              optionalNonNegativeNumber(
                request.body.averagePriceCents,
                "invalid_average_price_cents",
                "averagePriceCents must be a non-negative number"
              ) ?? null,
            supportsDineIn: optionalBoolean(request.body.supportsDineIn) ?? true,
            supportsTakeout: optionalBoolean(request.body.supportsTakeout) ?? false,
            tags: stringArray(request.body.tags) ?? [],
            status: "active",
            createdByMembershipId: membership.membershipId
          },
          include: restaurantInclude
        });
        return {
          groupId: request.params.groupId,
          restaurant: toRestaurantSummary(restaurant)
        } satisfies RestaurantMutationResponse;
      } catch (error) {
        return sendAuthError(reply, error);
      }
    }
  );

  app.patch<{ Params: { groupId: string; restaurantId: string }; Body: PatchRestaurantRequest }>(
    "/api/groups/:groupId/restaurants/:restaurantId",
    async (request, reply) => {
      try {
        const membership = await requireActiveMembership({
          prisma,
          env,
          ...membershipAuthInput(request.params.groupId, request.headers.authorization)
        });
        const existing = await prisma.restaurant.findFirst({
          where: { id: request.params.restaurantId, groupId: request.params.groupId },
          include: restaurantInclude
        });
        if (!existing) {
          reply.code(404);
          return { error: "restaurant_not_found", message: "Restaurant not found" };
        }
        const body = restaurantPatchBody(request.body);
        const wantsStatusChange = body.status !== undefined;
        const data = buildRestaurantPatch(body, membership.role === "admin");
        if (wantsStatusChange && membership.role !== "admin") {
          reply.code(403);
          return {
            error: "admin_membership_required",
            message: "Admin membership is required to change restaurant status"
          };
        }
        if (membership.role !== "admin" && existing.createdByMembershipId !== membership.membershipId) {
          reply.code(403);
          return { error: "restaurant_owner_required", message: "Only the creator or an admin can edit restaurant" };
        }
        if (Object.keys(data).length === 0) {
          reply.code(400);
          return { error: "empty_restaurant_patch", message: "At least one restaurant field is required" };
        }
        const restaurant = await prisma.restaurant.update({
          where: { id: existing.id },
          data,
          include: restaurantInclude
        });
        return {
          groupId: request.params.groupId,
          restaurant: toRestaurantSummary(restaurant)
        } satisfies RestaurantMutationResponse;
      } catch (error) {
        return sendAuthError(reply, error);
      }
    }
  );

  app.post<{ Params: { groupId: string }; Body: CreateRecommendationRequest }>(
    "/api/groups/:groupId/recommendations",
    async (request, reply) => {
      try {
        const membership = await requireActiveMembership({
          prisma,
          env,
          ...membershipAuthInput(request.params.groupId, request.headers.authorization)
        });
        const reason = requiredNonBlankString(
          request.body,
          "reason",
          "recommendation_reason_required",
          "Recommendation reason is required"
        );
        const restaurantId = requiredNonBlankString(
          request.body,
          "restaurantId",
          "restaurant_id_required",
          "Restaurant ID is required"
        );
        const restaurant = await findRestaurantForWrite(request.params.groupId, restaurantId);
        if (!restaurant) {
          reply.code(400);
          return {
            error: "restaurant_group_mismatch",
            message: "Restaurant does not belong to route group"
          };
        }
        const recommendation = await prisma.recommendation.create({
          data: {
            groupId: request.params.groupId,
            restaurantId: restaurant.id,
            createdByMembershipId: membership.membershipId,
            dish: optionalString(request.body.dish) ?? null,
            reason,
            weatherTags: weatherTagArray(request.body.weatherTags),
            weekdayTags: weekdayTagArray(request.body.weekdayTags),
            moodTags: moodTagArray(request.body.moodTags)
          }
        });
        return {
          groupId: request.params.groupId,
          recommendation: toRecommendationSummary(recommendation as RecommendationRow)
        } satisfies RecommendationMutationResponse;
      } catch (error) {
        return sendAuthError(reply, error);
      }
    }
  );

  app.patch<{ Params: { groupId: string; recommendationId: string }; Body: PatchRecommendationRequest }>(
    "/api/groups/:groupId/recommendations/:recommendationId",
    async (request, reply) => {
      try {
        const membership = await requireActiveMembership({
          prisma,
          env,
          ...membershipAuthInput(request.params.groupId, request.headers.authorization)
        });
        const existing = await prisma.recommendation.findFirst({
          where: { id: request.params.recommendationId, groupId: request.params.groupId }
        });
        if (!existing) {
          reply.code(404);
          return { error: "recommendation_not_found", message: "Recommendation not found" };
        }
        if (membership.role !== "admin" && existing.createdByMembershipId !== membership.membershipId) {
          reply.code(403);
          return {
            error: "recommendation_owner_required",
            message: "Only the creator or an admin can edit recommendation"
          };
        }
        const data = recommendationPatch(request.body);
        if (Object.keys(data).length === 0) {
          reply.code(400);
          return { error: "empty_recommendation_patch", message: "At least one recommendation field is required" };
        }
        const recommendation = await prisma.recommendation.update({
          where: { id: existing.id },
          data
        });
        return {
          groupId: request.params.groupId,
          recommendation: toRecommendationSummary(recommendation as RecommendationRow)
        } satisfies RecommendationMutationResponse;
      } catch (error) {
        return sendAuthError(reply, error);
      }
    }
  );
}
