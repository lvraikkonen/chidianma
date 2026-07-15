import type { GroupSummary } from "@lunch/shared";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "../src/components/AppShell";
import { GroupEntryPanel } from "../src/components/GroupEntryPanel";
import type { AdminSessionState } from "../src/sessionStore";

function groupSummary(groupId = "group-1"): GroupSummary {
  return {
    groupId,
    name: groupId === "group-1" ? "设计组" : "产品组",
    role: "admin",
    membershipId: `membership-${groupId}`
  };
}

function session(): AdminSessionState {
  return {
    version: 2,
    apiBaseUrl: "https://lunch.example",
    displayName: "小林",
    identityToken: "identity-secret-token",
    activeGroupId: "group-1",
    sessionsByGroupId: {
      "group-1": { token: "group-secret-token" }
    },
    groupSummariesById: {
      "group-1": groupSummary()
    }
  };
}

function shell(groupEntryPanel?: React.ReactNode) {
  return (
    <AppShell
      route="today"
      session={session()}
      groups={[groupSummary(), groupSummary("group-2")]}
      onSwitchGroup={vi.fn()}
      onOpenGroupEntry={vi.fn()}
      onDisconnect={vi.fn()}
      groupEntryPanel={groupEntryPanel}
    >
      <p>页面内容</p>
    </AppShell>
  );
}

describe("authenticated auth markup", () => {
  it("renders four production navigation links plus a non-navigation create/join action", () => {
    const html = renderToStaticMarkup(shell());

    expect(html).toContain("创建/加入小组");
    expect(html.match(/<nav[\s\S]*?<\/nav>/)?.[0].match(/<a /g)).toHaveLength(4);
    expect(html).toContain('href="#today"');
    expect(html).toContain('href="#restaurants"');
    expect(html).toContain('href="#dashboard"');
    expect(html).toContain('href="#settings"');
    expect(html).not.toContain("#history");
    expect(html).not.toContain("#members");
  });

  it("renders the reusable create/join panel with an empty invite default", () => {
    const html = renderToStaticMarkup(shell(
      <GroupEntryPanel
        groups={[groupSummary()]}
        onCreateGroup={vi.fn()}
        onJoinGroup={vi.fn()}
      />
    ));

    expect(html).toContain("创建新小组");
    expect(html).toContain("加入已有小组");
    expect(html).toContain('name="inviteCode"');
    expect(html).not.toContain('name="inviteCode" value="LUNCH-');
  });

  it("surfaces an authenticated one-time invite without rendering tokens", () => {
    const html = renderToStaticMarkup(shell(
      <GroupEntryPanel
        groups={[groupSummary()]}
        inviteCode="LUNCH-ABC123"
        onCreateGroup={vi.fn()}
        onJoinGroup={vi.fn()}
      />
    ));

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("LUNCH-ABC123");
    expect(html).not.toContain("identity-secret-token");
    expect(html).not.toContain("group-secret-token");
  });
});
