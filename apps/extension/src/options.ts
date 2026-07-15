import {
  createGroup,
  createIdentity,
  joinGroup,
  listGroups,
  refreshGroupSession
} from "./groupClient";
import {
  createOptionsController,
  type OptionsViewState
} from "./optionsController";
import { buildPersonalHistoryModel } from "./personalHistoryModel";
import {
  buildReminderFormModel,
  type ReminderDraft,
  validateReminderDraft
} from "./reminderFormModel";
import {
  getGroupSettingsForContext,
  getPersonalHistoryForContext
} from "./stage5Client";
import {
  clearGroupReminderOverride,
  clearGroupSession,
  disconnectIdentity,
  getStorageState,
  replaceApiBaseUrl,
  saveActiveGroupReminderOverride,
  saveGroupConnection,
  saveGroupReminderOverride,
  saveGroupSettingsCache,
  saveIdentityConnection,
  syncGroupSummaries,
  type ExtensionStorageShape
} from "./storage";
import { createExclusiveActionGate } from "./uiAction";

const globalMessage = document.querySelector<HTMLElement>("#global-message")!;
const identityState = document.querySelector<HTMLElement>("#identity-state")!;
const groupsCard = document.querySelector<HTMLElement>("#groups-card")!;
const groupList = document.querySelector<HTMLElement>("#group-list")!;
const reminderCard = document.querySelector<HTMLElement>("#reminder-card")!;
const historyCard = document.querySelector<HTMLElement>("#history-card")!;
const inviteResult = document.querySelector<HTMLElement>("#invite-result")!;

const createGroupForm = document.querySelector<HTMLFormElement>(
  "#create-group-form"
)!;
const groupName = document.querySelector<HTMLInputElement>("#group-name")!;
const groupSubtitle = document.querySelector<HTMLInputElement>(
  "#group-subtitle"
)!;
const joinGroupForm = document.querySelector<HTMLFormElement>("#join-group-form")!;
const inviteCode = document.querySelector<HTMLInputElement>("#invite-code")!;
const reminderForm = document.querySelector<HTMLFormElement>("#reminder-form")!;
const reminderResourceMessage = document.querySelector<HTMLElement>(
  "#reminder-resource-message"
)!;
const groupReminderDefaults = document.querySelector<HTMLElement>(
  "#group-reminder-defaults"
)!;
const reminderCustomMode = document.querySelector<HTMLInputElement>(
  "#reminder-custom-mode"
)!;
const reminderTime = document.querySelector<HTMLInputElement>("#reminder-time")!;
const reminderEnabled = document.querySelector<HTMLInputElement>(
  "#reminder-enabled"
)!;
const secondReminderEnabled = document.querySelector<HTMLInputElement>(
  "#second-reminder-enabled"
)!;
const saveReminderButton = document.querySelector<HTMLButtonElement>(
  "#save-reminder-button"
)!;
const restoreReminderButton = document.querySelector<HTMLButtonElement>(
  "#restore-reminder-button"
)!;
const retrySettingsButton = document.querySelector<HTMLButtonElement>(
  "#retry-settings-button"
)!;
const historyResourceMessage = document.querySelector<HTMLElement>(
  "#history-resource-message"
)!;
const historyContent = document.querySelector<HTMLElement>("#history-content")!;
const retryHistoryButton = document.querySelector<HTMLButtonElement>(
  "#retry-history-button"
)!;
const apiHostForm = document.querySelector<HTMLFormElement>("#api-host-form")!;
const apiBaseUrl = document.querySelector<HTMLInputElement>("#api-base-url")!;

function createLabel(text: string, input: HTMLInputElement): HTMLLabelElement {
  const label = document.createElement("label");
  label.append(document.createTextNode(text), input);
  return label;
}

function setActionControlsDisabled(disabled: boolean): void {
  document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    button.disabled = disabled;
  });
}

const actionGate = createExclusiveActionGate({
  onPendingChange: (pending) => {
    setActionControlsDisabled(pending);
    if (!pending) renderOptions(controller.getState());
  }
});

function renderIdentity(container: HTMLElement, state: OptionsViewState): void {
  if (state.storage.identityToken) {
    const connection = document.createElement("div");
    connection.className = "group-option";

    const displayName = document.createElement("strong");
    displayName.textContent = state.storage.identityDisplayName ?? "已连接用户";

    const disconnectButton = document.createElement("button");
    disconnectButton.id = "disconnect-button";
    disconnectButton.className = "button secondary";
    disconnectButton.type = "button";
    disconnectButton.textContent = "断开连接";
    disconnectButton.disabled = state.kind === "loading" || actionGate.isPending();
    disconnectButton.addEventListener("click", () => {
      void actionGate.run(() => controller.disconnect());
    });

    connection.append(displayName, disconnectButton);
    container.replaceChildren(connection);
    return;
  }

  const form = document.createElement("form");
  form.id = "identity-form";
  form.className = "stack";

  const displayName = document.createElement("input");
  displayName.id = "display-name";
  displayName.required = true;
  displayName.maxLength = 80;
  displayName.autocomplete = "name";

  const submitButton = document.createElement("button");
  submitButton.className = "button primary";
  submitButton.type = "submit";
  submitButton.textContent = "建立轻量身份";
  submitButton.disabled = state.kind === "loading" || actionGate.isPending();

  form.append(createLabel("你的名字", displayName), submitButton);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = displayName.value.trim();
    if (!name) return;
    void actionGate.run(() => controller.createIdentity(name));
  });
  container.replaceChildren(form);
}

function renderGroups(container: HTMLElement, state: OptionsViewState): void {
  const groups = Object.values(state.storage.groupSummariesById);
  if (groups.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "还没有加入小组，可以创建一个或使用邀请码加入。";
    container.replaceChildren(empty);
    return;
  }

  const groupButtons = groups.map((group) => {
    const isActive = group.groupId === state.storage.activeGroupId;
    const hasSession = Boolean(state.storage.sessionsByGroupId[group.groupId]?.token);
    const pendingGroupId = state.kind === "ready" ? state.pendingGroupId : undefined;
    const isPending = group.groupId === pendingGroupId;
    const button = document.createElement("button");
    button.className = "group-option";
    button.type = "button";
    button.setAttribute("aria-current", String(isActive));
    button.disabled = actionGate.isPending()
      || state.kind === "loading"
      || (isActive && hasSession)
      || Boolean(pendingGroupId);

    const name = document.createElement("strong");
    name.textContent = group.name;
    const status = document.createElement("small");
    status.textContent = isActive
      ? hasSession ? "当前小组" : "连接已失效，点击重新连接"
      : isPending
        ? "正在切换…"
        : group.subtitle ?? "切换到此小组";
    button.append(name, status);

    if (!isActive || !hasSession) {
      button.addEventListener("click", () => {
        void actionGate.run(() => controller.switchGroup(group.groupId));
      });
    }
    return button;
  });
  container.replaceChildren(...groupButtons);
}

let reminderDraft: ReminderDraft | undefined;
let reminderDraftGroupId: string | undefined;
let reminderDraftDirty = false;
let reminderModeCustom = false;

function renderReminder(state: OptionsViewState): void {
  const storage = state.storage;
  const groupId = storage.activeGroupId;
  const resource = state.kind === "ready" ? state.groupSettings : undefined;
  const liveSettings = resource?.status === "ready" ? resource.data : undefined;
  const model = buildReminderFormModel(storage, liveSettings);

  reminderResourceMessage.textContent = resource?.status === "loading"
    ? "正在加载小组默认提醒…"
    : resource?.status === "error"
      ? resource.message
      : "";
  retrySettingsButton.hidden = resource?.status !== "error";

  if (!groupId || !model) {
    reminderDraft = undefined;
    reminderDraftGroupId = groupId;
    reminderDraftDirty = false;
    reminderModeCustom = false;
    groupReminderDefaults.hidden = true;
    reminderCustomMode.checked = false;
    reminderCustomMode.disabled = true;
    reminderTime.disabled = true;
    reminderEnabled.disabled = true;
    secondReminderEnabled.disabled = true;
    saveReminderButton.disabled = true;
    restoreReminderButton.hidden = true;
    if (groupId && resource?.status !== "error" && resource?.status !== "loading") {
      reminderResourceMessage.textContent = "尚未取得有效的小组提醒设置，当前不会调度提醒。";
    }
    return;
  }

  if (reminderDraftGroupId !== groupId || !reminderDraftDirty) {
    reminderDraftGroupId = groupId;
    reminderDraft = { ...model.draft };
    reminderModeCustom = model.mode === "local-override";
  }
  reminderDraft ??= { ...model.draft };

  groupReminderDefaults.hidden = false;
  const label = model.notificationGroupLabel
    ? ` · 称呼「${model.notificationGroupLabel}」`
    : "";
  groupReminderDefaults.textContent =
    `小组默认：${model.groupDefault.reminderTime} · ${model.officeTimezone} · `
    + `${model.groupDefault.weekdayReminderEnabled ? "工作日开启" : "工作日关闭"} · `
    + `${model.groupDefault.secondReminderEnabled ? "二次提醒开启" : "二次提醒关闭"} · `
    + `标题「${model.notificationTitle}」${label}`;
  reminderCustomMode.disabled = false;
  reminderCustomMode.checked = reminderModeCustom;
  reminderTime.value = reminderDraft.reminderTime;
  reminderEnabled.checked = reminderDraft.weekdayReminderEnabled;
  secondReminderEnabled.checked = reminderDraft.secondReminderEnabled;
  reminderTime.disabled = !reminderModeCustom;
  reminderEnabled.disabled = !reminderModeCustom;
  secondReminderEnabled.disabled = !reminderModeCustom;
  saveReminderButton.disabled = !reminderModeCustom;
  restoreReminderButton.hidden = model.mode !== "local-override";
}

function formatDecisionTime(value: string, timeZone?: string): string | undefined {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return undefined;
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date);
  } catch {
    return undefined;
  }
}

function renderHistory(state: OptionsViewState): void {
  const resource = state.kind === "ready" ? state.personalHistory : undefined;
  historyContent.replaceChildren();
  historyResourceMessage.textContent = resource?.status === "loading"
    ? "正在加载最近的午饭记录…"
    : resource?.status === "error"
      ? resource.message
      : "";
  retryHistoryButton.hidden = resource?.status !== "error";
  if (resource?.status !== "ready") return;

  const model = buildPersonalHistoryModel(resource.data);
  const summary = document.createElement("div");
  summary.className = "history-summary";
  const windowLabel = document.createElement("small");
  windowLabel.textContent = `记录窗口：${model.windowLabel}`;
  summary.append(windowLabel);

  if (model.kind === "empty") {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = model.message;
    historyContent.append(summary, empty);
    return;
  }

  const metrics = document.createElement("div");
  metrics.className = "history-metrics";
  const count = document.createElement("div");
  count.append(Object.assign(document.createElement("strong"), {
    textContent: String(model.decidedCount)
  }), Object.assign(document.createElement("small"), {
    textContent: "已完成决定"
  }));
  metrics.append(count);
  if (model.kind === "ready" && model.averagePriceLabel) {
    const price = document.createElement("div");
    price.append(Object.assign(document.createElement("strong"), {
      textContent: model.averagePriceLabel
    }), Object.assign(document.createElement("small"), {
      textContent: "平均价格"
    }));
    metrics.append(price);
  }
  summary.append(metrics);

  const preference = document.createElement("div");
  preference.className = "preference-bars";
  if (model.kind === "insufficient") {
    preference.textContent = "完成至少 3 次决定后显示类别偏好，目前数据不足。";
  } else if (model.categories.length === 0) {
    preference.textContent = "暂时没有可展示的类别偏好。";
  } else {
    for (const category of model.categories) {
      const row = document.createElement("div");
      row.className = "preference-row";
      const heading = document.createElement("div");
      heading.append(Object.assign(document.createElement("span"), {
        textContent: category.cuisine
      }), Object.assign(document.createElement("span"), {
        textContent: `${category.percentage}% · ${category.decisionCount} 次`
      }));
      const track = document.createElement("div");
      track.className = "bar-track";
      const bar = document.createElement("span");
      bar.style.width = `${Math.max(0, Math.min(100, category.percentage))}%`;
      track.append(bar);
      row.append(heading, track);
      preference.append(row);
    }
  }

  const timeZone = state.storage.activeGroupId
    ? state.storage.groupSettingsCacheByGroupId[state.storage.activeGroupId]
      ?.response.group.officeTimezone
    : undefined;
  const list = document.createElement("div");
  list.className = "history-list";
  for (const item of model.items) {
    const entry = document.createElement("article");
    entry.className = "history-item";
    const date = document.createElement("time");
    date.dateTime = item.officeDate;
    date.textContent = item.officeDate;
    const body = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.restaurantName;
    const detail = document.createElement("p");
    detail.textContent = [item.cuisine, item.dish, item.priceLabel]
      .filter(Boolean)
      .join(" · ");
    const context = document.createElement("small");
    const decidedTime = item.decidedAt
      ? formatDecisionTime(item.decidedAt, timeZone)
      : undefined;
    context.textContent = [
      decidedTime ? `${decidedTime} 完成` : undefined,
      item.coDinerLabel
    ].filter(Boolean).join(" · ");
    body.append(title, detail, context);
    entry.append(date, body);
    list.append(entry);
  }
  historyContent.append(summary, preference, list);
}

function renderInvite(container: HTMLElement, code?: string): void {
  container.hidden = !code;
  container.textContent = code
    ? `小组已创建。请立即保存邀请码：${code}`
    : "";
}

function renderOptions(state: OptionsViewState): void {
  globalMessage.textContent = "error" in state ? state.error ?? "" : "";
  const connected = Boolean(state.storage.identityToken);
  const activeGroupId = state.storage.activeGroupId;
  const hasActiveSession = Boolean(
    activeGroupId && state.storage.sessionsByGroupId[activeGroupId]?.token
  );
  groupsCard.hidden = !connected;
  reminderCard.hidden = !connected || !hasActiveSession;
  historyCard.hidden = !connected || !hasActiveSession;
  apiBaseUrl.value = state.storage.apiBaseUrl;
  renderIdentity(identityState, state);
  renderGroups(groupList, state);
  renderReminder(state);
  renderHistory(state);
  renderInvite(
    inviteResult,
    state.kind === "ready" ? state.inviteCode : undefined
  );
  if (actionGate.isPending()) setActionControlsDisabled(true);
}

const controller = createOptionsController({
  loadStorage: getStorageState,
  createIdentity,
  createGroup,
  joinGroup,
  listGroups,
  refreshSession: refreshGroupSession,
  saveIdentityConnection,
  saveGroupConnection,
  syncGroupSummaries,
  saveReminder: saveActiveGroupReminderOverride,
  replaceApiBaseUrl,
  disconnectIdentity,
  getGroupSettingsForContext,
  getPersonalHistoryForContext,
  saveGroupSettingsCache,
  clearGroupSession,
  saveGroupReminderOverride,
  clearGroupReminderOverride,
  render: renderOptions
});

createGroupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const nextGroupName = groupName.value.trim();
  const subtitle = groupSubtitle.value.trim();
  if (!nextGroupName) return;
  void actionGate.run(() =>
    controller.createGroup({
      groupName: nextGroupName,
      ...(subtitle ? { subtitle } : {})
    })
  );
});

joinGroupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = inviteCode.value.trim();
  if (!code) return;
  void actionGate.run(() => controller.joinGroup(code));
});

reminderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const draft: ReminderDraft = {
    reminderTime: reminderTime.value.trim(),
    weekdayReminderEnabled: reminderEnabled.checked,
    secondReminderEnabled: secondReminderEnabled.checked
  };
  const validation = validateReminderDraft(draft);
  if (!validation.valid) {
    reminderResourceMessage.textContent = validation.error;
    return;
  }
  void actionGate.run(async () => {
    if (await controller.saveReminderOverride(draft)) {
      reminderDraftDirty = false;
      renderOptions(controller.getState());
    }
  });
});

reminderCustomMode.addEventListener("change", () => {
  reminderModeCustom = reminderCustomMode.checked;
  reminderDraftDirty = reminderModeCustom;
  renderOptions(controller.getState());
});

function captureReminderDraft(): void {
  reminderDraft = {
    reminderTime: reminderTime.value.trim(),
    weekdayReminderEnabled: reminderEnabled.checked,
    secondReminderEnabled: secondReminderEnabled.checked
  };
  reminderDraftDirty = true;
}

reminderTime.addEventListener("input", captureReminderDraft);
reminderEnabled.addEventListener("change", captureReminderDraft);
secondReminderEnabled.addEventListener("change", captureReminderDraft);

restoreReminderButton.addEventListener("click", () => {
  void actionGate.run(async () => {
    if (await controller.restoreGroupReminderDefault()) {
      reminderDraftDirty = false;
      reminderModeCustom = false;
      renderOptions(controller.getState());
    }
  });
});

retrySettingsButton.addEventListener("click", () => {
  retrySettingsButton.disabled = true;
  void controller.retrySettings().finally(() => {
    retrySettingsButton.disabled = false;
  });
});

retryHistoryButton.addEventListener("click", () => {
  retryHistoryButton.disabled = true;
  void controller.retryHistory().finally(() => {
    retryHistoryButton.disabled = false;
  });
});

apiHostForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const host = apiBaseUrl.value.trim();
  if (!host) return;
  void actionGate.run(async () => {
    if (!window.confirm("更换地址会断开当前身份并清除该服务的分组缓存。")) {
      return;
    }
    await controller.replaceHost(host);
  });
});

void actionGate.run(() => controller.load());
