import type { GroupSummary } from "@lunch/shared";
import type { ReactNode } from "react";
import type { AdminRoute } from "../app/router";
import type { AdminSessionState } from "../sessionStore";

export function AppShell(props: {
  route: AdminRoute;
  session: AdminSessionState;
  groups: GroupSummary[];
  pendingGroupId?: string | undefined;
  groupEntryPanel?: ReactNode;
  onSwitchGroup: (groupId: string) => void | Promise<void>;
  onOpenGroupEntry: () => void;
  onDisconnect: () => void;
  children: ReactNode;
}) {
  const activeGroup = props.session.activeGroupId
    ? props.session.groupSummariesById[props.session.activeGroupId]
    : undefined;

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">餐</span>
          <span>
            <strong>中午吃点啥</strong>
            <small>管理后台</small>
          </span>
        </div>

        <nav aria-label="主要导航">
          <a className={props.route === "today" ? "nav-link active" : "nav-link"} href="#today" aria-current={props.route === "today" ? "page" : undefined}>
            今日推荐
          </a>
          <a className={props.route === "restaurants" ? "nav-link active" : "nav-link"} href="#restaurants" aria-current={props.route === "restaurants" ? "page" : undefined}>
            餐厅库
          </a>
        </nav>

        <div className="sidebar-footer">
          <span className="avatar" aria-hidden="true">
            {(props.session.displayName ?? "同").slice(0, 1)}
          </span>
          <span>
            <strong>{props.session.displayName ?? "当前同事"}</strong>
            <small>{activeGroup?.role === "admin" ? "小组管理员" : "小组成员"}</small>
          </span>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <label className="group-switcher">
            <span>当前小组</span>
            <select
              value={props.session.activeGroupId ?? ""}
              disabled={Boolean(props.pendingGroupId)}
              onChange={(event) => {
                if (event.target.value) void props.onSwitchGroup(event.target.value);
              }}
            >
              {props.groups.map((group) => (
                <option key={group.groupId} value={group.groupId}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <div className="topbar-actions">
            <button className="button secondary" type="button" onClick={props.onOpenGroupEntry}>
              创建/加入小组
            </button>
            <button className="button ghost" type="button" onClick={props.onDisconnect}>
              更换身份
            </button>
          </div>
        </header>

        {props.groupEntryPanel}
        <main className="content">{props.children}</main>
      </div>
    </div>
  );
}
