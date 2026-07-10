import { LUNCH_HEADLINE } from "@lunch/shared";
import { getNextAlarmTime } from "./alarmSchedule";
import {
  ensureGroupTodayRecommendations,
  fetchTodayRecommendations,
  isGroupResponse
} from "./recommendationClient";
import { getSettings } from "./storage";

const ALARM_NAME = "lunch-reminder";
const NOTIFICATION_ID = "today-lunch";

chrome.runtime.onInstalled.addListener(() => {
  void scheduleLunchAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureLunchAlarm();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "settingsChanged") {
    void scheduleLunchAlarm();
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  void showLunchNotification()
    .catch((error) => {
      console.error("Failed to show lunch notification", error);
    })
    .finally(() => {
      void scheduleLunchAlarm();
    });
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId !== NOTIFICATION_ID) return;
  void openRecommendationDetail();
});

void ensureLunchAlarm();

export async function ensureLunchAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) {
    await scheduleLunchAlarm();
  }
}

export async function scheduleLunchAlarm(): Promise<void> {
  const settings = await getSettings();
  await chrome.alarms.clear(ALARM_NAME);
  if (!settings.enabled) return;
  await chrome.alarms.create(ALARM_NAME, {
    when: getNextAlarmTime(new Date(), settings.reminderTime)
  });
}

export async function showLunchNotification(): Promise<void> {
  const recommendation = await ensureGroupTodayRecommendations().catch(() =>
    fetchTodayRecommendations()
  );
  const names = recommendation.items.map((item) => item.restaurantName).join("、");
  const weatherSummary = isGroupResponse(recommendation)
    ? recommendation.weather?.summary
    : recommendation.weatherSummary;

  const options: chrome.notifications.NotificationOptions<true> = {
    type: "basic",
    iconUrl: "icon-128.png",
    title: LUNCH_HEADLINE,
    message: names || "还没有可用推荐，先去管理页添加几家饭馆。",
    priority: 1
  };

  if (weatherSummary) {
    options.contextMessage = weatherSummary;
  }

  await chrome.notifications.create(NOTIFICATION_ID, options);
}

async function openRecommendationDetail(): Promise<void> {
  if (chrome.action.openPopup) {
    try {
      await chrome.action.openPopup();
      return;
    } catch {
      // Fall through to opening a detail tab.
    }
  }
  await chrome.tabs.create({
    url: chrome.runtime.getURL("detail.html")
  });
}
