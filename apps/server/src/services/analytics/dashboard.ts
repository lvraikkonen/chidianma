import type { PrismaClient } from "@prisma/client";
import type {
  DashboardActivityItem,
  DashboardResponse,
  ParticipationStatus,
  RestaurantStatus
} from "@lunch/shared";
import {
  getOfficeCalendarWindows,
  type OfficeCalendarWindows
} from "../dates.js";

export class DashboardGroupNotFoundError extends Error {
  constructor(public readonly groupId: string) {
    super("Group not found");
    this.name = "DashboardGroupNotFoundError";
  }
}

export interface DashboardParticipationRecord {
  officeDate: string;
  membershipId: string;
  status: ParticipationStatus;
  restaurantId: string | null;
}

export interface DashboardRestaurantRecord {
  id: string;
  name: string;
  cuisine: string | null;
  averagePriceCents: number | null;
  status: RestaurantStatus;
  createdAt: Date;
  createdByMembershipId: string | null;
  createdByName: string | null;
}

export interface DashboardRecommendationRecord {
  id: string;
  restaurantId: string;
  restaurantName: string;
  dish: string | null;
  createdAt: Date;
  createdByMembershipId: string | null;
  createdByName: string | null;
}

export function buildDashboardResponse(input: {
  groupId: string;
  officeTimezone: string;
  windows: OfficeCalendarWindows;
  activeMembershipIds: string[];
  participation: DashboardParticipationRecord[];
  restaurants: DashboardRestaurantRecord[];
  recommendations: DashboardRecommendationRecord[];
}): DashboardResponse {
  const restaurantById = new Map(input.restaurants.map((restaurant) => [restaurant.id, restaurant]));
  const todayByMembership = new Map(
    input.participation
      .filter((item) => item.officeDate === input.windows.officeDate)
      .map((item) => [item.membershipId, item])
  );
  const todayStatuses = input.activeMembershipIds.map(
    (membershipId) => todayByMembership.get(membershipId)?.status ?? "undecided"
  );
  const countToday = (status: ParticipationStatus) =>
    todayStatuses.filter((candidate) => candidate === status).length;
  const decisions = input.participation.filter(
    (item) => item.status === "decided" && item.restaurantId
  );
  const inRange = (item: DashboardParticipationRecord, range: { startDate: string; endDate: string }) =>
    item.officeDate >= range.startDate && item.officeDate <= range.endDate;
  const currentWeekDecisions = decisions.filter((item) => inRange(item, input.windows.currentWeek));
  const previousWeekDecisions = decisions.filter((item) => inRange(item, input.windows.previousWeek));
  const rollingDecisions = decisions.filter((item) => inRange(item, input.windows.rolling7));
  const currentWeekMembers = new Set(currentWeekDecisions.map((item) => item.membershipId));
  const rollingMembers = new Set(rollingDecisions.map((item) => item.membershipId));
  const pricedDecisions = currentWeekDecisions.flatMap((item) => {
    const price = restaurantById.get(item.restaurantId!)?.averagePriceCents;
    return typeof price === "number" ? [price] : [];
  });
  const enoughCurrentWeekData = currentWeekDecisions.length >= 3 && currentWeekMembers.size >= 2;
  const averagePrice = enoughCurrentWeekData && pricedDecisions.length > 0
    ? {
        status: "ready" as const,
        averagePriceCents: Math.round(
          pricedDecisions.reduce((sum, value) => sum + value, 0) / pricedDecisions.length
        ),
        pricedDecisionCount: pricedDecisions.length
      }
    : { status: "insufficient" as const };

  const restaurantDecisionCounts = countBy(
    rollingDecisions.map((item) => item.restaurantId!)
  );
  const topRestaurants = [...restaurantDecisionCounts.entries()]
    .flatMap(([restaurantId, decisionCount]) => {
      const restaurant = restaurantById.get(restaurantId);
      return restaurant ? [{
        restaurantId,
        restaurantName: restaurant.name,
        cuisine: restaurant.cuisine?.trim() || "未分类",
        decisionCount,
        ...(typeof restaurant.averagePriceCents === "number"
          ? { averagePriceCents: restaurant.averagePriceCents }
          : {})
      }] : [];
    })
    .sort((left, right) => right.decisionCount - left.decisionCount
      || left.restaurantName.localeCompare(right.restaurantName))
    .slice(0, 5);

  const enoughCategoryData = rollingDecisions.length >= 3 && rollingMembers.size >= 2;
  const categoryDistribution = enoughCategoryData
    ? {
        status: "ready" as const,
        decidedCount: rollingDecisions.length,
        items: [...countBy(rollingDecisions.map((item) =>
          restaurantById.get(item.restaurantId!)?.cuisine?.trim() || "未分类"
        )).entries()]
          .map(([cuisine, decisionCount]) => ({
            cuisine,
            decisionCount,
            percentage: Math.round(decisionCount / rollingDecisions.length * 100)
          }))
          .sort((left, right) => right.decisionCount - left.decisionCount
            || left.cuisine.localeCompare(right.cuisine))
      }
    : { status: "insufficient" as const, decidedCount: rollingDecisions.length };

  const restaurantCounts = { active: 0, paused: 0, blocked: 0 };
  for (const restaurant of input.restaurants) restaurantCounts[restaurant.status] += 1;

  const recentActivity: DashboardActivityItem[] = [
    ...input.restaurants.map((restaurant): DashboardActivityItem => ({
      kind: "restaurant_created",
      occurredAt: restaurant.createdAt.toISOString(),
      ...(restaurant.createdByMembershipId
        ? { membershipId: restaurant.createdByMembershipId }
        : {}),
      ...(restaurant.createdByName ? { memberName: restaurant.createdByName } : {}),
      restaurantId: restaurant.id,
      restaurantName: restaurant.name
    })),
    ...input.recommendations.map((recommendation): DashboardActivityItem => ({
      kind: "recommendation_created",
      occurredAt: recommendation.createdAt.toISOString(),
      ...(recommendation.createdByMembershipId
        ? { membershipId: recommendation.createdByMembershipId }
        : {}),
      ...(recommendation.createdByName ? { memberName: recommendation.createdByName } : {}),
      restaurantId: recommendation.restaurantId,
      restaurantName: recommendation.restaurantName,
      recommendationId: recommendation.id,
      ...(recommendation.dish ? { dish: recommendation.dish } : {})
    }))
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, 8);

  return {
    groupId: input.groupId,
    officeDate: input.windows.officeDate,
    officeTimezone: input.officeTimezone,
    today: {
      activeMemberCount: input.activeMembershipIds.length,
      joiningCount: countToday("joining"),
      decidedCount: countToday("decided"),
      awayCount: countToday("away"),
      undecidedCount: countToday("undecided")
    },
    currentWeek: {
      ...input.windows.currentWeek,
      decidedCount: currentWeekDecisions.length,
      distinctMemberCount: currentWeekMembers.size,
      averagePrice
    },
    previousWeek: {
      ...input.windows.previousWeek,
      decidedCount: previousWeekDecisions.length
    },
    restaurantCounts,
    topRestaurants,
    categoryDistribution,
    recentActivity
  };
}

export async function getGroupDashboard(input: {
  prisma: PrismaClient;
  groupId: string;
  now?: Date | undefined;
}): Promise<DashboardResponse> {
  const group = await input.prisma.lunchGroup.findUnique({ where: { id: input.groupId } });
  if (!group) throw new DashboardGroupNotFoundError(input.groupId);
  const windows = getOfficeCalendarWindows(input.now ?? new Date(), group.officeTimezone);
  const [activeMemberships, participation, restaurants, recommendations] = await Promise.all([
    input.prisma.groupMembership.findMany({
      where: { groupId: input.groupId, status: "active" },
      select: { id: true }
    }),
    input.prisma.dailyParticipation.findMany({
      where: {
        groupId: input.groupId,
        officeDate: {
          gte: windows.previousWeek.startDate,
          lte: windows.officeDate
        }
      },
      select: {
        officeDate: true,
        membershipId: true,
        status: true,
        restaurantId: true
      }
    }),
    input.prisma.restaurant.findMany({
      where: { groupId: input.groupId },
      include: { createdByMembership: { include: { identity: true } } }
    }),
    input.prisma.recommendation.findMany({
      where: { groupId: input.groupId },
      take: 8,
      orderBy: { createdAt: "desc" },
      include: {
        restaurant: true,
        createdByMembership: { include: { identity: true } }
      }
    })
  ]);

  return buildDashboardResponse({
    groupId: input.groupId,
    officeTimezone: group.officeTimezone,
    windows,
    activeMembershipIds: activeMemberships.map((membership) => membership.id),
    participation,
    restaurants: restaurants.map((restaurant) => ({
      id: restaurant.id,
      name: restaurant.name,
      cuisine: restaurant.cuisine,
      averagePriceCents: restaurant.averagePriceCents,
      status: restaurant.status,
      createdAt: restaurant.createdAt,
      createdByMembershipId: restaurant.createdByMembershipId,
      createdByName: restaurant.createdByMembership?.identity.displayName ?? null
    })),
    recommendations: recommendations.map((recommendation) => ({
      id: recommendation.id,
      restaurantId: recommendation.restaurantId,
      restaurantName: recommendation.restaurant.name,
      dish: recommendation.dish,
      createdAt: recommendation.createdAt,
      createdByMembershipId: recommendation.createdByMembershipId,
      createdByName: recommendation.createdByMembership?.identity.displayName ?? null
    }))
  });
}

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}
