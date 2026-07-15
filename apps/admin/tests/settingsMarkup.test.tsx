import type { GroupSettingsResponse, GroupSummary, MembersResponse } from "@lunch/shared";
import { DEFAULT_GROUP_SCORING_WEIGHTS } from "@lunch/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createSettingsEditor } from "../src/features/settings/settingsModel";
import { SettingsView } from "../src/pages/SettingsPage";

const settings: GroupSettingsResponse = {
  groupId: "group-1",
  group: {
    name: "Dev Team",
    subtitle: "干饭小分队",
    officeTimezone: "Asia/Shanghai",
    officeCity: "Shanghai",
    officeLatitude: 31.23,
    officeLongitude: 121.47
  },
  reminder: {
    reminderTime: "11:30",
    weekdayReminderEnabled: true,
    secondReminderEnabled: false,
    notificationTitle: "吃饭才是正事",
    notificationGroupLabel: "干饭小分队"
  },
  scoringWeights: { ...DEFAULT_GROUP_SCORING_WEIGHTS },
  invite: { version: 2, rotatedAt: "2026-07-14T00:00:00.000Z" }
};

const members: MembersResponse = {
  groupId: "group-1",
  contributionWindow: { startAt: "2026-07-01T00:00:00.000Z", endAt: "2026-08-01T00:00:00.000Z" },
  members: [
    { membershipId: "admin-1", displayName: "小李", role: "admin", status: "active", joinedAt: "2026-06-01T00:00:00.000Z", contribution: { restaurantCount: 1, recommendationCount: 2, feedbackCount: 3, total: 6 } },
    { membershipId: "member-1", displayName: "小王", role: "member", status: "removed", joinedAt: "2026-06-02T00:00:00.000Z", removedAt: "2026-07-13T00:00:00.000Z", contribution: { restaurantCount: 2, recommendationCount: 1, feedbackCount: 0, total: 3 } }
  ]
};

function group(role: "admin" | "member"): GroupSummary {
  return { groupId: "group-1", name: "Dev Team", role, membershipId: role === "admin" ? "admin-1" : "member-1" };
}

function view(role: "admin" | "member", inviteCode?: string) {
  return (
    <SettingsView
      group={group(role)}
      editor={createSettingsEditor(settings, members)}
      settingsError={undefined}
      members={members}
      membersError={undefined}
      pendingSection={undefined}
      sectionErrors={{}}
      pendingMemberId={undefined}
      inviteState={inviteCode ? { kind: "result", groupId: "group-1", inviteCode, version: 3, rotatedAt: "2026-07-14T04:00:00.000Z" } : { kind: "closed" }}
      onGroupDraft={vi.fn()}
      onReminderDraft={vi.fn()}
      onWeightDraft={vi.fn()}
      onSave={vi.fn()}
      onPatchMember={vi.fn()}
      onOpenInvite={vi.fn()}
      onConfirmInvite={vi.fn()}
      onCloseInvite={vi.fn()}
      onCopyInvite={vi.fn()}
      onRetry={vi.fn()}
    />
  );
}

describe("Settings page markup", () => {
  it("renders all settings and contribution breakdowns for an Admin", () => {
    const html = renderToStaticMarkup(view("admin"));
    expect(html).toContain("小组资料");
    expect(html).toContain("提醒默认值");
    expect(html).toContain("评分权重");
    expect(html).toContain("只影响之后生成的新批次");
    expect(html).toContain('type="range"');
    expect(html).toContain('max="100"');
    expect(html).toContain("餐厅 1");
    expect(html).toContain("推荐 2");
    expect(html).toContain("反馈 3");
    expect(html).toContain("恢复成员");
    expect(html).toContain("邀请码版本 2");
    expect(html).not.toContain("LUNCH-");
  });

  it("renders member mode as read-only without mutation actions", () => {
    const html = renderToStaticMarkup(view("member"));
    expect(html).toContain("当前为只读模式");
    expect(html).toContain("disabled");
    expect(html).not.toContain("保存小组资料");
    expect(html).not.toContain("轮换邀请码");
    expect(html).not.toContain("恢复成员");
  });

  it("disables destructive controls for the only active Admin", () => {
    const html = renderToStaticMarkup(view("admin"));
    expect(html).toContain("最后一位有效管理员不能降级或移除");
    expect(html).toContain("降级为成员");
  });

  it("shows a rotated code only in the one-time result dialog and never renders tokens", () => {
    const html = renderToStaticMarkup(view("admin", "LUNCH-ABC123"));
    expect(html).toContain('role="dialog"');
    expect(html).toContain("LUNCH-ABC123");
    expect(html).toContain("仅显示这一次");
    expect(html).not.toContain("group-secret-token");
    expect(html).not.toContain("identity-secret-token");
  });
});
