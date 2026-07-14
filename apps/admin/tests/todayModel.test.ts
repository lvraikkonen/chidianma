import type {
  GroupTodayRecommendationsResponse,
  ParticipationTodayResponse
} from "@lunch/shared";
import { describe, expect, it, vi } from "vitest";
import { AdminApiError } from "../src/api";
import {
  buildStrategyRows,
  loadTodayView,
  refreshTodayView,
  type TodayDependencies,
  type TodayViewState
} from "../src/features/today/todayModel";

function todayResponse(
  overrides: Partial<GroupTodayRecommendationsResponse> = {}
): GroupTodayRecommendationsResponse {
  return {
    groupId: "group-1",
    officeDate: "2026-07-14",
    batchId: "batch-2",
    batchNo: 2,
    generatedAt: "2026-07-14T19:00:00.000Z",
    weather: {
      city: "Shanghai",
      condition: "rainy",
      temperatureC: 24,
      precipitationProbability: 70,
      summary: "有雨，适合近一点的热食"
    },
    participationSummary: {
      joiningCount: 1,
      decidedCount: 0,
      awayCount: 0,
      undecidedCount: 1
    },
    items: [{
      rank: 1,
      restaurantId: "restaurant-1",
      recommendationId: "recommendation-1",
      restaurantName: "巷口砂锅",
      dish: "番茄肥牛砂锅",
      reason: "下雨天离得近，吃点热乎的。",
      distanceMinutes: 6,
      tags: ["热乎"],
      score: 55,
      scoreBreakdown: {
        weatherMatch: 20,
        weekdayMatch: 10,
        distance: 20,
        teammateRecommendation: 10,
        recentDuplicatePenalty: -5,
        negativeFeedbackPenalty: 0,
        total: 55
      }
    }],
    ...overrides
  };
}

function participationResponse(): ParticipationTodayResponse {
  return {
    groupId: "group-1",
    officeDate: "2026-07-14",
    members: [
      {
        membershipId: "membership-1",
        displayName: "小林",
        status: "joining"
      },
      {
        membershipId: "membership-2",
        displayName: "小周",
        status: "undecided"
      }
    ],
    summary: {
      joiningCount: 1,
      decidedCount: 0,
      awayCount: 0,
      undecidedCount: 1
    }
  };
}

function todayDependencies(
  overrides: Partial<TodayDependencies> = {}
): TodayDependencies {
  return {
    getToday: vi.fn().mockResolvedValue(todayResponse()),
    refreshToday: vi.fn().mockResolvedValue(todayResponse({ batchNo: 3 })),
    getParticipation: vi.fn().mockResolvedValue(participationResponse()),
    ...overrides
  };
}

describe("today model", () => {
  it("turns no_current_batch into a generate state while retaining participation", async () => {
    const state = await loadTodayView(todayDependencies({
      getToday: vi.fn().mockRejectedValue(new AdminApiError({
        kind: "http",
        status: 404,
        code: "no_current_batch"
      }))
    }));

    expect(state).toMatchObject({
      kind: "no-current-batch",
      participation: expect.objectContaining({ groupId: "group-1" })
    });
  });

  it("groups every active member by participation status", async () => {
    const state = await loadTodayView(todayDependencies());

    expect(state.kind === "ready" && state.participationGroups).toEqual({
      joining: [expect.objectContaining({ membershipId: "membership-1" })],
      decided: [],
      away: [],
      undecided: [expect.objectContaining({ membershipId: "membership-2" })]
    });
  });

  it("returns session-expired when participation rejects with 401", async () => {
    const state = await loadTodayView(todayDependencies({
      getParticipation: vi.fn().mockRejectedValue(new AdminApiError({
        kind: "http",
        status: 401,
        code: "invalid_session"
      }))
    }));

    expect(state).toEqual({ kind: "session-expired" });
  });

  it("returns forbidden when participation reports a removed membership", async () => {
    const state = await loadTodayView(todayDependencies({
      getParticipation: vi.fn().mockRejectedValue(new AdminApiError({
        kind: "http",
        status: 403,
        code: "removed_member"
      }))
    }));

    expect(state).toEqual({ kind: "forbidden" });
  });

  it("keeps a ready batch when participation has a non-membership failure", async () => {
    const state = await loadTodayView(todayDependencies({
      getParticipation: vi.fn().mockRejectedValue(new AdminApiError({
        kind: "network"
      }))
    }));

    expect(state).toMatchObject({ kind: "ready" });
    expect(state).not.toHaveProperty("participation");
  });

  it("derives strategy rows only from the returned breakdown", () => {
    expect(buildStrategyRows(todayResponse())).toEqual([
      { key: "weather", label: "天气匹配", value: 20 },
      { key: "weekday", label: "星期匹配", value: 10 },
      { key: "distance", label: "距离", value: 20 },
      { key: "teammate", label: "同事推荐", value: 10 },
      { key: "recent", label: "近期重复", value: -5 },
      { key: "negative", label: "负反馈", value: 0 }
    ]);
  });

  it("preserves the prior ready view when refresh fails", async () => {
    const prior = await loadTodayView(todayDependencies()) as Extract<
      TodayViewState,
      { kind: "ready" }
    >;
    const next = await refreshTodayView(prior, todayDependencies({
      refreshToday: vi.fn().mockRejectedValue(new AdminApiError({ kind: "network" }))
    }));

    expect(next).toMatchObject({
      kind: "ready",
      response: { batchNo: 2 },
      refreshError: "重新生成失败，仍显示上一批结果。"
    });
  });

  it("does not hide a participation auth failure after refresh succeeds", async () => {
    const next = await refreshTodayView(
      { kind: "no-current-batch" },
      todayDependencies({
        getParticipation: vi.fn().mockRejectedValue(new AdminApiError({
          kind: "http",
          status: 403,
          code: "active_membership_required"
        }))
      })
    );

    expect(next).toEqual({ kind: "forbidden" });
  });

  it("does not preserve a prior ready view when refresh reports an expired session", async () => {
    const prior = await loadTodayView(todayDependencies()) as Extract<
      TodayViewState,
      { kind: "ready" }
    >;
    const next = await refreshTodayView(prior, todayDependencies({
      refreshToday: vi.fn().mockRejectedValue(new AdminApiError({
        kind: "http",
        status: 401,
        code: "invalid_session"
      }))
    }));

    expect(next).toEqual({ kind: "session-expired" });
  });
});
