import type { GroupSettingsResponse, MembersResponse } from "@lunch/shared";
import { DEFAULT_GROUP_SCORING_WEIGHTS } from "@lunch/shared";
import { describe, expect, it } from "vitest";
import {
  applySettingsSave,
  createSettingsEditor,
  groupPatchFromDraft,
  isOnlyActiveAdmin,
  replaceMember,
  setGroupDraft,
  setWeightDraft,
  weightsPatchFromDraft
} from "../src/features/settings/settingsModel";

const settings: GroupSettingsResponse = {
  groupId: "group-1",
  group: {
    name: "Dev Team",
    officeTimezone: "Asia/Shanghai",
    officeCity: "Shanghai",
    officeLatitude: 31.23,
    officeLongitude: 121.47
  },
  reminder: {
    reminderTime: "11:30",
    weekdayReminderEnabled: true,
    secondReminderEnabled: false,
    notificationTitle: "吃饭了",
    notificationGroupLabel: "Dev Team"
  },
  scoringWeights: { ...DEFAULT_GROUP_SCORING_WEIGHTS },
  invite: { version: 1, rotatedAt: "2026-07-14T00:00:00.000Z" }
};

const members: MembersResponse = {
  groupId: "group-1",
  contributionWindow: { startAt: "2026-07-01T00:00:00.000Z", endAt: "2026-08-01T00:00:00.000Z" },
  members: [
    { membershipId: "admin-1", displayName: "Admin", role: "admin", status: "active", joinedAt: "2026-06-01T00:00:00.000Z", contribution: { restaurantCount: 1, recommendationCount: 2, feedbackCount: 3, total: 6 } },
    { membershipId: "member-1", displayName: "Member", role: "member", status: "active", joinedAt: "2026-06-02T00:00:00.000Z", contribution: { restaurantCount: 0, recommendationCount: 0, feedbackCount: 0, total: 0 } }
  ]
};

describe("settings model", () => {
  it("keeps unrelated dirty drafts after a section save", () => {
    let editor = createSettingsEditor(settings, members);
    editor = setGroupDraft(editor, { name: "New Team" });
    editor = setWeightDraft(editor, { weatherMatch: "40" });
    const response = { ...settings, group: { ...settings.group, name: "New Team" } };
    editor = applySettingsSave(editor, response, "group");

    expect(editor.dirty).toEqual({ group: false, reminder: false, weights: true });
    expect(editor.drafts.weights.weatherMatch).toBe("40");
    expect(editor.snapshot.group.name).toBe("New Team");
  });

  it("mirrors group and weight validation before requests", () => {
    const editor = createSettingsEditor(settings, members);
    expect(groupPatchFromDraft({ ...editor.drafts.group, name: "   " })).toEqual({
      ok: false,
      message: "小组名称不能为空。"
    });
    expect(groupPatchFromDraft({ ...editor.drafts.group, officeTimezone: "Mars/Olympus" })).toEqual({
      ok: false,
      message: "请输入有效的 IANA 办公室时区。"
    });
    expect(weightsPatchFromDraft({ ...editor.drafts.weights, weatherMatch: "100.5" })).toEqual({
      ok: false,
      message: "评分权重必须是 0–100 的整数。"
    });
  });

  it("detects the last active admin and replaces one member without reordering", () => {
    expect(isOnlyActiveAdmin(members.members, "admin-1")).toBe(true);
    const updated = replaceMember(members, { ...members.members[1]!, status: "removed", removedAt: "2026-07-14T00:00:00.000Z" });
    expect(updated.members.map((member) => [member.membershipId, member.status])).toEqual([
      ["admin-1", "active"],
      ["member-1", "removed"]
    ]);
  });
});
