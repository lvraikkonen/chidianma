import type { DashboardResponse, RecommendationHistoryBatch } from "@lunch/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DashboardWorkspaceState } from "../src/features/dashboard/dashboardModel";
import { DashboardView } from "../src/pages/DashboardPage";

const dashboard: DashboardResponse = {
  groupId: "group-1",
  officeDate: "2026-07-14",
  officeTimezone: "Asia/Shanghai",
  today: { activeMemberCount: 4, joiningCount: 1, decidedCount: 2, awayCount: 1, undecidedCount: 0 },
  currentWeek: {
    startDate: "2026-07-13",
    endDate: "2026-07-19",
    decidedCount: 2,
    distinctMemberCount: 1,
    averagePrice: { status: "insufficient" }
  },
  previousWeek: { startDate: "2026-07-06", endDate: "2026-07-12", decidedCount: 5 },
  restaurantCounts: { active: 7, paused: 1, blocked: 1 },
  topRestaurants: [{ restaurantId: "restaurant-1", restaurantName: "面馆", cuisine: "面食", decisionCount: 2, averagePriceCents: 2500 }],
  categoryDistribution: { status: "insufficient", decidedCount: 2 },
  recentActivity: [{
    kind: "recommendation_created",
    occurredAt: "2026-07-14T03:00:00.000Z",
    memberName: "小李",
    restaurantId: "restaurant-1",
    restaurantName: "面馆",
    recommendationId: "recommendation-1",
    dish: "牛肉面"
  }]
};

const batch: RecommendationHistoryBatch = {
  batchId: "batch-2",
  officeDate: "2026-07-14",
  batchNo: 2,
  source: "manual",
  isCurrent: false,
  generatedAt: "2026-07-14T04:00:00.000Z",
  generatedByName: "小李",
  weatherUnavailable: true,
  scoringWeightsSnapshot: {
    weekdayMatch: 20,
    weatherMatch: 40,
    distance: 15,
    teammateRecommendation: 10,
    recentDuplicatePenalty: 12,
    negativeFeedbackPenalty: 10
  },
  algorithmVersion: "group-v1",
  participationSummary: { joiningCount: 0, decidedCount: 2, awayCount: 1, undecidedCount: 1 },
  recommendations: [{
    rank: 1,
    restaurantId: "restaurant-1",
    restaurantName: "面馆",
    reason: "离办公室近",
    tags: ["近"],
    score: 42,
    scoreBreakdown: {
      weekdayMatch: 5,
      weatherMatch: 0,
      distance: 20,
      teammateRecommendation: 17,
      recentDuplicatePenalty: 0,
      negativeFeedbackPenalty: 0,
      total: 42
    }
  }],
  decisions: [
    { restaurantId: "restaurant-1", restaurantName: "面馆", memberCount: 1, members: [{ membershipId: "member-1", displayName: "小李" }] },
    { restaurantId: "restaurant-2", restaurantName: "砂锅", memberCount: 1, members: [{ membershipId: "member-2", displayName: "小王" }] }
  ]
};

function readyState(): DashboardWorkspaceState {
  return {
    kind: "ready",
    dashboard: { kind: "ready", value: dashboard },
    history: { kind: "ready", items: [batch, { ...batch, batchId: "batch-1", batchNo: 1, isCurrent: true }], nextCursor: "next", loadingMore: false }
  };
}

describe("Dashboard page markup", () => {
  it("renders real KPIs and explicit insufficient states without invented averages", () => {
    const html = renderToStaticMarkup(
      <DashboardView state={readyState()} expandedBatchIds={new Set()} onToggleBatch={vi.fn()} onRetry={vi.fn()} onLoadMore={vi.fn()} />
    );
    expect(html).toContain("今日已决定");
    expect(html).toContain("2 / 4 人");
    expect(html).toContain("比上周少 3 条");
    expect(html).toContain("团队人均");
    expect(html).toContain("数据不足");
    expect(html).not.toContain("¥0");
    expect(html).toContain("类别偏好数据不足");
    expect(html).toContain("小李 加了 面馆 的推荐");
  });

  it("keeps same-day batches separate and expands stored snapshots plus real multi-restaurant decisions", () => {
    const html = renderToStaticMarkup(
      <DashboardView state={readyState()} expandedBatchIds={new Set(["batch-2"])} onToggleBatch={vi.fn()} onRetry={vi.fn()} onLoadMore={vi.fn()} />
    );
    expect(html.match(/2026-07-14/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain("已被后续批次替代");
    expect(html).toContain("历史天气不可用");
    expect(html).toContain("面馆 · 1 人");
    expect(html).toContain("砂锅 · 1 人");
    expect(html).toContain("天气匹配");
    expect(html).toContain("40");
    expect(html).toContain("group-v1");
    expect(html).toContain("离办公室近");
    expect(html).toContain("总分");
    expect(html).toContain("42");
    expect(html).toContain('aria-expanded="true"');
  });

  it("renders an explicit cursor action", () => {
    const html = renderToStaticMarkup(
      <DashboardView state={readyState()} expandedBatchIds={new Set()} onToggleBatch={vi.fn()} onRetry={vi.fn()} onLoadMore={vi.fn()} />
    );
    expect(html).toContain("加载更多");
  });

  it("labels legacy records without showing fabricated score components", () => {
    const legacyBatch: RecommendationHistoryBatch = {
      ...batch,
      batchId: "legacy-batch",
      source: "legacy",
      algorithmVersion: "legacy-v1"
    };
    const state = readyState();
    state.history = { kind: "ready", items: [legacyBatch], loadingMore: false };

    const html = renderToStaticMarkup(
      <DashboardView state={state} expandedBatchIds={new Set(["legacy-batch"])} onToggleBatch={vi.fn()} onRetry={vi.fn()} onLoadMore={vi.fn()} />
    );

    expect(html).toContain("旧版迁移记录，仅保留总分和理由");
    expect(html).toContain("42 分");
    expect(html).toContain("离办公室近");
    expect(html).not.toContain("history-breakdown");
  });
});
