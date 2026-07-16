import type {
  GroupTodayRecommendationItem,
  GroupTodayRecommendationsResponse,
  PutParticipationTodayResponse
} from "@lunch/shared";
import { describe, expect, it, vi } from "vitest";
import { ExtensionApiError } from "../src/apiClient";
import type { DetailViewState } from "../src/detailController";
import {
  createDetailPageActionCoordinator,
  toDetailPageRenderModel
} from "../src/detailPageController";
import { getDefaultStorageState } from "../src/storage";

function todayResponse(): GroupTodayRecommendationsResponse {
  return {
    groupId: "group-1",
    officeDate: "2026-07-10",
    batchId: "batch-1",
    batchNo: 1,
    generatedAt: "2026-07-10T03:30:00.000Z",
    weather: {
      city: "上海",
      condition: "rainy",
      summary: "午间有小雨"
    },
    participationSummary: {
      joiningCount: 1,
      decidedCount: 0,
      awayCount: 0,
      undecidedCount: 1
    },
    items: [{
      restaurantId: "restaurant-1",
      recommendationId: "recommendation-1",
      restaurantName: "巷口砂锅",
      dish: "菌菇鸡汤砂锅",
      reason: "热乎且离得近",
      distanceMinutes: 6,
      tags: ["热乎", "近"],
      rank: 1,
      score: 55,
      scoreBreakdown: {
        weekdayMatch: 10,
        weatherMatch: 20,
        distance: 20,
        teammateRecommendation: 10,
        recentDuplicatePenalty: -5,
        negativeFeedbackPenalty: 0,
        total: 55
      }
    }]
  };
}

function readyState(): Extract<DetailViewState, { kind: "ready" }> {
  const response = todayResponse();
  return {
    kind: "ready",
    response,
    readOnly: false,
    items: response.items.map((item) => ({ item, recommendations: [] }))
  };
}

function cachedState(): Extract<DetailViewState, { kind: "cached" }> {
  const response = { ...todayResponse(), fromCache: true };
  return {
    kind: "cached",
    response,
    readOnly: true,
    items: response.items.map((item) => ({ item, recommendations: [] }))
  };
}

function connectedStorage(groupId = "group-1") {
  return {
    ...getDefaultStorageState(),
    activeGroupId: groupId,
    sessionsByGroupId: {
      [groupId]: { token: `${groupId}-session-token` }
    },
    groupSummariesById: {
      [groupId]: {
        groupId,
        name: `${groupId} 小组`,
        role: "member" as const,
        membershipId: `${groupId}-membership`
      }
    }
  };
}

function participationUpdate(
  overrides: Partial<PutParticipationTodayResponse> = {}
): PutParticipationTodayResponse {
  return {
    groupId: "group-1",
    officeDate: "2026-07-10",
    participation: {
      membershipId: "group-1-membership",
      displayName: "小林",
      status: "decided",
      restaurantId: "restaurant-2"
    },
    summary: {
      joiningCount: 0,
      decidedCount: 1,
      awayCount: 0,
      undecidedCount: 1
    },
    ...overrides
  };
}

type ActionDependencies = Parameters<
  typeof createDetailPageActionCoordinator
>[0];

function actionDependencies(
  overrides: Partial<ActionDependencies> = {}
): ActionDependencies {
  return {
    loadStorage: vi.fn().mockResolvedValue(connectedStorage()),
    postFeedback: vi.fn().mockResolvedValue(undefined),
    putParticipation: vi.fn().mockResolvedValue(participationUpdate()),
    reload: vi.fn().mockResolvedValue(undefined),
    render: vi.fn(),
    announce: vi.fn(),
    onPendingChange: vi.fn(),
    ...overrides
  };
}

function otherRestaurant(
  item: GroupTodayRecommendationItem
): GroupTodayRecommendationItem {
  return {
    ...item,
    restaurantId: "restaurant-2",
    recommendationId: "recommendation-2",
    restaurantName: "番茄米线",
    rank: 2
  };
}

describe("detail page presenter", () => {
  it.each([
    {
      state: { kind: "disconnected" } as const,
      message: "请先在设置中连接小组。",
      control: { kind: "settings", label: "设置" }
    },
    {
      state: { kind: "no-current-batch" } as const,
      message: "今天还没有生成推荐。",
      control: {
        kind: "index",
        label: "打开 Chrome 扩展生成推荐",
        href: "index.html"
      }
    },
    {
      state: { kind: "session-expired" } as const,
      message: "当前小组连接已失效，请在设置中重新连接。",
      control: { kind: "settings", label: "设置" }
    },
    {
      state: { kind: "forbidden" } as const,
      message: "你已被移出当前小组，请在设置中选择其他小组。",
      control: { kind: "settings", label: "设置" }
    },
    {
      state: {
        kind: "error",
        message: "暂时无法加载推荐详情，请重试。",
        retryable: true
      } as const,
      message: "暂时无法加载推荐详情，请重试。",
      control: { kind: "retry", label: "重试" }
    }
  ])("maps $state.kind to exact recovery copy and control", ({
    state,
    message,
    control
  }) => {
    expect(toDetailPageRenderModel(state)).toEqual({
      kind: "recovery",
      message,
      control
    });
  });

  it("omits retry for a non-retryable focus error", () => {
    expect(toDetailPageRenderModel({
      kind: "error",
      message: "今天的推荐里没有这家餐厅。",
      retryable: false
    })).toEqual({
      kind: "recovery",
      message: "今天的推荐里没有这家餐厅。"
    });
  });

  it("marks cached recommendations read-only and not writable", () => {
    const state = cachedState();

    expect(toDetailPageRenderModel(state)).toEqual({
      kind: "recommendations",
      state,
      status: "缓存内容仅供查看",
      readOnly: true,
      canWrite: false
    });
  });

  it("keeps fresh recommendations writable with real weather copy", () => {
    const state = readyState();

    expect(toDetailPageRenderModel(state)).toEqual({
      kind: "recommendations",
      state,
      status: "午间有小雨",
      readOnly: false,
      canWrite: true
    });
  });
});

describe("detail page action coordinator", () => {
  it("rejects a cross-card action while one is pending and restores write controls", async () => {
    let resolveFeedback!: () => void;
    const dependencies = actionDependencies({
      postFeedback: vi.fn(
        () => new Promise<void>((resolve) => {
          resolveFeedback = resolve;
        })
      )
    });
    const coordinator = createDetailPageActionCoordinator(dependencies);
    const state = readyState();
    const item = state.items[0]!.item;

    const firstAction = coordinator.submitFeedback(state, item, "want");

    expect(coordinator.isPending()).toBe(true);
    expect(dependencies.onPendingChange).toHaveBeenCalledWith(true);
    await expect(coordinator.submitDecision(
      state,
      otherRestaurant(item)
    )).resolves.toBe(false);
    expect(dependencies.putParticipation).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(dependencies.postFeedback).toHaveBeenCalledOnce();
    });
    resolveFeedback();

    await expect(firstAction).resolves.toBe(true);
    expect(coordinator.isPending()).toBe(false);
    expect(dependencies.onPendingChange).toHaveBeenLastCalledWith(false);
  });

  it("reloads after a stale group without announcing feedback success", async () => {
    const dependencies = actionDependencies({
      loadStorage: vi.fn().mockResolvedValue(connectedStorage("group-2"))
    });
    const coordinator = createDetailPageActionCoordinator(dependencies);
    const state = readyState();

    await coordinator.submitFeedback(state, state.items[0]!.item, "want");

    expect(dependencies.reload).toHaveBeenCalledWith(
      "当前小组已切换，已加载当前小组内容，请重新操作。"
    );
    expect(dependencies.postFeedback).not.toHaveBeenCalled();
    expect(dependencies.announce).not.toHaveBeenCalledWith("反馈已记录。");
  });

  it.each([
    [401, "session-expired"],
    [403, "forbidden"]
  ] as const)("maps action HTTP %s to %s", async (status, kind) => {
    const dependencies = actionDependencies({
      postFeedback: vi.fn().mockRejectedValue(
        new ExtensionApiError({ kind: "http", status })
      )
    });
    const coordinator = createDetailPageActionCoordinator(dependencies);
    const state = readyState();

    await coordinator.submitFeedback(state, state.items[0]!.item, "skip");

    expect(dependencies.render).toHaveBeenCalledWith({ kind });
    expect(dependencies.announce).not.toHaveBeenCalledWith("反馈已记录。");
  });

  it("rerenders the whole recommendation state after a decision succeeds", async () => {
    const dependencies = actionDependencies();
    const coordinator = createDetailPageActionCoordinator(dependencies);
    const state = readyState();
    const item = otherRestaurant(state.items[0]!.item);

    await coordinator.submitDecision(state, item);

    expect(dependencies.render).toHaveBeenCalledWith(expect.objectContaining({
      kind: "ready",
      decidedRestaurantId: "restaurant-2",
      response: {
        ...state.response,
        participationSummary: participationUpdate().summary
      }
    }));
    expect(dependencies.reload).not.toHaveBeenCalled();
    expect(dependencies.announce).toHaveBeenCalledWith(
      "今天的午饭决定已记录。"
    );
  });

  it.each([
    { groupId: "group-2" },
    { officeDate: "2026-07-11" }
  ])("reloads without success when a decision response is from another batch", async (override) => {
    const dependencies = actionDependencies({
      putParticipation: vi.fn().mockResolvedValue(
        participationUpdate(override)
      )
    });
    const coordinator = createDetailPageActionCoordinator(dependencies);
    const state = readyState();

    await coordinator.submitDecision(
      state,
      otherRestaurant(state.items[0]!.item)
    );

    expect(dependencies.reload).toHaveBeenCalledWith(
      "操作结果无法确认，已重新加载当前详情。"
    );
    expect(dependencies.render).not.toHaveBeenCalled();
    expect(dependencies.announce).not.toHaveBeenCalledWith(
      "今天的午饭决定已记录。"
    );
  });
});
