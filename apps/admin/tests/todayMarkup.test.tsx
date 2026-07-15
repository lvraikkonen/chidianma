import type { GroupTodayRecommendationsResponse } from "@lunch/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TodayPage } from "../src/pages/TodayPage";
import type { TodayViewState } from "../src/features/today/todayModel";

function response(): GroupTodayRecommendationsResponse {
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
    }]
  };
}

function readyState(): Extract<TodayViewState, { kind: "ready" }> {
  return {
    kind: "ready",
    response: response(),
    participation: {
      groupId: "group-1",
      officeDate: "2026-07-14",
      members: [
        { membershipId: "membership-1", displayName: "小林", status: "joining" },
        { membershipId: "membership-2", displayName: "小周", status: "undecided" }
      ],
      summary: {
        joiningCount: 1,
        decidedCount: 0,
        awayCount: 0,
        undecidedCount: 1
      }
    },
    participationGroups: {
      joining: [{ membershipId: "membership-1", displayName: "小林", status: "joining" }],
      decided: [],
      away: [],
      undecided: [{ membershipId: "membership-2", displayName: "小周", status: "undecided" }]
    }
  };
}

function render(state: TodayViewState) {
  return renderToStaticMarkup(
    <TodayPage
      state={state}
      onGenerate={vi.fn()}
      onRefresh={vi.fn()}
      onRetry={vi.fn()}
      onOpenRestaurants={vi.fn()}
    />
  );
}

describe("today page markup", () => {
  it("renders only real batch and participation values", () => {
    const html = render(readyState());

    expect(html).toContain("当前批次 #2");
    expect(html).toContain("巷口砂锅");
    expect(html).toContain("天气匹配");
    expect(html).toContain("近期重复");
    expect(html).toContain("小林");
    expect(html).not.toContain("#046");
    expect(html).not.toContain("张三、李雷");
  });

  it("renders generation instead of an error for no current batch", () => {
    const html = render({ kind: "no-current-batch" });

    expect(html).toContain("生成今日推荐");
    expect(html).not.toContain("加载失败");
  });

  it("renders weather unavailable and empty restaurant recovery from real state", () => {
    const html = render({
      kind: "empty",
      response: responseWith({ weather: undefined, weatherUnavailable: true, items: [] })
    });

    expect(html).toContain("天气暂不可用");
    expect(html).toContain("打开餐厅库");
  });

  it.each([
    [{ kind: "session-expired" } as const, "小组连接已失效"],
    [{ kind: "forbidden" } as const, "已无法访问这个小组"],
    [{ kind: "error", message: "暂时无法加载今日推荐，请重试。" } as const, "重试"]
  ])("renders explicit recovery for %j", (state, expected) => {
    expect(render(state)).toContain(expected);
  });

  it("announces a failed refresh while preserving the prior batch", () => {
    const html = render({
      ...readyState(),
      refreshError: "重新生成失败，仍显示上一批结果。"
    });

    expect(html).toContain("当前批次 #2");
    expect(html).toContain("重新生成失败，仍显示上一批结果。");
    expect(html).toContain('aria-live="polite"');
  });

  it("announces blocking recovery states as alerts", () => {
    const html = render({ kind: "session-expired" });

    expect(html).toContain('role="alert"');
  });
});

function responseWith(
  overrides: Partial<GroupTodayRecommendationsResponse>
): GroupTodayRecommendationsResponse {
  return { ...response(), ...overrides };
}
