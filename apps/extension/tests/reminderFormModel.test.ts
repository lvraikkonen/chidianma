import type { GroupSettingsResponse } from "@lunch/shared";
import { describe, expect, it } from "vitest";
import {
  buildReminderFormModel,
  validateReminderDraft
} from "../src/reminderFormModel";
import { getDefaultStorageState } from "../src/storage";

function settings(): GroupSettingsResponse {
  return {
    groupId: "group-1",
    group: {
      name: "设计组",
      officeTimezone: "America/Los_Angeles",
      officeCity: "Los Angeles",
      officeLatitude: 34.05,
      officeLongitude: -118.24
    },
    reminder: {
      reminderTime: "11:30",
      weekdayReminderEnabled: true,
      secondReminderEnabled: false,
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

describe("reminder form model", () => {
  it("starts in follow-default mode without an override bucket", () => {
    const response = settings();
    const state = {
      ...getDefaultStorageState(),
      activeGroupId: "group-1",
      groupSettingsCacheByGroupId: {
        "group-1": { response, cachedAt: "2026-07-14T00:00:00.000Z" }
      }
    };

    expect(buildReminderFormModel(state, response)).toEqual({
      groupId: "group-1",
      mode: "group-default",
      officeTimezone: "America/Los_Angeles",
      notificationTitle: "午饭时间",
      notificationGroupLabel: "设计组",
      groupDefault: {
        reminderTime: "11:30",
        weekdayReminderEnabled: true,
        secondReminderEnabled: false
      },
      draft: {
        reminderTime: "11:30",
        weekdayReminderEnabled: true,
        secondReminderEnabled: false
      }
    });
  });

  it("uses canonical and legacy override values in custom mode", () => {
    const response = settings();
    const state = {
      ...getDefaultStorageState(),
      activeGroupId: "group-1",
      groupSettingsCacheByGroupId: {
        "group-1": { response, cachedAt: "2026-07-14T00:00:00.000Z" }
      },
      localReminderOverridesByGroupId: {
        "group-1": {
          reminderTime: "12:10",
          enabled: false,
          secondReminderEnabled: true
        }
      }
    };

    expect(buildReminderFormModel(state, response)).toMatchObject({
      mode: "local-override",
      draft: {
        reminderTime: "12:10",
        weekdayReminderEnabled: false,
        secondReminderEnabled: true
      }
    });
  });

  it("does not render a corrupted cached settings response", () => {
    const response = settings();
    response.group.officeTimezone = "Mars/Olympus";
    const state = {
      ...getDefaultStorageState(),
      activeGroupId: "group-1",
      groupSettingsCacheByGroupId: {
        "group-1": { response, cachedAt: "2026-07-14T00:00:00.000Z" }
      }
    };

    expect(buildReminderFormModel(state)).toBeNull();
  });

  it.each(["9:30", "24:00", "12:60", ""])(
    "rejects invalid draft time %s",
    (reminderTime) => {
      expect(validateReminderDraft({
        reminderTime,
        weekdayReminderEnabled: true,
        secondReminderEnabled: false
      })).toEqual({ valid: false, error: "提醒时间必须使用 HH:mm。" });
    }
  );

  it("accepts a complete canonical draft", () => {
    expect(validateReminderDraft({
      reminderTime: "09:05",
      weekdayReminderEnabled: false,
      secondReminderEnabled: true
    })).toEqual({ valid: true });
  });
});
