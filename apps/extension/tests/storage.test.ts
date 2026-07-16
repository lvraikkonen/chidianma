import type { GroupTodayRecommendationsResponse } from "@lunch/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../src/config";
import {
  clearGroupSession,
  disconnectIdentity,
  getActiveGroupRecommendationCache,
  getActiveGroupSession,
  getDefaultSettings,
  getDefaultStorageState,
  getReminderSettingsForActiveGroup,
  getSettings,
  getStorageState,
  replaceApiBaseUrl,
  saveActiveGroupReminderOverride,
  saveGroupConnection,
  saveGroupRecommendationCache,
  saveIdentityConnection,
  saveSettings,
  saveStorageState,
  STORAGE_STATE_LOCK_NAME,
  syncGroupSummaries,
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

function stubMutableStorage(initial: ReturnType<typeof getDefaultStorageState>) {
  let storedState = structuredClone(initial);
  const locks = serialLockManager();
  const sendMessage = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { locks });
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async () => ({
          [STORAGE_KEYS.state]: structuredClone(storedState)
        })),
        set: vi.fn(async (value: Record<string, unknown>) => {
          storedState = structuredClone(
            value[STORAGE_KEYS.state]
          ) as typeof storedState;
        })
      }
    },
    runtime: { sendMessage }
  });
  return {
    locks,
    readStoredState: () => storedState,
    sendMessage
  };
}

function expectExclusiveStorageLock(locks: ReturnType<typeof serialLockManager>) {
  expect(locks.request).toHaveBeenCalledWith(
    STORAGE_STATE_LOCK_NAME,
    { mode: "exclusive" },
    expect.any(Function)
  );
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
      localReminderOverridesByGroupId: {},
      groupSettingsCacheByGroupId: {},
      reminderRevision: 0
    });
  });

  it("merges defaults, legacy settings, then current grouped state", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
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
          }),
          set,
          remove
        }
      }
    });

    const state = await getStorageState();
    expect(state).toMatchObject({
      apiBaseUrl: "https://current.example",
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
    expect(state).not.toHaveProperty("readToken");
    expect(set).toHaveBeenCalledWith({ [STORAGE_KEYS.state]: state });
    expect(remove).toHaveBeenCalledWith([
      STORAGE_KEYS.settings,
      "lunchLastRecommendation"
    ]);
  });

  it("stores an identity and clears group-scoped state for a changed identity", async () => {
    const { locks, readStoredState, sendMessage } = stubMutableStorage({
      ...getDefaultStorageState(),
      activeGroupId: "old-group",
      sessionsByGroupId: { "old-group": { token: "old-session" } },
      groupSummariesById: {
        "old-group": {
          groupId: "old-group",
          name: "旧小组",
          role: "member",
          membershipId: "old-membership"
        }
      },
      lastRecommendationsByGroupId: {
        "old-group": recommendationResponse("old-group", "old-batch")
      },
      localReminderOverridesByGroupId: {
        "old-group": { reminderTime: "12:20", enabled: false }
      }
    });

    await saveIdentityConnection({
      identityId: "identity-1",
      displayName: " 小林 ",
      identityToken: "identity-token",
      identityTokenExpiresAt: "2026-10-13T00:00:00.000Z"
    });

    expect(readStoredState()).toMatchObject({
      identityDisplayName: "小林",
      identityToken: "identity-token",
      sessionsByGroupId: {},
      groupSummariesById: {},
      lastRecommendationsByGroupId: {},
      localReminderOverridesByGroupId: {},
      groupSettingsCacheByGroupId: {},
      reminderRevision: 1
    });
    expect(readStoredState().activeGroupId).toBeUndefined();
    expect(sendMessage).toHaveBeenCalledWith({ type: "reminderContextChanged" });
    expectExclusiveStorageLock(locks);
  });

  it("commits a group session and active group in one locked mutation", async () => {
    const { locks, readStoredState, sendMessage } = stubMutableStorage({
      ...getDefaultStorageState(),
      sessionsByGroupId: { "group-0": { token: "existing-session" } },
      groupSummariesById: {
        "group-0": {
          groupId: "group-0",
          name: "现有小组",
          role: "member",
          membershipId: "membership-0"
        }
      }
    });

    await saveGroupConnection({
      identityToken: "new-identity-token",
      identityTokenExpiresAt: "2026-10-13T00:00:00.000Z",
      groupSessionToken: "group-session-token",
      groupSessionTokenExpiresAt: "2026-10-13T00:00:00.000Z",
      group: {
        groupId: "group-1",
        name: "设计组",
        role: "admin",
        membershipId: "membership-1"
      }
    });

    expect(readStoredState()).toMatchObject({
      identityToken: "new-identity-token",
      activeGroupId: "group-1",
      sessionsByGroupId: {
        "group-0": { token: "existing-session" },
        "group-1": { token: "group-session-token" }
      },
      groupSummariesById: {
        "group-0": expect.objectContaining({ name: "现有小组" }),
        "group-1": expect.objectContaining({ name: "设计组" })
      }
    });
    expect(sendMessage).toHaveBeenCalledWith({ type: "reminderContextChanged" });
    expectExclusiveStorageLock(locks);
  });

  it("syncs group summaries and drops sessions and active group outside membership", async () => {
    const { locks, readStoredState, sendMessage } = stubMutableStorage({
      ...getDefaultStorageState(),
      activeGroupId: "removed-group",
      sessionsByGroupId: {
        "kept-group": { token: "kept-session" },
        "removed-group": { token: "removed-session" }
      },
      groupSummariesById: {
        "removed-group": {
          groupId: "removed-group",
          name: "已移除小组",
          role: "member",
          membershipId: "removed-membership"
        }
      }
    });

    await syncGroupSummaries([
      {
        groupId: "kept-group",
        name: "保留小组",
        role: "member",
        membershipId: "kept-membership"
      },
      {
        groupId: "new-group",
        name: "新小组",
        role: "admin",
        membershipId: "new-membership"
      }
    ]);

    expect(readStoredState().groupSummariesById).toEqual({
      "kept-group": expect.objectContaining({ name: "保留小组" }),
      "new-group": expect.objectContaining({ name: "新小组" })
    });
    expect(readStoredState().sessionsByGroupId).toEqual({
      "kept-group": { token: "kept-session" }
    });
    expect(readStoredState().activeGroupId).toBeUndefined();
    expect(sendMessage).toHaveBeenCalledWith({ type: "reminderContextChanged" });
    expectExclusiveStorageLock(locks);
  });

  it("clears only the requested group session", async () => {
    const { locks, readStoredState, sendMessage } = stubMutableStorage({
      ...getDefaultStorageState(),
      activeGroupId: "group-1",
      sessionsByGroupId: {
        "group-1": { token: "session-1" },
        "group-2": { token: "session-2" }
      }
    });

    await clearGroupSession("group-1");

    expect(readStoredState().sessionsByGroupId).toEqual({
      "group-2": { token: "session-2" }
    });
    expect(readStoredState().activeGroupId).toBe("group-1");
    expect(sendMessage).toHaveBeenCalledWith({ type: "reminderContextChanged" });
    expectExclusiveStorageLock(locks);
  });

  it("disconnects identity without changing the API host or global reminders", async () => {
    const { locks, readStoredState, sendMessage } = stubMutableStorage({
      ...getDefaultStorageState(),
      apiBaseUrl: "https://lunch.example",
      reminderTime: "12:05",
      enabled: false,
      identityToken: "identity-token",
      identityDisplayName: "小林",
      activeGroupId: "group-1",
      sessionsByGroupId: { "group-1": { token: "session" } },
      groupSummariesById: {
        "group-1": {
          groupId: "group-1",
          name: "设计组",
          role: "member",
          membershipId: "membership-1"
        }
      },
      lastRecommendationsByGroupId: {
        "group-1": recommendationResponse("group-1", "batch-1")
      },
      localReminderOverridesByGroupId: {
        "group-1": { reminderTime: "12:20" }
      }
    });

    await disconnectIdentity();

    expect(readStoredState()).toEqual({
      apiBaseUrl: "https://lunch.example",
      reminderTime: "12:05",
      enabled: false,
      sessionsByGroupId: {},
      groupSummariesById: {},
      lastRecommendationsByGroupId: {},
      localReminderOverridesByGroupId: {},
      groupSettingsCacheByGroupId: {},
      reminderRevision: 1
    });
    expect(sendMessage).toHaveBeenCalledWith({ type: "reminderContextChanged" });
    expectExclusiveStorageLock(locks);
  });

  it("replaces the API host without carrying credentials or group cache", async () => {
    const { locks, readStoredState, sendMessage } = stubMutableStorage({
      ...getDefaultStorageState(),
      apiBaseUrl: "https://old.example",
      reminderTime: "12:05",
      enabled: false,
      identityToken: "identity-token",
      identityDisplayName: "小林",
      activeGroupId: "group-1",
      sessionsByGroupId: { "group-1": { token: "session" } },
      groupSummariesById: {
        "group-1": {
          groupId: "group-1",
          name: "设计组",
          role: "admin",
          membershipId: "membership-1"
        }
      },
      lastRecommendationsByGroupId: {
        "group-1": recommendationResponse("group-1", "batch-1")
      },
      localReminderOverridesByGroupId: {
        "group-1": { reminderTime: "12:20" }
      }
    });

    await replaceApiBaseUrl("https://new.example/");

    expect(readStoredState()).toEqual({
      apiBaseUrl: "https://new.example",
      reminderTime: "12:05",
      enabled: false,
      sessionsByGroupId: {},
      groupSummariesById: {},
      lastRecommendationsByGroupId: {},
      localReminderOverridesByGroupId: {},
      groupSettingsCacheByGroupId: {},
      reminderRevision: 1
    });
    expect(sendMessage).toHaveBeenCalledWith({ type: "reminderContextChanged" });
    expectExclusiveStorageLock(locks);
  });

  it("stores reminder overrides only in the active group bucket", async () => {
    const { locks, readStoredState, sendMessage } = stubMutableStorage({
      ...getDefaultStorageState(),
      reminderTime: "11:30",
      enabled: true,
      activeGroupId: "group-1",
      localReminderOverridesByGroupId: {
        "group-2": { reminderTime: "12:40", enabled: false }
      }
    });

    await saveActiveGroupReminderOverride({
      reminderTime: "12:10",
      enabled: false
    });

    expect(readStoredState()).toMatchObject({
      reminderTime: "11:30",
      enabled: true,
      localReminderOverridesByGroupId: {
        "group-1": { reminderTime: "12:10", enabled: false },
        "group-2": { reminderTime: "12:40", enabled: false }
      }
    });
    expect(sendMessage).toHaveBeenCalledWith({ type: "settingsChanged" });
    expectExclusiveStorageLock(locks);
  });

  it("stores reminder settings globally when there is no active group", async () => {
    const { locks, readStoredState, sendMessage } = stubMutableStorage({
      ...getDefaultStorageState(),
      localReminderOverridesByGroupId: {
        "group-1": { reminderTime: "12:40", enabled: false }
      }
    });

    await saveActiveGroupReminderOverride({
      reminderTime: "11:55",
      enabled: false
    });

    expect(readStoredState()).toMatchObject({
      reminderTime: "11:55",
      enabled: false,
      localReminderOverridesByGroupId: {
        "group-1": { reminderTime: "12:40", enabled: false }
      }
    });
    expect(sendMessage).toHaveBeenCalledWith({ type: "settingsChanged" });
    expectExclusiveStorageLock(locks);
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

describe("legacy settings migration", () => {
  it("keeps current defaults free of legacy credentials", () => {
    expect(getDefaultSettings()).toEqual({
      apiBaseUrl: "http://localhost:3000",
      reminderTime: "11:30",
      enabled: true
    });
  });

  it("migrates legacy settings without retaining the read token", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
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
          }),
          set,
          remove
        }
      }
    });

    await expect(getSettings()).resolves.toEqual({
      apiBaseUrl: "https://legacy.example",
      reminderTime: "10:30",
      enabled: false
    });
    expect(set).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });

  it("saves current settings into grouped state and keeps the settings changed message", async () => {
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
