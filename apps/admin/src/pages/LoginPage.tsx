import type { CreateGroupRequest } from "@lunch/shared";
import { useState, type FormEvent } from "react";
import type { AuthViewState } from "../features/auth/authModel";
import { GroupEntryPanel } from "../components/GroupEntryPanel";
import { StatusPanel } from "../components/StatusPanel";

export function LoginPage(props: {
  state: AuthViewState;
  onCreateIdentity: (displayName: string) => void | Promise<void>;
  onCreateGroup: (input: CreateGroupRequest) => void | Promise<void>;
  onJoinGroup: (inviteCode: string) => void | Promise<void>;
  onSwitchGroup: (groupId: string) => void | Promise<void>;
  onDisconnect: () => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [pending, setPending] = useState(false);

  async function submitIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!displayName.trim() || pending) return;
    setPending(true);
    try {
      await props.onCreateIdentity(displayName.trim());
    } finally {
      setPending(false);
    }
  }

  if (props.state.kind === "loading") {
    return (
      <div className="login-page">
        <div className="login-card">
          <StatusPanel title="正在连接" message="正在读取你的身份和小组…" />
        </div>
      </div>
    );
  }

  if (props.state.kind === "identity-entry") {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-brand">
            <span className="brand-mark" aria-hidden="true">餐</span>
            <div>
              <strong>中午吃点啥</strong>
              <small>团队午饭知识库</small>
            </div>
          </div>
          <h1>先告诉我们怎么称呼你</h1>
          <p className="lead">这里没有正式账号；名字只用于保留团队推荐来源。</p>
          <form className="identity-form" onSubmit={submitIdentity}>
            <label>
              你的名字
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="例如：小林"
                autoComplete="name"
                required
              />
            </label>
            <button className="button primary" type="submit" disabled={pending}>
              {pending ? "正在建立身份…" : "继续"}
            </button>
          </form>
          {props.state.error && <p className="inline-error" aria-live="polite">{props.state.error}</p>}
        </div>
      </div>
    );
  }

  const { session, groups } = props.state;
  const pendingGroupId = props.state.kind === "switching"
    ? props.state.pendingGroupId
    : undefined;
  const inviteCode = props.state.kind === "group-entry" || props.state.kind === "authenticated"
    ? props.state.inviteCode
    : undefined;
  const error = props.state.kind === "group-entry" || props.state.kind === "authenticated"
    ? props.state.error
    : undefined;

  return (
    <div className="login-page group-entry-page">
      <div className="group-entry-card">
        <div className="group-entry-heading">
          <div>
            <span className="eyebrow">你好，{session.displayName}</span>
            <h1>选择、创建或加入一个小组</h1>
          </div>
          <button className="button ghost" type="button" onClick={props.onDisconnect}>
            更换身份
          </button>
        </div>

        {groups.length > 0 && (
          <section className="membership-list" aria-label="已加入的小组">
            <h2>已加入的小组</h2>
            <div>
              {groups.map((group) => (
                <button
                  className="membership-button"
                  type="button"
                  key={group.groupId}
                  disabled={Boolean(pendingGroupId)}
                  onClick={() => { void props.onSwitchGroup(group.groupId); }}
                >
                  <span>
                    <strong>{group.name}</strong>
                    <small>{group.subtitle ?? (group.role === "admin" ? "管理员" : "成员")}</small>
                  </span>
                  <span>{pendingGroupId === group.groupId ? "正在进入…" : "进入"}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <GroupEntryPanel
          groups={groups}
          inviteCode={inviteCode}
          error={error}
          onCreateGroup={props.onCreateGroup}
          onJoinGroup={props.onJoinGroup}
        />
      </div>
    </div>
  );
}
