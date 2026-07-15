import { getPrimaryRecommendationsForStorage } from "./recommendationClient";
import {
  PRIMARY_ALARM_NAME,
  PRIMARY_NOTIFICATION_ID,
  SECOND_ALARM_NAME,
  SECOND_NOTIFICATION_ID,
  createReminderRuntime
} from "./reminderRuntime";
import {
  getGroupSettingsForContext,
  getTodayParticipationForContext
} from "./stage5Client";
import {
  claimPendingSecondReminder,
  claimScheduledPrimaryReminder,
  clearGroupSession,
  clearPendingSecondReminder,
  clearScheduledPrimaryReminder,
  getStorageState,
  saveGroupSettingsCache,
  savePendingSecondReminder,
  saveScheduledPrimaryReminder
} from "./storage";

function runBackgroundTask(label: string, task: Promise<void>): void {
  void task.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "unknown_error";
    console.error(`[lunch-reminder] ${label}: ${message}`);
  });
}

const runtime = createReminderRuntime({
  now: () => Date.now(),
  notificationIconUrl: chrome.runtime.getURL("icon-128.png"),
  getStorageState,
  saveGroupSettingsCache,
  clearGroupSession,
  saveScheduledPrimaryReminder,
  claimScheduledPrimaryReminder,
  clearScheduledPrimaryReminder,
  savePendingSecondReminder,
  claimPendingSecondReminder,
  clearPendingSecondReminder,
  getAlarm: (name) => chrome.alarms.get(name),
  createAlarm: async (name, scheduledFor) => {
    const alarmInfo = {
      when: scheduledFor,
      persistAcrossSessions: true
    };
    await chrome.alarms.create(name, alarmInfo);
  },
  clearAlarm: (name) => chrome.alarms.clear(name),
  createNotification: async (id, options) => {
    await chrome.notifications.create(id, options);
  },
  clearNotification: async (id) => {
    await chrome.notifications.clear(id);
    return true;
  },
  getGroupSettingsForContext,
  getPrimaryRecommendationsForStorage,
  getTodayParticipationForContext
});

chrome.runtime.onInstalled.addListener(() => {
  runBackgroundTask("install reschedule failed", runtime.rescheduleAll());
});

chrome.runtime.onStartup.addListener(() => {
  runBackgroundTask("startup restore failed", runtime.ensureAlarms());
});

chrome.runtime.onMessage.addListener((message) => {
  if (
    message?.type === "settingsChanged"
    || message?.type === "reminderContextChanged"
  ) {
    runBackgroundTask("context reschedule failed", runtime.rescheduleAll());
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PRIMARY_ALARM_NAME) {
    runBackgroundTask("primary handler failed", runtime.handlePrimaryAlarm());
  } else if (alarm.name === SECOND_ALARM_NAME) {
    runBackgroundTask("second handler failed", runtime.handleSecondAlarm());
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (
    notificationId === PRIMARY_NOTIFICATION_ID
    || notificationId === SECOND_NOTIFICATION_ID
  ) {
    runBackgroundTask("notification click failed", openRecommendationDetail());
  }
});

runBackgroundTask("worker restore failed", runtime.restoreWorkerAlarms());

async function openRecommendationDetail(): Promise<void> {
  if (chrome.action.openPopup) {
    try {
      await chrome.action.openPopup();
      return;
    } catch {
      // Fall through to opening a detail tab.
    }
  }
  await chrome.tabs.create({ url: chrome.runtime.getURL("detail.html") });
}
