import type { GroupTodayRecommendationsResponse } from "@lunch/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../src/config";
import {
  clearGroupSession,
  clearGroupSessionIfCurrent,
  disconnectIdentity,
  disconnectIdentityIfCurrent,
  getActiveGroupRecommendationCache,
  getActiveGroupSession,
  getDefaultSettings,
  getDefaultStorageState,
  getReminderSettingsForActiveGroup,
  getSettings,
  getStorageState,
  groupSummariesStorageGuardFor,
  replaceApiBaseUrl,
  saveActiveGroupReminderOverride,
  saveGroupConnection,
  saveGroupConnectionIfCurrent,
  saveGroupRecommendationCache,
  saveIdentityConnection,
  saveResetIdentityConnection,
  saveSettings,
  saveStorageState,
  STORAGE_STATE_LOCK_NAME,
  syncGroupSummaries,
  syncGroupSummariesIfCurrent,
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
  let storedWheelSession: unknown = { marker: "existing-wheel-session" };
  const locks = serialLockManager();
  const sendMessage = vi.fn().mockResolvedValue(undefined);
  const remove = vi.fn(async (key: string | string[]) => {
    if (
      (Array.isArray(key) && key.includes(STORAGE_KEYS.luckyWheelSession))
      || key === STORAGE_KEYS.luckyWheelSession
    ) {
      storedWheelSession = undefined;
    }
  });
  vi.stubGlobal("navigator", { locks });
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async () => ({
          [STORAGE_KEYS.state]: structuredClone(storedState),
          ...(storedWheelSession === undefined
            ? {}
            : { [STORAGE_KEYS.luckyWheelSession]: structuredClone(storedWheelSession) })
        })),
        set: vi.fn(async (value: Record<string, unknown>) => {
          if (value[STORAGE_KEYS.state] !== undefined) {
            storedState = structuredClone(
              value[STORAGE_KEYS.state]
            ) as typeof storedState;
          }
          if (value[STORAGE_KEYS.luckyWheelSession] !== undefined) {
            storedWheelSession = structuredClone(
              value[STORAGE_KEYS.luckyWheelSession]
            );
          }
        }),
        remove
      }
    },
    runtime: { sendMessage }
  });
  return {
    locks,
    readStoredState: () => storedState,
    readStoredWheelSession: () => storedWheelSession,
    remove,
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
    const {
      locks,
      readStoredState,
      readStoredWheelSession,
      sendMessage
    } = stubMutableStorage({
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
    expect(readStoredWheelSession()).toBeUndefined();
    expect(sendMessage).toHaveBeenCalledWith({ type: "reminderContextChanged" });
    expectExclusiveStorageLock(locks);
  });

  it("clears the wheel session when identity sessions are reset", async () => {
    const { readStoredWheelSession } = stubMutableStorage({
      ...getDefaultStorageState(),
      identityId: "identity-1",
      identityToken: "old-token",
      activeGroupId: "group-1",
      sessionsByGroupId: { "group-1": { token: "group-token" } }
    });

    await saveResetIdentityConnection({
      identityId: "identity-1",
      displayName: "小林",
      identityToken: "reset-token",
      identityTokenExpiresAt: "2026-10-20T00:00:00.000Z"
    });

    expect(readStoredWheelSession()).toBeUndefined();
  });

  it("commits a group session and active group in one locked mutation", async () => {
    const {
      locks,
      readStoredState,
      readStoredWheelSession,
      sendMessage
    } = stubMutableStorage({
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
    expect(readStoredWheelSession()).toBeUndefined();
    expectExclusiveStorageLock(locks);
  });

  it("preserves the wheel session when only the active group token is renewed", async () => {
    const {
      readStoredWheelSession,
      remove
    } = stubMutableStorage({
      ...getDefaultStorageState(),
      activeGroupId: "group-1",
      sessionsByGroupId: { "group-1": { token: "old-token" } },
      groupSummariesById: {
        "group-1": {
          groupId: "group-1",
          name: "设计组",
          role: "member",
          membershipId: "membership-1"
        }
      }
    });

    await saveGroupConnection({
      identityToken: "identity-token",
      identityTokenExpiresAt: "2026-10-13T00:00:00.000Z",
      groupSessionToken: "renewed-token",
      groupSessionTokenExpiresAt: "2026-10-13T00:00:00.000Z",
      group: {
        groupId: "group-1",
        name: "设计组",
        role: "member",
        membershipId: "membership-1"
      }
    });

    expect(readStoredWheelSession()).toEqual({ marker: "existing-wheel-session" });
    expect(remove).not.toHaveBeenCalledWith(STORAGE_KEYS.luckyWheelSession);
  });

  it("rejects a late conditional renewal after another group becomes active", async () => {
    const {
      readStoredState,
      readStoredWheelSession
    } = stubMutableStorage({
      ...getDefaultStorageState(),
      apiBaseUrl: "https://lunch.example",
      identityId: "identity-1",
      identityToken: "identity-token",
      activeGroupId: "group-2",
      sessionsByGroupId: {
        "group-1": { token: "old-group-token" },
        "group-2": { token: "group-2-token" }
      },
      groupSummariesById: {
        "group-1": {
          groupId: "group-1",
          name: "旧组",
          role: "member",
          membershipId: "membership-1"
        },
        "group-2": {
          groupId: "group-2",
          name: "当前组",
          role: "member",
          membershipId: "membership-2"
        }
      }
    });

    await expect(saveGroupConnectionIfCurrent({
      identityToken: "identity-token",
      identityTokenExpiresAt: "2026-10-13T00:00:00.000Z",
      groupSessionToken: "renewed-group-1-token",
      groupSessionTokenExpiresAt: "2026-10-13T00:00:00.000Z",
      group: {
        groupId: "group-1",
        name: "旧组",
        role: "member",
        membershipId: "membership-1"
      }
    }, {
      apiBaseUrl: "https://lunch.example",
      identityId: "identity-1",
      identityToken: "identity-token",
      groupId: "group-1",
      membershipId: "membership-1",
      groupSessionToken: "old-group-token"
    })).resolves.toBe(false);

    expect(readStoredState().activeGroupId).toBe("group-2");
    expect(readStoredState().sessionsByGroupId["group-1"]?.token)
      .toBe("old-group-token");
    expect(readStoredWheelSession()).toEqual({ marker: "existing-wheel-session" });
  });

  it("does not clear a newer token or identity through stale conditional cleanup", async () => {
    const { readStoredState, readStoredWheelSession } = stubMutableStorage({
      ...getDefaultStorageState(),
      apiBaseUrl: "https://lunch.example",
      identityId: "identity-new",
      identityToken: "identity-token-new",
      activeGroupId: "group-1",
      sessionsByGroupId: { "group-1": { token: "group-token-new" } },
      groupSummariesById: {
        "group-1": {
          groupId: "group-1",
          name: "设计组",
          role: "member",
          membershipId: "membership-1"
        }
      }
    });
    const staleGuard = {
      apiBaseUrl: "https://lunch.example",
      identityId: "identity-old",
      identityToken: "identity-token-old",
      groupId: "group-1",
      membershipId: "membership-1",
      groupSessionToken: "group-token-old"
    };

    await expect(clearGroupSessionIfCurrent(staleGuard)).resolves.toBe(false);
    await expect(disconnectIdentityIfCurrent(staleGuard)).resolves.toBe(false);

    expect(readStoredState()).toMatchObject({
      identityId: "identity-new",
      identityToken: "identity-token-new",
      activeGroupId: "group-1",
      sessionsByGroupId: { "group-1": { token: "group-token-new" } }
    });
    expect(readStoredWheelSession()).toEqual({ marker: "existing-wheel-session" });
  });

  it("does not apply a stale group resync after the identity context changes", async () => {
    const { readStoredState, readStoredWheelSession } = stubMutableStorage({
      ...getDefaultStorageState(),
      apiBaseUrl: "https://lunch.example",
      identityId: "identity-new",
      identityToken: "identity-token-new",
      activeGroupId: "group-2",
      sessionsByGroupId: { "group-2": { token: "group-2-token" } },
      groupSummariesById: {
        "group-2": {
          groupId: "group-2",
          name: "当前组",
          role: "member",
          membershipId: "membership-2"
        }
      }
    });

    await expect(syncGroupSummariesIfCurrent([], {
      apiBaseUrl: "https://lunch.example",
      identityId: "identity-old",
      identityToken: "identity-token-old",
      groupContextFingerprint: "stale-context"
    })).resolves.toBe(false);

    expect(readStoredState()).toMatchObject({
      identityId: "identity-new",
      activeGroupId: "group-2",
      sessionsByGroupId: { "group-2": { token: "group-2-token" } }
    });
    expect(readStoredWheelSession()).toEqual({ marker: "existing-wheel-session" });
  });

  it("does not apply an old group resync after the same identity renews its group context", async () => {
    const initial = {
      ...getDefaultStorageState(),
      apiBaseUrl: "https://lunch.example",
      identityId: "identity-1",
      identityToken: "identity-token",
      activeGroupId: "group-1",
      sessionsByGroupId: { "group-1": { token: "old-group-token" } },
      groupSummariesById: {
        "group-1": {
          groupId: "group-1",
          name: "设计组",
          role: "member" as const,
          membershipId: "membership-1"
        }
      }
    };
    const staleResyncGuard = groupSummariesStorageGuardFor(initial)!;
    const { readStoredState, readStoredWheelSession } = stubMutableStorage(initial);

    await saveGroupConnection({
      identityToken: "identity-token",
      identityTokenExpiresAt: "2026-10-13T00:00:00.000Z",
      groupSessionToken: "new-group-token",
      groupSessionTokenExpiresAt: "2026-08-13T00:00:00.000Z",
      group: initial.groupSummariesById["group-1"]
    });
    await expect(syncGroupSummariesIfCurrent([], staleResyncGuard))
      .resolves.toBe(false);

    expect(readStoredState()).toMatchObject({
      activeGroupId: "group-1",
      sessionsByGroupId: { "group-1": { token: "new-group-token" } }
    });
    expect(readStoredWheelSession()).toEqual({ marker: "existing-wheel-session" });
  });

  it("clears the wheel session when the active membership changes", async () => {
    const { readStoredWheelSession } = stubMutableStorage({
      ...getDefaultStorageState(),
      activeGroupId: "group-1",
      sessionsByGroupId: { "group-1": { token: "old-token" } },
      groupSummariesById: {
        "group-1": {
          groupId: "group-1",
          name: "设计组",
          role: "member",
          membershipId: "membership-old"
        }
      }
    });

    await saveGroupConnection({
      identityToken: "identity-token",
      identityTokenExpiresAt: "2026-10-13T00:00:00.000Z",
      groupSessionToken: "new-token",
      groupSessionTokenExpiresAt: "2026-10-13T00:00:00.000Z",
      group: {
        groupId: "group-1",
        name: "设计组",
        role: "member",
        membershipId: "membership-new"
      }
    });

    expect(readStoredWheelSession()).toBeUndefined();
  });

  it("syncs group summaries and drops sessions and active group outside membership", async () => {
    const {
      locks,
      readStoredState,
      readStoredWheelSession,
      sendMessage
    } = stubMutableStorage({
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
    expect(readStoredWheelSession()).toBeUndefined();
    expect(sendMessage).toHaveBeenCalledWith({ type: "reminderContextChanged" });
    expectExclusiveStorageLock(locks);
  });

  it("clears only the requested group session", async () => {
    const {
      locks,
      readStoredState,
      readStoredWheelSession,
      sendMessage
    } = stubMutableStorage({
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
    expect(readStoredWheelSession()).toBeUndefined();
    expect(sendMessage).toHaveBeenCalledWith({ type: "reminderContextChanged" });
    expectExclusiveStorageLock(locks);
  });

  it("disconnects identity without changing the API host or global reminders", async () => {
    const {
      locks,
      readStoredState,
      readStoredWheelSession,
      sendMessage
    } = stubMutableStorage({
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
    expect(readStoredWheelSession()).toBeUndefined();
    expect(sendMessage).toHaveBeenCalledWith({ type: "reminderContextChanged" });
    expectExclusiveStorageLock(locks);
  });

  it("replaces the API host without carrying credentials or group cache", async () => {
    const {
      locks,
      readStoredState,
      readStoredWheelSession,
      sendMessage
    } = stubMutableStorage({
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
    expect(readStoredWheelSession()).toBeUndefined();
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
    const remove = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { locks });
    vi.stubGlobal("chrome", {
      storage: { local: { get, set, remove } },
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
    expect(remove).toHaveBeenCalledWith(STORAGE_KEYS.luckyWheelSession);
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
    const remove = vi.fn().mockResolvedValue(undefined);
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
          set,
          remove
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
    expect(remove).toHaveBeenCalledWith(STORAGE_KEYS.luckyWheelSession);
    expect(sendMessage).toHaveBeenCalledWith({ type: "settingsChanged" });
  });
});
