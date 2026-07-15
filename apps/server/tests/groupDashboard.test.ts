import { describe, expect, it } from "vitest";
import { buildDashboardResponse } from "../src/services/analytics/dashboard";

const windows = {
  officeDate: "2026-07-14",
  currentWeek: { startDate: "2026-07-13", endDate: "2026-07-19" },
  previousWeek: { startDate: "2026-07-06", endDate: "2026-07-12" },
  rolling7: { startDate: "2026-07-08", endDate: "2026-07-14" },
  rolling30: { startDate: "2026-06-15", endDate: "2026-07-14" },
  currentMonth: { startDate: "2026-07-01", endDate: "2026-07-31" },
  currentMonthUtc: {
    startAt: new Date("2026-06-30T16:00:00.000Z"),
    endAt: new Date("2026-07-31T16:00:00.000Z")
  }
};

const restaurants = [
  {
    id: "restaurant-1",
    name: "面馆",
    cuisine: "面食",
    averagePriceCents: 2000,
    status: "active" as const,
    createdAt: new Date("2026-07-14T01:00:00.000Z"),
    createdByMembershipId: "member-1",
    createdByName: "小李"
  },
  {
    id: "restaurant-2",
    name: "小店",
    cuisine: null,
    averagePriceCents: 4000,
    status: "paused" as const,
    createdAt: new Date("2026-07-10T01:00:00.000Z"),
    createdByMembershipId: null,
    createdByName: null
  },
  {
    id: "restaurant-3",
    name: "避雷店",
    cuisine: "快餐",
    averagePriceCents: null,
    status: "blocked" as const,
    createdAt: new Date("2026-06-01T01:00:00.000Z"),
    createdByMembershipId: null,
    createdByName: null
  }
];

describe("dashboard aggregation", () => {
  it("keeps removed-member history while today's summary uses active members", () => {
    const response = buildDashboardResponse({
      groupId: "group-1",
      officeTimezone: "Asia/Shanghai",
      windows,
      activeMembershipIds: ["member-1", "member-2"],
      participation: [
        { officeDate: "2026-07-14", membershipId: "member-1", status: "joining", restaurantId: null },
        { officeDate: "2026-07-14", membershipId: "removed", status: "decided", restaurantId: "restaurant-1" },
        { officeDate: "2026-07-13", membershipId: "member-1", status: "decided", restaurantId: "restaurant-1" },
        { officeDate: "2026-07-13", membershipId: "member-2", status: "decided", restaurantId: "restaurant-2" }
      ],
      restaurants,
      recommendations: []
    });

    expect(response.today).toEqual({
      activeMemberCount: 2,
      joiningCount: 1,
      decidedCount: 0,
      awayCount: 0,
      undecidedCount: 1
    });
    expect(response.currentWeek.decidedCount).toBe(3);
    expect(response.currentWeek.averagePrice).toEqual({
      status: "ready",
      averagePriceCents: 2667,
      pricedDecisionCount: 3
    });
    expect(response.topRestaurants[0]).toMatchObject({
      restaurantId: "restaurant-1",
      decisionCount: 2
    });
    expect(response.categoryDistribution).toEqual({
      status: "ready",
      decidedCount: 3,
      items: [
        { cuisine: "面食", decisionCount: 2, percentage: 67 },
        { cuisine: "未分类", decisionCount: 1, percentage: 33 }
      ]
    });
    expect(response.restaurantCounts).toEqual({ active: 1, paused: 1, blocked: 1 });
  });

  it("returns insufficient states instead of invented averages", () => {
    const response = buildDashboardResponse({
      groupId: "group-1",
      officeTimezone: "Asia/Shanghai",
      windows,
      activeMembershipIds: ["member-1"],
      participation: [
        { officeDate: "2026-07-14", membershipId: "member-1", status: "decided", restaurantId: "restaurant-1" }
      ],
      restaurants,
      recommendations: []
    });

    expect(response.currentWeek.averagePrice).toEqual({ status: "insufficient" });
    expect(response.categoryDistribution).toEqual({ status: "insufficient", decidedCount: 1 });
  });

  it("keeps only the eight latest real create events", () => {
    const recommendations = Array.from({ length: 9 }, (_, index) => ({
      id: `recommendation-${index}`,
      restaurantId: "restaurant-1",
      restaurantName: "面馆",
      dish: `菜 ${index}`,
      createdAt: new Date(`2026-07-${String(index + 1).padStart(2, "0")}T02:00:00.000Z`),
      createdByMembershipId: "member-1",
      createdByName: "小李"
    }));
    const response = buildDashboardResponse({
      groupId: "group-1",
      officeTimezone: "Asia/Shanghai",
      windows,
      activeMembershipIds: [],
      participation: [],
      restaurants,
      recommendations
    });

    expect(response.recentActivity).toHaveLength(8);
    expect(response.recentActivity[0]).toMatchObject({
      kind: "restaurant_created",
      restaurantId: "restaurant-1"
    });
    expect(response.recentActivity.at(-1)?.kind).toBe("recommendation_created");
  });
});
