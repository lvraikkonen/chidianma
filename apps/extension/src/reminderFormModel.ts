import type { GroupSettingsResponse } from "@lunch/shared";
import {
  isStrictReminderTime,
  validateGroupSettingsForReminder
} from "./reminderPolicy";
import type { ExtensionStorageShape } from "./storage";

export interface ReminderDraft {
  reminderTime: string;
  weekdayReminderEnabled: boolean;
  secondReminderEnabled: boolean;
}

export interface ReminderFormModel {
  groupId: string;
  mode: "group-default" | "local-override";
  officeTimezone: string;
  notificationTitle: string;
  notificationGroupLabel?: string | undefined;
  groupDefault: ReminderDraft;
  draft: ReminderDraft;
}

export function buildReminderFormModel(
  storage: ExtensionStorageShape,
  liveSettings?: GroupSettingsResponse
): ReminderFormModel | null {
  const groupId = storage.activeGroupId;
  if (!groupId) return null;

  const cached = storage.groupSettingsCacheByGroupId[groupId];
  if (!liveSettings && cached && !Number.isFinite(Date.parse(cached.cachedAt))) {
    return null;
  }
  const response = liveSettings ?? cached?.response;
  if (!response || response.groupId !== groupId) return null;
  try {
    validateGroupSettingsForReminder(groupId, response);
  } catch {
    return null;
  }

  const groupDefault: ReminderDraft = {
    reminderTime: response.reminder.reminderTime,
    weekdayReminderEnabled: response.reminder.weekdayReminderEnabled,
    secondReminderEnabled: response.reminder.secondReminderEnabled
  };
  const override = storage.localReminderOverridesByGroupId[groupId];

  return {
    groupId,
    mode: override ? "local-override" : "group-default",
    officeTimezone: response.group.officeTimezone,
    notificationTitle: response.reminder.notificationTitle,
    ...(response.reminder.notificationGroupLabel
      ? { notificationGroupLabel: response.reminder.notificationGroupLabel }
      : {}),
    groupDefault,
    draft: {
      reminderTime: override?.reminderTime ?? groupDefault.reminderTime,
      weekdayReminderEnabled: override?.weekdayReminderEnabled
        ?? override?.enabled
        ?? groupDefault.weekdayReminderEnabled,
      secondReminderEnabled: override?.secondReminderEnabled
        ?? groupDefault.secondReminderEnabled
    }
  };
}

export function validateReminderDraft(
  draft: ReminderDraft
): { valid: true } | { valid: false; error: string } {
  if (!isStrictReminderTime(draft.reminderTime)) {
    return { valid: false, error: "提醒时间必须使用 HH:mm。" };
  }
  return { valid: true };
}
