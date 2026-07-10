import { getStorageState, updateStorageState } from "./storage";
import { createOptionsController } from "./optionsController";

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

const controller = createOptionsController({
  loadState: getStorageState,
  applyState: (state) => {
    apiBaseUrl.value = state.apiBaseUrl;
    readToken.value = state.readToken;
    activeGroupId.value = state.activeGroupId ?? "";
    groupSessionToken.value = state.activeGroupId
      ? state.sessionsByGroupId[state.activeGroupId]?.token ?? ""
      : "";
    identityToken.value = state.identityToken ?? "";
    reminderTime.value = state.reminderTime;
    enabled.checked = state.enabled;
  },
  saveState: async () => {
    const nextGroupId = activeGroupId.value.trim();
    const nextGroupSessionToken = groupSessionToken.value.trim();
    const nextIdentityToken = identityToken.value.trim();

    await updateStorageState((state) => {
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
    });
  },
  notifySettingsChanged: () =>
    chrome.runtime
      .sendMessage({ type: "settingsChanged" })
      .catch(() => undefined),
  setMessage: (text) => {
    message.textContent = text;
  }
});

void controller.load();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void controller.save();
});
