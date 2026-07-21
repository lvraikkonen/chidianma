import type { GroupWheelCandidatesResponse } from "@lunch/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtensionApiError } from "../src/apiClient";
import { STORAGE_KEYS } from "../src/config";
import { fetchGroupWheelCandidatesForStorage } from "../src/wheelClient";
import { getDefaultStorageState } from "../src/storage";

function connectedStorage(groupId = "group-1") {
  return {
    ...getDefaultStorageState(),
    apiBaseUrl: "https://lunch.example/base/",
    activeGroupId: groupId,
    sessionsByGroupId: {
      [groupId]: { token: `${groupId}-captured-token` }
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

function candidate(index: number) {
  return {
    restaurantId: `restaurant-${index}`,
    recommendationId: `recommendation-${index}`,
    name: `餐厅 ${index}`,
    dish: `招牌菜 ${index}`,
    reason: "距离合适",
    distanceMinutes: 5 + index,
    tags: ["近"],
    recommendationScore: 50 - index,
    selectedWithinLast7Days: false
  };
}

function response(
  groupId = "group-1",
  count = 2
): GroupWheelCandidatesResponse {
  return {
    groupId,
    officeDate: "2026-07-20",
    batchId: "batch-1",
    algorithmVersion: "explainable-v1",
    candidates: Array.from({ length: count }, (_, index) => candidate(index + 1))
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("wheel candidate client", () => {
  it("uses the captured group route, bearer token, and cancellation signal", async () => {
    const signal = new AbortController().signal;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(response())
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchGroupWheelCandidatesForStorage(connectedStorage(), signal)
    ).resolves.toEqual(response());

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "/api/groups/group-1/today-recommendations/wheel-candidates",
        "https://lunch.example/base/"
      ),
      {
        headers: { authorization: "Bearer group-1-captured-token" },
        signal
      }
    );
  });

  it("uses only the supplied popup snapshot after the active group changes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(response("group-1"))
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchGroupWheelCandidatesForStorage(connectedStorage("group-1"));

    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "/api/groups/group-1/today-recommendations/wheel-candidates",
        "https://lunch.example/base/"
      ),
      expect.objectContaining({
        headers: { authorization: "Bearer group-1-captured-token" }
      })
    );
  });

  it("reuses the one-time group session renewal path after a 401", async () => {
    const stored = {
      ...connectedStorage(),
      identityId: "identity-1",
      identityToken: "identity-token"
    };
    const locks = {
      request: vi.fn(async (
        _name: string,
        _options: LockOptions,
        callback: () => Promise<unknown>
      ) => callback())
    };
    vi.stubGlobal("navigator", { locks });
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({ [STORAGE_KEYS.state]: stored }),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined)
        }
      },
      runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) }
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: vi.fn().mockResolvedValue({ error: "expired_token" })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          identityToken: "identity-token",
          identityTokenExpiresAt: "2026-10-20T00:00:00.000Z",
          groupSessionToken: "renewed-group-token",
          groupSessionTokenExpiresAt: "2026-08-20T00:00:00.000Z",
          group: stored.groupSummariesById["group-1"]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(response())
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchGroupWheelCandidatesForStorage(stored)
    ).resolves.toEqual(response());

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { authorization: "Bearer group-1-captured-token" }
    });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      headers: { authorization: "Bearer identity-token" }
    });
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      headers: { authorization: "Bearer renewed-group-token" }
    });
  });

  it("does not request without an active group session", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchGroupWheelCandidatesForStorage({
      ...getDefaultStorageState(),
      activeGroupId: "group-1"
    })).rejects.toThrow("No active group session configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a response for another group", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(response("group-2"))
    }));

    await expect(
      fetchGroupWheelCandidatesForStorage(connectedStorage())
    ).rejects.toMatchObject({
      kind: "invalid-response",
      code: "group_response_mismatch"
    });
  });

  it.each([
    ["more than eight candidates", { ...response(), candidates: Array.from({ length: 9 }, (_, i) => candidate(i + 1)) }],
    ["duplicate restaurant ids", { ...response(), candidates: [candidate(1), candidate(1)] }],
    ["non-finite scores", { ...response(), candidates: [{ ...candidate(1), recommendationScore: Number.NaN }] }],
    ["invalid recent selection signal", { ...response(), candidates: [{ ...candidate(1), selectedWithinLast7Days: "false" }] }],
    ["invalid office date", { ...response(), officeDate: "2026-02-30" }],
    ["invalid optional fields", { ...response(), candidates: [{ ...candidate(1), distanceMinutes: "5" }] }],
    ["blank recommendation ids", { ...response(), candidates: [{ ...candidate(1), recommendationId: "  " }] }]
  ])("rejects %s", async (_label, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(body)
    }));

    await expect(
      fetchGroupWheelCandidatesForStorage(connectedStorage())
    ).rejects.toMatchObject({
      kind: "invalid-response",
      code: "invalid_wheel_candidates_response"
    });
  });

  it("preserves the Server feature-disabled error without cache fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValue({
        error: "lucky_restaurant_wheel_not_enabled",
        message: "Lucky restaurant wheel is not enabled for this group"
      })
    }));

    await expect(
      fetchGroupWheelCandidatesForStorage(connectedStorage())
    ).rejects.toMatchObject({
      status: 404,
      code: "lucky_restaurant_wheel_not_enabled"
    });
  });

  it("surfaces network failures without recommendation cache fallback", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(
      fetchGroupWheelCandidatesForStorage(connectedStorage())
    ).rejects.toEqual(expect.objectContaining<Partial<ExtensionApiError>>({
      kind: "network",
      message: "offline"
    }));
  });
});
