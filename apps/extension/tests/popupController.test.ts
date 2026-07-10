import type {
  GroupTodayRecommendationsResponse,
  ParticipationTodayResponse,
  PutParticipationTodayResponse
} from "@lunch/shared";
import { describe, expect, it, vi } from "vitest";
import { ExtensionApiError } from "../src/apiClient";
import {
  applyParticipationUpdate,
  classifyPopupError,
  classifyPopupRetryOutcome,
  composeStaleReloadStatus,
  currentMemberParticipation,
  loadRefreshedPopupState,
  loadRefreshedPopupStateForStorage,
  loadPopupState,
  runPopupActionWithContext,
  resolvePopupActionFailure,
  restoreRecommendationFocus,
  type PopupDependencies
} from "../src/popupController";
import { getDefaultStorageState } from "../src/storage";

function todayResponse(groupId: string): GroupTodayRecommendationsResponse {
  return {
    groupId,
    officeDate: "2026-07-10",
    batchId: "batch-1",
    batchNo: 1,
    generatedAt: "2026-07-10T03:30:00.000Z",
    participationSummary: {
      joiningCount: 1,
      decidedCount: 0,
      awayCount: 0,
      undecidedCount: 0
    },
    items: [{
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
    }]
  };
}

function participationResponse(
  groupId = "group-1"
): ParticipationTodayResponse {
  return {
    groupId,
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
      status: "joining"
    }]
  };
}

function popupDependencies(
  overrides: Partial<PopupDependencies> = {}
): PopupDependencies {
  const dependencies: PopupDependencies = {
    loadStorage: vi.fn().mockResolvedValue({
      ...getDefaultStorageState(),
      activeGroupId: "group-1",
      sessionsByGroupId: {
        "group-1": { token: "group-session-token" }
      },
      groupSummariesById: {
        "group-1": {
          groupId: "group-1",
          name: "午饭小组",
          role: "member",
          membershipId: "membership-1"
        }
      }
    }),
    loadRecommendations: vi.fn().mockResolvedValue(todayResponse("group-1")),
    loadParticipation: vi.fn().mockResolvedValue(participationResponse())
  };
  return { ...dependencies, ...overrides };
}

function storageForGroup(
  groupId: string,
  membershipId: string
): ReturnType<typeof getDefaultStorageState> {
  return {
    ...getDefaultStorageState(),
    activeGroupId: groupId,
    sessionsByGroupId: {
      [groupId]: { token: `${groupId}-session-token` }
    },
    groupSummariesById: {
      [groupId]: {
        groupId,
        name: `${groupId} 午饭组`,
        role: "member",
        membershipId
      }
    }
  };
}

describe("popup controller", () => {
  it("returns disconnected before making a network request", async () => {
    const loadRecommendations = vi.fn();
    const state = await loadPopupState({
      loadStorage: vi.fn().mockResolvedValue(getDefaultStorageState()),
      loadRecommendations,
      loadParticipation: vi.fn()
    });

    expect(state.kind).toBe("disconnected");
    expect(loadRecommendations).not.toHaveBeenCalled();
  });

  it.each([
    [new ExtensionApiError({
      kind: "http",
      status: 404,
      code: "no_current_batch"
    }), "no-current-batch"],
    [new ExtensionApiError({ kind: "http", status: 401 }), "session-expired"],
    [new ExtensionApiError({ kind: "http", status: 403 }), "forbidden"],
    [new ExtensionApiError({ kind: "http", status: 503 }), "error"],
    [new Error("offline"), "error"]
  ] as const)("classifies popup failures as %s", (error, expected) => {
    expect(classifyPopupError(error)).toBe(expected);
  });

  it("maps no_current_batch to a generate state", async () => {
    const state = await loadPopupState(popupDependencies({
      loadRecommendations: vi.fn().mockRejectedValue(
        new ExtensionApiError({
          kind: "http",
          status: 404,
          code: "no_current_batch"
        })
      )
    }));

    expect(state).toMatchObject({ kind: "no-current-batch", groupId: "group-1" });
  });

  it("marks matching cached data read-only without fetching participation", async () => {
    const loadParticipation = vi.fn();
    const state = await loadPopupState(popupDependencies({
      loadRecommendations: vi.fn().mockResolvedValue({
        ...todayResponse("group-1"),
        fromCache: true
      }),
      loadParticipation
    }));

    expect(state).toMatchObject({ kind: "cached", readOnly: true });
    expect(loadParticipation).not.toHaveBeenCalled();
  });

  it("matches the active membership", async () => {
    const participation = participationResponse();
    expect(currentMemberParticipation(participation, "membership-1")).toEqual(
      participation.members[0]
    );

    const state = await loadPopupState(popupDependencies());
    expect(state).toMatchObject({
      kind: "ready",
      currentMember: {
        membershipId: "membership-1",
        status: "joining"
      }
    });
  });

  it("preserves recommendations if participation fails", async () => {
    const state = await loadPopupState(popupDependencies({
      loadParticipation: vi.fn().mockRejectedValue(
        new ExtensionApiError({ kind: "http", status: 503 })
      )
    }));

    expect(state).toMatchObject({
      kind: "ready",
      response: todayResponse("group-1"),
      participationUnavailable: true
    });
  });

  it("rejects a recommendation response from a different group snapshot", async () => {
    let resolveRecommendations!: (
      response: GroupTodayRecommendationsResponse
    ) => void;
    const loadParticipation = vi.fn();
    const dependencies = popupDependencies({
      loadRecommendations: vi.fn(() => new Promise<
        GroupTodayRecommendationsResponse
      >((resolve) => {
        resolveRecommendations = resolve;
      })),
      loadParticipation
    });

    const pendingState = loadPopupState(dependencies);
    await vi.waitFor(() => {
      expect(dependencies.loadStorage).toHaveBeenCalledOnce();
      expect(dependencies.loadRecommendations).toHaveBeenCalledOnce();
    });
    expect(dependencies.loadRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({ activeGroupId: "group-1" })
    );
    resolveRecommendations(todayResponse("group-2"));

    const state = await pendingState;
    expect(state).toMatchObject({
      kind: "error",
      group: { groupId: "group-1" },
      message: "暂时无法加载今日推荐，请重试。"
    });
    expect("response" in state).toBe(false);
    expect(loadParticipation).not.toHaveBeenCalled();
  });

  it("rejects participation from a different group snapshot", async () => {
    let resolveParticipation!: (response: ParticipationTodayResponse) => void;
    const dependencies = popupDependencies({
      loadParticipation: vi.fn(() => new Promise<ParticipationTodayResponse>(
        (resolve) => {
          resolveParticipation = resolve;
        }
      ))
    });

    const pendingState = loadPopupState(dependencies);
    await vi.waitFor(() => {
      expect(dependencies.loadStorage).toHaveBeenCalledOnce();
      expect(dependencies.loadParticipation).toHaveBeenCalledOnce();
    });
    expect(dependencies.loadParticipation).toHaveBeenCalledWith(
      expect.objectContaining({ activeGroupId: "group-1" })
    );
    resolveParticipation(participationResponse("group-2"));

    const state = await pendingState;
    expect(state).toMatchObject({
      kind: "error",
      group: { groupId: "group-1" },
      message: "暂时无法加载今日推荐，请重试。"
    });
    expect("response" in state).toBe(false);
  });

  it.each([
    [401, "session-expired"],
    [403, "forbidden"]
  ] as const)(
    "maps participation HTTP %s to %s instead of preserving writable recommendations",
    async (status, kind) => {
      const state = await loadPopupState(popupDependencies({
        loadParticipation: vi.fn().mockRejectedValue(
          new ExtensionApiError({ kind: "http", status })
        )
      }));

      expect(state).toMatchObject({
        kind,
        group: { groupId: "group-1" }
      });
      expect("response" in state).toBe(false);
    }
  );

  it("maps invalid participation failures to a stable safe error", async () => {
    const state = await loadPopupState(popupDependencies({
      loadParticipation: vi.fn().mockRejectedValue(
        new ExtensionApiError({
          kind: "invalid-response",
          message: "token=private-session-token"
        })
      )
    }));

    expect(state).toMatchObject({
      kind: "error",
      group: { groupId: "group-1" },
      message: "暂时无法加载今日推荐，请重试。"
    });
    expect(JSON.stringify(state)).not.toContain("private-session-token");
    expect("response" in state).toBe(false);
  });

  it.each([
    [401, "session-expired"],
    [403, "forbidden"]
  ] as const)("routes action HTTP %s to %s", async (status, kind) => {
    const state = await loadPopupState(popupDependencies());
    const resolution = resolvePopupActionFailure(
      state,
      new ExtensionApiError({ kind: "http", status }),
      "记录失败，请重试。"
    );

    expect(resolution).toMatchObject({
      kind: "state",
      state: { kind, group: { groupId: "group-1" } }
    });
  });

  it("uses stable safe copy for non-auth action failures", async () => {
    const state = await loadPopupState(popupDependencies());
    const resolution = resolvePopupActionFailure(
      state,
      new ExtensionApiError({
        kind: "invalid-response",
        message: "Bearer private-session-token"
      }),
      "记录反馈失败，请重试。"
    );

    expect(resolution).toEqual({
      kind: "message",
      message: "记录反馈失败，请重试。"
    });
    expect(JSON.stringify(resolution)).not.toContain("private-session-token");
  });

  it("blocks a rendered-group-A action after storage switches to group B", async () => {
    const renderedState = await loadPopupState(popupDependencies());
    const storage = storageForGroup("group-2", "membership-2");
    const loadStorage = vi.fn().mockResolvedValue(storage);
    const write = vi.fn().mockResolvedValue("unexpected-write");

    const result = await runPopupActionWithContext(
      renderedState,
      loadStorage,
      write
    );

    expect(result).toEqual({
      kind: "stale",
      storage,
      message: "当前小组已切换，已加载当前小组内容，请重新操作。"
    });
    expect(loadStorage).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
  });

  it("keeps cached/read-only copy after a stale-action reload", async () => {
    const state = await loadPopupState(popupDependencies({
      loadRecommendations: vi.fn().mockResolvedValue({
        ...todayResponse("group-1"),
        fromCache: true
      })
    }));

    const status = composeStaleReloadStatus(
      state,
      "当前小组已切换，已加载当前小组内容，请重新操作。"
    );

    expect(status).toBe(
      "缓存内容仅供查看，写入操作已停用。你仍可重试或打开设置。"
    );
    expect(status).not.toContain("最新");
  });

  it("keeps participation-unavailable copy after a stale-action reload", async () => {
    const state = await loadPopupState(popupDependencies({
      loadParticipation: vi.fn().mockRejectedValue(
        new ExtensionApiError({ kind: "http", status: 503 })
      )
    }));

    expect(composeStaleReloadStatus(
      state,
      "当前小组已切换，已加载当前小组内容，请重新操作。"
    )).toBe("参与状态暂时无法读取，推荐内容仍可查看和重试。");
  });

  it("announces fresh group switches without obscuring auth or error recovery", async () => {
    const freshState = await loadPopupState(popupDependencies());
    const switchMessage = "当前小组已切换，已加载当前小组内容，请重新操作。";

    expect(composeStaleReloadStatus(freshState, switchMessage)).toBe(
      switchMessage
    );
    expect(composeStaleReloadStatus({
      kind: "session-expired",
      group: freshState.kind === "ready" ? freshState.group : undefined
    }, switchMessage)).toBeNull();
    expect(composeStaleReloadStatus({
      kind: "error",
      message: "暂时无法加载今日推荐，请重试。"
    }, switchMessage)).toBeNull();
  });

  it("passes the one verified click snapshot into the write", async () => {
    const renderedState = await loadPopupState(popupDependencies());
    const storage = storageForGroup("group-1", "membership-1");
    const loadStorage = vi.fn().mockResolvedValue(storage);
    const write = vi.fn().mockResolvedValue("written");

    const result = await runPopupActionWithContext(
      renderedState,
      loadStorage,
      write
    );

    expect(result).toEqual({ kind: "performed", storage, value: "written" });
    expect(loadStorage).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(storage);
  });

  it("distinguishes fresh retry success from retryable cached/error outcomes", async () => {
    const readyState = await loadPopupState(popupDependencies());
    const cachedState = await loadPopupState(popupDependencies({
      loadRecommendations: vi.fn().mockResolvedValue({
        ...todayResponse("group-1"),
        fromCache: true
      })
    }));

    expect(classifyPopupRetryOutcome(readyState)).toEqual({
      kind: "fresh",
      announcement: "已获取最新推荐。"
    });
    expect(classifyPopupRetryOutcome(cachedState)).toEqual({
      kind: "retryable-failure",
      announcement: "暂时仍无法获取最新推荐，当前为缓存只读内容，请重试。"
    });
    expect(classifyPopupRetryOutcome({
      kind: "error",
      message: "暂时无法加载今日推荐，请重试。"
    })).toEqual({
      kind: "retryable-failure",
      announcement: "暂时仍无法获取最新推荐，请重试。"
    });
  });

  it("restores focus to the originating restaurant or a safe fallback", () => {
    const firstFocus = vi.fn();
    const originFocus = vi.fn();
    const fallbackFocus = vi.fn();
    const targets = [
      { restaurantId: "restaurant-1", focus: firstFocus },
      { restaurantId: "restaurant-'\"] unsafe", focus: originFocus }
    ];

    expect(restoreRecommendationFocus(
      targets,
      "restaurant-'\"] unsafe",
      { focus: fallbackFocus }
    )).toBe("card");
    expect(originFocus).toHaveBeenCalledOnce();
    expect(firstFocus).not.toHaveBeenCalled();
    expect(fallbackFocus).not.toHaveBeenCalled();

    expect(restoreRecommendationFocus(
      targets,
      "missing-restaurant",
      { focus: fallbackFocus }
    )).toBe("fallback");
    expect(fallbackFocus).toHaveBeenCalledOnce();
  });

  it("uses the authoritative refresh response without a redundant recommendation read", async () => {
    const freshResponse = {
      ...todayResponse("group-1"),
      batchId: "batch-2",
      batchNo: 2
    };
    const redundantRead = vi.fn().mockResolvedValue({
      ...freshResponse,
      fromCache: true
    });

    const state = await loadRefreshedPopupState({
      ...popupDependencies({ loadRecommendations: redundantRead }),
      refreshRecommendations: vi.fn().mockResolvedValue(freshResponse)
    });

    expect({
      stateKind: state.kind,
      redundantReads: redundantRead.mock.calls.length
    }).toEqual({
      stateKind: "ready",
      redundantReads: 0
    });
    expect(state).toMatchObject({
      kind: "ready",
      response: { batchId: "batch-2" }
    });
  });

  it("captures refresh storage before the request and rejects another group's response", async () => {
    const calls: string[] = [];
    const loadParticipation = vi.fn();
    const dependencies = popupDependencies({
      loadStorage: vi.fn(async () => {
        calls.push("storage");
        return await popupDependencies().loadStorage();
      }),
      loadParticipation
    });
    const refreshRecommendations = vi.fn(async () => {
      calls.push("refresh");
      return todayResponse("group-2");
    });

    const state = await loadRefreshedPopupState({
      ...dependencies,
      refreshRecommendations
    });

    expect(calls).toEqual(["storage", "refresh"]);
    expect(dependencies.loadStorage).toHaveBeenCalledOnce();
    expect(refreshRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({ activeGroupId: "group-1" })
    );
    expect(state).toMatchObject({
      kind: "error",
      group: { groupId: "group-1" },
      message: "暂时无法加载今日推荐，请重试。"
    });
    expect("response" in state).toBe(false);
    expect(loadParticipation).not.toHaveBeenCalled();
  });

  it("refreshes and derives state from the already verified click snapshot", async () => {
    const storage = storageForGroup("group-1", "membership-1");
    const dependencies = popupDependencies({
      loadStorage: vi.fn(),
      loadRecommendations: vi.fn(),
      loadParticipation: vi.fn().mockResolvedValue(participationResponse())
    });
    const refreshRecommendations = vi.fn().mockResolvedValue({
      ...todayResponse("group-1"),
      batchId: "batch-verified-refresh"
    });

    const state = await loadRefreshedPopupStateForStorage(storage, {
      ...dependencies,
      refreshRecommendations
    });

    expect(dependencies.loadStorage).not.toHaveBeenCalled();
    expect(refreshRecommendations).toHaveBeenCalledOnce();
    expect(refreshRecommendations).toHaveBeenCalledWith(storage);
    expect(dependencies.loadParticipation).toHaveBeenCalledWith(storage);
    expect(state).toMatchObject({
      kind: "ready",
      response: { batchId: "batch-verified-refresh", groupId: "group-1" }
    });
  });

  it("applies a participation update to the current member and summaries immutably", async () => {
    const participation = participationResponse();
    participation.members[0] = {
      ...participation.members[0]!,
      status: "away"
    };
    participation.summary = {
      joiningCount: 0,
      decidedCount: 0,
      awayCount: 1,
      undecidedCount: 0
    };
    const readyState = await loadPopupState(popupDependencies({
      loadParticipation: vi.fn().mockResolvedValue(participation)
    }));
    expect(readyState.kind).toBe("ready");
    if (readyState.kind !== "ready") throw new Error("expected ready state");

    const update: PutParticipationTodayResponse = {
      groupId: "group-1",
      officeDate: "2026-07-10",
      participation: {
        membershipId: "membership-1",
        displayName: "小林",
        status: "joining"
      },
      summary: {
        joiningCount: 1,
        decidedCount: 0,
        awayCount: 0,
        undecidedCount: 0
      }
    };

    const nextState = applyParticipationUpdate(readyState, update);

    expect(nextState).toMatchObject({
      kind: "ready",
      currentMember: { status: "joining" },
      response: {
        participationSummary: {
          joiningCount: 1,
          decidedCount: 0,
          awayCount: 0,
          undecidedCount: 0
        }
      }
    });
    expect(nextState).not.toBe(readyState);
    expect(readyState.currentMember?.status).toBe("away");
    expect(readyState.participation?.members[0]?.status).toBe("away");
    expect(nextState.kind === "ready" && nextState.participation).toMatchObject({
      summary: update.summary,
      members: [{ status: "joining" }]
    });
  });

  it.each([
    ["groupId", { groupId: "group-2" }],
    ["officeDate", { officeDate: "2026-07-11" }]
  ] as const)("rejects a participation update with mismatched %s", async (
    _field,
    mismatch
  ) => {
    const readyState = await loadPopupState(popupDependencies());
    expect(readyState.kind).toBe("ready");
    const update: PutParticipationTodayResponse = {
      groupId: "group-1",
      officeDate: "2026-07-10",
      participation: {
        membershipId: "membership-2",
        displayName: "foreign member",
        status: "decided",
        restaurantId: "restaurant-foreign"
      },
      summary: {
        joiningCount: 0,
        decidedCount: 99,
        awayCount: 0,
        undecidedCount: 0
      },
      ...mismatch
    };

    const nextState = applyParticipationUpdate(readyState, update);

    expect(nextState).toMatchObject({
      kind: "error",
      group: { groupId: "group-1" },
      message: "暂时无法加载今日推荐，请重试。"
    });
    expect("response" in nextState).toBe(false);
    expect(JSON.stringify(nextState)).not.toContain("foreign member");
    expect(readyState).toMatchObject({
      kind: "ready",
      currentMember: { membershipId: "membership-1" }
    });
  });
});
