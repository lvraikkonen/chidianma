import type { PrismaClient } from "@prisma/client";
import { DEFAULT_GROUP_SCORING_WEIGHTS } from "@lunch/shared";
import { describe, expect, it, vi } from "vitest";
import {
  buildPersonalHistoryResponse,
  decodeHistoryCursor,
  encodeHistoryCursor,
  formatHistoryBatch,
  getGroupRecommendationHistory,
  parseHistoryLimit
} from "../src/services/analytics/history";

describe("history cursor", () => {
  it("round-trips an opaque office-date and batch-number cursor", () => {
    const cursor = encodeHistoryCursor({ officeDate: "2026-07-14", batchNo: 3 });
    expect(cursor).not.toContain("2026-07-14");
    expect(decodeHistoryCursor(cursor)).toEqual({ officeDate: "2026-07-14", batchNo: 3 });
  });

  it.each(["", "not-base64", Buffer.from("{}").toString("base64url")])(
    "rejects invalid cursor %s",
    (cursor) => {
      expect(() => decodeHistoryCursor(cursor)).toThrow("Invalid history cursor");
    }
  );

  it("rejects a syntactically shaped cursor with an impossible office date", () => {
    const cursor = Buffer.from(JSON.stringify({ officeDate: "2026-02-30", batchNo: 1 })).toString("base64url");
    expect(() => decodeHistoryCursor(cursor)).toThrow("Invalid history cursor");
  });

  it.each(["0", "51", "1.5", "1e1", "abc"])("rejects invalid limit %s", (limit) => {
    expect(() => parseHistoryLimit(limit)).toThrow("History limit must be an integer from 1 to 50");
  });
});

describe("recommendation history formatting", () => {
  it("keeps stored scoring snapshots and a multi-restaurant decision distribution", () => {
    const batch = formatHistoryBatch({
      batch: {
        id: "batch-2",
        officeDate: "2026-07-14",
        batchNo: 2,
        source: "manual",
        isCurrent: false,
        createdAt: new Date("2026-07-14T04:00:00.000Z"),
        generatedByMembershipId: "member-1",
        generatedByName: "小李",
        scoringWeightsSnapshot: {
          weekdayMatch: 20,
          weatherMatch: 25,
          distance: 20,
          teammateRecommendation: 10,
          recentDuplicatePenalty: 12,
          negativeFeedbackPenalty: 10
        },
        algorithmVersion: "group-v1",
        weather: undefined,
        items: [{
          rank: 1,
          restaurantId: "restaurant-1",
          restaurantName: "面馆",
          recommendationId: "recommendation-1",
          dish: "牛肉面",
          reason: "离办公室近",
          distanceMinutes: 8,
          tags: ["近"],
          priceBand: "¥¥",
          averagePriceCents: 2500,
          supportsDineIn: true,
          supportsTakeout: false,
          score: 40,
          scoreBreakdown: {
            weekdayMatch: 0,
            weatherMatch: 0,
            distance: 20,
            teammateRecommendation: 20,
            recentDuplicatePenalty: 0,
            negativeFeedbackPenalty: 0,
            total: 40
          }
        }]
      },
      participation: [
        {
          membershipId: "member-1",
          displayName: "小李",
          status: "decided",
          restaurantId: "restaurant-1",
          recommendationId: "recommendation-1",
          decidedAt: new Date("2026-07-14T04:30:00.000Z")
        },
        {
          membershipId: "member-2",
          displayName: "小王",
          status: "decided",
          restaurantId: "restaurant-2",
          recommendationId: null,
          decidedAt: new Date("2026-07-14T04:35:00.000Z")
        },
        {
          membershipId: "member-3",
          displayName: "小赵",
          status: "away",
          restaurantId: null,
          recommendationId: null,
          decidedAt: null
        }
      ],
      decisionRestaurants: [
        { id: "restaurant-1", name: "面馆" },
        { id: "restaurant-2", name: "砂锅" }
      ],
      decisionRecommendations: [
        { id: "recommendation-1", dish: "牛肉面" }
      ],
      historicalMemberCount: 3
    });

    expect(batch.scoringWeightsSnapshot.weatherMatch).toBe(25);
    expect(batch.recommendations[0]?.scoreBreakdown.total).toBe(40);
    expect(batch.decisions).toEqual([
      expect.objectContaining({ restaurantName: "面馆", memberCount: 1 }),
      expect.objectContaining({ restaurantName: "砂锅", memberCount: 1 })
    ]);
    expect(batch.participationSummary).toEqual({
      joiningCount: 0,
      decidedCount: 2,
      awayCount: 1,
      undecidedCount: 0
    });
  });

  it("paginates every batch in stable office-date and batch-number descending order", async () => {
    const batch = (officeDate: string, batchNo: number, isCurrent: boolean) => ({
      id: `${officeDate}-${batchNo}`,
      officeDate,
      batchNo,
      source: "manual" as const,
      isCurrent,
      createdAt: new Date(`${officeDate}T04:00:00.000Z`),
      generatedByMembershipId: null,
      generatedByMembership: null,
      weatherSnapshotId: null,
      scoringWeightsSnapshot: { ...DEFAULT_GROUP_SCORING_WEIGHTS },
      algorithmVersion: "group-v1",
      items: []
    });
    const firstPageRows = [
      batch("2026-07-14", 3, true),
      batch("2026-07-14", 2, false),
      batch("2026-07-13", 4, true)
    ];
    const secondPageRows = [batch("2026-07-13", 4, true)];
    const findMany = vi.fn()
      .mockResolvedValueOnce(firstPageRows)
      .mockResolvedValueOnce(secondPageRows);
    const prisma = {
      lunchGroup: {
        findUnique: vi.fn().mockResolvedValue({ officeTimezone: "Asia/Shanghai" })
      },
      dailyRecommendationBatch: { findMany },
      dailyParticipation: { findMany: vi.fn().mockResolvedValue([]) },
      groupMembership: { findMany: vi.fn().mockResolvedValue([]) },
      weatherSnapshot: { findMany: vi.fn().mockResolvedValue([]) },
      restaurant: { findMany: vi.fn().mockResolvedValue([]) },
      recommendation: { findMany: vi.fn().mockResolvedValue([]) }
    } as unknown as PrismaClient;

    const first = await getGroupRecommendationHistory({ prisma, groupId: "group-1", limit: 2 });
    expect(first.items.map((item) => [item.officeDate, item.batchNo, item.isCurrent])).toEqual([
      ["2026-07-14", 3, true],
      ["2026-07-14", 2, false]
    ]);
    expect(first.nextCursor).toEqual(expect.any(String));

    const second = await getGroupRecommendationHistory({
      prisma,
      groupId: "group-1",
      limit: 2,
      cursor: first.nextCursor
    });
    expect(second.items.map((item) => [item.officeDate, item.batchNo])).toEqual([["2026-07-13", 4]]);
    expect(second.nextCursor).toBeUndefined();
    expect(findMany.mock.calls[0]?.[0]).toMatchObject({
      orderBy: [{ officeDate: "desc" }, { batchNo: "desc" }],
      take: 3
    });
    expect(findMany.mock.calls[1]?.[0].where.OR).toEqual([
      { officeDate: { lt: "2026-07-14" } },
      { officeDate: "2026-07-14", batchNo: { lt: 2 } }
    ]);
  });
});

describe("personal lunch history", () => {
  it("uses the session membership, counts co-diners, and aggregates preferences", () => {
    const response = buildPersonalHistoryResponse({
      groupId: "group-1",
      membershipId: "member-1",
      window: { startDate: "2026-06-15", endDate: "2026-07-14" },
      participation: [
        { officeDate: "2026-07-14", membershipId: "member-1", status: "decided", restaurantId: "restaurant-1", recommendationId: "recommendation-1", decidedAt: new Date("2026-07-14T04:00:00.000Z") },
        { officeDate: "2026-07-14", membershipId: "member-2", status: "decided", restaurantId: "restaurant-1", recommendationId: null, decidedAt: new Date("2026-07-14T04:02:00.000Z") },
        { officeDate: "2026-07-13", membershipId: "member-1", status: "decided", restaurantId: "restaurant-1", recommendationId: null, decidedAt: new Date("2026-07-13T04:00:00.000Z") },
        { officeDate: "2026-07-12", membershipId: "member-1", status: "decided", restaurantId: "restaurant-2", recommendationId: null, decidedAt: new Date("2026-07-12T04:00:00.000Z") }
      ],
      restaurants: [
        { id: "restaurant-1", name: "面馆", cuisine: "面食", averagePriceCents: 2000 },
        { id: "restaurant-2", name: "砂锅", cuisine: null, averagePriceCents: 4000 }
      ],
      recommendations: [{ id: "recommendation-1", dish: "牛肉面" }]
    });

    expect(response.items[0]).toMatchObject({ officeDate: "2026-07-14", coDinerCount: 1 });
    expect(response.preference).toEqual({
      status: "ready",
      decidedCount: 3,
      averagePriceCents: 2667,
      categories: [
        { cuisine: "面食", decisionCount: 2, percentage: 67 },
        { cuisine: "未分类", decisionCount: 1, percentage: 33 }
      ]
    });
  });

  it("returns insufficient preference below three decisions", () => {
    const response = buildPersonalHistoryResponse({
      groupId: "group-1",
      membershipId: "member-1",
      window: { startDate: "2026-06-15", endDate: "2026-07-14" },
      participation: [],
      restaurants: [],
      recommendations: []
    });
    expect(response.preference).toEqual({ status: "insufficient", decidedCount: 0 });
  });
});
