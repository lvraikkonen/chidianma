import { getStorageState, updateStorageState } from "./storage";

const form = document.querySelector<HTMLFormElement>("#settings-form")!;
const apiBaseUrl = document.querySelector<HTMLInputElement>("#apiBaseUrl")!;
const readToken = document.querySelector<HTMLInputElement>("#readToken")!;
const activeGroupId = document.querySelector<HTMLInputElement>("#activeGroupId")!;
const groupSessionToken = document.querySelector<HTMLInputElement>(
  "#groupSessionToken"
)!;
const identityToken = document.querySelector<HTMLInputElement>("#identityToken")!;
const reminderTime = document.querySelector<HTMLInputElement>("#reminderTime")!;
const enabled = document.querySelector<HTMLInputElement>("#enabled")!;
const message = document.querySelector<HTMLElement>("#message")!;

void getStorageState().then((state) => {
  apiBaseUrl.value = state.apiBaseUrl;
  readToken.value = state.readToken;
  activeGroupId.value = state.activeGroupId ?? "";
  groupSessionToken.value = state.activeGroupId
    ? state.sessionsByGroupId[state.activeGroupId]?.token ?? ""
    : "";
  identityToken.value = state.identityToken ?? "";
  reminderTime.value = state.reminderTime;
  enabled.checked = state.enabled;
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const nextGroupId = activeGroupId.value.trim();
  const nextGroupSessionToken = groupSessionToken.value.trim();
  const nextIdentityToken = identityToken.value.trim();

  void updateStorageState((state) => {
    const nextState = {
      ...state,
      apiBaseUrl: apiBaseUrl.value,
      readToken: readToken.value,
      identityToken: nextIdentityToken || undefined,
      reminderTime: reminderTime.value,
      enabled: enabled.checked
    };

    if (!nextGroupId || !nextGroupSessionToken) return nextState;
    return {
      ...nextState,
      activeGroupId: nextGroupId,
      sessionsByGroupId: {
        ...state.sessionsByGroupId,
        [nextGroupId]: { token: nextGroupSessionToken }
      }
    };
  })
    .then(() =>
      chrome.runtime
        .sendMessage({ type: "settingsChanged" })
        .catch(() => undefined)
    )
    .then(() => {
      message.textContent = "设置已保存。";
    });
});
