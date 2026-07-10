import type {
  GroupTodayRecommendationsResponse,
  PutParticipationTodayResponse,
  RestaurantListResponse
} from "@lunch/shared";
import { describe, expect, it, vi } from "vitest";
import { ExtensionApiError } from "../src/apiClient";
import {
  applyDetailDecisionUpdate,
  loadDetailState,
  mergeDetailAnnouncement,
  runDetailActionWithContext
} from "../src/detailController";
import { getDefaultStorageState } from "../src/storage";

function todayResponse(
  fromCache = false
): GroupTodayRecommendationsResponse {
  return {
    groupId: "group-1",
    officeDate: "2026-07-10",
    batchId: "batch-1",
    batchNo: 1,
    generatedAt: "2026-07-10T03:30:00.000Z",
    participationSummary: {
      joiningCount: 1,
      decidedCount: 0,
      awayCount: 0,
      undecidedCount: 1
    },
    ...(fromCache ? { fromCache: true } : {}),
    items: [
      {
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
      },
      {
        restaurantId: "restaurant-2",
        recommendationId: "recommendation-2",
        restaurantName: "番茄米线",
        dish: "番茄肥牛米线",
        reason: "今天想吃点开胃的",
        distanceMinutes: 9,
        tags: ["酸甜", "米线"],
        rank: 2,
        score: 48,
        scoreBreakdown: {
          weekdayMatch: 8,
          weatherMatch: 10,
          distance: 15,
          teammateRecommendation: 15,
          recentDuplicatePenalty: 0,
          negativeFeedbackPenalty: 0,
          total: 48
        }
      }
    ]
  };
}

function restaurantResponse(): RestaurantListResponse {
  return {
    groupId: "group-1",
    restaurants: [
      {
        id: "restaurant-1",
        groupId: "group-1",
        name: "巷口砂锅",
        supportsDineIn: true,
        supportsTakeout: true,
        tags: ["热乎", "近"],
        status: "active",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
        recommendations: [
          {
            id: "recommendation-1",
            groupId: "group-1",
            restaurantId: "restaurant-1",
            dish: "菌菇鸡汤砂锅",
            reason: "下雨天喝汤很舒服",
            weatherTags: ["rainy"],
            weekdayTags: ["friday"],
            moodTags: ["热乎"],
            createdAt: "2026-07-01T00:00:00.000Z",
            updatedAt: "2026-07-01T00:00:00.000Z"
          }
        ]
      },
      {
        id: "restaurant-2",
        groupId: "group-1",
        name: "番茄米线",
        supportsDineIn: true,
        supportsTakeout: false,
        tags: ["酸甜", "米线"],
        status: "active",
        createdAt: "2026-07-02T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z",
        recommendations: [
          {
            id: "recommendation-2",
            groupId: "group-1",
            restaurantId: "restaurant-2",
            dish: "番茄肥牛米线",
            reason: "番茄汤底开胃",
            weatherTags: ["clear"],
            weekdayTags: ["friday"],
            moodTags: ["清爽"],
            createdAt: "2026-07-02T00:00:00.000Z",
            updatedAt: "2026-07-02T00:00:00.000Z"
          }
        ]
      }
    ]
  };
}

type DetailDependencies = Parameters<typeof loadDetailState>[0];

function detailDependencies({
  fromCache = false,
  response = todayResponse(fromCache),
  loadRecommendations,
  loadRestaurants = vi.fn().mockResolvedValue(restaurantResponse())
}: {
  fromCache?: boolean;
  response?: GroupTodayRecommendationsResponse;
  loadRecommendations?: DetailDependencies["loadRecommendations"];
  loadRestaurants?: DetailDependencies["loadRestaurants"];
} = {}): DetailDependencies {
  return {
    loadRecommendations:
      loadRecommendations ?? vi.fn().mockResolvedValue(response),
    loadRestaurants
  };
}

function connectedStorage(groupId: string) {
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

function readyDetailState(decidedRestaurantId?: string) {
  const response = todayResponse();
  return {
    kind: "ready" as const,
    response,
    readOnly: false as const,
    items: response.items.map((item) => ({ item, recommendations: [] })),
    ...(decidedRestaurantId ? { decidedRestaurantId } : {})
  };
}

function cachedDetailState() {
  const response = todayResponse(true);
  return {
    kind: "cached" as const,
    response,
    readOnly: true as const,
    items: response.items.map((item) => ({ item, recommendations: [] }))
  };
}

function participationUpdate(
  restaurantId: string
): PutParticipationTodayResponse {
  return {
    groupId: "group-1",
    officeDate: "2026-07-10",
    participation: {
      membershipId: "group-1-membership",
      displayName: "小林",
      status: "decided",
      restaurantId
    },
    summary: {
      joiningCount: 0,
      decidedCount: 1,
      awayCount: 0,
      undecidedCount: 1
    }
  };
}

describe("standalone detail controller", () => {
  it("focuses the requested restaurant and enriches it with real recommendations", async () => {
    const state = await loadDetailState(detailDependencies(), "restaurant-2");

    expect(state).toMatchObject({
      kind: "ready",
      items: [{ item: { restaurantId: "restaurant-2" } }]
    });
    expect(state.kind === "ready" && state.items[0]?.recommendations).toEqual([
      expect.objectContaining({ reason: "番茄汤底开胃" })
    ]);
  });

  it("keeps cached detail read-only", async () => {
    const dependencies = detailDependencies({ fromCache: true });

    const state = await loadDetailState(dependencies);

    expect(state).toMatchObject({ kind: "cached", readOnly: true });
    expect(dependencies.loadRestaurants).not.toHaveBeenCalled();
  });

  it("returns every today item when the notification fallback has no focus", async () => {
    const state = await loadDetailState(detailDependencies());

    expect(state.kind === "ready" && state.items.map(({ item }) => item.restaurantId))
      .toEqual(["restaurant-1", "restaurant-2"]);
  });

  it("keeps fresh today items when optional restaurant enrichment fails", async () => {
    const state = await loadDetailState(detailDependencies({
      loadRestaurants: vi.fn().mockRejectedValue(new TypeError("offline"))
    }));

    expect(state).toMatchObject({
      kind: "ready",
      items: [
        { item: { restaurantId: "restaurant-1" }, recommendations: [] },
        { item: { restaurantId: "restaurant-2" }, recommendations: [] }
      ]
    });
  });

  it("does not request restaurant enrichment for an empty fresh batch", async () => {
    const loadRestaurants = vi.fn();
    const state = await loadDetailState(detailDependencies({
      response: { ...todayResponse(), items: [] },
      loadRestaurants
    }));

    expect(state).toMatchObject({ kind: "ready", items: [] });
    expect(loadRestaurants).not.toHaveBeenCalled();
  });

  it.each([
    [
      new ExtensionApiError({
        kind: "http",
        status: 404,
        code: "no_current_batch"
      }),
      "no-current-batch"
    ],
    [new ExtensionApiError({ kind: "http", status: 401 }), "session-expired"],
    [new ExtensionApiError({ kind: "http", status: 403 }), "forbidden"]
  ] as const)("maps structured recommendation failure to %s", async (error, kind) => {
    const state = await loadDetailState(detailDependencies({
      loadRecommendations: vi.fn().mockRejectedValue(error)
    }));

    expect(state.kind).toBe(kind);
  });

  it("returns a retryable safe error for network recommendation failure", async () => {
    const state = await loadDetailState(detailDependencies({
      loadRecommendations: vi.fn().mockRejectedValue(new TypeError("offline"))
    }));

    expect(state).toEqual({
      kind: "error",
      message: "暂时无法加载推荐详情，请重试。",
      retryable: true
    });
  });

  it("prevents a rendered group action after the active group changes", async () => {
    const action = vi.fn();
    const result = await runDetailActionWithContext(
      readyDetailState(),
      vi.fn().mockResolvedValue(connectedStorage("group-2")),
      action
    );

    expect(result.kind).toBe("stale");
    expect(action).not.toHaveBeenCalled();
  });

  it("passes one captured storage snapshot to a matching group action", async () => {
    const storage = connectedStorage("group-1");
    const action = vi.fn().mockResolvedValue("saved");

    await expect(runDetailActionWithContext(
      readyDetailState(),
      vi.fn().mockResolvedValue(storage),
      action
    )).resolves.toMatchObject({ kind: "performed", value: "saved" });
    expect(action).toHaveBeenCalledWith(storage);
  });

  it("replaces the local decided restaurant and participation summary", () => {
    const update = participationUpdate("restaurant-2");

    expect(applyDetailDecisionUpdate(readyDetailState("restaurant-1"), update))
      .toMatchObject({
        kind: "ready",
        decidedRestaurantId: "restaurant-2",
        response: { participationSummary: update.summary }
      });
  });

  it.each([
    { groupId: "group-2" },
    { officeDate: "2026-07-11" }
  ])("does not merge a decision from another recommendation batch", (override) => {
    const state = readyDetailState("restaurant-1");
    const update = { ...participationUpdate("restaurant-2"), ...override };

    expect(applyDetailDecisionUpdate(state, update)).toBe(state);
  });

  it("keeps cached content visibly marked when adding an announcement", () => {
    expect(mergeDetailAnnouncement(
      cachedDetailState(),
      "当前小组已切换，已加载当前小组内容，请重新操作。"
    )).toBe(
      "当前小组已切换，已加载当前小组内容，请重新操作。 缓存内容仅供查看"
    );
  });
});
