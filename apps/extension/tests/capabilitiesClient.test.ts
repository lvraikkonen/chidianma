import type { GroupCapabilitiesResponse } from "@lunch/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGroupCapabilitiesForStorage } from "../src/capabilitiesClient";
import { getDefaultStorageState } from "../src/storage";

function storage() {
  return {
    ...getDefaultStorageState(),
    apiBaseUrl: "https://lunch.example/base/",
    activeGroupId: "group-1",
    sessionsByGroupId: {
      "group-1": { token: "captured-group-session-token" }
    }
  };
}

function response(groupId = "group-1"): GroupCapabilitiesResponse {
  return {
    groupId,
    features: {
      luckyRestaurantWheel: true,
      poiReferenceSearch: false,
      poiReferenceDraft: false,
      poiOfficePreset: false,
      poiProvider: null
    }
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("group capabilities client", () => {
  it("uses the captured group route and bearer session", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(response())
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchGroupCapabilitiesForStorage(storage())).resolves.toEqual(
      response()
    );
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/api/groups/group-1/capabilities", "https://lunch.example/base/"),
      { headers: { authorization: "Bearer captured-group-session-token" } }
    );
  });

  it("uses the newly captured group path and token after a group switch", async () => {
    const switchedStorage = {
      ...getDefaultStorageState(),
      apiBaseUrl: "https://lunch.example/base/",
      activeGroupId: "group-2",
      sessionsByGroupId: {
        "group-1": { token: "stale-group-1-token" },
        "group-2": { token: "current-group-2-token" }
      }
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(response("group-2"))
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      fetchGroupCapabilitiesForStorage(switchedStorage)
    ).resolves.toEqual(response("group-2"));
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/api/groups/group-2/capabilities", "https://lunch.example/base/"),
      { headers: { authorization: "Bearer current-group-2-token" } }
    );
  });

  it("rejects a response for another group", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(response("group-2"))
    }));

    await expect(fetchGroupCapabilitiesForStorage(storage())).rejects.toMatchObject({
      kind: "invalid-response",
      code: "group_response_mismatch"
    });
  });

  it("rejects malformed capability fields instead of treating them as enabled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        ...response(),
        features: {
          ...response().features,
          luckyRestaurantWheel: "true"
        }
      })
    }));

    await expect(fetchGroupCapabilitiesForStorage(storage())).rejects.toMatchObject({
      kind: "invalid-response",
      code: "invalid_capabilities_response"
    });
  });

  it("does not send a request without an active group session", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchGroupCapabilitiesForStorage({
      ...getDefaultStorageState(),
      activeGroupId: "group-1"
    })).rejects.toThrow("No active group session configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards a cancellation signal to the capabilities request", async () => {
    const signal = new AbortController().signal;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(response())
    });
    vi.stubGlobal("fetch", fetchMock);

    await fetchGroupCapabilitiesForStorage(storage(), signal);

    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({
      signal
    }));
  });
});
