import type { CreateGroupRequest } from "@lunch/shared";
import { useState, type FormEvent } from "react";
import type { AuthViewState } from "../features/auth/authModel";
import { BrandLockup } from "../components/BrandLockup";
import { GroupEntryPanel } from "../components/GroupEntryPanel";
import { StatusPanel } from "../components/StatusPanel";

export function LoginPage(props: {
  state: AuthViewState;
  onCreateIdentity: (displayName: string) => void | Promise<void>;
  onRedeemIdentity: (linkCode: string) => void | Promise<void>;
  onGenerateIdentityLinkCode: () => void | Promise<void>;
  onResetAllConnections: () => void | Promise<void>;
  onCreateGroup: (input: CreateGroupRequest) => void | Promise<void>;
  onJoinGroup: (inviteCode: string) => void | Promise<void>;
  onSwitchGroup: (groupId: string) => void | Promise<void>;
  onDisconnect: () => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [linkCode, setLinkCode] = useState("");
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

  async function submitIdentityLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!linkCode.trim() || pending) return;
    setPending(true);
    try {
      await props.onRedeemIdentity(linkCode.trim());
    } finally {
      setPending(false);
    }
  }

  if (props.state.kind === "loading") {
    return (
      <div className="login-page">
        <div className="login-card">
          <div className="login-brand">
            <BrandLockup subtitle="管理端" />
          </div>
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
            <BrandLockup subtitle="管理端" />
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
          <form className="identity-form" onSubmit={submitIdentityLink}>
            <label>
              身份连接码
              <input
                value={linkCode}
                onChange={(event) => setLinkCode(event.target.value)}
                placeholder="LINK-XXXX-XXXX-XXXX"
                autoComplete="one-time-code"
                required
              />
            </label>
            <button className="button secondary" type="submit" disabled={pending}>
              连接已有身份
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
  const identityLinkCode = props.state.kind === "group-entry" || props.state.kind === "authenticated"
    ? props.state.identityLinkCode
    : undefined;

  return (
    <div className="login-page group-entry-page">
      <div className="group-entry-card">
        <div className="login-brand">
          <BrandLockup subtitle="管理端" />
        </div>
        <div className="group-entry-heading">
          <div>
            <span className="eyebrow">你好，{session.displayName}</span>
            <small>身份参考号：{session.identityId ?? "续期后显示"}</small>
            <h1>选择、创建或加入一个小组</h1>
          </div>
          <div>
            <button className="button ghost" type="button" onClick={() => { void props.onGenerateIdentityLinkCode(); }}>
              生成身份连接码
            </button>
            <button className="button ghost" type="button" onClick={() => {
              if (window.confirm("这会让其他设备上的现有连接立即失效，继续吗？")) {
                void props.onResetAllConnections();
              }
            }}>
              重置所有连接
            </button>
            <button className="button ghost" type="button" onClick={props.onDisconnect}>
              断开此设备
            </button>
          </div>
        </div>
        {identityLinkCode && (
          <p className="invite-result" aria-live="polite">
            身份连接码：<code>{identityLinkCode.linkCode}</code>（10 分钟内单次有效）
          </p>
        )}

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
