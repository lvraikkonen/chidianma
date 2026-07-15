import type {
  GroupSettingsResponse,
  MemberSummary,
  MembersResponse,
  PatchGroupSettingsRequest,
  ScoringWeightsSnapshot
} from "@lunch/shared";

export type SettingsSection = "group" | "reminder" | "weights";

export interface GroupDraft {
  name: string;
  subtitle: string;
  officeTimezone: string;
  officeCity: string;
  officeLatitude: string;
  officeLongitude: string;
}

export interface ReminderDraft {
  reminderTime: string;
  weekdayReminderEnabled: boolean;
  secondReminderEnabled: boolean;
  notificationTitle: string;
  notificationGroupLabel: string;
}

export type WeightsDraft = Record<keyof ScoringWeightsSnapshot, string>;

export interface SettingsEditorState {
  snapshot: GroupSettingsResponse;
  members: MembersResponse;
  drafts: { group: GroupDraft; reminder: ReminderDraft; weights: WeightsDraft };
  dirty: Record<SettingsSection, boolean>;
}

type ValidationResult =
  | { ok: true; value: PatchGroupSettingsRequest }
  | { ok: false; message: string };

export function createSettingsEditor(
  settings: GroupSettingsResponse,
  members: MembersResponse
): SettingsEditorState {
  return {
    snapshot: settings,
    members,
    drafts: draftsFromSettings(settings),
    dirty: { group: false, reminder: false, weights: false }
  };
}

export function setGroupDraft(
  state: SettingsEditorState,
  patch: Partial<GroupDraft>
): SettingsEditorState {
  return {
    ...state,
    drafts: { ...state.drafts, group: { ...state.drafts.group, ...patch } },
    dirty: { ...state.dirty, group: true }
  };
}

export function setReminderDraft(
  state: SettingsEditorState,
  patch: Partial<ReminderDraft>
): SettingsEditorState {
  return {
    ...state,
    drafts: { ...state.drafts, reminder: { ...state.drafts.reminder, ...patch } },
    dirty: { ...state.dirty, reminder: true }
  };
}

export function setWeightDraft(
  state: SettingsEditorState,
  patch: Partial<WeightsDraft>
): SettingsEditorState {
  return {
    ...state,
    drafts: { ...state.drafts, weights: { ...state.drafts.weights, ...patch } },
    dirty: { ...state.dirty, weights: true }
  };
}

export function applySettingsSave(
  state: SettingsEditorState,
  response: GroupSettingsResponse,
  section: SettingsSection
): SettingsEditorState {
  const responseDrafts = draftsFromSettings(response);
  return {
    ...state,
    snapshot: response,
    drafts: { ...state.drafts, [section]: responseDrafts[section] },
    dirty: { ...state.dirty, [section]: false }
  };
}

export function groupPatchFromDraft(draft: GroupDraft): ValidationResult {
  const name = draft.name.trim();
  if (!name) return invalid("小组名称不能为空。");
  const officeCity = draft.officeCity.trim();
  if (!officeCity) return invalid("办公室城市不能为空。");
  const officeTimezone = draft.officeTimezone.trim();
  if (!isTimezone(officeTimezone)) return invalid("请输入有效的 IANA 办公室时区。");
  const officeLatitude = Number(draft.officeLatitude);
  const officeLongitude = Number(draft.officeLongitude);
  if (!Number.isFinite(officeLatitude) || officeLatitude < -90 || officeLatitude > 90) {
    return invalid("纬度必须是 -90 到 90 的有限数字。");
  }
  if (!Number.isFinite(officeLongitude) || officeLongitude < -180 || officeLongitude > 180) {
    return invalid("经度必须是 -180 到 180 的有限数字。");
  }
  return {
    ok: true,
    value: {
      group: {
        name,
        subtitle: draft.subtitle.trim() || null,
        officeTimezone,
        officeCity,
        officeLatitude,
        officeLongitude
      }
    }
  };
}

export function reminderPatchFromDraft(draft: ReminderDraft): ValidationResult {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(draft.reminderTime)) {
    return invalid("提醒时间必须使用 HH:mm 格式。");
  }
  const notificationTitle = draft.notificationTitle.trim();
  if (!notificationTitle) return invalid("通知标题不能为空。");
  return {
    ok: true,
    value: {
      reminder: {
        reminderTime: draft.reminderTime,
        weekdayReminderEnabled: draft.weekdayReminderEnabled,
        secondReminderEnabled: draft.secondReminderEnabled,
        notificationTitle,
        notificationGroupLabel: draft.notificationGroupLabel.trim() || null
      }
    }
  };
}

export function weightsPatchFromDraft(draft: WeightsDraft): ValidationResult {
  const result = {} as ScoringWeightsSnapshot;
  for (const key of Object.keys(draft) as Array<keyof ScoringWeightsSnapshot>) {
    const value = Number(draft[key]);
    if (!/^\d+$/.test(draft[key]) || !Number.isInteger(value) || value < 0 || value > 100) {
      return invalid("评分权重必须是 0–100 的整数。");
    }
    result[key] = value;
  }
  return { ok: true, value: { scoringWeights: result } };
}

export function isOnlyActiveAdmin(members: MemberSummary[], membershipId: string): boolean {
  const target = members.find((member) => member.membershipId === membershipId);
  return target?.role === "admin"
    && target.status === "active"
    && members.filter((member) => member.role === "admin" && member.status === "active").length === 1;
}

export function replaceMember(response: MembersResponse, member: MemberSummary): MembersResponse {
  return {
    ...response,
    members: response.members.map((candidate) =>
      candidate.membershipId === member.membershipId ? member : candidate)
  };
}

function draftsFromSettings(settings: GroupSettingsResponse): SettingsEditorState["drafts"] {
  return {
    group: {
      name: settings.group.name,
      subtitle: settings.group.subtitle ?? "",
      officeTimezone: settings.group.officeTimezone,
      officeCity: settings.group.officeCity,
      officeLatitude: String(settings.group.officeLatitude),
      officeLongitude: String(settings.group.officeLongitude)
    },
    reminder: {
      reminderTime: settings.reminder.reminderTime,
      weekdayReminderEnabled: settings.reminder.weekdayReminderEnabled,
      secondReminderEnabled: settings.reminder.secondReminderEnabled,
      notificationTitle: settings.reminder.notificationTitle,
      notificationGroupLabel: settings.reminder.notificationGroupLabel ?? ""
    },
    weights: Object.fromEntries(
      Object.entries(settings.scoringWeights).map(([key, value]) => [key, String(value)])
    ) as WeightsDraft
  };
}

function isTimezone(value: string): boolean {
  if (!value) return false;
  try {
    new Intl.DateTimeFormat("zh-CN", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function invalid(message: string): ValidationResult {
  return { ok: false, message };
}
