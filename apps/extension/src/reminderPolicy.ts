import type { GroupSettingsResponse } from "@lunch/shared";
import type { ExtensionStorageShape } from "./storage";

export const STRICT_REMINDER_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export interface EffectiveReminderSettings {
  source: "group-default" | "local-override";
  mode: "group";
  groupId: string;
  officeTimezone: string;
  reminderTime: string;
  weekdayReminderEnabled: boolean;
  secondReminderEnabled: boolean;
  notificationTitle: string;
  notificationGroupLabel?: string | undefined;
}

export function isStrictReminderTime(value: string): boolean {
  return STRICT_REMINDER_TIME.test(value);
}

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function validateGroupSettingsForReminder(
  groupId: string,
  response: GroupSettingsResponse
): void {
  if (response.groupId !== groupId) throw new Error("group_settings_mismatch");
  if (!isStrictReminderTime(response.reminder.reminderTime)) {
    throw new Error("invalid_reminder_time");
  }
  if (!isValidTimeZone(response.group.officeTimezone)) {
    throw new Error("invalid_office_timezone");
  }
  if (response.reminder.notificationTitle.trim().length === 0) {
    throw new Error("invalid_notification_title");
  }
  if (
    typeof response.reminder.weekdayReminderEnabled !== "boolean"
    || typeof response.reminder.secondReminderEnabled !== "boolean"
  ) {
    throw new Error("invalid_reminder_switch");
  }
}

export function resolveEffectiveReminderSettings(
  state: ExtensionStorageShape
): EffectiveReminderSettings | null {
  const groupId = state.activeGroupId;
  if (!groupId) return null;

  const cached = state.groupSettingsCacheByGroupId[groupId];
  if (!cached) return null;
  if (!Number.isFinite(Date.parse(cached.cachedAt))) return null;
  try {
    validateGroupSettingsForReminder(groupId, cached.response);
  } catch {
    return null;
  }

  const group = cached.response;
  const override = state.localReminderOverridesByGroupId[groupId];
  const reminderTime = override?.reminderTime ?? group.reminder.reminderTime;
  if (!isStrictReminderTime(reminderTime)) return null;
  return {
    source: override ? "local-override" : "group-default",
    mode: "group",
    groupId,
    officeTimezone: group.group.officeTimezone,
    reminderTime,
    weekdayReminderEnabled:
      override?.weekdayReminderEnabled
      ?? override?.enabled
      ?? group.reminder.weekdayReminderEnabled,
    secondReminderEnabled:
      override?.secondReminderEnabled
      ?? group.reminder.secondReminderEnabled,
    notificationTitle: group.reminder.notificationTitle,
    ...(group.reminder.notificationGroupLabel
      ? { notificationGroupLabel: group.reminder.notificationGroupLabel }
      : {})
  };
}

export function getReminderFingerprint(state: ExtensionStorageShape): string {
  const effective = resolveEffectiveReminderSettings(state);
  return JSON.stringify(effective ?? null);
}
