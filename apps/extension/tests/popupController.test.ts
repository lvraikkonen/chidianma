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
  currentMemberParticipation,
  loadRefreshedPopupState,
  loadPopupState,
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

function participationResponse(): ParticipationTodayResponse {
  return {
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
});
