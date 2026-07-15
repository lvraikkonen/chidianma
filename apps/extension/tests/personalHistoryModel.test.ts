import type { PersonalLunchHistoryResponse } from "@lunch/shared";
import { describe, expect, it } from "vitest";
import { buildPersonalHistoryModel } from "../src/personalHistoryModel";

function history(
  overrides: Partial<PersonalLunchHistoryResponse> = {}
): PersonalLunchHistoryResponse {
  return {
    groupId: "group-1",
    membershipId: "membership-1",
    window: { startDate: "2026-06-15", endDate: "2026-07-14" },
    items: [],
    preference: { status: "insufficient", decidedCount: 0 },
    ...overrides
  };
}

describe("personal history model", () => {
  it("renders a truthful empty state separately from preference readiness", () => {
    expect(buildPersonalHistoryModel(history())).toEqual({
      kind: "empty",
      windowLabel: "2026-06-15 至 2026-07-14",
      message: "最近 30 个办公室日期还没有已决定记录。",
      items: []
    });
  });

  it("keeps insufficient history without invented averages", () => {
    const response = history({
      items: [{
        officeDate: "2026-07-14",
        restaurantId: "restaurant-1",
        restaurantName: "面馆",
        cuisine: "未分类",
        coDinerCount: 2
      }],
      preference: { status: "insufficient", decidedCount: 1 }
    });

    expect(buildPersonalHistoryModel(response)).toMatchObject({
      kind: "insufficient",
      decidedCount: 1,
      averagePriceLabel: undefined,
      categories: [],
      items: [{
        officeDate: "2026-07-14",
        restaurantName: "面馆",
        cuisine: "未分类",
        coDinerLabel: "当天另有 2 位同事也完成决定"
      }]
    });
  });

  it("uses server percentages and optional price fields in ready history", () => {
    const response = history({
      items: [{
        officeDate: "2026-07-14",
        restaurantId: "restaurant-1",
        restaurantName: "面馆",
        recommendationId: "recommendation-1",
        dish: "牛肉面",
        cuisine: "面食",
        averagePriceCents: 3250,
        decidedAt: "2026-07-14T04:00:00.000Z",
        coDinerCount: 0
      }],
      preference: {
        status: "ready",
        decidedCount: 3,
        averagePriceCents: 3250,
        categories: [{ cuisine: "面食", decisionCount: 2, percentage: 67 }]
      }
    });

    expect(buildPersonalHistoryModel(response)).toMatchObject({
      kind: "ready",
      decidedCount: 3,
      averagePriceLabel: "¥32.50",
      categories: [{ cuisine: "面食", decisionCount: 2, percentage: 67 }],
      items: [{
        dish: "牛肉面",
        priceLabel: "¥32.50",
        coDinerLabel: "当天没有其他同事完成决定"
      }]
    });
  });

  it("preserves the one-item-per-office-date server order", () => {
    const response = history({
      items: [
        {
          officeDate: "2026-07-14",
          restaurantId: "r-2",
          restaurantName: "饭馆二",
          cuisine: "川菜",
          coDinerCount: 1
        },
        {
          officeDate: "2026-07-13",
          restaurantId: "r-1",
          restaurantName: "饭馆一",
          cuisine: "本帮菜",
          coDinerCount: 1
        }
      ],
      preference: { status: "insufficient", decidedCount: 2 }
    });

    expect(buildPersonalHistoryModel(response).items.map((item) => item.officeDate))
      .toEqual(["2026-07-14", "2026-07-13"]);
  });
});
