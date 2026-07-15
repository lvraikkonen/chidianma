import type { GroupSettingsResponse } from "@lunch/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../src/config";
import {
  claimPendingSecondReminder,
  claimScheduledPrimaryReminder,
  clearGroupReminderOverride,
  getDefaultStorageState,
  saveGroupReminderOverride,
  saveGroupSettingsCache,
  savePendingSecondReminder,
  saveScheduledPrimaryReminder,
  STORAGE_STATE_LOCK_NAME,
  type ExtensionStorageShape
} from "../src/storage";

function serialLockManager() {
  let queue = Promise.resolve();
  return {
    request: vi.fn((_name: string, _options: LockOptions, callback: () => Promise<unknown>) => {
      const run = queue.then(callback);
      queue = run.then(() => undefined, () => undefined);
      return run;
    })
  };
}

function settingsResponse(title = "中午吃点啥"): GroupSettingsResponse {
  return {
    groupId: "group-1",
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
      secondReminderEnabled: true,
      notificationTitle: title
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

function stubStorage(initial: ExtensionStorageShape = {
  ...getDefaultStorageState(),
  activeGroupId: "group-1",
  sessionsByGroupId: { "group-1": { token: "session" } },
  groupSummariesById: {
    "group-1": {
      groupId: "group-1",
      name: "设计组",
      role: "member" as const,
      membershipId: "membership-1"
    }
  }
}) {
  let state = structuredClone(initial);
  const locks = serialLockManager();
  const sendMessage = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { locks });
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async () => ({ [STORAGE_KEYS.state]: structuredClone(state) })),
        set: vi.fn(async (value: Record<string, unknown>) => {
          state = structuredClone(value[STORAGE_KEYS.state]) as typeof state;
        })
      }
    },
    runtime: { sendMessage }
  });
  return { locks, sendMessage, read: () => state };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Stage 5 reminder storage", () => {
  it("adds empty reminder caches and revision to old installs", () => {
    expect(getDefaultStorageState()).toMatchObject({
      groupSettingsCacheByGroupId: {},
      reminderRevision: 0
    });
  });

  it("caches validated settings and advances revision when behavior changes", async () => {
    const { locks, read, sendMessage } = stubStorage();

    await saveGroupSettingsCache(
      "group-1",
      settingsResponse(),
      "2026-07-14T00:00:00.000Z"
    );

    expect(read()).toMatchObject({
      reminderRevision: 1,
      groupSettingsCacheByGroupId: {
        "group-1": { cachedAt: "2026-07-14T00:00:00.000Z" }
      }
    });
    expect(sendMessage).toHaveBeenCalledWith({ type: "reminderContextChanged" });
    expect(locks.request).toHaveBeenCalledWith(
      STORAGE_STATE_LOCK_NAME,
      { mode: "exclusive" },
      expect.any(Function)
    );
  });

  it("does not advance revision for unrelated settings or cache timestamp changes", async () => {
    const response = settingsResponse();
    const { read, sendMessage } = stubStorage({
      ...getDefaultStorageState(),
      activeGroupId: "group-1",
      sessionsByGroupId: { "group-1": { token: "session" } },
      groupSummariesById: {},
      groupSettingsCacheByGroupId: {
        "group-1": { response, cachedAt: "2026-07-14T00:00:00.000Z" }
      }
    });
    const renamed = structuredClone(response);
    renamed.group.name = "新名字";

    await saveGroupSettingsCache(
      "group-1",
      renamed,
      "2026-07-15T00:00:00.000Z"
    );

    expect(read().reminderRevision).toBe(0);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("writes canonical overrides for the captured active group", async () => {
    const { read } = stubStorage({
      ...getDefaultStorageState(),
      activeGroupId: "group-1",
      sessionsByGroupId: { "group-1": { token: "session" } },
      groupSummariesById: {},
      groupSettingsCacheByGroupId: {
        "group-1": {
          response: settingsResponse(),
          cachedAt: "2026-07-14T00:00:00.000Z"
        }
      },
      localReminderOverridesByGroupId: {
        "group-1": { enabled: false }
      }
    });

    await saveGroupReminderOverride("group-1", {
      reminderTime: "12:05",
      weekdayReminderEnabled: true,
      secondReminderEnabled: false
    });

    expect(read().localReminderOverridesByGroupId["group-1"]).toEqual({
      reminderTime: "12:05",
      weekdayReminderEnabled: true,
      secondReminderEnabled: false
    });
    expect(read().reminderRevision).toBe(1);
  });

  it("rejects a late override save after switching groups", async () => {
    stubStorage({
      ...getDefaultStorageState(),
      activeGroupId: "group-2",
      sessionsByGroupId: { "group-2": { token: "session-2" } },
      groupSummariesById: {}
    });

    await expect(saveGroupReminderOverride("group-1", {
      reminderTime: "12:05",
      weekdayReminderEnabled: true,
      secondReminderEnabled: false
    })).rejects.toThrow("stale_group_context");
  });

  it("restores group defaults by deleting the override bucket", async () => {
    const { read } = stubStorage({
      ...getDefaultStorageState(),
      activeGroupId: "group-1",
      sessionsByGroupId: { "group-1": { token: "session" } },
      groupSummariesById: {},
      groupSettingsCacheByGroupId: {
        "group-1": {
          response: settingsResponse(),
          cachedAt: "2026-07-14T00:00:00.000Z"
        }
      },
      localReminderOverridesByGroupId: {
        "group-1": { reminderTime: "12:05", enabled: false }
      }
    });

    await clearGroupReminderOverride("group-1");

    expect(read().localReminderOverridesByGroupId["group-1"]).toBeUndefined();
    expect(read().reminderRevision).toBe(1);
  });

  it("atomically claims persisted primary and second contexts once", async () => {
    const { read } = stubStorage();
    await saveScheduledPrimaryReminder({
      revision: 0,
      mode: "group",
      groupId: "group-1",
      scheduledFor: 1_000
    });
    await savePendingSecondReminder({
      revision: 0,
      groupId: "group-1",
      officeDate: "2026-07-14",
      scheduledFor: 2_000
    });

    await expect(claimScheduledPrimaryReminder()).resolves.toMatchObject({
      groupId: "group-1",
      scheduledFor: 1_000
    });
    await expect(claimScheduledPrimaryReminder()).resolves.toBeNull();
    await expect(claimPendingSecondReminder()).resolves.toMatchObject({
      groupId: "group-1",
      officeDate: "2026-07-14"
    });
    await expect(claimPendingSecondReminder()).resolves.toBeNull();
    expect(read().scheduledPrimaryReminder).toBeUndefined();
    expect(read().pendingSecondReminder).toBeUndefined();
  });
});
