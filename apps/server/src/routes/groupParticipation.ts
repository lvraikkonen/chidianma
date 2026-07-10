import type {
  ParticipationStatus,
  ParticipationTodayResponse,
  PutParticipationTodayRequest,
  PutParticipationTodayResponse
} from "@lunch/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppEnv } from "../env.js";
import { prisma } from "../plugins/prisma.js";
import { AuthError } from "../services/auth/errors.js";
import { getOfficeDate } from "../services/dates.js";
import { requireActiveMembership } from "../services/groups/memberships.js";
import { buildParticipationSummary } from "../services/recommendation/groupToday.js";

class ParticipationValidationError extends Error {
  constructor(
    public readonly error: string,
    message: string
  ) {
    super(message);
  }
}

const participationStatuses = new Set<ParticipationStatus>([
  "undecided",
  "joining",
  "away",
  "decided"
]);

function membershipAuthInput(groupId: string, authorization: string | undefined) {
  return authorization ? { groupId, authorization } : { groupId };
}

function parseOptionalResourceId(
  record: Record<string, unknown>,
  key: "restaurantId" | "recommendationId"
): string | undefined {
  if (!(key in record)) return undefined;
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new ParticipationValidationError(
      "invalid_participation_request",
      `${key} must be a non-empty string when provided`
    );
  }
  return value.trim();
}

function parseParticipationBody(body: unknown): PutParticipationTodayRequest {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ParticipationValidationError(
      "invalid_participation_request",
      "Participation request body is invalid"
    );
  }
  const record = body as Record<string, unknown>;
  const status = record.status;
  if (!participationStatuses.has(status as ParticipationStatus)) {
    throw new ParticipationValidationError(
      "invalid_participation_status",
      "Participation status is invalid"
    );
  }
  const restaurantId = parseOptionalResourceId(record, "restaurantId");
  const recommendationId = parseOptionalResourceId(record, "recommendationId");
  if (status === "decided" && !restaurantId) {
    throw new ParticipationValidationError(
      "decision_restaurant_required",
      "restaurantId is required when status is decided"
    );
  }
  if (recommendationId && !restaurantId) {
    throw new ParticipationValidationError(
      "recommendation_restaurant_required",
      "restaurantId is required when recommendationId is provided"
    );
  }
  return {
    status: status as ParticipationStatus,
    ...(restaurantId ? { restaurantId } : {}),
    ...(recommendationId ? { recommendationId } : {})
  };
}

async function assertParticipationReferences(input: {
  groupId: string;
  restaurantId: string;
  recommendationId?: string;
  requireActiveRestaurant: boolean;
}) {
  const restaurant = await prisma.restaurant.findFirst({
    where: { id: input.restaurantId, groupId: input.groupId }
  });
  if (!restaurant) {
    throw new ParticipationValidationError(
      "restaurant_group_mismatch",
      "Restaurant does not belong to route group"
    );
  }
  if (input.requireActiveRestaurant && restaurant.status !== "active") {
    throw new ParticipationValidationError(
      "restaurant_not_active",
      "Only active restaurants can be selected"
    );
  }
  if (input.recommendationId) {
    const recommendation = await prisma.recommendation.findFirst({
      where: {
        id: input.recommendationId,
        groupId: input.groupId,
        restaurantId: input.restaurantId
      }
    });
    if (!recommendation) {
      throw new ParticipationValidationError(
        "recommendation_group_mismatch",
        "Recommendation does not belong to route group and restaurant"
      );
    }
  }
}

function sendParticipationError(reply: FastifyReply, error: unknown) {
  if (error instanceof AuthError) {
    const statusCode =
      error.code === "unauthorized" ? 401 : error.code === "forbidden" ? 403 : 400;
    reply.code(statusCode);
    return { error: error.error, message: error.message };
  }
  if (error instanceof ParticipationValidationError) {
    reply.code(400);
    return { error: error.error, message: error.message };
  }
  throw error;
}

export async function registerGroupParticipationRoutes(
  app: FastifyInstance,
  env: AppEnv
) {
  app.get<{ Params: { groupId: string } }>(
    "/api/groups/:groupId/participation/today",
    async (request, reply) => {
      try {
        await requireActiveMembership({
          prisma,
          env,
          ...membershipAuthInput(
            request.params.groupId,
            request.headers.authorization
          )
        });
        const group = await prisma.lunchGroup.findUnique({
          where: { id: request.params.groupId }
        });
        if (!group) {
          reply.code(404);
          return { error: "group_not_found", message: "Group not found" };
        }
        const officeDate = getOfficeDate(new Date(), group.officeTimezone);
        const memberships = await prisma.groupMembership.findMany({
          where: { groupId: request.params.groupId, status: "active" },
          include: { identity: true },
          orderBy: { joinedAt: "asc" }
        });
        const participation = await prisma.dailyParticipation.findMany({
          where: { groupId: request.params.groupId, officeDate }
        });
        const participationByMembership = new Map(
          participation.map((item) => [item.membershipId, item])
        );
        const summary = await buildParticipationSummary({
          prisma,
          groupId: request.params.groupId,
          officeDate
        });
        return {
          groupId: request.params.groupId,
          officeDate,
          summary,
          members: memberships.map((membership) => {
            const item = participationByMembership.get(membership.id);
            return {
              membershipId: membership.id,
              displayName: membership.identity.displayName,
              status: item?.status ?? "undecided",
              ...(item?.restaurantId ? { restaurantId: item.restaurantId } : {}),
              ...(item?.recommendationId
                ? { recommendationId: item.recommendationId }
                : {}),
              ...(item?.decidedAt
                ? { decidedAt: item.decidedAt.toISOString() }
                : {}),
              ...(item?.updatedAt
                ? { updatedAt: item.updatedAt.toISOString() }
                : {})
            };
          })
        } satisfies ParticipationTodayResponse;
      } catch (error) {
        return sendParticipationError(reply, error);
      }
    }
  );

  app.put<{
    Params: { groupId: string };
    Body: PutParticipationTodayRequest;
  }>(
    "/api/groups/:groupId/participation/today",
    async (request, reply) => {
      try {
        const membership = await requireActiveMembership({
          prisma,
          env,
          ...membershipAuthInput(
            request.params.groupId,
            request.headers.authorization
          )
        });
        const group = await prisma.lunchGroup.findUnique({
          where: { id: request.params.groupId }
        });
        if (!group) {
          reply.code(404);
          return { error: "group_not_found", message: "Group not found" };
        }
        const officeDate = getOfficeDate(new Date(), group.officeTimezone);
        const body = parseParticipationBody(request.body);
        const currentMembership = await prisma.groupMembership.findUnique({
          where: { id: membership.membershipId },
          include: { identity: true }
        });
        if (body.restaurantId) {
          await assertParticipationReferences({
            groupId: request.params.groupId,
            restaurantId: body.restaurantId,
            ...(body.recommendationId
              ? { recommendationId: body.recommendationId }
              : {}),
            requireActiveRestaurant: body.status === "decided"
          });
        }
        const clearDecision = body.status !== "decided";
        const data = {
          status: body.status,
          restaurantId: clearDecision ? null : (body.restaurantId as string),
          recommendationId: clearDecision
            ? null
            : body.recommendationId ?? null,
          decidedAt: clearDecision ? null : new Date()
        };
        const participation = await prisma.dailyParticipation.upsert({
          where: {
            groupId_officeDate_membershipId: {
              groupId: request.params.groupId,
              officeDate,
              membershipId: membership.membershipId
            }
          },
          create: {
            groupId: request.params.groupId,
            officeDate,
            membershipId: membership.membershipId,
            ...data
          },
          update: data
        });
        const summary = await buildParticipationSummary({
          prisma,
          groupId: request.params.groupId,
          officeDate
        });
        return {
          groupId: request.params.groupId,
          officeDate,
          summary,
          participation: {
            membershipId: membership.membershipId,
            displayName:
              currentMembership?.identity.displayName ?? membership.membershipId,
            status: participation.status,
            ...(participation.restaurantId
              ? { restaurantId: participation.restaurantId }
              : {}),
            ...(participation.recommendationId
              ? { recommendationId: participation.recommendationId }
              : {}),
            ...(participation.decidedAt
              ? { decidedAt: participation.decidedAt.toISOString() }
              : {}),
            updatedAt: participation.updatedAt.toISOString()
          }
        } satisfies PutParticipationTodayResponse;
      } catch (error) {
        return sendParticipationError(reply, error);
      }
    }
  );
}
