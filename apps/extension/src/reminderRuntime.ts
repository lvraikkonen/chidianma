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
  notificationIconUrl: string;
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
  return {
    revision: state.reminderRevision,
    mode: "group",
    groupId: effective.groupId,
    scheduledFor
  };
}

function notificationOptions(
  recommendation: ExtensionRecommendationResponse,
  effective: EffectiveReminderSettings,
  iconUrl: string
): chrome.notifications.NotificationOptions<true> {
  const names = recommendation.items
    .map((item) => item.restaurantName)
    .join("、");
  const weatherSummary = recommendation.weather?.summary;
  const contextMessage = [
    effective.notificationGroupLabel,
    weatherSummary
  ].filter((value): value is string => Boolean(value)).join(" · ");
  return {
    type: "basic",
    iconUrl,
    title: effective.notificationTitle,
    message: names || "还没有可用推荐，先去管理页添加几家饭馆。",
    priority: 1,
    ...(contextMessage ? { contextMessage } : {})
  };
}

function secondNotificationOptions(
  effective: EffectiveReminderSettings,
  iconUrl: string
): chrome.notifications.NotificationOptions<true> {
  return {
    type: "basic",
    iconUrl,
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

  function alarmMatches(
    alarm: AlarmSnapshot | undefined,
    scheduledFor: number
  ): boolean {
    return alarm?.scheduledTime === scheduledFor;
  }

  async function ensureActualAlarm(
    name: string,
    scheduledFor: number
  ): Promise<void> {
    const existing = await dependencies.getAlarm(name);
    if (alarmMatches(existing, scheduledFor)) return;
    if (existing) await dependencies.clearAlarm(name);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await dependencies.createAlarm(name, scheduledFor);
      const created = await dependencies.getAlarm(name);
      if (alarmMatches(created, scheduledFor)) return;
    }
    throw new Error(`alarm_creation_failed:${name}`);
  }

  async function reconcilePrimaryAfterStaleAttempt(
    attempted: ScheduledPrimaryReminder
  ): Promise<void> {
    const current = await dependencies.getStorageState();
    const latest = current.scheduledPrimaryReminder;
    if (
      latest
      && isStoredReminderContextCurrent(current, {
        revision: latest.revision,
        ...(latest.mode === "group" ? { groupId: latest.groupId } : {})
      })
    ) {
      if (latest.scheduledFor > dependencies.now()) {
        await ensureActualAlarm(PRIMARY_ALARM_NAME, latest.scheduledFor);
      }
      return;
    }
    const alarm = await dependencies.getAlarm(PRIMARY_ALARM_NAME);
    if (alarmMatches(alarm, attempted.scheduledFor)) {
      await dependencies.clearAlarm(PRIMARY_ALARM_NAME);
    }
  }

  async function reconcileSecondAfterStaleAttempt(
    attempted: PendingSecondReminder
  ): Promise<void> {
    const current = await dependencies.getStorageState();
    const latest = current.pendingSecondReminder;
    if (
      latest
      && isStoredReminderContextCurrent(current, {
        revision: latest.revision,
        groupId: latest.groupId
      })
    ) {
      if (latest.scheduledFor > dependencies.now()) {
        await ensureActualAlarm(SECOND_ALARM_NAME, latest.scheduledFor);
      }
      return;
    }
    const alarm = await dependencies.getAlarm(SECOND_ALARM_NAME);
    if (alarmMatches(alarm, attempted.scheduledFor)) {
      await dependencies.clearAlarm(SECOND_ALARM_NAME);
    }
  }

  async function createVerifiedPrimaryAlarm(
    context: ScheduledPrimaryReminder
  ): Promise<void> {
    await dependencies.saveScheduledPrimaryReminder(context);
    try {
      await ensureActualAlarm(PRIMARY_ALARM_NAME, context.scheduledFor);
    } catch (error) {
      const failed = await dependencies.getStorageState();
      if (samePrimaryContext(failed.scheduledPrimaryReminder, context)) {
        await dependencies.clearScheduledPrimaryReminder();
        throw error;
      }
      await reconcilePrimaryAfterStaleAttempt(context);
      return;
    }
    const current = await dependencies.getStorageState();
    if (!samePrimaryContext(current.scheduledPrimaryReminder, context)) {
      await reconcilePrimaryAfterStaleAttempt(context);
    }
  }

  async function createVerifiedSecondAlarm(
    context: PendingSecondReminder
  ): Promise<void> {
    await dependencies.savePendingSecondReminder(context);
    try {
      await ensureActualAlarm(SECOND_ALARM_NAME, context.scheduledFor);
    } catch (error) {
      const failed = await dependencies.getStorageState();
      if (sameSecondContext(failed.pendingSecondReminder, context)) {
        await dependencies.clearPendingSecondReminder();
        throw error;
      }
      await reconcileSecondAfterStaleAttempt(context);
      return;
    }
    const current = await dependencies.getStorageState();
    if (!sameSecondContext(current.pendingSecondReminder, context)) {
      await reconcileSecondAfterStaleAttempt(context);
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
    await ensureActualAlarm(name, scheduledFor);
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

  async function restoreWorkerAlarms(): Promise<void> {
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
    }

    const second = state.pendingSecondReminder;
    if (
      second
      && second.scheduledFor > now
      && isStoredReminderContextCurrent(state, {
        revision: second.revision,
        groupId: second.groupId
      })
    ) {
      await restoreFutureAlarm(SECOND_ALARM_NAME, second.scheduledFor);
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
        notificationOptions(
          recommendation,
          effective,
          dependencies.notificationIconUrl
        )
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
        secondNotificationOptions(effective, dependencies.notificationIconUrl)
      );
    } catch {
      // The second reminder is deliberately best effort and never retries.
    }
  }

  let operationTail: Promise<void> = Promise.resolve();

  function runSerialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = operationTail.then(
      () => operation(),
      () => operation()
    );
    operationTail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  return {
    ensureAlarms: () => runSerialized(ensureAlarms),
    restoreWorkerAlarms: () => runSerialized(restoreWorkerAlarms),
    rescheduleAll: () => runSerialized(rescheduleAll),
    scheduleNextPrimary: () => runSerialized(scheduleNextPrimary),
    handlePrimaryAlarm: () => runSerialized(handlePrimaryAlarm),
    handleSecondAlarm: () => runSerialized(handleSecondAlarm)
  };
}
