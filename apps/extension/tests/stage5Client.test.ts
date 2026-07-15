import type {
  GroupSettingsResponse,
  ParticipationTodayResponse,
  PersonalLunchHistoryResponse
} from "@lunch/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getGroupSettingsForContext,
  getPersonalHistoryForContext,
  getTodayParticipationForContext,
  type ExtensionGroupContext
} from "../src/stage5Client";

const context: ExtensionGroupContext = {
  apiBaseUrl: "https://lunch.example/base/",
  groupId: "group-1",
  membershipId: "membership-1",
  groupSessionToken: "group-session-token"
};

function settingsResponse(groupId = "group-1"): GroupSettingsResponse {
  return {
    groupId,
    group: {
      name: "设计组",
      officeTimezone: "Asia/Shanghai",
      officeCity: "上海",
      officeLatitude: 31.23,
      officeLongitude: 121.47
    },
    reminder: {
      reminderTime: "11:30",
      weekdayReminderEnabled: true,
      secondReminderEnabled: false,
      notificationTitle: "中午吃点啥"
    },
    scoringWeights: {
      weekdayMatch: 20,
      weatherMatch: 20,
      distance: 20,
      teammateRecommendation: 20,
      recentDuplicatePenalty: 20,
      negativeFeedbackPenalty: 20
    },
    invite: { version: 1, rotatedAt: "2026-07-14T00:00:00.000Z" }
  };
}

function historyResponse(
  groupId = "group-1",
  membershipId = "membership-1"
): PersonalLunchHistoryResponse {
  return {
    groupId,
    membershipId,
    window: { startDate: "2026-06-15", endDate: "2026-07-14" },
    items: [],
    preference: { status: "insufficient", decidedCount: 0 }
  };
}

function participationResponse(groupId = "group-1"): ParticipationTodayResponse {
  return {
    groupId,
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

function stubJson(value: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(value)
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Stage 5 Extension group resources client", () => {
  it.each([
    ["settings", getGroupSettingsForContext, "/api/groups/group-1/settings", settingsResponse()],
    ["history", getPersonalHistoryForContext, "/api/groups/group-1/history/me", historyResponse()],
    ["participation", getTodayParticipationForContext, "/api/groups/group-1/participation/today", participationResponse()]
  ] as const)("reads %s with the captured group bearer token", async (
    _name,
    request,
    path,
    response
  ) => {
    const fetchMock = stubJson(response);

    await expect(request(context)).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(path, context.apiBaseUrl),
      { headers: { authorization: "Bearer group-session-token" } }
    );
  });

  it("rejects a settings response from another group", async () => {
    stubJson(settingsResponse("group-2"));

    await expect(getGroupSettingsForContext(context)).rejects.toMatchObject({
      kind: "invalid-response",
      code: "group_response_mismatch"
    });
  });

  it("rejects personal history for another membership", async () => {
    stubJson(historyResponse("group-1", "membership-2"));

    await expect(getPersonalHistoryForContext(context)).rejects.toMatchObject({
      kind: "invalid-response",
      code: "membership_response_mismatch"
    });
  });

  it("preserves group HTTP errors without retrying another context", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: vi.fn().mockResolvedValue({ error: "removed_member" })
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPersonalHistoryForContext(context)).rejects.toMatchObject({
      status: 403,
      code: "removed_member"
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
