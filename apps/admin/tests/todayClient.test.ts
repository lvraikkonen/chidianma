import type {
  GroupTodayRecommendationsResponse,
  ParticipationTodayResponse
} from "@lunch/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getParticipation,
  getToday,
  refreshToday,
  type AdminGroupContext
} from "../src/clients/today";

function todayResponse(): GroupTodayRecommendationsResponse {
  return {
    groupId: "group-1",
    officeDate: "2026-07-14",
    batchId: "batch-1",
    batchNo: 1,
    generatedAt: "2026-07-14T19:00:00.000Z",
    participationSummary: {
      joiningCount: 0,
      decidedCount: 0,
      awayCount: 0,
      undecidedCount: 1
    },
    items: []
  };
}

function participationResponse(): ParticipationTodayResponse {
  return {
    groupId: "group-1",
    officeDate: "2026-07-14",
    members: [],
    summary: {
      joiningCount: 0,
      decidedCount: 0,
      awayCount: 0,
      undecidedCount: 1
    }
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("today client", () => {
  it("uses exact group routes and the captured group session", async () => {
    const responses = [todayResponse(), todayResponse(), participationResponse()];
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => responses.shift()
    }));
    vi.stubGlobal("fetch", fetchMock);
    const context: AdminGroupContext = {
      apiBaseUrl: "https://lunch.example",
      groupId: "group-1",
      token: "group-session-token"
    };

    await getToday(context);
    await refreshToday(context);
    await getParticipation(context);

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ["https://lunch.example/api/groups/group-1/today-recommendations", undefined],
      ["https://lunch.example/api/groups/group-1/today-recommendations/refresh", "POST"],
      ["https://lunch.example/api/groups/group-1/participation/today", undefined]
    ]);
    expect(fetchMock.mock.calls.every(([, init]) =>
      (init?.headers as Record<string, string>).authorization === "Bearer group-session-token"
    )).toBe(true);
  });
});
