import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  GroupTodayRecommendationItem,
  ParticipationStatus,
  PersonalLunchHistoryResponse,
  RecommendationBatchSource,
  RecommendationHistoryBatch,
  RecommendationHistoryResponse,
  ScoreBreakdown,
  ScoringWeightsSnapshot,
  WeatherSummary
} from "@lunch/shared";
import { getOfficeCalendarWindows, getOfficeDate } from "../dates.js";
import { snapshotToWeather } from "../weather/officeWeather.js";

export class HistoryValidationError extends Error {
  constructor(public readonly error: string, message: string) {
    super(message);
    this.name = "HistoryValidationError";
  }
}

export class HistoryGroupNotFoundError extends Error {
  constructor(public readonly groupId: string) {
    super("Group not found");
    this.name = "HistoryGroupNotFoundError";
  }
}

export interface HistoryCursor {
  officeDate: string;
  batchNo: number;
}

export function encodeHistoryCursor(cursor: HistoryCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeHistoryCursor(value: string): HistoryCursor {
  try {
    if (!value) throw new Error("empty");
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw new Error("shape");
    const officeDate = (decoded as Record<string, unknown>).officeDate;
    const batchNo = (decoded as Record<string, unknown>).batchNo;
    if (typeof officeDate !== "string" || !isValidOfficeDate(officeDate)) {
      throw new Error("date");
    }
    if (!Number.isInteger(batchNo) || (batchNo as number) < 1) throw new Error("batch");
    return { officeDate, batchNo: batchNo as number };
  } catch {
    throw new HistoryValidationError("invalid_history_cursor", "Invalid history cursor");
  }
}

export function parseHistoryLimit(value: string | undefined): number {
  if (value === undefined) return 20;
  if (!/^\d+$/.test(value)) {
    throw new HistoryValidationError("invalid_history_limit", "History limit must be an integer from 1 to 50");
  }
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new HistoryValidationError("invalid_history_limit", "History limit must be an integer from 1 to 50");
  }
  return limit;
}

function isValidOfficeDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

interface FormattedHistoryBatchRecord {
  id: string;
  officeDate: string;
  batchNo: number;
  source: RecommendationBatchSource;
  isCurrent: boolean;
  createdAt: Date;
  generatedByMembershipId: string | null;
  generatedByName: string | null;
  scoringWeightsSnapshot: ScoringWeightsSnapshot;
  algorithmVersion: string;
  weather?: WeatherSummary | undefined;
  items: GroupTodayRecommendationItem[];
}

interface HistoryParticipationRecord {
  membershipId: string;
  displayName: string;
  status: ParticipationStatus;
  restaurantId: string | null;
  recommendationId: string | null;
  decidedAt: Date | null;
}

export function formatHistoryBatch(input: {
  batch: FormattedHistoryBatchRecord;
  participation: HistoryParticipationRecord[];
  decisionRestaurants: Array<{ id: string; name: string }>;
  decisionRecommendations: Array<{ id: string; dish: string | null }>;
  historicalMemberCount: number;
}): RecommendationHistoryBatch {
  const restaurantById = new Map(input.decisionRestaurants.map((restaurant) => [restaurant.id, restaurant]));
  const recommendationById = new Map(
    input.decisionRecommendations.map((recommendation) => [recommendation.id, recommendation])
  );
  const decisions = new Map<string, RecommendationHistoryBatch["decisions"][number]>();
  for (const participation of input.participation) {
    if (participation.status !== "decided" || !participation.restaurantId) continue;
    const restaurant = restaurantById.get(participation.restaurantId);
    if (!restaurant) continue;
    let decision = decisions.get(participation.restaurantId);
    if (!decision) {
      const recommendation = participation.recommendationId
        ? recommendationById.get(participation.recommendationId)
        : undefined;
      decision = {
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        ...(recommendation?.dish ? { dish: recommendation.dish } : {}),
        memberCount: 0,
        members: []
      };
      decisions.set(participation.restaurantId, decision);
    }
    decision.memberCount += 1;
    decision.members.push({
      membershipId: participation.membershipId,
      displayName: participation.displayName,
      ...(participation.decidedAt ? { decidedAt: participation.decidedAt.toISOString() } : {})
    });
  }

  const count = (status: ParticipationStatus) =>
    input.participation.filter((item) => item.status === status).length;
  const joiningCount = count("joining");
  const decidedCount = count("decided");
  const awayCount = count("away");
  const explicitUndecidedCount = count("undecided");
  const recordedCount = joiningCount + decidedCount + awayCount + explicitUndecidedCount;

  return {
    batchId: input.batch.id,
    officeDate: input.batch.officeDate,
    batchNo: input.batch.batchNo,
    source: input.batch.source,
    isCurrent: input.batch.isCurrent,
    generatedAt: input.batch.createdAt.toISOString(),
    ...(input.batch.generatedByMembershipId
      ? { generatedByMembershipId: input.batch.generatedByMembershipId }
      : {}),
    ...(input.batch.generatedByName ? { generatedByName: input.batch.generatedByName } : {}),
    ...(input.batch.weather ? { weather: input.batch.weather } : { weatherUnavailable: true }),
    scoringWeightsSnapshot: input.batch.scoringWeightsSnapshot,
    algorithmVersion: input.batch.algorithmVersion,
    participationSummary: {
      joiningCount,
      decidedCount,
      awayCount,
      undecidedCount: explicitUndecidedCount + Math.max(0, input.historicalMemberCount - recordedCount)
    },
    recommendations: input.batch.items,
    decisions: [...decisions.values()]
  };
}

interface PersonalParticipationRecord {
  officeDate: string;
  membershipId: string;
  status: ParticipationStatus;
  restaurantId: string | null;
  recommendationId: string | null;
  decidedAt: Date | null;
}

interface PersonalRestaurantRecord {
  id: string;
  name: string;
  cuisine: string | null;
  averagePriceCents: number | null;
}

export function buildPersonalHistoryResponse(input: {
  groupId: string;
  membershipId: string;
  window: { startDate: string; endDate: string };
  participation: PersonalParticipationRecord[];
  restaurants: PersonalRestaurantRecord[];
  recommendations: Array<{ id: string; dish: string | null }>;
}): PersonalLunchHistoryResponse {
  const restaurantById = new Map(input.restaurants.map((restaurant) => [restaurant.id, restaurant]));
  const recommendationById = new Map(input.recommendations.map((recommendation) => [recommendation.id, recommendation]));
  const ownDecisions = input.participation
    .filter((item) => item.membershipId === input.membershipId
      && item.status === "decided"
      && item.restaurantId)
    .sort((left, right) => right.officeDate.localeCompare(left.officeDate)
      || (right.decidedAt?.getTime() ?? 0) - (left.decidedAt?.getTime() ?? 0));
  const items = ownDecisions.flatMap((decision) => {
    const restaurant = restaurantById.get(decision.restaurantId!);
    if (!restaurant) return [];
    const recommendation = decision.recommendationId
      ? recommendationById.get(decision.recommendationId)
      : undefined;
    const coDinerCount = input.participation.filter((candidate) =>
      candidate.officeDate === decision.officeDate
      && candidate.membershipId !== input.membershipId
      && candidate.status === "decided"
    ).length;
    return [{
      officeDate: decision.officeDate,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      ...(decision.recommendationId ? { recommendationId: decision.recommendationId } : {}),
      ...(recommendation?.dish ? { dish: recommendation.dish } : {}),
      cuisine: restaurant.cuisine?.trim() || "未分类",
      ...(typeof restaurant.averagePriceCents === "number"
        ? { averagePriceCents: restaurant.averagePriceCents }
        : {}),
      ...(decision.decidedAt ? { decidedAt: decision.decidedAt.toISOString() } : {}),
      coDinerCount
    }];
  });

  if (items.length < 3) {
    return {
      groupId: input.groupId,
      membershipId: input.membershipId,
      window: input.window,
      items,
      preference: { status: "insufficient", decidedCount: items.length }
    };
  }
  const prices = items.flatMap((item) =>
    typeof item.averagePriceCents === "number" ? [item.averagePriceCents] : []
  );
  const categoryCounts = countBy(items.map((item) => item.cuisine));
  return {
    groupId: input.groupId,
    membershipId: input.membershipId,
    window: input.window,
    items,
    preference: {
      status: "ready",
      decidedCount: items.length,
      ...(prices.length > 0
        ? { averagePriceCents: Math.round(prices.reduce((sum, value) => sum + value, 0) / prices.length) }
        : {}),
      categories: [...categoryCounts.entries()]
        .map(([cuisine, decisionCount]) => ({
          cuisine,
          decisionCount,
          percentage: Math.round(decisionCount / items.length * 100)
        }))
        .sort((left, right) => right.decisionCount - left.decisionCount
          || left.cuisine.localeCompare(right.cuisine))
    }
  };
}

export async function getGroupRecommendationHistory(input: {
  prisma: PrismaClient;
  groupId: string;
  limit: number;
  cursor?: string | undefined;
}): Promise<RecommendationHistoryResponse> {
  const group = await input.prisma.lunchGroup.findUnique({ where: { id: input.groupId } });
  if (!group) throw new HistoryGroupNotFoundError(input.groupId);
  const cursor = input.cursor ? decodeHistoryCursor(input.cursor) : undefined;
  const batches = await input.prisma.dailyRecommendationBatch.findMany({
    where: {
      groupId: input.groupId,
      ...(cursor ? {
        OR: [
          { officeDate: { lt: cursor.officeDate } },
          { officeDate: cursor.officeDate, batchNo: { lt: cursor.batchNo } }
        ]
      } : {})
    },
    orderBy: [{ officeDate: "desc" }, { batchNo: "desc" }],
    take: input.limit + 1,
    include: {
      generatedByMembership: { include: { identity: true } },
      items: {
        orderBy: { rank: "asc" },
        include: { restaurant: true, recommendation: true }
      }
    }
  });
  const page = batches.slice(0, input.limit);
  if (page.length === 0) return { groupId: input.groupId, items: [] };
  const officeDates = [...new Set(page.map((batch) => batch.officeDate))];
  const weatherIds = page.flatMap((batch) => batch.weatherSnapshotId ? [batch.weatherSnapshotId] : []);
  const [participation, memberships, weatherSnapshots] = await Promise.all([
    input.prisma.dailyParticipation.findMany({
      where: { groupId: input.groupId, officeDate: { in: officeDates } },
      include: { membership: { include: { identity: true } } }
    }),
    input.prisma.groupMembership.findMany({
      where: { groupId: input.groupId },
      include: { identity: true }
    }),
    weatherIds.length > 0
      ? input.prisma.weatherSnapshot.findMany({ where: { id: { in: weatherIds }, groupId: input.groupId } })
      : Promise.resolve([])
  ]);
  const decisionRestaurantIds = [...new Set(participation.flatMap((item) => item.restaurantId ? [item.restaurantId] : []))];
  const decisionRecommendationIds = [...new Set(participation.flatMap((item) => item.recommendationId ? [item.recommendationId] : []))];
  const [decisionRestaurants, decisionRecommendations] = await Promise.all([
    decisionRestaurantIds.length > 0
      ? input.prisma.restaurant.findMany({
          where: { id: { in: decisionRestaurantIds }, groupId: input.groupId },
          select: { id: true, name: true }
        })
      : Promise.resolve([]),
    decisionRecommendationIds.length > 0
      ? input.prisma.recommendation.findMany({
          where: { id: { in: decisionRecommendationIds }, groupId: input.groupId },
          select: { id: true, dish: true }
        })
      : Promise.resolve([])
  ]);
  const weatherById = new Map(weatherSnapshots.map((weather) => [weather.id, weather]));
  const historicalMemberCount = (officeDate: string) => memberships.filter((membership) => {
    const joinedDate = getOfficeDate(membership.joinedAt, group.officeTimezone);
    const removedDate = membership.removedAt
      ? getOfficeDate(membership.removedAt, group.officeTimezone)
      : undefined;
    return joinedDate <= officeDate && (!removedDate || removedDate > officeDate);
  }).length;

  const items = page.map((batch) => {
    const weatherSnapshot = batch.weatherSnapshotId
      ? weatherById.get(batch.weatherSnapshotId)
      : undefined;
    return formatHistoryBatch({
      batch: {
        id: batch.id,
        officeDate: batch.officeDate,
        batchNo: batch.batchNo,
        source: batch.source,
        isCurrent: batch.isCurrent,
        createdAt: batch.createdAt,
        generatedByMembershipId: batch.generatedByMembershipId,
        generatedByName: batch.generatedByMembership?.identity.displayName ?? null,
        scoringWeightsSnapshot: batch.scoringWeightsSnapshot as unknown as ScoringWeightsSnapshot,
        algorithmVersion: batch.algorithmVersion,
        ...(weatherSnapshot ? { weather: toSharedWeather(weatherSnapshot) } : {}),
        items: batch.items.map((item) => toSharedRecommendationItem(item))
      },
      participation: participation
        .filter((item) => item.officeDate === batch.officeDate)
        .map((item) => ({
          membershipId: item.membershipId,
          displayName: item.membership.identity.displayName,
          status: item.status,
          restaurantId: item.restaurantId,
          recommendationId: item.recommendationId,
          decidedAt: item.decidedAt
        })),
      decisionRestaurants,
      decisionRecommendations,
      historicalMemberCount: historicalMemberCount(batch.officeDate)
    });
  });
  const last = page.at(-1);
  return {
    groupId: input.groupId,
    items,
    ...(batches.length > input.limit && last
      ? { nextCursor: encodeHistoryCursor({ officeDate: last.officeDate, batchNo: last.batchNo }) }
      : {})
  };
}

export async function getPersonalLunchHistory(input: {
  prisma: PrismaClient;
  groupId: string;
  membershipId: string;
  now?: Date | undefined;
}): Promise<PersonalLunchHistoryResponse> {
  const group = await input.prisma.lunchGroup.findUnique({ where: { id: input.groupId } });
  if (!group) throw new HistoryGroupNotFoundError(input.groupId);
  const window = getOfficeCalendarWindows(input.now ?? new Date(), group.officeTimezone).rolling30;
  const participation = await input.prisma.dailyParticipation.findMany({
    where: {
      groupId: input.groupId,
      officeDate: { gte: window.startDate, lte: window.endDate },
      status: "decided"
    }
  });
  const restaurantIds = [...new Set(participation.flatMap((item) => item.restaurantId ? [item.restaurantId] : []))];
  const recommendationIds = [...new Set(participation.flatMap((item) => item.recommendationId ? [item.recommendationId] : []))];
  const [restaurants, recommendations] = await Promise.all([
    restaurantIds.length > 0
      ? input.prisma.restaurant.findMany({
          where: { id: { in: restaurantIds }, groupId: input.groupId },
          select: { id: true, name: true, cuisine: true, averagePriceCents: true }
        })
      : Promise.resolve([]),
    recommendationIds.length > 0
      ? input.prisma.recommendation.findMany({
          where: { id: { in: recommendationIds }, groupId: input.groupId },
          select: { id: true, dish: true }
        })
      : Promise.resolve([])
  ]);
  return buildPersonalHistoryResponse({
    groupId: input.groupId,
    membershipId: input.membershipId,
    window,
    participation,
    restaurants,
    recommendations
  });
}

function toSharedRecommendationItem(item: {
  rank: number;
  restaurantId: string;
  recommendationId: string | null;
  score: number;
  scoreBreakdown: Prisma.JsonValue;
  reason: string;
  restaurant: {
    name: string;
    distanceMinutes: number | null;
    tags: string[];
    priceBand: string | null;
    averagePriceCents: number | null;
    supportsDineIn: boolean;
    supportsTakeout: boolean;
  };
  recommendation: { dish: string | null; moodTags: string[] } | null;
}): GroupTodayRecommendationItem {
  return {
    rank: item.rank,
    restaurantId: item.restaurantId,
    ...(item.recommendationId ? { recommendationId: item.recommendationId } : {}),
    restaurantName: item.restaurant.name,
    ...(item.recommendation?.dish ? { dish: item.recommendation.dish } : {}),
    reason: item.reason,
    ...(typeof item.restaurant.distanceMinutes === "number"
      ? { distanceMinutes: item.restaurant.distanceMinutes }
      : {}),
    tags: [...new Set([...item.restaurant.tags, ...(item.recommendation?.moodTags ?? [])])],
    ...(item.restaurant.priceBand ? { priceBand: item.restaurant.priceBand } : {}),
    ...(typeof item.restaurant.averagePriceCents === "number"
      ? { averagePriceCents: item.restaurant.averagePriceCents }
      : {}),
    supportsDineIn: item.restaurant.supportsDineIn,
    supportsTakeout: item.restaurant.supportsTakeout,
    score: item.score,
    scoreBreakdown: item.scoreBreakdown as unknown as ScoreBreakdown
  };
}

function toSharedWeather(snapshot: {
  city: string;
  temperatureC: number | null;
  condition: string;
  precipitationProbability: number | null;
  windLevel: string | null;
}): WeatherSummary {
  return { city: snapshot.city, ...snapshotToWeather(snapshot) };
}

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}
