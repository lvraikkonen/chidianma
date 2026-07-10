import type { GroupTodayRecommendationsResponse } from "@lunch/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../src/config";
import {
  getActiveGroupRecommendationCache,
  getActiveGroupSession,
  getDefaultSettings,
  getDefaultStorageState,
  getReminderSettingsForActiveGroup,
  getSettings,
  getStorageState,
  saveGroupRecommendationCache,
  saveSettings,
  saveStorageState,
  updateStorageState
} from "../src/storage";

function serialLockManager() {
  let queue = Promise.resolve();
  return {
    request: vi.fn(
      (
        _name: string,
        _options: LockOptions,
        callback: () => Promise<unknown>
      ) => {
        const run = queue.then(callback);
        queue = run.then(
          () => undefined,
          () => undefined
        );
        return run;
      }
    )
  };
}

beforeEach(() => {
  vi.stubGlobal("navigator", { locks: serialLockManager() });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function recommendationResponse(groupId: string, batchId: string): GroupTodayRecommendationsResponse {
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

describe("grouped extension storage", () => {
  it("uses grouped storage defaults without a read token requirement for group APIs", () => {
    expect(getDefaultStorageState()).toMatchObject({
      apiBaseUrl: "http://localhost:3000",
      sessionsByGroupId: {},
      groupSummariesById: {},
      lastRecommendationsByGroupId: {},
      localReminderOverridesByGroupId: {}
    });
  });

  it("merges defaults, legacy settings, then current grouped state", async () => {
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            [STORAGE_KEYS.settings]: {
              apiBaseUrl: "https://legacy.example",
              readToken: "legacy-read-token",
              reminderTime: "10:45",
              enabled: false
            },
            [STORAGE_KEYS.state]: {
              apiBaseUrl: "https://current.example",
              activeGroupId: "group-1",
              enabled: true,
              groupSummariesById: {
                "group-1": {
                  groupId: "group-1",
                  name: "Design",
                  role: "member",
                  membershipId: "membership-1"
                }
              }
            }
          })
        }
      }
    });

    await expect(getStorageState()).resolves.toMatchObject({
      apiBaseUrl: "https://current.example",
      readToken: "legacy-read-token",
      reminderTime: "10:45",
      enabled: true,
      activeGroupId: "group-1",
      sessionsByGroupId: {},
      groupSummariesById: {
        "group-1": expect.objectContaining({ name: "Design" })
      },
      lastRecommendationsByGroupId: {},
      localReminderOverridesByGroupId: {}
    });
  });

  it("writes the grouped storage state under the current state key", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", { storage: { local: { set } } });
    const state = getDefaultStorageState();

    await saveStorageState(state);

    expect(set).toHaveBeenCalledWith({ [STORAGE_KEYS.state]: state });
  });

  it("serializes settings, active group session, and cache mutations without lost updates", async () => {
    let storedState = getDefaultStorageState();
    const locks = serialLockManager();
    const get = vi.fn(async () => ({
      [STORAGE_KEYS.state]: structuredClone(storedState)
    }));
    const set = vi.fn(async (value: Record<string, unknown>) => {
      storedState = structuredClone(
        value[STORAGE_KEYS.state]
      ) as typeof storedState;
    });
    vi.stubGlobal("navigator", { locks });
    vi.stubGlobal("chrome", {
      storage: { local: { get, set } },
      runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) }
    });

    await Promise.all([
      saveSettings({
        apiBaseUrl: "https://lunch.example",
        readToken: "read-token",
        reminderTime: "12:00",
        enabled: false
      }),
      updateStorageState((state) => ({
        ...state,
        activeGroupId: "group-2",
        sessionsByGroupId: {
          ...state.sessionsByGroupId,
          "group-2": { token: "group-session-token" }
        }
      })),
      saveGroupRecommendationCache(
        "group-1",
        recommendationResponse("group-1", "batch-1")
      )
    ]);

    expect(locks.request).toHaveBeenCalledTimes(3);
    expect(storedState).toMatchObject({
      apiBaseUrl: "https://lunch.example",
      reminderTime: "12:00",
      enabled: false,
      activeGroupId: "group-2",
      sessionsByGroupId: {
        "group-2": { token: "group-session-token" }
      },
      lastRecommendationsByGroupId: {
        "group-1": expect.objectContaining({
          groupId: "group-1",
          fromCache: true
        })
      }
    });
  });

  it("resolves the active group session without requiring a legacy read token", async () => {
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            [STORAGE_KEYS.state]: {
              ...getDefaultStorageState(),
              readToken: "",
              activeGroupId: "group-1",
              sessionsByGroupId: {
                "group-1": { token: "group-session-token" }
              }
            }
          })
        }
      }
    });

    await expect(getActiveGroupSession()).resolves.toEqual({
      groupId: "group-1",
      token: "group-session-token"
    });
  });

  it("returns null when the active group has no session", async () => {
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            [STORAGE_KEYS.state]: {
              ...getDefaultStorageState(),
              activeGroupId: "group-1"
            }
          })
        }
      }
    });

    await expect(getActiveGroupSession()).resolves.toBeNull();
  });

  it("stores and reads recommendation cache only for the active group", async () => {
    const groupOneResponse = recommendationResponse("group-1", "batch-1");
    const groupTwoResponse = recommendationResponse("group-2", "batch-2");
    const set = vi.fn().mockResolvedValue(undefined);
    const get = vi.fn().mockResolvedValue({
      [STORAGE_KEYS.state]: {
        ...getDefaultStorageState(),
        activeGroupId: "group-2",
        lastRecommendationsByGroupId: {
          "group-1": groupOneResponse
        }
      }
    });
    vi.stubGlobal("chrome", { storage: { local: { get, set } } });

    expect(await getActiveGroupRecommendationCache()).toBeNull();

    await saveGroupRecommendationCache("group-2", groupTwoResponse);

    expect(set).toHaveBeenCalledWith({
      [STORAGE_KEYS.state]: expect.objectContaining({
        lastRecommendationsByGroupId: {
          "group-1": groupOneResponse,
          "group-2": { ...groupTwoResponse, fromCache: true }
        }
      })
    });
  });

  it("reads the recommendation cache for the matching active group", async () => {
    const groupOneResponse = recommendationResponse("group-1", "batch-1");
    const groupTwoResponse = recommendationResponse("group-2", "batch-2");
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            [STORAGE_KEYS.state]: {
              ...getDefaultStorageState(),
              activeGroupId: "group-2",
              lastRecommendationsByGroupId: {
                "group-1": groupOneResponse,
                "group-2": groupTwoResponse
              }
            }
          })
        }
      }
    });

    await expect(getActiveGroupRecommendationCache()).resolves.toEqual(groupTwoResponse);
  });

  it("rejects a recommendation response for another cache group", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { locks: serialLockManager() });
    vi.stubGlobal("chrome", {
      storage: { local: { get: vi.fn(), set } }
    });

    await expect(
      saveGroupRecommendationCache(
        "group-1",
        recommendationResponse("group-2", "batch-2")
      )
    ).rejects.toThrow("recommendation_cache_group_mismatch");
    expect(set).not.toHaveBeenCalled();
  });

  it("ignores a stored cache whose response group does not match the active bucket", async () => {
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            [STORAGE_KEYS.state]: {
              ...getDefaultStorageState(),
              activeGroupId: "group-1",
              lastRecommendationsByGroupId: {
                "group-1": recommendationResponse("group-2", "batch-2")
              }
            }
          })
        }
      }
    });

    await expect(getActiveGroupRecommendationCache()).resolves.toBeNull();
  });

  it("fails writes when Web Locks is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("chrome", {
      storage: { local: { get: vi.fn(), set: vi.fn() } }
    });

    await expect(updateStorageState((state) => state)).rejects.toThrow(
      "storage_lock_unavailable"
    );
  });

  it("applies the active group's local reminder override", async () => {
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            [STORAGE_KEYS.state]: {
              ...getDefaultStorageState(),
              reminderTime: "11:45",
              enabled: true,
              activeGroupId: "group-1",
              localReminderOverridesByGroupId: {
                "group-1": { reminderTime: "12:15", enabled: false }
              }
            }
          })
        }
      }
    });

    await expect(getReminderSettingsForActiveGroup()).resolves.toEqual({
      reminderTime: "12:15",
      enabled: false
    });
  });

  it("falls back to global reminder settings without an active group", async () => {
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            [STORAGE_KEYS.state]: {
              ...getDefaultStorageState(),
              reminderTime: "11:50",
              enabled: false,
              localReminderOverridesByGroupId: {
                "group-1": { reminderTime: "12:30", enabled: true }
              }
            }
          })
        }
      }
    });

    await expect(getReminderSettingsForActiveGroup()).resolves.toEqual({
      reminderTime: "11:50",
      enabled: false
    });
  });

  it("falls back to global reminder fields missing from the active group override", async () => {
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            [STORAGE_KEYS.state]: {
              ...getDefaultStorageState(),
              reminderTime: "11:55",
              enabled: false,
              activeGroupId: "group-1",
              localReminderOverridesByGroupId: {
                "group-1": { enabled: true }
              }
            }
          })
        }
      }
    });

    await expect(getReminderSettingsForActiveGroup()).resolves.toEqual({
      reminderTime: "11:55",
      enabled: true
    });
  });
});

describe("legacy settings compatibility", () => {
  it("keeps the legacy default settings contract", () => {
    expect(getDefaultSettings()).toEqual({
      apiBaseUrl: "http://localhost:3000",
      readToken: "dev-read-token",
      reminderTime: "11:30",
      enabled: true
    });
  });

  it("reads legacy settings through the grouped storage state", async () => {
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            [STORAGE_KEYS.settings]: {
              apiBaseUrl: "https://legacy.example",
              readToken: "legacy-read-token",
              reminderTime: "10:30",
              enabled: false
            }
          })
        }
      }
    });

    await expect(getSettings()).resolves.toEqual({
      apiBaseUrl: "https://legacy.example",
      readToken: "legacy-read-token",
      reminderTime: "10:30",
      enabled: false
    });
  });

  it("saves legacy settings into grouped state and keeps the settings changed message", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            [STORAGE_KEYS.state]: {
              ...getDefaultStorageState(),
              activeGroupId: "group-1",
              sessionsByGroupId: {
                "group-1": { token: "group-session-token" }
              }
            }
          }),
          set
        }
      },
      runtime: { sendMessage }
    });
    const settings = {
      apiBaseUrl: "https://lunch.example",
      readToken: "saved-read-token",
      reminderTime: "12:00",
      enabled: false
    };

    await saveSettings(settings);

    expect(set).toHaveBeenCalledWith({
      [STORAGE_KEYS.state]: expect.objectContaining({
        ...settings,
        activeGroupId: "group-1",
        sessionsByGroupId: {
          "group-1": { token: "group-session-token" }
        }
      })
    });
    expect(sendMessage).toHaveBeenCalledWith({ type: "settingsChanged" });
  });
});
