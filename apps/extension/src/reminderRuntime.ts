import type {
  GroupSettingsResponse,
  ParticipationTodayResponse
} from "@lunch/shared";
import { ExtensionApiError } from "./apiClient";
import { getNextAlarmTime, getSecondReminderTime } from "./alarmSchedule";
import {
  isGroupResponse,
  type ExtensionRecommendationResponse
} from "./recommendationClient";
import {
  resolveEffectiveReminderSettings,
  type EffectiveReminderSettings
} from "./reminderPolicy";
import type { ExtensionGroupContext } from "./stage5Client";
import {
  isStoredReminderContextCurrent,
  type ExtensionStorageShape,
  type PendingSecondReminder,
  type ScheduledPrimaryReminder
} from "./storage";

export const PRIMARY_ALARM_NAME = "lunch-reminder";
export const SECOND_ALARM_NAME = "lunch-second-reminder";
export const PRIMARY_NOTIFICATION_ID = "today-lunch";
export const SECOND_NOTIFICATION_ID = "today-lunch-second";

interface AlarmSnapshot {
  name: string;
  scheduledTime?: number | undefined;
}

export interface ReminderRuntimeDependencies {
  now: () => number;
  getStorageState: () => Promise<ExtensionStorageShape>;
  saveGroupSettingsCache: (
    groupId: string,
    response: GroupSettingsResponse,
    cachedAt: string,
    options?: { notify?: boolean }
  ) => Promise<void>;
  clearGroupSession: (groupId: string) => Promise<void>;
  saveScheduledPrimaryReminder: (
    context: ScheduledPrimaryReminder
  ) => Promise<void>;
  claimScheduledPrimaryReminder: () => Promise<ScheduledPrimaryReminder | null>;
  clearScheduledPrimaryReminder: () => Promise<void>;
  savePendingSecondReminder: (
    context: PendingSecondReminder
  ) => Promise<void>;
  claimPendingSecondReminder: () => Promise<PendingSecondReminder | null>;
  clearPendingSecondReminder: () => Promise<void>;
  getAlarm: (name: string) => Promise<AlarmSnapshot | undefined>;
  createAlarm: (name: string, scheduledFor: number) => Promise<void>;
  clearAlarm: (name: string) => Promise<boolean>;
  createNotification: (
    id: string,
    options: chrome.notifications.NotificationOptions<true>
  ) => Promise<unknown>;
  clearNotification: (id: string) => Promise<boolean>;
  getGroupSettingsForContext: (
    context: ExtensionGroupContext
  ) => Promise<GroupSettingsResponse>;
  getPrimaryRecommendationsForStorage: (
    storage: ExtensionStorageShape
  ) => Promise<ExtensionRecommendationResponse>;
  getTodayParticipationForContext: (
    context: ExtensionGroupContext
  ) => Promise<ParticipationTodayResponse>;
}

function groupContextFromStorage(
  state: ExtensionStorageShape
): ExtensionGroupContext | null {
  const groupId = state.activeGroupId;
  if (!groupId) return null;
  const groupSessionToken = state.sessionsByGroupId[groupId]?.token;
  const membershipId = state.groupSummariesById[groupId]?.membershipId;
  if (!groupSessionToken || !membershipId) return null;
  return {
    apiBaseUrl: state.apiBaseUrl,
    groupId,
    membershipId,
    groupSessionToken
  };
}

function samePrimaryContext(
  left: ScheduledPrimaryReminder | undefined,
  right: ScheduledPrimaryReminder
): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right);
}

function sameSecondContext(
  left: PendingSecondReminder | undefined,
  right: PendingSecondReminder
): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right);
}

function contextForEffectiveSettings(
  state: ExtensionStorageShape,
  effective: EffectiveReminderSettings,
  scheduledFor: number
): ScheduledPrimaryReminder {
  return effective.mode === "group"
    ? {
      revision: state.reminderRevision,
      mode: "group",
      groupId: effective.groupId!,
      scheduledFor
    }
    : {
      revision: state.reminderRevision,
      mode: "legacy",
      scheduledFor
    };
}

function notificationOptions(
  recommendation: ExtensionRecommendationResponse,
  effective: EffectiveReminderSettings
): chrome.notifications.NotificationOptions<true> {
  const names = recommendation.items
    .map((item) => item.restaurantName)
    .join("、");
  const weatherSummary = isGroupResponse(recommendation)
    ? recommendation.weather?.summary
    : recommendation.weatherSummary;
  const contextMessage = [
    effective.notificationGroupLabel,
    weatherSummary
  ].filter((value): value is string => Boolean(value)).join(" · ");
  return {
    type: "basic",
    iconUrl: "icon-128.png",
    title: effective.notificationTitle,
    message: names || "还没有可用推荐，先去管理页添加几家饭馆。",
    priority: 1,
    ...(contextMessage ? { contextMessage } : {})
  };
}

function secondNotificationOptions(
  effective: EffectiveReminderSettings
): chrome.notifications.NotificationOptions<true> {
  return {
    type: "basic",
    iconUrl: "icon-128.png",
    title: effective.notificationTitle,
    message: "还没人决定午饭，打开看看今天的推荐吧。",
    priority: 1,
    ...(effective.notificationGroupLabel
      ? { contextMessage: effective.notificationGroupLabel }
      : {})
  };
}

export function createReminderRuntime(
  dependencies: ReminderRuntimeDependencies
) {
  async function refreshGroupSettings(): Promise<{
    state: ExtensionStorageShape;
    fresh: boolean;
  }> {
    const before = await dependencies.getStorageState();
    const context = groupContextFromStorage(before);
    if (!context) return { state: before, fresh: false };
    try {
      const response = await dependencies.getGroupSettingsForContext(context);
      await dependencies.saveGroupSettingsCache(
        context.groupId,
        response,
        new Date(dependencies.now()).toISOString(),
        { notify: false }
      );
      return { state: await dependencies.getStorageState(), fresh: true };
    } catch (error) {
      if (
        error instanceof ExtensionApiError
        && (error.status === 401 || error.status === 403)
      ) {
        await dependencies.clearGroupSession(context.groupId);
      }
      return { state: await dependencies.getStorageState(), fresh: false };
    }
  }

  async function clearPrimary(): Promise<void> {
    await dependencies.clearAlarm(PRIMARY_ALARM_NAME);
    await dependencies.clearScheduledPrimaryReminder();
  }

  async function clearSecond(): Promise<void> {
    await dependencies.clearAlarm(SECOND_ALARM_NAME);
    await dependencies.clearPendingSecondReminder();
  }

  async function createVerifiedPrimaryAlarm(
    context: ScheduledPrimaryReminder
  ): Promise<void> {
    await dependencies.saveScheduledPrimaryReminder(context);
    await dependencies.createAlarm(PRIMARY_ALARM_NAME, context.scheduledFor);
    const current = await dependencies.getStorageState();
    if (!samePrimaryContext(current.scheduledPrimaryReminder, context)) {
      await dependencies.clearAlarm(PRIMARY_ALARM_NAME);
    }
  }

  async function createVerifiedSecondAlarm(
    context: PendingSecondReminder
  ): Promise<void> {
    await dependencies.savePendingSecondReminder(context);
    await dependencies.createAlarm(SECOND_ALARM_NAME, context.scheduledFor);
    const current = await dependencies.getStorageState();
    if (!sameSecondContext(current.pendingSecondReminder, context)) {
      await dependencies.clearAlarm(SECOND_ALARM_NAME);
    }
  }

  async function scheduleNextPrimary(): Promise<void> {
    await clearPrimary();
    const state = await dependencies.getStorageState();
    const effective = resolveEffectiveReminderSettings(state);
    if (!effective?.weekdayReminderEnabled) return;
    const scheduledFor = getNextAlarmTime(
      new Date(dependencies.now()),
      effective.reminderTime,
      effective.officeTimezone
    );
    await createVerifiedPrimaryAlarm(
      contextForEffectiveSettings(state, effective, scheduledFor)
    );
  }

  async function rescheduleAll(): Promise<void> {
    await clearPrimary();
    await clearSecond();
    await dependencies.clearNotification(PRIMARY_NOTIFICATION_ID);
    await dependencies.clearNotification(SECOND_NOTIFICATION_ID);
    await refreshGroupSettings();
    await scheduleNextPrimary();
  }

  async function restoreFutureAlarm(
    name: string,
    scheduledFor: number
  ): Promise<void> {
    const existing = await dependencies.getAlarm(name);
    if (!existing) await dependencies.createAlarm(name, scheduledFor);
  }

  async function ensureAlarms(): Promise<void> {
    await refreshGroupSettings();
    const now = dependencies.now();
    const state = await dependencies.getStorageState();
    const primary = state.scheduledPrimaryReminder;
    if (
      primary
      && primary.scheduledFor > now
      && isStoredReminderContextCurrent(state, {
        revision: primary.revision,
        ...(primary.mode === "group" ? { groupId: primary.groupId } : {})
      })
    ) {
      await restoreFutureAlarm(PRIMARY_ALARM_NAME, primary.scheduledFor);
    } else {
      await clearPrimary();
      await scheduleNextPrimary();
    }

    const latest = await dependencies.getStorageState();
    const second = latest.pendingSecondReminder;
    if (
      second
      && second.scheduledFor > now
      && isStoredReminderContextCurrent(latest, {
        revision: second.revision,
        groupId: second.groupId
      })
    ) {
      await restoreFutureAlarm(SECOND_ALARM_NAME, second.scheduledFor);
    } else if (second) {
      await clearSecond();
    }
  }

  async function handlePrimaryAlarm(): Promise<void> {
    const claimed = await dependencies.claimScheduledPrimaryReminder();
    if (!claimed) return;
    try {
      const sync = await refreshGroupSettings();
      if (!isStoredReminderContextCurrent(sync.state, {
        revision: claimed.revision,
        ...(claimed.mode === "group" ? { groupId: claimed.groupId } : {})
      })) return;
      const effective = resolveEffectiveReminderSettings(sync.state);
      if (!effective?.weekdayReminderEnabled) return;
      const recommendation = await dependencies
        .getPrimaryRecommendationsForStorage(sync.state);
      const current = await dependencies.getStorageState();
      if (!isStoredReminderContextCurrent(current, {
        revision: claimed.revision,
        ...(claimed.mode === "group" ? { groupId: claimed.groupId } : {})
      })) return;
      if (
        isGroupResponse(recommendation)
        && recommendation.groupId !== current.activeGroupId
      ) return;
      await dependencies.createNotification(
        PRIMARY_NOTIFICATION_ID,
        notificationOptions(recommendation, effective)
      );

      if (
        sync.fresh
        && effective.mode === "group"
        && effective.secondReminderEnabled
        && isGroupResponse(recommendation)
        && recommendation.fromCache !== true
      ) {
        const pending: PendingSecondReminder = {
          revision: current.reminderRevision,
          groupId: effective.groupId!,
          officeDate: recommendation.officeDate,
          scheduledFor: getSecondReminderTime(dependencies.now())
        };
        await createVerifiedSecondAlarm(pending);
      }
    } catch {
      // Primary failures stay quiet; the next alarm is still scheduled below.
    } finally {
      await scheduleNextPrimary();
    }
  }

  async function handleSecondAlarm(): Promise<void> {
    const claimed = await dependencies.claimPendingSecondReminder();
    if (!claimed) return;
    try {
      const state = await dependencies.getStorageState();
      if (!isStoredReminderContextCurrent(state, {
        revision: claimed.revision,
        groupId: claimed.groupId
      })) return;
      const effective = resolveEffectiveReminderSettings(state);
      if (
        effective?.mode !== "group"
        || !effective.secondReminderEnabled
        || effective.groupId !== claimed.groupId
      ) return;
      const context = groupContextFromStorage(state);
      if (!context || context.groupId !== claimed.groupId) return;
      const participation = await dependencies
        .getTodayParticipationForContext(context);
      const current = await dependencies.getStorageState();
      if (!isStoredReminderContextCurrent(current, {
        revision: claimed.revision,
        groupId: claimed.groupId
      })) return;
      if (
        participation.groupId !== claimed.groupId
        || participation.officeDate !== claimed.officeDate
        || participation.summary.decidedCount !== 0
      ) return;
      await dependencies.createNotification(
        SECOND_NOTIFICATION_ID,
        secondNotificationOptions(effective)
      );
    } catch {
      // The second reminder is deliberately best effort and never retries.
    }
  }

  return {
    ensureAlarms,
    rescheduleAll,
    scheduleNextPrimary,
    handlePrimaryAlarm,
    handleSecondAlarm
  };
}
