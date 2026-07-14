import type { CreateGroupRequest } from "@lunch/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createGroup,
  createIdentity,
  joinGroup,
  listGroups,
  refreshGroupSession
} from "../clients/groups";
import { AppShell } from "../components/AppShell";
import { GroupEntryPanel } from "../components/GroupEntryPanel";
import { StatusPanel } from "../components/StatusPanel";
import {
  createAuthController,
  type AuthViewState
} from "../features/auth/authModel";
import { LoginPage } from "../pages/LoginPage";
import {
  clearGroupSession,
  disconnectAdmin,
  readAdminSession,
  saveGroupSession,
  saveIdentity,
  syncGroups
} from "../sessionStore";
import { createRequestGate } from "./requestGate";
import {
  navigate,
  parseAdminRoute,
  subscribeRoute,
  type AdminRoute
} from "./router";

export function App() {
  const [authState, setAuthState] = useState<AuthViewState>({ kind: "loading" });
  const [route, setRoute] = useState<AdminRoute>(() => (
    parseAdminRoute(window.location.hash)
  ));
  const [groupEntryOpen, setGroupEntryOpen] = useState(false);
  const requestGate = useRef(createRequestGate());
  const authController = useMemo(() => createAuthController({
    readSession: readAdminSession,
    saveIdentity,
    saveGroupSession,
    syncGroups,
    clearGroupSession,
    disconnectAdmin,
    createIdentity,
    createGroup,
    joinGroup,
    listGroups,
    refreshGroupSession,
    onState: setAuthState
  }), []);

  useEffect(() => {
    const unsubscribe = subscribeRoute(setRoute);
    void authController.load();
    return unsubscribe;
  }, [authController]);

  useEffect(() => {
    if (authState.kind === "authenticated" && route === "login") {
      navigate("today");
    }
    if ((authState.kind === "identity-entry" || authState.kind === "group-entry")
      && route !== "login") {
      navigate("login");
    }
  }, [authState.kind, route]);

  async function runActiveGroupMutation(operation: () => Promise<void>) {
    const before = readAdminSession().activeGroupId;
    await operation();
    const after = readAdminSession().activeGroupId;
    if (after && after !== before) requestGate.current.invalidate();
  }

  async function handleCreateGroup(input: CreateGroupRequest) {
    await runActiveGroupMutation(() => authController.createGroup(input));
  }

  async function handleJoinGroup(inviteCode: string) {
    await runActiveGroupMutation(() => authController.joinGroup(inviteCode));
  }

  async function handleSwitchGroup(groupId: string) {
    await runActiveGroupMutation(() => authController.switchGroup(groupId));
  }

  function handleDisconnect() {
    requestGate.current.invalidate();
    setGroupEntryOpen(false);
    authController.disconnect();
    navigate("login");
  }

  const switchingHasUsableActiveGroup = authState.kind === "switching"
    && Boolean(
      authState.session.activeGroupId
      && authState.session.sessionsByGroupId[authState.session.activeGroupId]
      && authState.session.groupSummariesById[authState.session.activeGroupId]
    );
  const shellState = authState.kind === "authenticated"
    || (authState.kind === "switching" && switchingHasUsableActiveGroup)
    ? authState
    : null;

  if (!shellState) {
    return (
      <LoginPage
        state={authState}
        onCreateIdentity={authController.createIdentity}
        onCreateGroup={handleCreateGroup}
        onJoinGroup={handleJoinGroup}
        onSwitchGroup={handleSwitchGroup}
        onDisconnect={handleDisconnect}
      />
    );
  }

  const inviteCode = shellState.kind === "authenticated"
    ? shellState.inviteCode
    : undefined;
  const error = shellState.kind === "authenticated"
    ? shellState.error
    : undefined;

  return (
    <AppShell
      route={route === "login" ? "today" : route}
      session={shellState.session}
      groups={shellState.groups}
      pendingGroupId={shellState.kind === "switching" ? shellState.pendingGroupId : undefined}
      onSwitchGroup={handleSwitchGroup}
      onOpenGroupEntry={() => setGroupEntryOpen((open) => !open)}
      onDisconnect={handleDisconnect}
      groupEntryPanel={groupEntryOpen ? (
        <div className="shell-entry-wrap">
          <div className="shell-entry-heading">
            <div>
              <span className="eyebrow">保留当前身份和小组</span>
              <h2>创建或加入另一个小组</h2>
            </div>
            <button className="button ghost" type="button" onClick={() => setGroupEntryOpen(false)}>
              关闭
            </button>
          </div>
          <GroupEntryPanel
            groups={shellState.groups}
            inviteCode={inviteCode}
            error={error}
            onCreateGroup={handleCreateGroup}
            onJoinGroup={handleJoinGroup}
          />
        </div>
      ) : inviteCode ? (
        <div className="shell-invite-banner" aria-live="polite">
          <span>小组已创建，请立即保存一次性邀请码</span>
          <code>{inviteCode}</code>
        </div>
      ) : undefined}
    >
      {route === "restaurants" ? (
        <StatusPanel
          title="餐厅库"
          message="小组连接已就绪；餐厅数据页面将在 Stage4B Task 6～7 接入。"
        />
      ) : (
        <StatusPanel
          title="今日推荐"
          message="小组连接已就绪；今日推荐页面将在 Stage4B Task 4～5 接入。"
        />
      )}
    </AppShell>
  );
}
