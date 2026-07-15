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

const runtime = createReminderRuntime({
  now: () => Date.now(),
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
    await chrome.alarms.create(name, { when: scheduledFor });
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
  void runtime.rescheduleAll();
});

chrome.runtime.onStartup.addListener(() => {
  void runtime.ensureAlarms();
});

chrome.runtime.onMessage.addListener((message) => {
  if (
    message?.type === "settingsChanged"
    || message?.type === "reminderContextChanged"
  ) {
    void runtime.rescheduleAll();
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PRIMARY_ALARM_NAME) {
    void runtime.handlePrimaryAlarm();
  } else if (alarm.name === SECOND_ALARM_NAME) {
    void runtime.handleSecondAlarm();
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (
    notificationId === PRIMARY_NOTIFICATION_ID
    || notificationId === SECOND_NOTIFICATION_ID
  ) {
    void openRecommendationDetail();
  }
});

void runtime.ensureAlarms();

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
