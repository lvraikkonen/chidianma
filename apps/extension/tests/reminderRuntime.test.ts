import type {
  GroupSettingsResponse,
  GroupTodayRecommendationsResponse,
  ParticipationTodayResponse
} from "@lunch/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtensionApiError } from "../src/apiClient";
import {
  PRIMARY_ALARM_NAME,
  PRIMARY_NOTIFICATION_ID,
  SECOND_ALARM_NAME,
  SECOND_NOTIFICATION_ID,
  createReminderRuntime,
  type ReminderRuntimeDependencies
} from "../src/reminderRuntime";
import {
  getDefaultStorageState,
  type ExtensionStorageShape,
  type PendingSecondReminder,
  type ScheduledPrimaryReminder
} from "../src/storage";

function settingsResponse(): GroupSettingsResponse {
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
      notificationTitle: "午饭时间",
      notificationGroupLabel: "设计组"
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

function recommendations(fromCache = false): GroupTodayRecommendationsResponse {
  return {
    groupId: "group-1",
    officeDate: "2026-07-14",
    batchId: "batch-1",
    batchNo: 1,
    generatedAt: "2026-07-14T03:30:00.000Z",
    participationSummary: {
      joiningCount: 0,
      decidedCount: 0,
      awayCount: 0,
      undecidedCount: 1
    },
    items: [{
      restaurantId: "restaurant-1",
      restaurantName: "面馆",
      reason: "出餐快",
      tags: [],
      rank: 1,
      score: 80,
      scoreBreakdown: {
        weekdayMatch: 20,
        weatherMatch: 20,
        distance: 20,
        teammateRecommendation: 20,
        recentDuplicatePenalty: 0,
        negativeFeedbackPenalty: 0,
        total: 80
      }
    }],
    ...(fromCache ? { fromCache: true } : {})
  };
}

function participation(decidedCount = 0): ParticipationTodayResponse {
  return {
    groupId: "group-1",
    officeDate: "2026-07-14",
    members: [],
    summary: {
      joiningCount: 0,
      decidedCount,
      awayCount: 0,
      undecidedCount: decidedCount === 0 ? 1 : 0
    }
  };
}

function connectedState(withCache = true): ExtensionStorageShape {
  const response = settingsResponse();
  return {
    ...getDefaultStorageState(),
    apiBaseUrl: "https://lunch.example",
    identityToken: "identity-token",
    activeGroupId: "group-1",
    sessionsByGroupId: { "group-1": { token: "group-token" } },
    groupSummariesById: {
      "group-1": {
        groupId: "group-1",
        name: "设计组",
        role: "member",
        membershipId: "membership-1"
      }
    },
    reminderRevision: 1,
    groupSettingsCacheByGroupId: withCache
      ? {
        "group-1": {
          response,
          cachedAt: "2026-07-14T00:00:00.000Z"
        }
      }
      : {}
  };
}

function runtimeFixture(initial = connectedState()) {
  let state = structuredClone(initial);
  const alarms = new Map<string, number>();
  const notifications: Array<{
    id: string;
    options: chrome.notifications.NotificationOptions<true>;
  }> = [];

  const dependencies: ReminderRuntimeDependencies = {
    now: vi.fn(() => Date.parse("2026-07-14T03:00:00.000Z")),
    getStorageState: vi.fn(async () => structuredClone(state)),
    saveGroupSettingsCache: vi.fn(async (_groupId, response, cachedAt) => {
      state.groupSettingsCacheByGroupId[response.groupId] = { response, cachedAt };
    }),
    clearGroupSession: vi.fn(async (groupId) => {
      delete state.sessionsByGroupId[groupId];
      state.reminderRevision += 1;
      delete state.scheduledPrimaryReminder;
      delete state.pendingSecondReminder;
    }),
    saveScheduledPrimaryReminder: vi.fn(async (context) => {
      state.scheduledPrimaryReminder = context;
    }),
    claimScheduledPrimaryReminder: vi.fn(async () => {
      const context = state.scheduledPrimaryReminder ?? null;
      delete state.scheduledPrimaryReminder;
      return context;
    }),
    clearScheduledPrimaryReminder: vi.fn(async () => {
      delete state.scheduledPrimaryReminder;
    }),
    savePendingSecondReminder: vi.fn(async (context) => {
      state.pendingSecondReminder = context;
    }),
    claimPendingSecondReminder: vi.fn(async () => {
      const context = state.pendingSecondReminder ?? null;
      delete state.pendingSecondReminder;
      return context;
    }),
    clearPendingSecondReminder: vi.fn(async () => {
      delete state.pendingSecondReminder;
    }),
    getAlarm: vi.fn(async (name) => {
      const scheduledTime = alarms.get(name);
      return scheduledTime === undefined ? undefined : { name, scheduledTime };
    }),
    createAlarm: vi.fn(async (name, scheduledFor) => {
      alarms.set(name, scheduledFor);
    }),
    clearAlarm: vi.fn(async (name) => alarms.delete(name)),
    createNotification: vi.fn(async (id, options) => {
      notifications.push({ id, options });
    }),
    clearNotification: vi.fn(async () => true),
    getGroupSettingsForContext: vi.fn(async () => settingsResponse()),
    getPrimaryRecommendationsForStorage: vi.fn(async () => recommendations()),
    getTodayParticipationForContext: vi.fn(async () => participation())
  };

  return {
    dependencies,
    alarms,
    notifications,
    readState: () => state,
    writeState: (next: ExtensionStorageShape) => { state = next; }
  };
}

function scheduledPrimary(): ScheduledPrimaryReminder {
  return {
    revision: 1,
    mode: "group",
    groupId: "group-1",
    scheduledFor: Date.parse("2026-07-14T03:30:00.000Z")
  };
}

function pendingSecond(): PendingSecondReminder {
  return {
    revision: 1,
    groupId: "group-1",
    officeDate: "2026-07-14",
    scheduledFor: Date.parse("2026-07-14T03:50:00.000Z")
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Manifest V3 reminder runtime", () => {
  it("keeps an active group without settings cache unscheduled when sync is offline", async () => {
    const fixture = runtimeFixture(connectedState(false));
    vi.mocked(fixture.dependencies.getGroupSettingsForContext).mockRejectedValue(
      new TypeError("offline")
    );
    const runtime = createReminderRuntime(fixture.dependencies);

    await runtime.rescheduleAll();

    expect(fixture.alarms.has(PRIMARY_ALARM_NAME)).toBe(false);
    expect(fixture.readState().scheduledPrimaryReminder).toBeUndefined();
  });

  it("persists a group primary context before creating its alarm", async () => {
    const fixture = runtimeFixture();
    const runtime = createReminderRuntime(fixture.dependencies);

    await runtime.rescheduleAll();

    expect(fixture.readState().scheduledPrimaryReminder).toMatchObject({
      revision: 1,
      mode: "group",
      groupId: "group-1"
    });
    expect(fixture.alarms.get(PRIMARY_ALARM_NAME)).toBe(
      Date.parse("2026-07-14T03:30:00.000Z")
    );
  });

  it("does not schedule a primary when the effective weekday reminder is disabled", async () => {
    const response = settingsResponse();
    response.reminder.weekdayReminderEnabled = false;
    const fixture = runtimeFixture();
    vi.mocked(fixture.dependencies.getGroupSettingsForContext)
      .mockResolvedValue(response);
    const runtime = createReminderRuntime(fixture.dependencies);

    await runtime.rescheduleAll();

    expect(fixture.alarms.has(PRIMARY_ALARM_NAME)).toBe(false);
    expect(fixture.readState().scheduledPrimaryReminder).toBeUndefined();
  });

  it("shows a fresh primary and arms one second reminder twenty minutes later", async () => {
    const state = connectedState();
    state.scheduledPrimaryReminder = scheduledPrimary();
    const fixture = runtimeFixture(state);
    vi.mocked(fixture.dependencies.now).mockReturnValue(
      Date.parse("2026-07-14T03:30:05.000Z")
    );
    const runtime = createReminderRuntime(fixture.dependencies);

    await runtime.handlePrimaryAlarm();

    expect(fixture.notifications).toContainEqual(expect.objectContaining({
      id: PRIMARY_NOTIFICATION_ID,
      options: expect.objectContaining({ title: "午饭时间" })
    }));
    expect(fixture.readState().pendingSecondReminder).toMatchObject({
      revision: 1,
      groupId: "group-1",
      officeDate: "2026-07-14",
      scheduledFor: Date.parse("2026-07-14T03:50:05.000Z")
    });
    expect(fixture.alarms.get(SECOND_ALARM_NAME)).toBe(
      Date.parse("2026-07-14T03:50:05.000Z")
    );
  });

  it("allows a cached primary recommendation but never arms the second reminder", async () => {
    const state = connectedState();
    state.scheduledPrimaryReminder = scheduledPrimary();
    const fixture = runtimeFixture(state);
    vi.mocked(fixture.dependencies.getPrimaryRecommendationsForStorage)
      .mockResolvedValue(recommendations(true));
    const runtime = createReminderRuntime(fixture.dependencies);

    await runtime.handlePrimaryAlarm();

    expect(fixture.notifications.some(({ id }) => id === PRIMARY_NOTIFICATION_ID)).toBe(true);
    expect(fixture.notifications.some(({ id }) => id === SECOND_NOTIFICATION_ID)).toBe(false);
    expect(fixture.readState().pendingSecondReminder).toBeUndefined();
    expect(fixture.alarms.has(SECOND_ALARM_NAME)).toBe(false);
  });

  it("uses valid cached settings for a primary after a settings network failure", async () => {
    const state = connectedState();
    state.scheduledPrimaryReminder = scheduledPrimary();
    const fixture = runtimeFixture(state);
    vi.mocked(fixture.dependencies.getGroupSettingsForContext)
      .mockRejectedValue(new TypeError("offline"));
    const runtime = createReminderRuntime(fixture.dependencies);

    await runtime.handlePrimaryAlarm();

    expect(fixture.notifications.some(({ id }) => id === PRIMARY_NOTIFICATION_ID))
      .toBe(true);
    expect(fixture.readState().pendingSecondReminder).toBeUndefined();
  });

  it("suppresses a primary and clears its session after settings authorization fails", async () => {
    const state = connectedState();
    state.scheduledPrimaryReminder = scheduledPrimary();
    const fixture = runtimeFixture(state);
    vi.mocked(fixture.dependencies.getGroupSettingsForContext).mockRejectedValue(
      new ExtensionApiError({ kind: "http", status: 401 })
    );
    const runtime = createReminderRuntime(fixture.dependencies);

    await runtime.handlePrimaryAlarm();

    expect(fixture.notifications).toHaveLength(0);
    expect(fixture.dependencies.clearGroupSession).toHaveBeenCalledWith("group-1");
  });

  it("does not arm a second reminder when primary notification creation fails", async () => {
    const state = connectedState();
    state.scheduledPrimaryReminder = scheduledPrimary();
    const fixture = runtimeFixture(state);
    vi.mocked(fixture.dependencies.createNotification)
      .mockRejectedValue(new Error("notification_failed"));
    const runtime = createReminderRuntime(fixture.dependencies);

    await runtime.handlePrimaryAlarm();

    expect(fixture.readState().pendingSecondReminder).toBeUndefined();
    expect(fixture.alarms.has(SECOND_ALARM_NAME)).toBe(false);
  });

  it("drops a late primary response after switching groups", async () => {
    const state = connectedState();
    state.scheduledPrimaryReminder = scheduledPrimary();
    const fixture = runtimeFixture(state);
    vi.mocked(fixture.dependencies.getPrimaryRecommendationsForStorage)
      .mockImplementation(async () => {
        const switched = fixture.readState();
        switched.activeGroupId = "group-2";
        switched.reminderRevision = 2;
        fixture.writeState(switched);
        return recommendations();
      });
    const runtime = createReminderRuntime(fixture.dependencies);

    await runtime.handlePrimaryAlarm();

    expect(fixture.notifications).toHaveLength(0);
    expect(fixture.readState().pendingSecondReminder).toBeUndefined();
  });

  it("shows the second reminder once only when live participation has no decision", async () => {
    const state = connectedState();
    state.pendingSecondReminder = pendingSecond();
    const fixture = runtimeFixture(state);
    const runtime = createReminderRuntime(fixture.dependencies);

    await runtime.handleSecondAlarm();
    await runtime.handleSecondAlarm();

    expect(fixture.notifications.filter(({ id }) => id === SECOND_NOTIFICATION_ID))
      .toHaveLength(1);
    expect(fixture.dependencies.getTodayParticipationForContext)
      .toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a decision", async (fixture: ReturnType<typeof runtimeFixture>) => {
      vi.mocked(fixture.dependencies.getTodayParticipationForContext)
        .mockResolvedValue(participation(1));
    }],
    ["network failure", async (fixture: ReturnType<typeof runtimeFixture>) => {
      vi.mocked(fixture.dependencies.getTodayParticipationForContext)
        .mockRejectedValue(new TypeError("offline"));
    }],
    ["a stale revision", async (fixture: ReturnType<typeof runtimeFixture>) => {
      const next = fixture.readState();
      next.reminderRevision = 2;
      fixture.writeState(next);
    }],
    ["a mismatched office date", async (fixture: ReturnType<typeof runtimeFixture>) => {
      const response = participation();
      response.officeDate = "2026-07-15";
      vi.mocked(fixture.dependencies.getTodayParticipationForContext)
        .mockResolvedValue(response);
    }],
    ["a mismatched group response", async (fixture: ReturnType<typeof runtimeFixture>) => {
      const response = participation();
      response.groupId = "group-2";
      vi.mocked(fixture.dependencies.getTodayParticipationForContext)
        .mockResolvedValue(response);
    }]
  ] as const)("suppresses the second reminder after %s", async (_case, arrange) => {
    const state = connectedState();
    state.pendingSecondReminder = pendingSecond();
    const fixture = runtimeFixture(state);
    await arrange(fixture);
    const runtime = createReminderRuntime(fixture.dependencies);

    await runtime.handleSecondAlarm();

    expect(fixture.notifications.some(({ id }) => id === SECOND_NOTIFICATION_ID))
      .toBe(false);
  });

  it("restores a missing future second alarm after worker startup", async () => {
    const state = connectedState();
    state.pendingSecondReminder = pendingSecond();
    const fixture = runtimeFixture(state);
    const runtime = createReminderRuntime(fixture.dependencies);

    await runtime.ensureAlarms();

    expect(fixture.alarms.get(SECOND_ALARM_NAME)).toBe(
      pendingSecond().scheduledFor
    );
  });

  it("restores a missing future primary alarm after worker startup", async () => {
    const state = connectedState();
    state.scheduledPrimaryReminder = scheduledPrimary();
    const fixture = runtimeFixture(state);
    const runtime = createReminderRuntime(fixture.dependencies);

    await runtime.ensureAlarms();

    expect(fixture.alarms.get(PRIMARY_ALARM_NAME)).toBe(
      scheduledPrimary().scheduledFor
    );
  });

  it("drops expired contexts on startup without backfilling notifications", async () => {
    const state = connectedState();
    state.scheduledPrimaryReminder = {
      ...scheduledPrimary(),
      scheduledFor: Date.parse("2026-07-14T02:00:00.000Z")
    };
    state.pendingSecondReminder = {
      ...pendingSecond(),
      scheduledFor: Date.parse("2026-07-14T02:20:00.000Z")
    };
    const fixture = runtimeFixture(state);
    const runtime = createReminderRuntime(fixture.dependencies);

    await runtime.ensureAlarms();

    expect(fixture.notifications).toHaveLength(0);
    expect(fixture.readState().pendingSecondReminder).toBeUndefined();
    expect(fixture.readState().scheduledPrimaryReminder?.scheduledFor)
      .toBeGreaterThan(Date.parse("2026-07-14T03:00:00.000Z"));
  });

  it("clears a newly-created alarm when its persisted context becomes stale", async () => {
    const fixture = runtimeFixture();
    vi.mocked(fixture.dependencies.createAlarm).mockImplementation(async (
      name,
      scheduledFor
    ) => {
      fixture.alarms.set(name, scheduledFor);
      const next = fixture.readState();
      next.reminderRevision += 1;
      delete next.scheduledPrimaryReminder;
      fixture.writeState(next);
    });
    const runtime = createReminderRuntime(fixture.dependencies);

    await runtime.rescheduleAll();

    expect(fixture.alarms.has(PRIMARY_ALARM_NAME)).toBe(false);
  });
});
