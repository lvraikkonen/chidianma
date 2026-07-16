import type { GroupSettingsResponse } from "@lunch/shared";
import { describe, expect, it } from "vitest";
import {
  getReminderFingerprint,
  isStrictReminderTime,
  resolveEffectiveReminderSettings,
  validateGroupSettingsForReminder
} from "../src/reminderPolicy";
import { getDefaultStorageState } from "../src/storage";

function groupSettings(overrides: {
  groupId?: string;
  timezone?: string;
  reminderTime?: string;
  secondReminderEnabled?: boolean;
  notificationTitle?: string;
} = {}): GroupSettingsResponse {
  return {
    groupId: overrides.groupId ?? "group-1",
    group: {
      name: "设计组",
      officeTimezone: overrides.timezone ?? "Asia/Shanghai",
      officeCity: "上海",
      officeLatitude: 31.23,
      officeLongitude: 121.47
    },
    reminder: {
      reminderTime: overrides.reminderTime ?? "11:30",
      weekdayReminderEnabled: true,
      secondReminderEnabled: overrides.secondReminderEnabled ?? false,
      notificationTitle: overrides.notificationTitle ?? "中午吃点啥",
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

describe("reminder policy", () => {
  it.each(["00:00", "09:05", "23:59"])("accepts strict time %s", (value) => {
    expect(isStrictReminderTime(value)).toBe(true);
  });

  it.each(["9:05", "24:00", "12:60", "noon", ""])("rejects invalid time %s", (value) => {
    expect(isStrictReminderTime(value)).toBe(false);
  });

  it("merges a canonical local override over group defaults", () => {
    const response = groupSettings({ secondReminderEnabled: false });
    const state = {
      ...getDefaultStorageState(),
      activeGroupId: "group-1",
      sessionsByGroupId: { "group-1": { token: "session" } },
      groupSettingsCacheByGroupId: {
        "group-1": { response, cachedAt: "2026-07-14T00:00:00.000Z" }
      },
      localReminderOverridesByGroupId: {
        "group-1": {
          reminderTime: "12:05",
          weekdayReminderEnabled: false,
          secondReminderEnabled: true
        }
      }
    };

    expect(resolveEffectiveReminderSettings(state)).toEqual({
      source: "local-override",
      mode: "group",
      groupId: "group-1",
      officeTimezone: "Asia/Shanghai",
      reminderTime: "12:05",
      weekdayReminderEnabled: false,
      secondReminderEnabled: true,
      notificationTitle: "中午吃点啥",
      notificationGroupLabel: "设计组"
    });
  });

  it("reads legacy enabled before the group default", () => {
    const response = groupSettings();
    const state = {
      ...getDefaultStorageState(),
      activeGroupId: "group-1",
      groupSettingsCacheByGroupId: {
        "group-1": { response, cachedAt: "2026-07-14T00:00:00.000Z" }
      },
      localReminderOverridesByGroupId: {
        "group-1": { enabled: false }
      }
    };

    expect(resolveEffectiveReminderSettings(state)).toMatchObject({
      source: "local-override",
      weekdayReminderEnabled: false,
      secondReminderEnabled: false
    });
  });

  it("keeps an active group quiet without a validated settings cache", () => {
    expect(resolveEffectiveReminderSettings({
      ...getDefaultStorageState(),
      activeGroupId: "group-1",
      localReminderOverridesByGroupId: {
        "group-1": { reminderTime: "12:00", enabled: true }
      }
    })).toBeNull();
  });

  it("keeps an active group quiet when its cache metadata is corrupted", () => {
    expect(resolveEffectiveReminderSettings({
      ...getDefaultStorageState(),
      activeGroupId: "group-1",
      groupSettingsCacheByGroupId: {
        "group-1": {
          response: groupSettings(),
          cachedAt: "not-an-iso-date"
        }
      }
    })).toBeNull();
  });

  it("disables reminders without an active group", () => {
    expect(resolveEffectiveReminderSettings({
      ...getDefaultStorageState(),
      reminderTime: "10:45",
      enabled: true
    })).toBeNull();
  });

  it.each([
    [{ reminderTime: "9:30" }, "invalid_reminder_time"],
    [{ timezone: "Mars/Olympus" }, "invalid_office_timezone"],
    [{ notificationTitle: "   " }, "invalid_notification_title"]
  ] as const)("rejects invalid cached reminder settings", (overrides, code) => {
    expect(() => validateGroupSettingsForReminder(
      "group-1",
      groupSettings(overrides)
    )).toThrow(code);
  });

  it("fingerprints reminder behavior but not unrelated settings metadata", () => {
    const state = {
      ...getDefaultStorageState(),
      activeGroupId: "group-1",
      groupSettingsCacheByGroupId: {
        "group-1": {
          response: groupSettings(),
          cachedAt: "2026-07-14T00:00:00.000Z"
        }
      }
    };
    const renamed = structuredClone(state);
    renamed.groupSettingsCacheByGroupId["group-1"]!.response.group.name = "新名称";
    renamed.groupSettingsCacheByGroupId["group-1"]!.cachedAt = "2026-07-15T00:00:00.000Z";

    expect(getReminderFingerprint(state)).toBe(getReminderFingerprint(renamed));
  });
});
