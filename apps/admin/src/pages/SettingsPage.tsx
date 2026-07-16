import type {
  GroupSettingsResponse,
  GroupSummary,
  MemberSummary,
  MembersResponse,
  PatchMemberRequest,
  RotateInviteCodeResponse,
  ScoringWeightsSnapshot
} from "@lunch/shared";
import { useEffect, useRef, useState } from "react";
import { AdminApiError } from "../api";
import { createRequestGate } from "../app/requestGate";
import {
  getMembers,
  getSettings,
  patchMember,
  patchSettings,
  rotateInviteCode
} from "../clients/operations";
import type { AdminGroupContext } from "../clients/today";
import { Modal } from "../components/Modal";
import { StatusPanel } from "../components/StatusPanel";
import { isMembershipInvalid } from "../features/auth/authModel";
import {
  applySettingsSave,
  createSettingsEditor,
  groupPatchFromDraft,
  isOnlyActiveAdmin,
  reminderPatchFromDraft,
  replaceMember,
  setGroupDraft,
  setReminderDraft,
  setWeightDraft,
  weightsPatchFromDraft,
  type GroupDraft,
  type ReminderDraft,
  type SettingsEditorState,
  type SettingsSection,
  type WeightsDraft
} from "../features/settings/settingsModel";

export type InviteViewState =
  | { kind: "closed" }
  | { kind: "confirm"; pending?: boolean | undefined; error?: string | undefined }
  | ({ kind: "result"; copyMessage?: string | undefined } & RotateInviteCodeResponse);

export function SettingsPage(props: {
  context: AdminGroupContext;
  group: GroupSummary;
  onMembershipInvalid: (error: unknown) => void | Promise<void>;
  onAuthSync: () => void | Promise<void>;
}) {
  const [editor, setEditor] = useState<SettingsEditorState>();
  const [members, setMembers] = useState<MembersResponse>();
  const [settingsError, setSettingsError] = useState<string>();
  const [membersError, setMembersError] = useState<string>();
  const [pendingSection, setPendingSection] = useState<SettingsSection>();
  const [sectionErrors, setSectionErrors] = useState<Partial<Record<SettingsSection, string>>>({});
  const [pendingMemberId, setPendingMemberId] = useState<string>();
  const [memberError, setMemberError] = useState<string>();
  const [inviteState, setInviteState] = useState<InviteViewState>({ kind: "closed" });
  const [reload, setReload] = useState(0);
  const gate = useRef(createRequestGate());

  useEffect(() => {
    const context = { ...props.context };
    const request = gate.current.begin();
    setEditor(undefined);
    setMembers(undefined);
    setSettingsError(undefined);
    setMembersError(undefined);
    setSectionErrors({});
    setMemberError(undefined);
    setInviteState({ kind: "closed" });
    void Promise.allSettled([getSettings(context), getMembers(context)]).then(async ([settingsResult, membersResult]) => {
      if (!gate.current.isCurrent(request)) return;
      for (const result of [settingsResult, membersResult]) {
        if (result.status === "rejected" && isMembershipInvalid(result.reason)) {
          await props.onMembershipInvalid(result.reason);
          return;
        }
      }
      const loadedMembers = membersResult.status === "fulfilled"
        ? membersResult.value
        : emptyMembers(context.groupId);
      if (membersResult.status === "fulfilled") setMembers(membersResult.value);
      else setMembersError("暂时无法加载成员列表，请重试。");
      if (settingsResult.status === "fulfilled") {
        setEditor(createSettingsEditor(settingsResult.value, loadedMembers));
      } else {
        setSettingsError("暂时无法加载小组设置，请重试。");
      }
    });
    return () => gate.current.invalidate();
  }, [props.context.groupId, props.context.token, reload]);

  async function handleSave(section: SettingsSection) {
    if (!editor || props.group.role !== "admin" || pendingSection) return;
    const validation = section === "group"
      ? groupPatchFromDraft(editor.drafts.group)
      : section === "reminder"
        ? reminderPatchFromDraft(editor.drafts.reminder)
        : weightsPatchFromDraft(editor.drafts.weights);
    if (!validation.ok) {
      setSectionErrors((current) => ({ ...current, [section]: validation.message }));
      return;
    }
    const context = { ...props.context };
    const request = gate.current.begin();
    setPendingSection(section);
    setSectionErrors((current) => ({ ...current, [section]: undefined }));
    try {
      const response = await patchSettings(context, validation.value);
      if (!gate.current.isCurrent(request)) return;
      setEditor((current) => current ? applySettingsSave(current, response, section) : current);
      if (section === "group") await props.onAuthSync();
    } catch (error) {
      if (!gate.current.isCurrent(request)) return;
      await handleOperationError(error, (message) => {
        setSectionErrors((current) => ({ ...current, [section]: message }));
      });
    } finally {
      if (gate.current.isCurrent(request)) setPendingSection(undefined);
    }
  }

  async function handlePatchMember(member: MemberSummary, patch: PatchMemberRequest) {
    if (props.group.role !== "admin" || pendingMemberId) return;
    if (isOnlyActiveAdmin(members?.members ?? [], member.membershipId)
      && (patch.role === "member" || patch.status === "removed")) return;
    if ((patch.role === "member" || patch.status === "removed")
      && !window.confirm(patch.status === "removed"
        ? `确认移除成员「${member.displayName}」？其历史贡献会保留。`
        : `确认将「${member.displayName}」降级为普通成员？`)) return;

    const context = { ...props.context };
    const request = gate.current.begin();
    setPendingMemberId(member.membershipId);
    setMemberError(undefined);
    try {
      const response = await patchMember(context, member.membershipId, patch);
      if (!gate.current.isCurrent(request)) return;
      setMembers((current) => current ? replaceMember(current, response.member) : current);
      setEditor((current) => current ? { ...current, members: replaceMember(current.members, response.member) } : current);
      if (member.membershipId === props.group.membershipId) await props.onAuthSync();
    } catch (error) {
      if (!gate.current.isCurrent(request)) return;
      await handleOperationError(error, setMemberError);
    } finally {
      if (gate.current.isCurrent(request)) setPendingMemberId(undefined);
    }
  }

  async function handleConfirmInvite() {
    if (props.group.role !== "admin" || inviteState.kind !== "confirm" || inviteState.pending) return;
    const context = { ...props.context };
    const request = gate.current.begin();
    setInviteState({ kind: "confirm", pending: true });
    try {
      const response = await rotateInviteCode(context);
      if (!gate.current.isCurrent(request)) return;
      setInviteState({ kind: "result", ...response });
      setEditor((current) => current ? {
        ...current,
        snapshot: {
          ...current.snapshot,
          invite: { version: response.version, rotatedAt: response.rotatedAt }
        }
      } : current);
    } catch (error) {
      if (!gate.current.isCurrent(request)) return;
      if (isMembershipInvalid(error)) {
        await props.onMembershipInvalid(error);
      } else if (isAdminRoleError(error)) {
        setInviteState({ kind: "closed" });
        await props.onAuthSync();
      } else {
        setInviteState({ kind: "confirm", error: operationMessage(error) });
      }
    }
  }

  async function handleCopyInvite() {
    if (inviteState.kind !== "result") return;
    try {
      await navigator.clipboard.writeText(inviteState.inviteCode);
      setInviteState({ ...inviteState, copyMessage: "邀请码已复制。" });
    } catch {
      setInviteState({ ...inviteState, copyMessage: "复制失败，请手动选中邀请码。" });
    }
  }

  async function handleOperationError(error: unknown, show: (message: string) => void) {
    if (isMembershipInvalid(error)) {
      await props.onMembershipInvalid(error);
      return;
    }
    if (isAdminRoleError(error)) {
      show("当前账号已不是小组管理员，页面将切换为只读。");
      await props.onAuthSync();
      return;
    }
    show(operationMessage(error));
  }

  return (
    <SettingsView
      group={props.group}
      editor={editor}
      settingsError={settingsError}
      members={members}
      membersError={membersError ?? memberError}
      pendingSection={pendingSection}
      sectionErrors={sectionErrors}
      pendingMemberId={pendingMemberId}
      inviteState={inviteState}
      onGroupDraft={(patch) => setEditor((current) => current ? setGroupDraft(current, patch) : current)}
      onReminderDraft={(patch) => setEditor((current) => current ? setReminderDraft(current, patch) : current)}
      onWeightDraft={(patch) => setEditor((current) => current ? setWeightDraft(current, patch) : current)}
      onSave={handleSave}
      onPatchMember={handlePatchMember}
      onOpenInvite={() => setInviteState({ kind: "confirm" })}
      onConfirmInvite={handleConfirmInvite}
      onCloseInvite={() => setInviteState({ kind: "closed" })}
      onCopyInvite={handleCopyInvite}
      onRetry={() => setReload((value) => value + 1)}
    />
  );
}

export function SettingsView(props: {
  group: GroupSummary;
  editor?: SettingsEditorState | undefined;
  settingsError?: string | undefined;
  members?: MembersResponse | undefined;
  membersError?: string | undefined;
  pendingSection?: SettingsSection | undefined;
  sectionErrors: Partial<Record<SettingsSection, string>>;
  pendingMemberId?: string | undefined;
  inviteState: InviteViewState;
  onGroupDraft: (patch: Partial<GroupDraft>) => void;
  onReminderDraft: (patch: Partial<ReminderDraft>) => void;
  onWeightDraft: (patch: Partial<WeightsDraft>) => void;
  onSave: (section: SettingsSection) => void;
  onPatchMember: (member: MemberSummary, patch: PatchMemberRequest) => void;
  onOpenInvite: () => void;
  onConfirmInvite: () => void;
  onCloseInvite: () => void;
  onCopyInvite: () => void;
  onRetry: () => void;
}) {
  const readOnly = props.group.role !== "admin";
  return (
    <section className="settings-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">团队配置</span>
          <h1>成员与设置</h1>
          <p className="lead">管理小组资料、提醒默认值、推荐权重和成员状态。</p>
        </div>
        {readOnly ? <span className="read-only-banner">当前为只读模式</span> : null}
      </header>

      {props.settingsError ? (
        <StatusPanel title="小组设置加载失败" message={props.settingsError} tone="error" action={<button className="button secondary" type="button" onClick={props.onRetry}>重试</button>} />
      ) : !props.editor ? (
        <StatusPanel title="小组设置" message="正在读取小组资料和提醒设置…" />
      ) : (
        <>
          <div className="settings-grid">
            <GroupSettingsForm {...props} editor={props.editor} readOnly={readOnly} />
            <ReminderSettingsForm {...props} editor={props.editor} readOnly={readOnly} />
          </div>
          <WeightsSettingsForm {...props} editor={props.editor} readOnly={readOnly} />
          <InvitePanel
            snapshot={props.editor.snapshot}
            readOnly={readOnly}
            onOpenInvite={props.onOpenInvite}
          />
        </>
      )}

      <MembersPanel
        group={props.group}
        members={props.members}
        error={props.membersError}
        pendingMemberId={props.pendingMemberId}
        onPatchMember={props.onPatchMember}
        onRetry={props.onRetry}
      />

      <InviteModal state={props.inviteState} onConfirm={props.onConfirmInvite} onClose={props.onCloseInvite} onCopy={props.onCopyInvite} />
    </section>
  );
}

function GroupSettingsForm(props: SettingsFormProps) {
  const draft = props.editor.drafts.group;
  return (
    <form className="panel settings-form" onSubmit={(event) => { event.preventDefault(); props.onSave("group"); }}>
      <div className="section-heading"><div><span className="eyebrow">显示与办公室</span><h2>小组资料</h2></div></div>
      <div className="form-grid two-columns">
        <Field label="小组名称"><input disabled={props.readOnly} value={draft.name} onChange={(event) => props.onGroupDraft({ name: event.target.value })} /></Field>
        <Field label="副标题（可选）"><input disabled={props.readOnly} value={draft.subtitle} onChange={(event) => props.onGroupDraft({ subtitle: event.target.value })} /></Field>
        <Field label="办公室城市"><input disabled={props.readOnly} value={draft.officeCity} onChange={(event) => props.onGroupDraft({ officeCity: event.target.value })} /></Field>
        <Field label="IANA 时区"><input disabled={props.readOnly} value={draft.officeTimezone} placeholder="Asia/Shanghai" onChange={(event) => props.onGroupDraft({ officeTimezone: event.target.value })} /></Field>
        <Field label="纬度"><input disabled={props.readOnly} inputMode="decimal" value={draft.officeLatitude} onChange={(event) => props.onGroupDraft({ officeLatitude: event.target.value })} /></Field>
        <Field label="经度"><input disabled={props.readOnly} inputMode="decimal" value={draft.officeLongitude} onChange={(event) => props.onGroupDraft({ officeLongitude: event.target.value })} /></Field>
      </div>
      <SectionFooter section="group" label="保存小组资料" {...props} />
    </form>
  );
}

function ReminderSettingsForm(props: SettingsFormProps) {
  const draft = props.editor.drafts.reminder;
  return (
    <form className="panel settings-form" onSubmit={(event) => { event.preventDefault(); props.onSave("reminder"); }}>
      <div className="section-heading"><div><span className="eyebrow">Chrome 扩展默认值</span><h2>提醒默认值</h2></div></div>
      <p className="settings-note">这是小组默认值；成员的本机自定义提醒仍然优先。二次提醒会在无人决定时按小组设置运行。</p>
      <div className="form-grid">
        <Field label="提醒时间"><input disabled={props.readOnly} type="time" value={draft.reminderTime} onChange={(event) => props.onReminderDraft({ reminderTime: event.target.value })} /></Field>
        <Toggle label="工作日提醒" checked={draft.weekdayReminderEnabled} disabled={props.readOnly} onChange={(checked) => props.onReminderDraft({ weekdayReminderEnabled: checked })} />
        <Toggle label="没人决定时二次提醒" checked={draft.secondReminderEnabled} disabled={props.readOnly} onChange={(checked) => props.onReminderDraft({ secondReminderEnabled: checked })} />
        <Field label="通知标题"><input disabled={props.readOnly} value={draft.notificationTitle} onChange={(event) => props.onReminderDraft({ notificationTitle: event.target.value })} /></Field>
        <Field label="小组称呼（留空则不显示）"><input disabled={props.readOnly} value={draft.notificationGroupLabel} onChange={(event) => props.onReminderDraft({ notificationGroupLabel: event.target.value })} /></Field>
      </div>
      <SectionFooter section="reminder" label="保存提醒默认值" {...props} />
    </form>
  );
}

function WeightsSettingsForm(props: SettingsFormProps) {
  return (
    <form className="panel settings-form weights-form" onSubmit={(event) => { event.preventDefault(); props.onSave("weights"); }}>
      <div className="section-heading"><div><span className="eyebrow">可解释评分</span><h2>评分权重</h2></div></div>
      <p className="settings-note">只影响之后生成的新批次，历史批次保存的权重和分数不会改变。惩罚项填写正数，计算时扣减。</p>
      <div className="weights-grid">
        {(Object.keys(weightMeta) as Array<keyof ScoringWeightsSnapshot>).map((key) => {
          const value = props.editor.drafts.weights[key];
          return (
            <label className="weight-control" key={key}>
              <span><strong>{weightMeta[key].label}</strong><small>{weightMeta[key].description}</small></span>
              <input disabled={props.readOnly} type="range" min="0" max="100" step="1" value={rangeValue(value)} onChange={(event) => props.onWeightDraft({ [key]: event.target.value })} />
              <input disabled={props.readOnly} className="weight-number" type="number" min="0" max="100" step="1" value={value} onChange={(event) => props.onWeightDraft({ [key]: event.target.value })} />
            </label>
          );
        })}
      </div>
      <SectionFooter section="weights" label="保存评分权重" {...props} />
    </form>
  );
}

function InvitePanel(props: { snapshot: GroupSettingsResponse; readOnly: boolean; onOpenInvite: () => void }) {
  return (
    <section className="panel invite-panel">
      <div><span className="eyebrow">一次性明文</span><h2>团队邀请码</h2><p>邀请码版本 {props.snapshot.invite.version} · 上次轮换 {formatDate(props.snapshot.invite.rotatedAt)}</p></div>
      {props.readOnly ? <span className="muted-note">只有管理员可以生成新邀请码。</span> : (
        <button className="button danger" type="button" onClick={props.onOpenInvite}>轮换邀请码</button>
      )}
    </section>
  );
}

function MembersPanel(props: {
  group: GroupSummary;
  members?: MembersResponse | undefined;
  error?: string | undefined;
  pendingMemberId?: string | undefined;
  onPatchMember: (member: MemberSummary, patch: PatchMemberRequest) => void;
  onRetry: () => void;
}) {
  return (
    <section className="panel members-panel">
      <div className="section-heading"><div><span className="eyebrow">本月真实贡献</span><h2>成员</h2></div></div>
      {props.error ? <StatusPanel title="成员列表加载失败" message={props.error} tone="error" action={<button className="button secondary" type="button" onClick={props.onRetry}>重试</button>} />
        : !props.members ? <p className="muted-note">正在读取成员列表…</p>
        : props.members.members.length === 0 ? <p className="muted-note">当前小组还没有成员。</p>
        : <div className="member-list">{props.members.members.map((member) => {
          const lastAdmin = isOnlyActiveAdmin(props.members!.members, member.membershipId);
          const pending = props.pendingMemberId === member.membershipId;
          return (
            <article className={`member-row ${member.status}`} key={member.membershipId}>
              <span className="avatar" aria-hidden="true">{member.displayName.slice(0, 1)}</span>
              <div className="member-identity">
                <strong>{member.displayName}</strong>
                <span>{member.role === "admin" ? "管理员" : "成员"} · {member.status === "active" ? "有效" : "已移除"}</span>
                <small>加入 {formatDate(member.joinedAt)}{member.removedAt ? ` · 移除 ${formatDate(member.removedAt)}` : ""}</small>
              </div>
              <div className="contribution-breakdown">
                <strong>{member.contribution.total}</strong>
                <span>餐厅 {member.contribution.restaurantCount} · 推荐 {member.contribution.recommendationCount} · 反馈 {member.contribution.feedbackCount}</span>
              </div>
              {props.group.role === "admin" ? (
                <div className="member-actions">
                  <button className="button ghost compact" type="button" disabled={pending || lastAdmin} title={lastAdmin ? "最后一位有效管理员不能降级或移除" : undefined} onClick={() => props.onPatchMember(member, { role: member.role === "admin" ? "member" : "admin" })}>
                    {member.role === "admin" ? "降级为成员" : "设为管理员"}
                  </button>
                  <button className={`button compact ${member.status === "active" ? "danger" : "secondary"}`} type="button" disabled={pending || (lastAdmin && member.status === "active")} title={lastAdmin ? "最后一位有效管理员不能降级或移除" : undefined} onClick={() => props.onPatchMember(member, { status: member.status === "active" ? "removed" : "active" })}>
                    {member.status === "active" ? "移除成员" : "恢复成员"}
                  </button>
                  {lastAdmin ? <small className="member-warning">最后一位有效管理员不能降级或移除</small> : null}
                </div>
              ) : null}
            </article>
          );
        })}</div>}
    </section>
  );
}

function InviteModal(props: { state: InviteViewState; onConfirm: () => void; onClose: () => void; onCopy: () => void }) {
  if (props.state.kind === "closed") return null;
  if (props.state.kind === "confirm") {
    return (
      <Modal open title="确认轮换邀请码" pending={props.state.pending} onClose={props.onClose}>
        <div className="modal-body">
          <p>轮换后旧邀请码会立即失效，尚未加入的同事必须使用新邀请码。</p>
          {props.state.error ? <p className="inline-error">{props.state.error}</p> : null}
        </div>
        <footer className="modal-footer">
          <button className="button danger" type="button" disabled={props.state.pending} onClick={props.onConfirm}>{props.state.pending ? "正在轮换…" : "确认轮换"}</button>
          <button className="button ghost" type="button" disabled={props.state.pending} onClick={props.onClose}>取消</button>
        </footer>
      </Modal>
    );
  }
  return (
    <Modal open title="新邀请码" onClose={props.onClose}>
      <div className="modal-body">
        <p>新邀请码仅显示这一次。关闭后无法找回，只能再次轮换。</p>
        <code className="one-time-code">{props.state.inviteCode}</code>
        {props.state.copyMessage ? <p className="copy-message" role="status">{props.state.copyMessage}</p> : null}
      </div>
      <footer className="modal-footer">
        <button className="button primary" type="button" onClick={props.onCopy}>复制邀请码</button>
        <button className="button ghost" type="button" onClick={props.onClose}>完成</button>
      </footer>
    </Modal>
  );
}

interface SettingsFormProps {
  editor: SettingsEditorState;
  readOnly: boolean;
  pendingSection?: SettingsSection | undefined;
  sectionErrors: Partial<Record<SettingsSection, string>>;
  onGroupDraft: (patch: Partial<GroupDraft>) => void;
  onReminderDraft: (patch: Partial<ReminderDraft>) => void;
  onWeightDraft: (patch: Partial<WeightsDraft>) => void;
  onSave: (section: SettingsSection) => void;
}

function SectionFooter(props: SettingsFormProps & { section: SettingsSection; label: string }) {
  return (
    <footer className="settings-form-footer">
      {props.sectionErrors[props.section] ? <p className="inline-error">{props.sectionErrors[props.section]}</p> : <span />}
      {!props.readOnly ? <button className="button primary" type="submit" disabled={!props.editor.dirty[props.section] || Boolean(props.pendingSection)}>{props.pendingSection === props.section ? "正在保存…" : props.label}</button> : null}
    </footer>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{props.label}</span>{props.children}</label>;
}

function Toggle(props: { label: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <label className="toggle-field"><span>{props.label}</span><input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(event) => props.onChange(event.target.checked)} /></label>;
}

const weightMeta: Record<keyof ScoringWeightsSnapshot, { label: string; description: string }> = {
  weekdayMatch: { label: "星期匹配", description: "星期与推荐标签匹配时加分" },
  weatherMatch: { label: "天气匹配", description: "天气与推荐标签匹配时加分" },
  distance: { label: "距离", description: "步行更近时加分" },
  teammateRecommendation: { label: "同事推荐", description: "真实同事推荐提供加分" },
  recentDuplicatePenalty: { label: "近期重复惩罚", description: "最近吃过的餐厅扣分" },
  negativeFeedbackPenalty: { label: "负反馈惩罚", description: "近期 skip / avoid 反馈扣分" }
};

function rangeValue(value: string): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(100, Math.max(0, numeric)) : 0;
}

function formatDate(value: string): string {
  try {
    return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
  } catch {
    return value;
  }
}

function emptyMembers(groupId: string): MembersResponse {
  return { groupId, contributionWindow: { startAt: "", endAt: "" }, members: [] };
}

function isAdminRoleError(error: unknown): boolean {
  return error instanceof AdminApiError && error.status === 403 && error.code === "admin_membership_required";
}

function operationMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.code === "last_admin") return "最后一位有效管理员不能降级或移除。";
    if (error.kind === "network") return "网络连接失败，已有数据没有被更改。";
    if (error.status && error.status >= 500) return "服务暂时不可用，请稍后重试。";
  }
  return "操作没有完成，请检查输入后重试。";
}
