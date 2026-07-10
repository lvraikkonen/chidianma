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
import {
  disconnectIdentity,
  getStorageState,
  replaceApiBaseUrl,
  saveActiveGroupReminderOverride,
  saveGroupConnection,
  saveIdentityConnection,
  syncGroupSummaries,
  type ExtensionStorageShape
} from "./storage";

const globalMessage = document.querySelector<HTMLElement>("#global-message")!;
const identityState = document.querySelector<HTMLElement>("#identity-state")!;
const groupsCard = document.querySelector<HTMLElement>("#groups-card")!;
const groupList = document.querySelector<HTMLElement>("#group-list")!;
const reminderCard = document.querySelector<HTMLElement>("#reminder-card")!;
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
const reminderTime = document.querySelector<HTMLInputElement>("#reminder-time")!;
const reminderEnabled = document.querySelector<HTMLInputElement>(
  "#reminder-enabled"
)!;
const apiHostForm = document.querySelector<HTMLFormElement>("#api-host-form")!;
const apiBaseUrl = document.querySelector<HTMLInputElement>("#api-base-url")!;

function createLabel(text: string, input: HTMLInputElement): HTMLLabelElement {
  const label = document.createElement("label");
  label.append(document.createTextNode(text), input);
  return label;
}

async function runFormAction(
  form: HTMLFormElement,
  action: () => Promise<void>
): Promise<void> {
  const submitButton = form.querySelector<HTMLButtonElement>(
    'button[type="submit"]'
  )!;
  submitButton.disabled = true;
  try {
    await action();
  } finally {
    submitButton.disabled = false;
  }
}

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
    disconnectButton.disabled = state.kind === "loading";
    disconnectButton.addEventListener("click", () => {
      disconnectButton.disabled = true;
      void controller.disconnect().finally(() => {
        disconnectButton.disabled = false;
      });
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
  submitButton.disabled = state.kind === "loading";

  form.append(createLabel("你的名字", displayName), submitButton);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = displayName.value.trim();
    if (!name) return;
    void runFormAction(form, () => controller.createIdentity(name));
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
    const pendingGroupId = state.kind === "ready" ? state.pendingGroupId : undefined;
    const isPending = group.groupId === pendingGroupId;
    const button = document.createElement("button");
    button.className = "group-option";
    button.type = "button";
    button.setAttribute("aria-current", String(isActive));
    button.disabled = state.kind === "loading" || isActive || Boolean(pendingGroupId);

    const name = document.createElement("strong");
    name.textContent = group.name;
    const status = document.createElement("small");
    status.textContent = isActive
      ? "当前小组"
      : isPending
        ? "正在切换…"
        : group.subtitle ?? "切换到此小组";
    button.append(name, status);

    if (!isActive) {
      button.addEventListener("click", () => {
        button.disabled = true;
        void controller.switchGroup(group.groupId).finally(() => {
          button.disabled = false;
        });
      });
    }
    return button;
  });
  container.replaceChildren(...groupButtons);
}

function renderReminder(storage: ExtensionStorageShape): void {
  const override = storage.activeGroupId
    ? storage.localReminderOverridesByGroupId[storage.activeGroupId]
    : undefined;
  reminderTime.value = override?.reminderTime ?? storage.reminderTime;
  reminderEnabled.checked = override?.enabled ?? storage.enabled;
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
  groupsCard.hidden = !connected;
  reminderCard.hidden = !connected || !state.storage.activeGroupId;
  apiBaseUrl.value = state.storage.apiBaseUrl;
  renderIdentity(identityState, state);
  renderGroups(groupList, state);
  renderReminder(state.storage);
  renderInvite(
    inviteResult,
    state.kind === "ready" ? state.inviteCode : undefined
  );
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
  render: renderOptions
});

createGroupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const nextGroupName = groupName.value.trim();
  const subtitle = groupSubtitle.value.trim();
  if (!nextGroupName) return;
  void runFormAction(createGroupForm, () =>
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
  void runFormAction(joinGroupForm, () => controller.joinGroup(code));
});

reminderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const time = reminderTime.value.trim();
  if (!time) return;
  void runFormAction(reminderForm, () =>
    controller.saveReminder({
      reminderTime: time,
      enabled: reminderEnabled.checked
    })
  );
});

apiHostForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const host = apiBaseUrl.value.trim();
  if (!host) return;
  if (!window.confirm("更换地址会断开当前身份并清除该服务的分组缓存。")) {
    return;
  }
  void runFormAction(apiHostForm, () => controller.replaceHost(host));
});

void controller.load();
