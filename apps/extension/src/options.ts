import { getSettings, saveSettings } from "./storage";

const form = document.querySelector<HTMLFormElement>("#settings-form")!;
const apiBaseUrl = document.querySelector<HTMLInputElement>("#apiBaseUrl")!;
const readToken = document.querySelector<HTMLInputElement>("#readToken")!;
const reminderTime = document.querySelector<HTMLInputElement>("#reminderTime")!;
const enabled = document.querySelector<HTMLInputElement>("#enabled")!;
const message = document.querySelector<HTMLElement>("#message")!;

void getSettings().then((settings) => {
  apiBaseUrl.value = settings.apiBaseUrl;
  readToken.value = settings.readToken;
  reminderTime.value = settings.reminderTime;
  enabled.checked = settings.enabled;
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void saveSettings({
    apiBaseUrl: apiBaseUrl.value,
    readToken: readToken.value,
    reminderTime: reminderTime.value,
    enabled: enabled.checked
  }).then(() => {
    message.textContent = "设置已保存。";
  });
});
