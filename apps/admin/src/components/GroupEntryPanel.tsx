import type { CreateGroupRequest, GroupSummary } from "@lunch/shared";
import { useState, type FormEvent } from "react";

export function GroupEntryPanel(props: {
  groups: GroupSummary[];
  inviteCode?: string | undefined;
  error?: string | undefined;
  onCreateGroup: (input: CreateGroupRequest) => void | Promise<void>;
  onJoinGroup: (inviteCode: string) => void | Promise<void>;
}) {
  const [groupName, setGroupName] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [pendingAction, setPendingAction] = useState<"create" | "join" | null>(null);

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!groupName.trim() || pendingAction) return;
    setPendingAction("create");
    try {
      await props.onCreateGroup({
        groupName: groupName.trim(),
        ...(subtitle.trim() ? { subtitle: subtitle.trim() } : {})
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function submitJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inviteCode.trim() || pendingAction) return;
    setPendingAction("join");
    try {
      await props.onJoinGroup(inviteCode.trim());
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <section className="group-entry-panel" aria-label="创建或加入小组">
      {props.inviteCode && (
        <div className="invite-result" aria-live="polite">
          <strong>小组已创建，请立即保存一次性邀请码</strong>
          <code>{props.inviteCode}</code>
        </div>
      )}

      {props.error && (
        <p className="inline-error" aria-live="polite">{props.error}</p>
      )}

      <div className="entry-grid">
        <form className="entry-form" onSubmit={submitCreate}>
          <div>
            <h2>创建新小组</h2>
            <p>建立自己的午饭推荐空间。</p>
          </div>
          <label>
            小组名称
            <input
              name="groupName"
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              placeholder="例如：设计组"
              required
            />
          </label>
          <label>
            小组说明（可选）
            <input
              name="subtitle"
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              placeholder="例如：每天 12:00 出发"
            />
          </label>
          <button className="button primary" type="submit" disabled={pendingAction !== null}>
            {pendingAction === "create" ? "正在创建…" : "创建小组"}
          </button>
        </form>

        <form className="entry-form" onSubmit={submitJoin}>
          <div>
            <h2>加入已有小组</h2>
            <p>向同事获取小组的一次性邀请码。</p>
          </div>
          <label>
            邀请码
            <input
              name="inviteCode"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder="LUNCH-XXXXXX"
              autoComplete="off"
              required
            />
          </label>
          <button className="button secondary" type="submit" disabled={pendingAction !== null}>
            {pendingAction === "join" ? "正在加入…" : "加入小组"}
          </button>
        </form>
      </div>

      {props.groups.length > 0 && (
        <p className="entry-membership-note">
          当前身份已加入 {props.groups.length} 个小组；创建或加入成功后才会切换当前小组。
        </p>
      )}
    </section>
  );
}
