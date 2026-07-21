import type { PrismaClient } from "@prisma/client";
import { DEFAULT_GROUP_SCORING_WEIGHTS } from "@lunch/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MembershipContext } from "../src/services/groups/memberships";
import { NoCurrentBatchError } from "../src/services/recommendation/groupToday";
import { getGroupWheelCandidates } from "../src/services/recommendation/wheelCandidates";

const membership: MembershipContext = {
  identityId: "identity-1",
  groupId: "group-1",
  membershipId: "membership-1",
  role: "member"
};

function restaurant(index: number, input: {
  weatherTags?: string[];
  feedback?: Array<{ membershipId: string | null }>;
} = {}) {
  const suffix = String(index).padStart(2, "0");
  return {
    id: `restaurant-${suffix}`,
    groupId: "group-1",
    name: `餐厅 ${suffix}`,
    distanceMinutes: 8,
    tags: ["近"],
    status: "active",
    recommendations: [{
      id: `recommendation-${suffix}`,
      dish: `招牌菜 ${suffix}`,
      weatherTags: input.weatherTags ?? [],
      weekdayTags: [],
      moodTags: ["稳妥"]
    }],
    feedback: input.feedback ?? []
  };
}

function buildPrisma(input: {
  restaurants?: ReturnType<typeof restaurant>[];
  batch?: Record<string, unknown> | null;
  groupTimezone?: string;
  weatherSnapshot?: Record<string, unknown> | null;
  hardExclusions?: Array<{ restaurantId: string }>;
  recentDecisions?: Array<{ restaurantId: string | null }>;
} = {}) {
  const batch = Object.prototype.hasOwnProperty.call(input, "batch")
    ? input.batch
    : {
        id: "batch-1",
        officeDate: "2026-07-09",
        weatherSnapshotId: null,
        scoringWeightsSnapshot: DEFAULT_GROUP_SCORING_WEIGHTS,
        algorithmVersion: "group-v1"
      };
  return {
    lunchGroup: {
      findUnique: vi.fn().mockResolvedValue({
        id: "group-1",
        officeTimezone: input.groupTimezone ?? "Asia/Shanghai"
      })
    },
    dailyRecommendationBatch: {
      findFirst: vi.fn().mockResolvedValue(batch),
      create: vi.fn(),
      updateMany: vi.fn()
    },
    weatherSnapshot: {
      findUnique: vi.fn().mockResolvedValue(input.weatherSnapshot ?? null),
      upsert: vi.fn()
    },
    restaurant: {
      findMany: vi.fn().mockResolvedValue(input.restaurants ?? [])
    },
    feedback: {
      findMany: vi.fn().mockResolvedValue(input.hardExclusions ?? [])
    },
    dailyRecommendationItem: {
      findMany: vi.fn().mockResolvedValue([])
    },
    dailyParticipation: {
      findMany: vi.fn().mockResolvedValue(input.recentDecisions ?? [])
    },
    scoringWeights: {
      findUnique: vi.fn()
    },
    $transaction: vi.fn()
  };
}

async function getCandidates(prisma: ReturnType<typeof buildPrisma>) {
  return getGroupWheelCandidates({
    prisma: prisma as unknown as PrismaClient,
    groupId: "group-1",
    membership
  });
}

describe("group wheel candidate service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-09T04:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [8, 8],
    [10, 8]
  ])("returns a deterministic maximum of eight from %i active candidates", async (
    inputCount,
    expectedCount
  ) => {
    const restaurants = Array.from(
      { length: inputCount },
      (_, index) => restaurant(index + 1)
    ).reverse();
    const prisma = buildPrisma({ restaurants });

    const response = await getCandidates(prisma);

    expect(response).toMatchObject({
      groupId: "group-1",
      officeDate: "2026-07-09",
      batchId: "batch-1",
      algorithmVersion: "group-v1"
    });
    expect(response.candidates).toHaveLength(expectedCount);
    expect(response.candidates.map((candidate) => candidate.restaurantId)).toEqual(
      Array.from(
        { length: expectedCount },
        (_, index) => `restaurant-${String(index + 1).padStart(2, "0")}`
      )
    );
    expect(prisma.restaurant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: "group-1", status: "active" }
      })
    );
    expect(prisma.dailyRecommendationBatch.create).not.toHaveBeenCalled();
    expect(prisma.dailyRecommendationBatch.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("hard-excludes only the current member's today skip/avoid before ranking", async () => {
    const prisma = buildPrisma({
      restaurants: [
        restaurant(1, { feedback: [{ membershipId: "membership-other" }] }),
        restaurant(2),
        restaurant(3)
      ],
      hardExclusions: [{ restaurantId: "restaurant-02" }],
      recentDecisions: [{ restaurantId: "restaurant-03" }]
    });

    const response = await getCandidates(prisma);

    expect(response.candidates.map((candidate) => candidate.restaurantId)).toEqual([
      "restaurant-03",
      "restaurant-01"
    ]);
    expect(response.candidates.find(
      (candidate) => candidate.restaurantId === "restaurant-03"
    )?.selectedWithinLast7Days).toBe(true);
    expect(response.candidates.find(
      (candidate) => candidate.restaurantId === "restaurant-01"
    )?.selectedWithinLast7Days).toBe(false);
    expect(prisma.feedback.findMany).toHaveBeenCalledWith({
      where: {
        groupId: "group-1",
        officeDate: "2026-07-09",
        membershipId: "membership-1",
        type: { in: ["skip", "avoid"] }
      },
      select: { restaurantId: true }
    });
    expect(prisma.dailyParticipation.findMany).toHaveBeenCalledWith({
      where: {
        groupId: "group-1",
        membershipId: "membership-1",
        status: "decided",
        officeDate: { gte: "2026-07-03", lte: "2026-07-09" },
        restaurantId: { not: null }
      },
      select: { restaurantId: true }
    });
  });

  it("hard-excludes before the eight-candidate limit", async () => {
    const prisma = buildPrisma({
      restaurants: Array.from({ length: 10 }, (_, index) => restaurant(index + 1)),
      hardExclusions: [
        { restaurantId: "restaurant-01" },
        { restaurantId: "restaurant-02" }
      ]
    });

    const response = await getCandidates(prisma);

    expect(response.candidates.map((candidate) => candidate.restaurantId)).toEqual(
      Array.from(
        { length: 8 },
        (_, index) => `restaurant-${String(index + 3).padStart(2, "0")}`
      )
    );
  });

  it("scores from the current batch weather and weights snapshot", async () => {
    const scoringWeightsSnapshot = {
      weekdayMatch: 0,
      weatherMatch: 40,
      distance: 0,
      teammateRecommendation: 0,
      recentDuplicatePenalty: 0,
      negativeFeedbackPenalty: 0
    };
    const prisma = buildPrisma({
      batch: {
        id: "batch-weighted",
        officeDate: "2026-07-09",
        weatherSnapshotId: "weather-1",
        scoringWeightsSnapshot,
        algorithmVersion: "group-v1"
      },
      weatherSnapshot: { id: "weather-1", condition: "rainy" },
      restaurants: [
        restaurant(1),
        restaurant(2, { weatherTags: ["rainy"] })
      ]
    });

    const response = await getCandidates(prisma);

    expect(response.batchId).toBe("batch-weighted");
    expect(response.candidates.map((candidate) => [
      candidate.restaurantId,
      candidate.recommendationScore
    ])).toEqual([
      ["restaurant-02", 40],
      ["restaurant-01", 0]
    ]);
    expect(prisma.weatherSnapshot.findUnique).toHaveBeenCalledWith({
      where: { id: "weather-1" }
    });
    expect(prisma.scoringWeights.findUnique).not.toHaveBeenCalled();
    expect(prisma.weatherSnapshot.upsert).not.toHaveBeenCalled();
  });

  it("scopes nested recommendations and feedback against malformed cross-group rows", async () => {
    const scoringWeightsSnapshot = {
      weekdayMatch: 0,
      weatherMatch: 40,
      distance: 0,
      teammateRecommendation: 0,
      recentDuplicatePenalty: 0,
      negativeFeedbackPenalty: 10
    };
    const localRestaurant = restaurant(1);
    const localRecommendation = {
      ...localRestaurant.recommendations[0]!,
      groupId: "group-1"
    };
    const foreignRecommendation = {
      ...localRecommendation,
      id: "recommendation-foreign",
      groupId: "group-2",
      weatherTags: ["rainy"]
    };
    const allFeedback = [{
      groupId: "group-2",
      membershipId: "membership-foreign"
    }];
    const prisma = buildPrisma({
      batch: {
        id: "batch-isolated",
        officeDate: "2026-07-09",
        weatherSnapshotId: "weather-1",
        scoringWeightsSnapshot,
        algorithmVersion: "group-v1"
      },
      weatherSnapshot: { id: "weather-1", condition: "rainy" }
    });
    prisma.restaurant.findMany.mockImplementation(async ({ include }) => {
      const recommendationGroupId = include.recommendations.where.groupId;
      const feedbackGroupId = include.feedback.where.groupId;
      return [{
        ...localRestaurant,
        recommendations: [localRecommendation, foreignRecommendation].filter(
          (recommendation) => recommendation.groupId === recommendationGroupId
        ),
        feedback: allFeedback.filter(
          (feedback) => feedback.groupId === feedbackGroupId
        )
      }];
    });

    const response = await getCandidates(prisma);

    expect(response.candidates).toEqual([
      expect.objectContaining({
        restaurantId: "restaurant-01",
        recommendationId: "recommendation-01",
        recommendationScore: 0
      })
    ]);
    expect(prisma.restaurant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          recommendations: { where: { groupId: "group-1" } },
          feedback: {
            where: {
              groupId: "group-1",
              officeDate: "2026-07-09",
              type: { in: ["skip", "avoid"] }
            }
          }
        }
      })
    );
  });

  it("uses the group office date at a UTC date boundary", async () => {
    const prisma = buildPrisma({
      groupTimezone: "America/Los_Angeles",
      batch: {
        id: "batch-la",
        officeDate: "2026-07-08",
        weatherSnapshotId: null,
        scoringWeightsSnapshot: DEFAULT_GROUP_SCORING_WEIGHTS,
        algorithmVersion: "group-v1"
      },
      restaurants: [restaurant(1)]
    });

    const response = await getCandidates(prisma);

    expect(response.officeDate).toBe("2026-07-08");
    expect(prisma.dailyRecommendationBatch.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          groupId: "group-1",
          officeDate: "2026-07-08",
          isCurrent: true
        }
      })
    );
    expect(prisma.dailyParticipation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          officeDate: { gte: "2026-07-02", lte: "2026-07-08" }
        })
      })
    );
  });

  it("fails read-only when no current batch exists", async () => {
    const prisma = buildPrisma({ batch: null, restaurants: [restaurant(1)] });

    await expect(getCandidates(prisma)).rejects.toBeInstanceOf(
      NoCurrentBatchError
    );

    expect(prisma.restaurant.findMany).not.toHaveBeenCalled();
    expect(prisma.feedback.findMany).not.toHaveBeenCalled();
    expect(prisma.dailyRecommendationBatch.create).not.toHaveBeenCalled();
    expect(prisma.dailyRecommendationBatch.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
