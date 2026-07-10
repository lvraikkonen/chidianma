import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTHORIZATION_HEADER, GROUP_ROUTES, READ_TOKEN_HEADER } from "@lunch/shared";
import { STORAGE_KEYS } from "../src/config";
import {
  decideTodayRecommendation,
  fetchGroupTodayRecommendationsWithCacheFallbackForStorage,
  ensureGroupTodayRecommendations,
  fetchTodayParticipation,
  fetchTodayParticipationForStorage,
  fetchTodayRecommendations,
  postFeedback,
  putTodayParticipation,
  refreshGroupTodayRecommendations,
  refreshGroupTodayRecommendationsForStorage,
  refreshTodayRecommendations
} from "../src/recommendationClient";
import { getDefaultStorageState, STORAGE_STATE_LOCK_NAME } from "../src/storage";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubGroupedState(extra: Partial<ReturnType<typeof getDefaultStorageState>> = {}) {
  const locks = {
    request: vi.fn(
      async (
        _name: string,
        _options: LockOptions,
        callback: () => Promise<unknown>
      ) => callback()
    )
  };
  const get = vi.fn().mockResolvedValue({
    [STORAGE_KEYS.state]: {
      ...getDefaultStorageState(),
      apiBaseUrl: "https://lunch.example",
      activeGroupId: "group-1",
      sessionsByGroupId: {
        "group-1": { token: "group-session-token" }
      },
      ...extra
    }
  });
  const set = vi.fn().mockResolvedValue(undefined);

  vi.stubGlobal("navigator", { locks });
  vi.stubGlobal("chrome", {
    storage: {
      local: { get, set }
    }
  });

  return { get, set, locks };
}

function groupRecommendationResponse(groupId: string, batchId: string) {
  return {
    groupId,
    officeDate: "2026-07-09",
    batchId,
    batchNo: 1,
    generatedAt: "2026-07-09T03:30:00.000Z",
    participationSummary: {
      joiningCount: 0,
      decidedCount: 0,
      awayCount: 0,
      undecidedCount: 1
    },
    items: []
  };
}

describe("group recommendation client", () => {
  it("uses the provided popup snapshot for recommendation, refresh, and participation", async () => {
    const snapshot = {
      ...getDefaultStorageState(),
      apiBaseUrl: "https://captured-lunch.example",
      activeGroupId: "group-1",
      sessionsByGroupId: {
        "group-1": { token: "captured-group-session-token" }
      },
      lastRecommendationsByGroupId: {
        "group-1": groupRecommendationResponse("group-1", "captured-cache")
      }
    };
    const recommendation = groupRecommendationResponse("group-1", "batch-1");
    const participation = {
      groupId: "group-1",
      officeDate: "2026-07-09",
      summary: {
        joiningCount: 0,
        decidedCount: 0,
        awayCount: 0,
        undecidedCount: 1
      },
      members: []
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => recommendation })
      .mockResolvedValueOnce({ ok: true, json: async () => recommendation })
      .mockResolvedValueOnce({ ok: true, json: async () => participation });
    vi.stubGlobal("fetch", fetchMock);
    stubGroupedState({
      apiBaseUrl: "https://current-lunch.example",
      activeGroupId: "group-2",
      sessionsByGroupId: {
        "group-2": { token: "current-group-session-token" }
      }
    });

    await expect(
      fetchGroupTodayRecommendationsWithCacheFallbackForStorage(snapshot)
    ).resolves.toEqual(recommendation);
    await expect(
      refreshGroupTodayRecommendationsForStorage(snapshot)
    ).resolves.toEqual(recommendation);
    await expect(fetchTodayParticipationForStorage(snapshot)).resolves.toEqual(
      participation
    );

    expect(fetchMock.mock.calls.map(([url]) => (url as URL).toString())).toEqual([
      `https://captured-lunch.example${GROUP_ROUTES.todayRecommendations("group-1")}`,
      `https://captured-lunch.example${GROUP_ROUTES.refreshTodayRecommendations("group-1")}`,
      `https://captured-lunch.example${GROUP_ROUTES.participationToday("group-1")}`
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toMatchObject({
        headers: expect.objectContaining({
          [AUTHORIZATION_HEADER]: "Bearer captured-group-session-token"
        })
      });
    }
  });

  it("uses only the provided popup snapshot for cache fallback", async () => {
    const snapshot = {
      ...getDefaultStorageState(),
      apiBaseUrl: "https://captured-lunch.example",
      activeGroupId: "group-1",
      sessionsByGroupId: {
        "group-1": { token: "captured-group-session-token" }
      },
      lastRecommendationsByGroupId: {
        "group-1": groupRecommendationResponse("group-1", "captured-cache")
      }
    };
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    stubGroupedState({
      activeGroupId: "group-2",
      sessionsByGroupId: {
        "group-2": { token: "current-group-session-token" }
      },
      lastRecommendationsByGroupId: {
        "group-2": groupRecommendationResponse("group-2", "current-cache")
      }
    });

    await expect(
      fetchGroupTodayRecommendationsWithCacheFallbackForStorage(snapshot)
    ).resolves.toMatchObject({
      groupId: "group-1",
      batchId: "captured-cache",
      fromCache: true
    });
  });

  it("uses the captured group cache after a network failure even if the active group changes", async () => {
    const groupOneCache = groupRecommendationResponse("group-1", "group-1-cache");
    const groupTwoCache = groupRecommendationResponse("group-2", "group-2-cache");
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const { get } = stubGroupedState();
    get.mockReset();
    get
      .mockResolvedValueOnce({
        [STORAGE_KEYS.state]: {
          ...getDefaultStorageState(),
          apiBaseUrl: "https://old-lunch.example",
          activeGroupId: "group-1",
          sessionsByGroupId: {
            "group-1": { token: "old-group-session-token" }
          },
          lastRecommendationsByGroupId: {
            "group-1": groupOneCache,
            "group-2": groupTwoCache
          }
        }
      })
      .mockResolvedValue({
        [STORAGE_KEYS.state]: {
          ...getDefaultStorageState(),
          apiBaseUrl: "https://new-lunch.example",
          activeGroupId: "group-2",
          sessionsByGroupId: {
            "group-2": { token: "new-group-session-token" }
          },
          lastRecommendationsByGroupId: {
            "group-1": groupOneCache,
            "group-2": groupTwoCache
          }
        }
      });

    await expect(fetchTodayRecommendations()).resolves.toMatchObject({
      groupId: "group-1",
      batchId: "group-1-cache",
      fromCache: true
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://old-lunch.example/api/groups/group-1/today-recommendations"),
      expect.objectContaining({
        headers: { [AUTHORIZATION_HEADER]: "Bearer old-group-session-token" }
      })
    );
  });

  it("uses the matching group cache after a recoverable 5xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: "service_unavailable" })
    }));
    stubGroupedState({
      lastRecommendationsByGroupId: {
        "group-1": groupRecommendationResponse("group-1", "group-1-cache")
      }
    });

    await expect(fetchTodayRecommendations()).resolves.toMatchObject({
      groupId: "group-1",
      batchId: "group-1-cache",
      fromCache: true
    });
  });

  it.each([400, 401, 403, 404])(
    "does not hide HTTP %s group responses with cache",
    async (status) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status,
        json: async () => ({ error: "request_rejected" })
      }));
      stubGroupedState({
        lastRecommendationsByGroupId: {
          "group-1": groupRecommendationResponse("group-1", "group-1-cache")
        }
      });

      await expect(fetchTodayRecommendations()).rejects.toThrow(`HTTP ${status}`);
    }
  );

  it.each([
    ["read", () => fetchTodayRecommendations()],
    ["refresh", () => refreshTodayRecommendations()],
    ["feedback", () => postFeedback({
      date: "2026-07-09",
      restaurantId: "restaurant-1",
      type: "want"
    })]
  ])("rejects group %s when activeGroupId has no session without using legacy", async (
    _operation,
    run
  ) => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ date: "2026-07-09", headline: "legacy", items: [] })
    });
    vi.stubGlobal("fetch", fetchMock);
    stubGroupedState({
      activeGroupId: "group-1",
      sessionsByGroupId: {},
      lastRecommendationsByGroupId: {
        "group-1": groupRecommendationResponse("group-1", "group-1-cache")
      }
    });

    await expect(run()).rejects.toThrow("No active group session configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a successful response for another group instead of hiding it with cache", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => groupRecommendationResponse("group-2", "group-2-batch")
    }));
    stubGroupedState({
      lastRecommendationsByGroupId: {
        "group-1": groupRecommendationResponse("group-1", "group-1-cache")
      }
    });

    await expect(fetchTodayRecommendations()).rejects.toThrow(
      "recommendation_cache_group_mismatch"
    );
  });

  it("uses one storage snapshot for the group host, path, token, and cache bucket", async () => {
    const fetchMock = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit
    ) => ({
      ok: true,
      json: async () => ({
        groupId: "group-1",
        officeDate: "2026-07-09",
        batchId: "batch-1",
        batchNo: 1,
        generatedAt: "2026-07-09T03:30:00.000Z",
        participationSummary: {
          joiningCount: 0,
          decidedCount: 0,
          awayCount: 0,
          undecidedCount: 1
        },
        items: []
      })
    } as Response));
    vi.stubGlobal("fetch", fetchMock);
    const { get, set } = stubGroupedState();
    get.mockReset();
    get
      .mockResolvedValueOnce({
        [STORAGE_KEYS.state]: {
          ...getDefaultStorageState(),
          apiBaseUrl: "https://old-lunch.example",
          activeGroupId: "group-1",
          sessionsByGroupId: {
            "group-1": { token: "old-group-session-token" }
          }
        }
      })
      .mockResolvedValue({
        [STORAGE_KEYS.state]: {
          ...getDefaultStorageState(),
          apiBaseUrl: "https://new-lunch.example",
          activeGroupId: "group-2",
          sessionsByGroupId: {
            "group-2": { token: "new-group-session-token" }
          }
        }
      });

    await fetchTodayRecommendations();

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://old-lunch.example/api/groups/group-1/today-recommendations"),
      expect.objectContaining({
        headers: {
          [AUTHORIZATION_HEADER]: "Bearer old-group-session-token"
        }
      })
    );
    expect(set).toHaveBeenCalledWith({
      [STORAGE_KEYS.state]: expect.objectContaining({
        activeGroupId: "group-2",
        lastRecommendationsByGroupId: expect.objectContaining({
          "group-1": expect.objectContaining({
            groupId: "group-1",
            batchId: "batch-1",
            fromCache: true
          })
        })
      })
    });
  });

  it("fetches current group today recommendations with the group session token", async () => {
    const fetchMock = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit
    ) => ({
      ok: true,
      json: async () => ({
        groupId: "group-1",
        officeDate: "2026-07-09",
        batchId: "batch-1",
        batchNo: 1,
        generatedAt: "2026-07-09T03:30:00.000Z",
        participationSummary: { joiningCount: 0, decidedCount: 0, awayCount: 0, undecidedCount: 1 },
        items: []
      })
    } as Response));
    vi.stubGlobal("fetch", fetchMock);
    const { locks } = stubGroupedState();

    await fetchTodayRecommendations();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect((url as URL).toString()).toBe(
      `https://lunch.example${GROUP_ROUTES.todayRecommendations("group-1")}`
    );
    expect(init).toMatchObject({
      headers: { [AUTHORIZATION_HEADER]: "Bearer group-session-token" }
    });
    expect(locks.request).toHaveBeenCalledWith(
      STORAGE_STATE_LOCK_NAME,
      { mode: "exclusive" },
      expect.any(Function)
    );
  });

  it("refreshes current group recommendations with POST refresh", async () => {
    const fetchMock = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit
    ) => ({
      ok: true,
      json: async () => ({
        groupId: "group-1",
        officeDate: "2026-07-09",
        batchId: "batch-2",
        batchNo: 2,
        generatedAt: "2026-07-09T04:00:00.000Z",
        participationSummary: { joiningCount: 0, decidedCount: 0, awayCount: 0, undecidedCount: 1 },
        items: []
      })
    } as Response));
    vi.stubGlobal("fetch", fetchMock);
    stubGroupedState();

    await refreshGroupTodayRecommendations();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect((url as URL).toString()).toBe(
      `https://lunch.example${GROUP_ROUTES.refreshTodayRecommendations("group-1")}`
    );
    expect(init).toMatchObject({ method: "POST" });
  });

  it("uses POST group refresh in the unified refresh flow", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        groupId: "group-1",
        officeDate: "2026-07-09",
        batchId: "batch-2",
        batchNo: 2,
        generatedAt: "2026-07-09T04:00:00.000Z",
        participationSummary: {
          joiningCount: 0,
          decidedCount: 0,
          awayCount: 0,
          undecidedCount: 1
        },
        items: []
      })
    } as Response));
    vi.stubGlobal("fetch", fetchMock);
    stubGroupedState();

    await refreshTodayRecommendations();

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://lunch.example/api/groups/group-1/today-recommendations/refresh"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("ensures recommendations by refreshing after no_current_batch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "no_current_batch", message: "No current batch" })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          groupId: "group-1",
          officeDate: "2026-07-09",
          batchId: "batch-1",
          batchNo: 1,
          generatedAt: "2026-07-09T03:30:00.000Z",
          participationSummary: { joiningCount: 0, decidedCount: 0, awayCount: 0, undecidedCount: 1 },
          items: []
        })
      });
    vi.stubGlobal("fetch", fetchMock);
    stubGroupedState({
      lastRecommendationsByGroupId: {
        "group-1": {
          groupId: "group-1",
          officeDate: "2026-07-08",
          batchId: "old-batch",
          batchNo: 1,
          generatedAt: "2026-07-08T03:30:00.000Z",
          participationSummary: { joiningCount: 0, decidedCount: 0, awayCount: 0, undecidedCount: 1 },
          items: [],
          fromCache: true
        }
      }
    });

    await ensureGroupTodayRecommendations();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1]?.[0] as URL).toString()).toBe(
      `https://lunch.example${GROUP_ROUTES.refreshTodayRecommendations("group-1")}`
    );
  });

  it("posts participation decisions to the active group", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) } as Response));
    vi.stubGlobal("fetch", fetchMock);
    stubGroupedState();

    await putTodayParticipation({ status: "joining" });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://lunch.example/api/groups/group-1/participation/today"),
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "content-type": "application/json",
          authorization: "Bearer group-session-token"
        }),
        body: JSON.stringify({ status: "joining" })
      })
    );
  });

  it("reads participation and returns the typed update response", async () => {
    const participation = {
      groupId: "group-1",
      officeDate: "2026-07-10",
      summary: {
        joiningCount: 1,
        decidedCount: 0,
        awayCount: 0,
        undecidedCount: 0
      },
      members: [{
        membershipId: "membership-1",
        displayName: "小林",
        status: "joining" as const
      }]
    };
    const update = {
      groupId: "group-1",
      officeDate: "2026-07-10",
      participation: participation.members[0],
      summary: participation.summary
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => participation })
      .mockResolvedValueOnce({ ok: true, json: async () => update });
    vi.stubGlobal("fetch", fetchMock);
    stubGroupedState();

    await expect(fetchTodayParticipation()).resolves.toEqual(participation);
    await expect(putTodayParticipation({ status: "joining" })).resolves.toEqual(update);
  });

  it("records the selected recommendation as today's decision", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) } as Response));
    vi.stubGlobal("fetch", fetchMock);
    stubGroupedState();

    await decideTodayRecommendation({
      restaurantId: "restaurant-1",
      recommendationId: "recommendation-1",
      restaurantName: "面馆",
      dish: "牛肉面",
      reason: "同事推荐",
      distanceMinutes: 8,
      tags: ["面食"],
      rank: 1,
      score: 42,
      scoreBreakdown: {
        weekdayMatch: 1,
        weatherMatch: 0,
        distance: 3,
        teammateRecommendation: 4,
        recentDuplicatePenalty: 0,
        negativeFeedbackPenalty: 0,
        total: 8
      }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://lunch.example/api/groups/group-1/participation/today"),
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          status: "decided",
          restaurantId: "restaurant-1",
          recommendationId: "recommendation-1"
        })
      })
    );
  });

  it("posts avoid feedback to the active group with group session auth", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) } as Response));
    vi.stubGlobal("fetch", fetchMock);
    stubGroupedState();

    await postFeedback({
      date: "2026-07-09",
      restaurantId: "restaurant-1",
      recommendationId: "recommendation-1",
      type: "avoid"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://lunch.example/api/groups/group-1/feedback"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          authorization: "Bearer group-session-token"
        }),
        body: JSON.stringify({
          officeDate: "2026-07-09",
          restaurantId: "restaurant-1",
          recommendationId: "recommendation-1",
          type: "avoid"
        })
      })
    );
  });
});

describe("legacy recommendation client fallback", () => {
  it("uses legacy read only when activeGroupId itself is absent", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        date: "2026-07-09",
        headline: "今天吃什么",
        items: []
      })
    } as Response));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            [STORAGE_KEYS.state]: {
              ...getDefaultStorageState(),
              apiBaseUrl: "https://lunch.example",
              readToken: "read-token"
            }
          }),
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    });

    await expect(fetchTodayRecommendations()).resolves.toMatchObject({
      date: "2026-07-09",
      headline: "今天吃什么"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://lunch.example/api/today-recommendations"),
      { headers: { [READ_TOKEN_HEADER]: "read-token" } }
    );
  });

  it("does not hide a legacy 401 response with cache", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "unauthorized" })
    }));
    const get = vi.fn(async (key: string | string[]) => {
      if (key === STORAGE_KEYS.lastRecommendation) {
        return {
          [STORAGE_KEYS.lastRecommendation]: {
            date: "2026-07-08",
            headline: "旧缓存",
            items: []
          }
        };
      }
      return {
        [STORAGE_KEYS.state]: {
          ...getDefaultStorageState(),
          apiBaseUrl: "https://lunch.example",
          readToken: "expired-read-token"
        }
      };
    });
    vi.stubGlobal("chrome", {
      storage: { local: { get, set: vi.fn() } }
    });

    await expect(fetchTodayRecommendations()).rejects.toThrow("HTTP 401");
  });

  it("keeps forceRefresh=true for unified refresh without an active group", async () => {
    const fetchMock = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit
    ) => ({
      ok: true,
      json: async () => ({
        date: "2026-07-09",
        headline: "今天吃什么",
        items: []
      })
    } as Response));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            [STORAGE_KEYS.state]: {
              ...getDefaultStorageState(),
              apiBaseUrl: "https://lunch.example",
              readToken: "read-token"
            }
          }),
          set: vi.fn().mockResolvedValue(undefined)
        }
      }
    });

    await refreshTodayRecommendations();

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://lunch.example/api/today-recommendations?forceRefresh=true"),
      {
        headers: {
          [READ_TOKEN_HEADER]: "read-token"
        }
      }
    );
  });

  it("keeps legacy feedback fallback when activeGroupId is absent", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true } as Response));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            [STORAGE_KEYS.state]: {
              ...getDefaultStorageState(),
              apiBaseUrl: "https://lunch.example",
              readToken: "read-token"
            }
          })
        }
      }
    });

    await postFeedback({
      date: "2026-07-09",
      restaurantId: "restaurant-1",
      recommendationId: "recommendation-1",
      type: "want"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://lunch.example/api/feedback"),
      expect.objectContaining({
        method: "POST",
        headers: {
          "content-type": "application/json",
          [READ_TOKEN_HEADER]: "read-token"
        },
        body: JSON.stringify({
          date: "2026-07-09",
          restaurantId: "restaurant-1",
          recommendationId: "recommendation-1",
          type: "want"
        })
      })
    );
  });
});
