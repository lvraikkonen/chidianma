import type {
  FeedbackType,
  GroupTodayRecommendationItem,
  ParticipationStatus,
  PutParticipationTodayResponse,
  WheelMode,
  WeatherTag,
  WeekdayTag
} from "@lunch/shared";
import { fetchGroupCapabilitiesForStorage } from "./capabilitiesClient";
import {
  createGroupRecommendation,
  createGroupRestaurant,
  listGroupRestaurants,
  type GroupApiContext
} from "./groupClient";
import {
  applyParticipationUpdate,
  classifyPopupRetryOutcome,
  composeStaleReloadStatus,
  loadRefreshedPopupStateForStorage,
  loadPopupState,
  loadPopupStateForStorage,
  resolvePopupActionFailure,
  restoreRecommendationFocus,
  runPopupActionWithContext,
  popupActionContextMatches,
  type PopupActionContextResult,
  type PopupViewState
} from "./popupController";
import {
  fetchGroupTodayRecommendationsWithCacheFallbackForStorage,
  fetchTodayParticipationForStorage,
  postFeedbackForStorage,
  putTodayParticipationForStorage,
  refreshGroupTodayRecommendationsForStorage
} from "./recommendationClient";
import {
  scoreBreakdownRows,
  toRecommendationCardModel
} from "./recommendationViewModel";
import {
  createQuickAddController,
  type QuickAddInput,
  type QuickAddState
} from "./quickAddController";
import { applyQuickAddControls } from "./quickAddViewState";
import { getStorageState, type ExtensionStorageShape } from "./storage";
import { createExclusiveActionGate, runButtonAction } from "./uiAction";
import {
  createExtensionLuckyWheelController,
  type LuckyWheelControllerState
} from "./wheelController";
import {
  luckyWheelEntryAvailable,
  toWheelPopupModel,
  type WheelCandidatePresentation,
  type WheelPopupModel
} from "./wheelPopupModel";
import {
  createWheelSpinLifecycle,
  type WheelSpinLifecycle
} from "./wheelSpinLifecycle";

type RecommendationState = Extract<
  PopupViewState,
  { kind: "ready" | "cached" }
>;

type QuickAddHostState = Extract<
  PopupViewState,
  { kind: "ready" | "empty" }
>;

type WheelHostState = QuickAddHostState;
type PopupSurface = "recommendations" | "wheel";
type WheelPendingAction = "spin" | "accept" | "exclude";

const RESTAURANT_TAG_OPTIONS = [
  ["热乎", "热乎"],
  ["清淡", "清淡"],
  ["近", "离得近"],
  ["快", "出餐快"],
  ["雨天", "雨天适合"],
  ["量大", "量大"],
  ["多人", "适合多人"],
  ["周五", "周五奖励"]
] as const;

const WEATHER_TAG_OPTIONS: ReadonlyArray<readonly [WeatherTag, string]> = [
  ["rainy", "雨天"],
  ["hot", "炎热"],
  ["cold", "寒冷"],
  ["clear", "晴朗"],
  ["windy", "大风"]
];

const WEEKDAY_TAG_OPTIONS: ReadonlyArray<readonly [WeekdayTag, string]> = [
  ["monday", "周一"],
  ["tuesday", "周二"],
  ["wednesday", "周三"],
  ["thursday", "周四"],
  ["friday", "周五"]
];

const MOOD_TAG_OPTIONS = [
  ["热乎", "想吃热乎的"],
  ["清爽", "想吃清爽的"],
  ["赶时间", "赶时间"],
  ["多人聚餐", "多人聚餐"],
  ["奖励自己", "奖励自己"]
] as const;

const activeGroupName = document.querySelector<HTMLElement>(
  "#active-group-name"
)!;
const popupStatus = document.querySelector<HTMLElement>("#popup-status")!;
const popupContent = document.querySelector<HTMLElement>("#popup-content")!;
const popupActions = document.querySelector<HTMLElement>("#popup-actions")!;
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh")!;
const quickAddButton = document.querySelector<HTMLButtonElement>("#quick-add")!;
const settingsButton = document.querySelector<HTMLButtonElement>(
  "#open-settings"
)!;
const recommendationCardTemplate = document.querySelector<HTMLTemplateElement>(
  "#recommendation-card-template"
)!;

let currentState: PopupViewState = { kind: "disconnected" };
let selectedRestaurantId: string | null = null;
let currentSurface: PopupSurface = "recommendations";
let wheelController: ReturnType<typeof createExtensionLuckyWheelController>
  | null = null;
let wheelSpinLifecycle: WheelSpinLifecycle | null = null;
let wheelRotationDegrees = 0;
let wheelCandidateSignature = "";
let wheelViewGeneration = 0;
let wheelPendingAction: WheelPendingAction | null = null;
const actionGate = createExclusiveActionGate({
  onPendingChange: (pending) => {
    if (
      currentSurface !== "wheel"
      || !wheelController
      || !luckyWheelEntryAvailable(currentState)
    ) {
      return;
    }
    const completedAction = pending ? null : wheelPendingAction;
    if (!pending) wheelPendingAction = null;
    const state = wheelController.getState();
    if (!pending && state.kind === "spinning") return;
    renderWheelControllerState(currentState, state);
    if (pending) {
      setWheelAnnouncement(
        wheelPendingAction === "spin"
          ? "正在确认最新候选并保存本次抽签结果。"
          : wheelPendingAction === "accept"
            ? "正在确认这次午饭选择。"
            : "正在更新本轮候选。"
      );
      return;
    }

    if (completedAction === "spin" && state.kind === "result") {
      focusAndAnnounceWheelResult();
    } else if (
      completedAction === "accept"
      && state.kind === "result"
    ) {
      focusWheelResultAfterAcceptance(state);
    } else if (
      completedAction === "exclude"
      && (state.kind === "ready" || state.kind === "insufficient")
    ) {
      setStatus("已从本次转盘移除；不会永久删除或影响今后推荐。");
      focusWheelPrimaryControl();
    } else {
      focusWheelSurfaceHeading();
    }
  }
});

settingsButton.addEventListener("click", openSettings);
refreshButton.addEventListener("click", () => {
  runExclusive(() => runRecommendationRefresh(
    refreshButton,
    "正在换一批...",
    "今日推荐已更新。",
    "刷新推荐失败，请重试。"
  ));
});
quickAddButton.addEventListener("click", () => {
  if (currentState.kind === "ready" || currentState.kind === "empty") {
    renderQuickAddForm(currentState);
  }
});

void reloadPopup();

async function reloadPopup(
  storage?: ExtensionStorageShape
): Promise<PopupViewState> {
  leaveWheelSurface();
  renderLoading();
  currentState = await loadCurrentPopupState(storage);
  renderPopup(currentState);
  return currentState;
}

async function loadCurrentPopupState(
  storage?: ExtensionStorageShape
): Promise<PopupViewState> {
  const dependencies = {
    loadStorage: getStorageState,
    loadRecommendations:
      fetchGroupTodayRecommendationsWithCacheFallbackForStorage,
    loadParticipation: fetchTodayParticipationForStorage,
    loadCapabilities: fetchGroupCapabilitiesForStorage
  };
  try {
    return storage
      ? await loadPopupStateForStorage(storage, dependencies)
      : await loadPopupState(dependencies);
  } catch {
    return {
      kind: "error",
      message: "暂时无法加载今日推荐，请重试。"
    };
  }
}

function renderPopup(state: PopupViewState): void {
  popupContent.replaceChildren();
  popupStatus.replaceChildren();
  popupStatus.classList.remove("visually-hidden");
  activeGroupName.textContent =
    "group" in state && state.group ? state.group.name : "";
  if (!luckyWheelEntryAvailable(state) && currentSurface === "wheel") {
    leaveWheelSurface();
  }
  popupActions.hidden = currentSurface === "wheel"
    || (state.kind !== "ready" && state.kind !== "empty");
  refreshButton.disabled = false;
  refreshButton.textContent = "换一批";
  if (currentSurface === "wheel" && luckyWheelEntryAvailable(state)) {
    renderWheelControllerState(
      state,
      wheelController?.getState() ?? { kind: "loading" }
    );
    return;
  }
  if (luckyWheelEntryAvailable(state)) renderExperienceSwitcher(state);
  if (state.kind === "disconnected") renderDisconnected();
  if (state.kind === "no-current-batch") renderGenerate(state);
  if (state.kind === "cached") renderRecommendations(state, true);
  if (state.kind === "empty") renderEmpty(state);
  if (state.kind === "ready") renderReady(state);
  if (state.kind === "session-expired") renderReconnect(state);
  if (state.kind === "forbidden") renderForbidden(state);
  if (state.kind === "error") renderError(state.message);
}

function renderLoading(): void {
  popupContent.replaceChildren();
  popupStatus.replaceChildren();
  popupStatus.classList.remove("visually-hidden");
  popupActions.hidden = true;

  const loading = document.createElement("section");
  loading.className = "loading-panel";
  loading.setAttribute("aria-label", "正在加载今日推荐");
  const title = document.createElement("strong");
  title.textContent = "正在挑今天中午吃什么...";
  loading.appendChild(title);
  for (let index = 0; index < 3; index += 1) {
    const placeholder = document.createElement("span");
    placeholder.className = "loading-placeholder";
    loading.appendChild(placeholder);
  }
  popupContent.appendChild(loading);
}

function renderExperienceSwitcher(state: WheelHostState): void {
  const switcher = document.createElement("nav");
  switcher.className = currentSurface === "wheel"
    ? "experience-switcher is-wheel-surface"
    : "experience-switcher";
  switcher.setAttribute("aria-label", "午饭选择方式");

  const recommendationButton = createExperienceButton({
    title: "给我推荐",
    description: currentSurface === "recommendations"
      ? "当前：今日推荐"
      : "返回已加载推荐",
    selected: currentSurface === "recommendations"
  });
  recommendationButton.disabled = currentSurface === "wheel"
    && actionGate.isPending();
  recommendationButton.addEventListener("click", () => {
    if (currentSurface === "recommendations") return;
    leaveWheelSurface();
    renderPopup(currentState);
    focusCurrentExperienceEntry();
  });

  const wheelButton = createExperienceButton({
    title: "转一下",
    description: currentSurface === "wheel"
      ? "当前：幸运大转盘"
      : "在有效候选中抽签",
    selected: currentSurface === "wheel",
    primary: true
  });
  wheelButton.addEventListener("click", () => {
    if (currentSurface === "wheel") return;
    if (actionGate.isPending()) {
      setStatus("请等待当前操作完成后再打开幸运大转盘。");
      return;
    }
    wheelButton.disabled = true;
    void openLuckyWheel(state);
  });

  switcher.append(recommendationButton, wheelButton);
  popupContent.appendChild(switcher);
}

function createExperienceButton(input: {
  title: string;
  description: string;
  selected: boolean;
  primary?: boolean | undefined;
}): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = [
    "experience-card",
    input.primary ? "is-wheel" : "",
    input.selected ? "is-current" : ""
  ].filter(Boolean).join(" ");
  button.setAttribute("aria-pressed", String(input.selected));
  const title = document.createElement("strong");
  title.textContent = input.title;
  const description = document.createElement("span");
  description.textContent = input.description;
  button.append(title, description);
  return button;
}

function cancelWheelRuntime(): void {
  wheelViewGeneration += 1;
  wheelSpinLifecycle?.cancel();
  wheelController?.cancel();
  wheelSpinLifecycle = null;
  wheelController = null;
  wheelRotationDegrees = 0;
  wheelCandidateSignature = "";
  wheelPendingAction = null;
}

function leaveWheelSurface(): void {
  cancelWheelRuntime();
  currentSurface = "recommendations";
}

async function openLuckyWheel(hostState: WheelHostState): Promise<void> {
  cancelWheelRuntime();
  currentSurface = "wheel";
  const generation = wheelViewGeneration;
  renderWheelControllerState(hostState, { kind: "loading" });
  focusWheelSurfaceHeading();

  let storage: ExtensionStorageShape;
  try {
    storage = await getStorageState();
  } catch {
    if (generation !== wheelViewGeneration) return;
    renderWheelControllerState(hostState, {
      kind: "error",
      code: "wheel_storage_failed",
      message: "暂时无法读取当前小组状态，请重试。",
      retryable: true
    });
    return;
  }
  if (generation !== wheelViewGeneration) return;
  if (!popupActionContextMatches(hostState, storage)) {
    leaveWheelSurface();
    await reloadPopup(storage);
    setStatus("当前小组已切换，已加载当前小组内容，请重新操作。");
    return;
  }

  let controller!: ReturnType<typeof createExtensionLuckyWheelController>;
  controller = createExtensionLuckyWheelController({
    onStateChange: (state) => {
      if (
        generation !== wheelViewGeneration
        || currentSurface !== "wheel"
        || wheelController !== controller
      ) {
        return;
      }
      renderWheelControllerState(hostState, state);
    },
    onAcceptanceUpdate: (update) => {
      if (
        generation !== wheelViewGeneration
        || currentSurface !== "wheel"
        || wheelController !== controller
      ) {
        return;
      }
      currentState = applyParticipationUpdate(currentState, update);
    }
  });
  wheelController = controller;
  wheelSpinLifecycle = createWheelSpinLifecycle({
    spin: controller.spin,
    finishSpin: controller.finishSpin,
    getState: controller.getState,
    getCurrentRotationDegrees: () => wheelRotationDegrees,
    reducedMotion: prefersReducedMotion,
    animate: (plan) => {
      wheelRotationDegrees = plan.targetRotationDegrees;
      const disc = popupContent.querySelector<HTMLElement>("#lucky-wheel-disc");
      if (!disc) return;
      disc.style.setProperty("--wheel-spin-duration", `${plan.durationMs}ms`);
      void disc.offsetWidth;
      disc.style.setProperty(
        "--wheel-rotation",
        `${plan.targetRotationDegrees}deg`
      );
    },
    schedule: (callback, milliseconds) => window.setTimeout(callback, milliseconds),
    cancelScheduled: (timer) => window.clearTimeout(timer),
    onFinished: () => {
      if (!actionGate.isPending()) focusAndAnnounceWheelResult();
    }
  });
  const loaded = await controller.load({
    storage,
    enabled: hostState.capabilities.features.luckyRestaurantWheel,
    readOnly: false,
    initialMode: "weighted"
  });
  if (
    generation !== wheelViewGeneration
    || currentSurface !== "wheel"
    || wheelController !== controller
  ) {
    return;
  }
  if (loaded.kind === "result") {
    focusAndAnnounceWheelResult();
  } else {
    focusWheelSurfaceHeading();
  }
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function renderWheelControllerState(
  hostState: WheelHostState,
  state: LuckyWheelControllerState
): void {
  if (currentSurface !== "wheel") return;
  const nextCandidateSignature = wheelPoolSignature(state);
  if (
    nextCandidateSignature !== null
    && nextCandidateSignature !== wheelCandidateSignature
  ) {
    wheelRotationDegrees = 0;
    wheelCandidateSignature = nextCandidateSignature;
  }
  const model = toWheelPopupModel(state, {
    interactionPending: actionGate.isPending()
  });
  popupContent.replaceChildren();
  popupActions.hidden = true;
  renderExperienceSwitcher(hostState);

  const view = document.createElement("section");
  view.className = "lucky-wheel-view";
  view.setAttribute("aria-busy", String(model.busy));
  view.appendChild(createWheelHeader());

  if (model.kind === "loading") {
    view.appendChild(createWheelLoadingPanel());
    setWheelAnnouncement(model.status);
  } else if (model.kind === "error") {
    view.appendChild(createWheelErrorPanel(hostState, model));
    setStatus(model.status);
  } else if (model.kind === "result") {
    view.appendChild(createWheelResult(model));
    if (model.acceptError) {
      setStatus(model.acceptError);
    } else if (model.acceptancePending) {
      setWheelAnnouncement(model.status);
    } else {
      hideStatus();
    }
  } else {
    view.appendChild(createWheelPool(hostState, model));
    if (model.notice) {
      setStatus(model.notice);
    } else if (model.kind === "spinning") {
      setWheelAnnouncement(model.status);
    } else if (model.kind === "ready" && !model.canSpin) {
      setStatus(model.status);
    } else {
      hideStatus();
    }
  }
  popupContent.appendChild(view);
  if (model.kind === "loading" || actionGate.isPending()) {
    if (model.kind === "result") {
      popupContent.querySelector<HTMLElement>("#wheel-result-title")?.focus();
    } else {
      focusWheelSurfaceHeading();
    }
  }
}

function createWheelHeader(): HTMLElement {
  const header = document.createElement("div");
  header.className = "wheel-view-header";
  const title = document.createElement("h2");
  title.id = "lucky-wheel-title";
  title.tabIndex = -1;
  title.textContent = "幸运大转盘";
  const rules = document.createElement("details");
  rules.className = "wheel-rules";
  const summary = document.createElement("summary");
  summary.textContent = "规则";
  const copy = document.createElement("p");
  copy.textContent = "奖品仅指本次选中的餐厅。转盘只在已通过现有硬条件的候选中抽签；懂你一点模式使用 1–3 张签轻度加权。";
  rules.append(summary, copy);
  header.append(title, rules);
  return header;
}

function createWheelLoadingPanel(): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "wheel-loading";
  const title = document.createElement("strong");
  title.textContent = "正在准备幸运大转盘...";
  const hint = document.createElement("p");
  hint.textContent = "候选仍会先经过现有推荐和硬条件过滤。";
  panel.append(title, hint);
  return panel;
}

function createWheelErrorPanel(
  hostState: WheelHostState,
  model: Extract<WheelPopupModel, { kind: "error" }>
): HTMLElement {
  const panel = createStatePanel("大转盘暂时没有准备好", model.message);
  panel.classList.add("wheel-state-panel");
  if (model.retryable) {
    const retry = createButton("重试加载", "button primary");
    retry.addEventListener("click", () => {
      retry.disabled = true;
      void openLuckyWheel(hostState);
    });
    panel.appendChild(retry);
  }
  const back = createButton("返回今日推荐", "button ghost");
  back.addEventListener("click", () => {
    leaveWheelSurface();
    renderPopup(currentState);
    focusCurrentExperienceEntry();
  });
  panel.appendChild(back);
  return panel;
}

function createWheelPool(
  hostState: WheelHostState,
  model: Extract<
    WheelPopupModel,
    { kind: "ready" | "spinning" | "insufficient" }
  >
): HTMLElement {
  const content = document.createElement("div");
  content.className = "wheel-pool";
  const headline = document.createElement("h2");
  headline.className = "wheel-headline";
  headline.append("中奖概率倍儿高，", document.createElement("br"), "奖品也嘛倍儿好！");
  const prize = document.createElement("p");
  prize.className = "wheel-prize-banner";
  prize.append("今天的奖品：", createStrongText("少纠结十分钟，选定一顿午饭。"));
  content.append(headline, prize);

  if (model.kind === "insufficient") {
    content.appendChild(createWheelModeFieldset(model));
    const insufficient = document.createElement("section");
    insufficient.className = "wheel-insufficient";
    const title = document.createElement("strong");
    title.textContent = model.message;
    const hint = document.createElement("p");
    hint.textContent = model.candidateCount === 0
      ? "可以先返回推荐，或稍后重试候选。"
      : "当前候选仍会保留，但不会绕过限制强行抽签。";
    const retry = createButton("重新加载候选", "button secondary");
    retry.addEventListener("click", () => {
      retry.disabled = true;
      void openLuckyWheel(hostState);
    });
    insufficient.append(title, hint, retry);
    content.appendChild(insufficient);
  } else {
    content.appendChild(createWheelStage(model));
    content.appendChild(createWheelModeFieldset(model));
    if (model.kind === "ready" && !model.canSpin) {
      const exhausted = document.createElement("p");
      exhausted.className = "wheel-exhausted-note";
      exhausted.textContent = "本轮的两次抽签机会已经用完。";
      content.appendChild(exhausted);
    }
  }

  const count = document.createElement("p");
  count.className = "wheel-count";
  count.textContent = `${model.candidates.length} 家餐厅参与本轮`;
  content.append(count, createWheelCandidateList(model.candidates));
  return content;
}

function createWheelModeFieldset(
  model: Extract<
    WheelPopupModel,
    { kind: "ready" | "spinning" | "insufficient" }
  >
): HTMLFieldSetElement {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "wheel-mode-fieldset";
  const legend = document.createElement("legend");
  legend.textContent = "转盘模式";
  const options = document.createElement("div");
  options.className = "wheel-mode-options";
  for (const [value, labelText, description] of [
    ["weighted", "懂你一点", "按推荐分使用 1–3 张签"],
    ["equal", "纯手气", "每家餐厅概率相同"]
  ] as const) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "luckyWheelMode";
    input.value = value;
    input.checked = model.mode === value;
    input.disabled = model.modeLocked || model.busy;
    input.addEventListener("change", () => {
      if (!input.checked || !wheelController?.setMode(value as WheelMode)) return;
      popupContent
        .querySelector<HTMLInputElement>(
          `input[name="luckyWheelMode"][value="${value}"]`
        )
        ?.focus();
    });
    const text = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = labelText;
    const hint = document.createElement("small");
    hint.textContent = description;
    text.append(title, hint);
    label.append(input, text);
    options.appendChild(label);
  }
  fieldset.append(legend, options);
  if (model.modeLocked) {
    const locked = document.createElement("p");
    locked.className = "wheel-mode-note";
    locked.textContent = "第一次抽签后，本轮模式已锁定。";
    fieldset.appendChild(locked);
  }
  return fieldset;
}

function createWheelStage(
  model: Extract<WheelPopupModel, { kind: "ready" | "spinning" }>
): HTMLElement {
  const stage = document.createElement("div");
  stage.className = "wheel-stage";
  const pointer = document.createElement("span");
  pointer.className = "wheel-pointer";
  pointer.setAttribute("aria-hidden", "true");

  const disc = document.createElement("div");
  disc.id = "lucky-wheel-disc";
  disc.className = "wheel-disc";
  disc.setAttribute("aria-hidden", "true");
  disc.style.background = model.gradient;
  disc.style.setProperty("--wheel-rotation", `${wheelRotationDegrees}deg`);
  disc.style.setProperty("--wheel-spin-duration", "0ms");
  for (const sector of model.sectors) {
    const number = document.createElement("span");
    number.className = `wheel-sector-number sector-color-${sector.colorIndex + 1}`;
    number.textContent = sector.label;
    number.style.setProperty(
      "--wheel-sector-midpoint",
      `${sector.midpointDegrees}deg`
    );
    disc.appendChild(number);
  }

  const exhausted = model.kind === "ready" && !model.canSpin;
  const spin = createButton(
    model.busy && model.kind !== "spinning"
      ? "正在准备..."
      : model.kind === "spinning"
        ? "转动中..."
        : exhausted
          ? "本轮结束"
          : model.spinNumber === 0
            ? "开转！"
            : "再转！",
    "wheel-spin-button"
  );
  spin.disabled = model.busy
    || model.kind === "spinning"
    || exhausted;
  spin.setAttribute(
    "aria-label",
    model.kind === "spinning"
      ? "幸运大转盘正在转动"
      : exhausted
        ? "本轮抽签机会已用完"
        : model.spinNumber === 0
          ? "开始转动幸运大转盘"
          : "使用剩余一次机会再次转动幸运大转盘"
  );
  spin.addEventListener("click", () => {
    runWheelAction("spin", async () => {
      await wheelSpinLifecycle?.start();
    });
  });
  stage.append(disc, pointer, spin);
  return stage;
}

function createWheelCandidateList(
  candidates: readonly WheelCandidatePresentation[],
  selectedRestaurantId?: string
): HTMLOListElement {
  const list = document.createElement("ol");
  list.className = "wheel-candidate-list";
  list.setAttribute("aria-label", "本轮候选、签数和中奖概率");
  for (const candidate of candidates) {
    const item = document.createElement("li");
    if (candidate.restaurantId === selectedRestaurantId) {
      item.classList.add("is-selected");
    }
    const number = document.createElement("span");
    number.className = `wheel-candidate-number sector-color-${
      ((candidate.number - 1) % 4) + 1
    }`;
    number.textContent = String(candidate.number);
    const detail = document.createElement("span");
    detail.className = "wheel-candidate-detail";
    const name = document.createElement("strong");
    name.textContent = candidate.name;
    const probability = document.createElement("span");
    probability.textContent = `${candidate.tickets} 张签 · ${candidate.probabilityLabel}`;
    detail.append(name, probability);
    item.append(number, detail);
    if (candidate.restaurantId === selectedRestaurantId) {
      const selected = document.createElement("strong");
      selected.className = "wheel-selected-label";
      selected.textContent = "本次选中";
      item.appendChild(selected);
    }
    list.appendChild(item);
  }
  return list;
}

function createWheelResult(
  model: Extract<WheelPopupModel, { kind: "result" }>
): HTMLElement {
  const result = document.createElement("div");
  result.className = "wheel-result";

  const eyebrow = document.createElement("p");
  eyebrow.className = "wheel-result-eyebrow";
  eyebrow.textContent = model.accepted ? "今天的午饭已选定" : "本轮抽签结果";
  const title = document.createElement("h2");
  title.id = "wheel-result-title";
  title.className = "wheel-result-title";
  title.tabIndex = -1;
  title.textContent = model.selected.name;
  const card = document.createElement("section");
  card.className = "wheel-result-card";
  card.append(eyebrow, title);

  if (model.selected.dish) {
    const dish = document.createElement("p");
    dish.className = "wheel-result-dish";
    dish.textContent = model.selected.dish;
    card.appendChild(dish);
  }
  if (model.selected.distanceLabel) {
    const distance = document.createElement("p");
    distance.className = "wheel-result-meta";
    distance.textContent = model.selected.distanceLabel;
    card.appendChild(distance);
  }
  const reasonLabel = document.createElement("strong");
  reasonLabel.className = "wheel-result-reason-label";
  reasonLabel.textContent = "推荐 / 中奖理由";
  const reason = document.createElement("p");
  reason.className = "wheel-result-reason";
  reason.textContent = model.selected.reason;
  card.append(reasonLabel, reason);
  if (model.selected.tags.length > 0) {
    const tags = document.createElement("div");
    tags.className = "chips wheel-result-tags";
    for (const value of model.selected.tags) {
      const tag = document.createElement("span");
      tag.className = "chip";
      tag.textContent = value;
      tags.appendChild(tag);
    }
    card.appendChild(tags);
  }
  if (model.selected.recentVisitLabel) {
    const recent = document.createElement("p");
    recent.className = "wheel-result-history";
    recent.textContent = model.selected.recentVisitLabel;
    card.appendChild(recent);
  }
  result.appendChild(card);

  if (model.acceptError) {
    const error = document.createElement("p");
    error.id = "wheel-accept-error";
    error.className = "field-error wheel-accept-error";
    error.textContent = model.acceptError;
    result.appendChild(error);
  }

  const actions = document.createElement("div");
  actions.className = "wheel-result-actions";
  const accept = createButton(model.acceptLabel, "button primary");
  accept.disabled = !model.canAccept;
  accept.setAttribute("aria-busy", String(model.accepting));
  if (model.acceptError) {
    accept.setAttribute("aria-describedby", "wheel-accept-error");
  }
  accept.addEventListener("click", () => {
    runWheelAction("accept", async () => {
      await wheelController?.acceptSelected();
    });
  });
  actions.appendChild(accept);

  if (model.canReroll && model.rerollLabel) {
    const reroll = createButton(model.rerollLabel, "button secondary");
    reroll.addEventListener("click", () => {
      runWheelAction("spin", async () => {
        await wheelSpinLifecycle?.start();
      });
    });
    actions.appendChild(reroll);
  }
  result.appendChild(actions);

  if (model.canExclude) {
    const exclude = createButton(
      "从本次转盘排除此餐厅",
      "wheel-exclude-button"
    );
    exclude.addEventListener("click", () => {
      runWheelAction("exclude", async () => {
        await wheelController?.excludeSelected();
      });
    });
    result.appendChild(exclude);
  }
  if (
    model.spinNumber >= 2
    && !model.accepted
    && !model.acceptancePending
  ) {
    const exhausted = document.createElement("p");
    exhausted.className = "wheel-exhausted-note";
    exhausted.textContent = "本轮的两次抽签机会已经用完。";
    result.appendChild(exhausted);
  }
  if (model.accepted) {
    const accepted = document.createElement("p");
    accepted.className = "wheel-result-confirmation";
    accepted.textContent = "已记录为你今天的午饭选择。";
    result.appendChild(accepted);
  }

  const probabilityDetails = document.createElement("details");
  probabilityDetails.className = "wheel-probability-details";
  const summary = document.createElement("summary");
  summary.textContent = "查看本轮候选与真实概率";
  const mode = document.createElement("p");
  mode.textContent = model.mode === "weighted"
    ? "懂你一点：按推荐分使用 1–3 张签轻度加权。"
    : "纯手气：每家餐厅使用相同签数。";
  probabilityDetails.append(
    summary,
    mode,
    createWheelCandidateList(model.candidates, model.selected.restaurantId)
  );
  result.appendChild(probabilityDetails);
  return result;
}

function createStrongText(text: string): HTMLElement {
  const strong = document.createElement("strong");
  strong.textContent = text;
  return strong;
}

function wheelPoolSignature(state: LuckyWheelControllerState): string | null {
  if (!("candidates" in state)) return null;
  return [
    state.mode,
    ...state.candidates.map(({ restaurantId, tickets }) => (
      `${restaurantId}:${tickets}`
    ))
  ].join("|");
}

function runWheelAction(
  action: WheelPendingAction,
  task: () => Promise<void>
): void {
  if (actionGate.isPending()) return;
  wheelPendingAction = action;
  void actionGate.run(task).catch(() => {
    setStatus("转盘操作失败，请重试。");
  });
}

function focusWheelSurfaceHeading(): void {
  popupContent.querySelector<HTMLElement>("#lucky-wheel-title")?.focus();
}

function focusCurrentExperienceEntry(): void {
  popupContent
    .querySelector<HTMLButtonElement>(".experience-card[aria-pressed='true']")
    ?.focus();
}

function focusWheelPrimaryControl(): void {
  const spin = popupContent.querySelector<HTMLButtonElement>(
    ".wheel-spin-button:not(:disabled)"
  );
  if (spin) {
    spin.focus();
  } else {
    focusWheelSurfaceHeading();
  }
}

function focusWheelResultAfterAcceptance(
  state: Extract<LuckyWheelControllerState, { kind: "result" }>
): void {
  popupContent.querySelector<HTMLElement>("#wheel-result-title")?.focus();
  const model = toWheelPopupModel(state);
  if (model.kind !== "result" || model.acceptError) return;
  setWheelAnnouncement(model.status);
}

function focusAndAnnounceWheelResult(): void {
  const state = wheelController?.getState();
  if (!state || state.kind !== "result") return;
  const model = toWheelPopupModel(state);
  if (model.kind !== "result") return;
  popupContent.querySelector<HTMLElement>("#wheel-result-title")?.focus();
  setWheelAnnouncement(
    model.source === "restored" && !model.accepted
      ? `已恢复上次的抽签结果：${model.selected.name}。`
      : model.status
  );
}

function setWheelAnnouncement(text: string): void {
  popupStatus.classList.add("visually-hidden");
  popupStatus.textContent = text;
}

function renderDisconnected(): void {
  const panel = createStatePanel(
    "先连接一个午饭小组",
    "连接后就能看到团队今天的 2–3 个午饭选择。"
  );
  panel.appendChild(createSettingsButton("去设置连接"));
  popupContent.appendChild(panel);
}

function renderGenerate(
  state: Extract<PopupViewState, { kind: "no-current-batch" }>
): void {
  const panel = createStatePanel(
    "今天还没有推荐",
    `${state.group.name} 还没有生成今天的推荐，生成后会保留为小组的当前批次。`
  );
  const button = createButton("生成今日推荐", "button primary");
  button.addEventListener("click", () => {
    runExclusive(() => runRecommendationRefresh(
      button,
      "正在生成...",
      "今日推荐已生成。",
      "生成推荐失败，请重试。"
    ));
  });
  panel.appendChild(button);
  popupContent.appendChild(panel);
}

function renderEmpty(
  state: Extract<PopupViewState, { kind: "empty" }>
): void {
  renderRecommendationContext(state.response);
  renderEmptyRecommendationLibrary();
}

function renderQuickAddForm(hostState: QuickAddHostState): void {
  popupContent.replaceChildren();
  popupStatus.replaceChildren();
  popupActions.hidden = true;

  const header = document.createElement("div");
  header.className = "quick-add-header";
  const cancelButton = createButton("← 取消", "detail-back");
  cancelButton.addEventListener("click", () => renderPopup(hostState));
  const title = document.createElement("h2");
  title.textContent = "加个新店进干饭名单";
  const hint = document.createElement("p");
  hint.textContent = "保存餐厅和第一条真实推荐，带 * 的内容必填。";
  header.append(cancelButton, title, hint);

  const form = document.createElement("form");
  form.className = "quick-add-form";
  form.noValidate = true;

  const name = createQuickAddInput("店名", "name", {
    required: true,
    placeholder: "例如：老王炒饭店"
  });
  const area = createQuickAddInput("区域", "area", {
    placeholder: "例如：B 楼美食街"
  });
  const cuisine = createQuickAddInput("分类", "cuisine", {
    placeholder: "例如：面食"
  });
  const averagePriceCents = createQuickAddInput("人均（元）", "averagePriceCents", {
    inputMode: "decimal",
    min: "0",
    placeholder: "例如：28",
    step: "0.01",
    type: "number"
  });
  const distanceMinutes = createQuickAddInput("步行分钟", "distanceMinutes", {
    inputMode: "numeric",
    min: "0",
    placeholder: "例如：8",
    step: "1",
    type: "number"
  });
  const dish = createQuickAddInput("推荐菜", "dish", {
    required: true,
    placeholder: "例如：红烧牛肉面"
  });
  const reason = createQuickAddTextarea(
    "一句话推荐理由",
    "reason",
    "为什么值得吃？适合什么天气或场景？"
  );

  const restaurantGrid = document.createElement("div");
  restaurantGrid.className = "field-grid";
  restaurantGrid.append(
    area.field,
    cuisine.field,
    averagePriceCents.field,
    distanceMinutes.field
  );

  const fieldError = document.createElement("p");
  fieldError.className = "field-error";
  fieldError.setAttribute("role", "alert");
  fieldError.hidden = true;

  const partialSuccess = document.createElement("section");
  partialSuccess.className = "partial-success";
  partialSuccess.hidden = true;

  const submitButton = createButton("加入干饭名单", "button primary");
  submitButton.type = "submit";
  submitButton.classList.add("quick-add-submit");

  form.append(
    name.field,
    restaurantGrid,
    createTagPicker("餐厅标签", "restaurantTags", RESTAURANT_TAG_OPTIONS),
    dish.field,
    reason.field,
    createTagPicker("适合天气", "weatherTags", WEATHER_TAG_OPTIONS),
    createTagPicker("适合星期", "weekdayTags", WEEKDAY_TAG_OPTIONS),
    createTagPicker("适合心情 / 场景", "moodTags", MOOD_TAG_OPTIONS),
    fieldError,
    partialSuccess,
    submitButton
  );
  popupContent.append(header, form);

  const updateControls = (state: QuickAddState): void => {
    applyQuickAddControls(state, {
      cancelButton,
      fields: Array.from(
        form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          "input, textarea"
        )
      ),
      partialSuccess,
      submitButton
    });
  };
  updateControls({ kind: "idle" });

  let controller: ReturnType<typeof createQuickAddController> | null = null;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const validationMessage = quickAddValidationMessage({
      name: name.input,
      averagePriceCents: averagePriceCents.input,
      distanceMinutes: distanceMinutes.input,
      dish: dish.input,
      reason: reason.input
    });
    if (validationMessage) {
      showQuickAddError(fieldError, validationMessage);
      return;
    }

    const input: QuickAddInput = {
      name: name.input.value,
      area: area.input.value,
      cuisine: cuisine.input.value,
      ...(averagePriceCents.input.value === ""
        ? {}
        : { averagePriceCents: Math.round(Number(averagePriceCents.input.value) * 100) }),
      ...(distanceMinutes.input.value === ""
        ? {}
        : { distanceMinutes: Number(distanceMinutes.input.value) }),
      tags: checkedValues(form, "restaurantTags"),
      dish: dish.input.value,
      reason: reason.input.value,
      weatherTags: checkedValues<WeatherTag>(form, "weatherTags"),
      weekdayTags: checkedValues<WeekdayTag>(form, "weekdayTags"),
      moodTags: checkedValues(form, "moodTags")
    };

    runExclusive(async () => {
      hideStatus();
      fieldError.hidden = true;
      updateControls({ kind: "submitting-restaurant" });
      submitButton.textContent = "正在保存餐厅...";

      let result: PopupActionContextResult<QuickAddState>;
      try {
        result = await runPopupActionWithContext(
          hostState,
          getStorageState,
          async (storage) => {
            controller ??= createQuickAddForStorage(storage, hostState);
            return controller.submit(input);
          }
        );
      } catch (error) {
        updateControls({ kind: "idle" });
        throw error;
      } finally {
        submitButton.textContent = "加入干饭名单";
      }

      if (result.kind === "stale") {
        await handleStalePopupAction(result);
        return;
      }
      if (!controller) throw new Error("quick_add_controller_missing");
      await handleQuickAddState(
        result.value,
        hostState,
        fieldError,
        partialSuccess,
        updateControls,
        controller
      );
    });
  });
}

function createQuickAddForStorage(
  storage: ExtensionStorageShape,
  hostState: QuickAddHostState
): ReturnType<typeof createQuickAddController> {
  const groupId = hostState.group.groupId;
  const token = storage.sessionsByGroupId[groupId]?.token;
  if (!token) throw new Error("quick_add_group_session_missing");
  const context: GroupApiContext = {
    apiBaseUrl: storage.apiBaseUrl,
    groupId,
    token
  };
  const requireCurrentContext = async (): Promise<void> => {
    const current = await getStorageState();
    if (
      current.apiBaseUrl !== storage.apiBaseUrl
      || current.identityId !== storage.identityId
      || !popupActionContextMatches(hostState, current)
    ) {
      throw new Error("quick_add_context_stale");
    }
  };
  return createQuickAddController({
    membershipId: hostState.group.membershipId,
    listRestaurants: async () => {
      await requireCurrentContext();
      return listGroupRestaurants(context);
    },
    createRestaurant: async (input) => {
      await requireCurrentContext();
      return createGroupRestaurant(context, input);
    },
    createRecommendation: async (input) => {
      await requireCurrentContext();
      return createGroupRecommendation(context, input);
    }
  });
}

async function handleQuickAddState(
  state: QuickAddState,
  hostState: QuickAddHostState,
  fieldError: HTMLElement,
  partialSuccess: HTMLElement,
  updateControls: (state: QuickAddState) => void,
  controller: ReturnType<typeof createQuickAddController>
): Promise<void> {
  partialSuccess.replaceChildren();
  updateControls(state);

  if (state.kind === "recovery") {
    fieldError.hidden = true;
    const message = document.createElement("p");
    message.textContent = state.message;
    const actions = document.createElement("div");
    actions.className = "partial-success-actions";
    const primaryButton = createButton(
      state.verdict === "confirmed-missing"
        ? state.target === "restaurant"
          ? "安全重试保存"
          : "安全重试推荐"
        : "重新核对",
      state.verdict === "confirmed-missing"
        ? "button primary"
        : "button secondary"
    );
    const finishButton = createButton("返回今日推荐", "button ghost");
    primaryButton.addEventListener("click", () => {
      runExclusive(async () => {
        updateControls({
          kind: "checking",
          target: state.target,
          verdict: "checking",
          ...(state.restaurantId ? { restaurantId: state.restaurantId } : {})
        });
        primaryButton.disabled = true;
        finishButton.disabled = true;
        const idleLabel = primaryButton.textContent ?? "";
        primaryButton.textContent = state.verdict === "confirmed-missing"
          ? "正在安全重试..."
          : "正在重新核对...";
        let result: PopupActionContextResult<QuickAddState>;
        try {
          result = await runPopupActionWithContext(
            hostState,
            getStorageState,
            () => state.verdict === "confirmed-missing"
              ? controller.retry()
              : controller.recheck()
          );
        } catch (error) {
          updateControls(state);
          throw error;
        } finally {
          primaryButton.textContent = idleLabel;
          primaryButton.disabled = false;
          finishButton.disabled = false;
        }
        if (result.kind === "stale") {
          await handleStalePopupAction(result);
          return;
        }
        await handleQuickAddState(
          result.value,
          hostState,
          fieldError,
          partialSuccess,
          updateControls,
          controller
        );
      });
    });
    finishButton.addEventListener("click", () => {
      runExclusive(async () => {
        await reloadPopup();
        setStatus(
          state.verdict === "uncertain"
            ? "写入结果仍未确认；已停止重试，请到餐厅库核对。"
            : "本次写入尚未完成。"
        );
      });
    });
    actions.append(primaryButton, finishButton);
    partialSuccess.append(message, actions);
    return;
  }
  if (state.kind === "complete") {
    await reloadPopup();
    setStatus("餐厅和推荐已保存。");
  }
}

function createQuickAddInput(
  labelText: string,
  name: string,
  options: {
    inputMode?: "decimal" | "numeric" | undefined;
    min?: string | undefined;
    placeholder?: string | undefined;
    required?: boolean | undefined;
    step?: string | undefined;
    type?: "number" | "text" | undefined;
  } = {}
): { field: HTMLLabelElement; input: HTMLInputElement } {
  const field = document.createElement("label");
  field.className = "quick-add-field";
  const label = document.createElement("span");
  label.className = "quick-add-label";
  label.textContent = options.required ? `${labelText} *` : labelText;
  const input = document.createElement("input");
  input.className = "quick-add-input";
  input.name = name;
  input.type = options.type ?? "text";
  input.required = options.required ?? false;
  if (options.inputMode) input.inputMode = options.inputMode;
  if (options.min) input.min = options.min;
  if (options.placeholder) input.placeholder = options.placeholder;
  if (options.step) input.step = options.step;
  field.append(label, input);
  return { field, input };
}

function createQuickAddTextarea(
  labelText: string,
  name: string,
  placeholder: string
): { field: HTMLLabelElement; input: HTMLTextAreaElement } {
  const field = document.createElement("label");
  field.className = "quick-add-field";
  const label = document.createElement("span");
  label.className = "quick-add-label";
  label.textContent = `${labelText} *`;
  const input = document.createElement("textarea");
  input.className = "quick-add-input quick-add-textarea";
  input.name = name;
  input.placeholder = placeholder;
  input.required = true;
  field.append(label, input);
  return { field, input };
}

function createTagPicker<T extends string>(
  labelText: string,
  name: string,
  options: ReadonlyArray<readonly [T, string]>
): HTMLFieldSetElement {
  const picker = document.createElement("fieldset");
  picker.className = "tag-picker";
  const legend = document.createElement("legend");
  legend.className = "quick-add-label";
  legend.textContent = labelText;
  const choices = document.createElement("div");
  choices.className = "tag-picker-options";
  for (const [value, labelTextValue] of options) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = name;
    input.value = value;
    const text = document.createElement("span");
    text.textContent = labelTextValue;
    label.append(input, text);
    choices.appendChild(label);
  }
  picker.append(legend, choices);
  return picker;
}

function checkedValues<T extends string = string>(
  form: HTMLFormElement,
  name: string
): T[] {
  return Array.from(
    form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)
  ).map((input) => input.value as T);
}

function quickAddValidationMessage(fields: {
  name: HTMLInputElement;
  averagePriceCents: HTMLInputElement;
  distanceMinutes: HTMLInputElement;
  dish: HTMLInputElement;
  reason: HTMLTextAreaElement;
}): string | null {
  if (!fields.name.value.trim()) return "请填写店名。";
  if (!fields.dish.value.trim()) return "请填写第一条推荐菜。";
  if (!fields.reason.value.trim()) return "请填写第一条推荐理由。";
  if (!fields.averagePriceCents.validity.valid) return "人均价格请填写不小于 0 的数字。";
  if (!fields.distanceMinutes.validity.valid) return "步行时间请填写不小于 0 的整数。";
  return null;
}

function showQuickAddError(element: HTMLElement, message: string): void {
  element.textContent = message;
  element.hidden = false;
}

function renderReady(
  state: Extract<PopupViewState, { kind: "ready" }>
): void {
  renderRecommendationContext(state.response);
  renderParticipationControls(state);
  if (state.participationUnavailable) {
    setStatus("参与状态暂时无法读取，推荐内容仍可查看和重试。");
  }
  renderRecommendations(state, false);
}

function renderReconnect(
  _state: Extract<PopupViewState, { kind: "session-expired" }>
): void {
  const panel = createStatePanel(
    "小组连接已过期",
    "请到设置页重新连接当前小组，再回来查看今天的推荐。"
  );
  panel.appendChild(createSettingsButton("重新连接"));
  popupContent.appendChild(panel);
}

function renderForbidden(
  _state: Extract<PopupViewState, { kind: "forbidden" }>
): void {
  const panel = createStatePanel(
    "无法访问当前小组",
    "你可能已被移出这个小组。请到设置页切换小组或重新加入。"
  );
  panel.appendChild(createSettingsButton("切换小组"));
  popupContent.appendChild(panel);
}

function renderError(message: string): void {
  const panel = createStatePanel("今天的推荐暂时没加载出来", message);
  const retryButton = createButton("重试", "button primary");
  retryButton.addEventListener("click", () => {
    runExclusive(() => retryPopup(retryButton));
  });
  panel.append(retryButton, createSettingsButton("打开设置"));
  popupContent.appendChild(panel);
}

function renderRecommendationContext(
  response: RecommendationState["response"]
): void {
  const context = document.createElement("div");
  context.className = "context-line";
  for (const text of [
    response.officeDate,
    `第 ${response.batchNo} 批`,
    `生成于 ${response.generatedAt}`
  ]) {
    const item = document.createElement("span");
    item.textContent = text;
    context.appendChild(item);
  }
  popupContent.appendChild(context);

  const question = document.createElement("h2");
  question.className = "hero-question";
  question.append("中午吃点", createAccentText("啥"), "呢？");
  popupContent.appendChild(question);

  if (response.weather?.summary || response.weatherUnavailable) {
    const weather = document.createElement("p");
    weather.className = "weather-note";
    weather.textContent = response.weather?.summary
      ?? "天气暂不可用，今天已按其他真实因素推荐。";
    popupContent.appendChild(weather);
  }

  const summary = response.participationSummary;
  const participation = document.createElement("p");
  participation.className = "participation-summary";
  participation.textContent = [
    `${summary.joiningCount} 人参与`,
    `${summary.decidedCount} 人已决定`,
    `${summary.awayCount} 人不吃`,
    `${summary.undecidedCount} 人待定`
  ].join(" · ");
  popupContent.appendChild(participation);
}

function renderParticipationControls(
  state: Extract<PopupViewState, { kind: "ready" }>
): void {
  const currentStatus = state.currentMember?.status ?? "undecided";
  const controls = document.createElement("div");
  controls.className = "participation-controls";
  const joiningButton = createButton(
    currentStatus === "joining" ? "已参与" : "今天参与",
    currentStatus === "joining" ? "button secondary selected" : "button secondary"
  );
  const awayButton = createButton(
    currentStatus === "away" ? "今天不吃 · 已记录" : "今天不吃",
    currentStatus === "away" ? "button ghost selected" : "button ghost"
  );
  const syncDisabledState = (pending: boolean): void => {
    joiningButton.disabled = pending || currentStatus === "joining";
    awayButton.disabled = pending || currentStatus === "away";
  };
  syncDisabledState(false);

  joiningButton.addEventListener("click", () => {
    runExclusive(() => updateParticipation(
      joiningButton,
      syncDisabledState,
      "joining",
      "已记录今天参与。"
    ));
  });
  awayButton.addEventListener("click", () => {
    runExclusive(() => updateParticipation(
      awayButton,
      syncDisabledState,
      "away",
      "已记录今天不吃。"
    ));
  });
  controls.append(joiningButton, awayButton);
  popupContent.appendChild(controls);

  if (currentStatus === "decided") {
    const decided = document.createElement("p");
    decided.className = "current-choice";
    decided.textContent = "你已经选好今天的午饭。";
    popupContent.appendChild(decided);
  }
}

function renderReadOnlyParticipationControls(): void {
  const controls = document.createElement("div");
  controls.className = "participation-controls";
  const joiningButton = createButton("今天参与", "button secondary");
  const awayButton = createButton("今天不吃", "button ghost");
  joiningButton.disabled = true;
  awayButton.disabled = true;
  controls.append(joiningButton, awayButton);
  popupContent.appendChild(controls);
}

function renderRecommendations(
  state: RecommendationState,
  readOnly: boolean
): void {
  const selected = state.response.items.find(
    (item) => item.restaurantId === selectedRestaurantId
  );
  if (selected) {
    popupContent.replaceChildren();
    popupActions.hidden = true;
    popupContent.appendChild(createRecommendationDetail(state, selected, readOnly));
    return;
  }
  selectedRestaurantId = null;

  if (readOnly) {
    setStatus("缓存内容仅供查看，写入操作已停用。你仍可重试或打开设置。");
    renderRecommendationContext(state.response);
    renderReadOnlyParticipationControls();
    popupContent.appendChild(createCacheRetryButton());
  }

  const recommendations = document.createElement("section");
  recommendations.className = "recommendations";
  recommendations.setAttribute("aria-label", "今日推荐");
  for (const item of state.response.items) {
    recommendations.appendChild(createRecommendationCard(item, state));
  }
  popupContent.appendChild(recommendations);
  if (state.response.items.length === 0) {
    renderEmptyRecommendationLibrary();
  }
}

function createRecommendationCard(
  item: GroupTodayRecommendationItem,
  state: RecommendationState
): HTMLElement {
  const card = recommendationCardTemplate.content.firstElementChild?.cloneNode(
    true
  );
  if (!(card instanceof HTMLElement)) {
    throw new Error("recommendation_card_template_missing");
  }
  const model = toRecommendationCardModel(item);
  const openButton = card.querySelector<HTMLButtonElement>(".card-open")!;
  openButton.dataset.restaurantId = item.restaurantId;
  card.querySelector<HTMLElement>(".rank")!.textContent = model.rankLabel;
  card.querySelector<HTMLElement>(".name")!.textContent = model.name;
  const dish = card.querySelector<HTMLElement>(".dish")!;
  dish.textContent = model.dish;
  dish.hidden = model.dish.length === 0;
  card.querySelector<HTMLElement>(".metadata")!.textContent = [
    model.distanceLabel,
    model.priceLabel,
    model.modeLabel,
    model.scoreLabel
  ].filter(Boolean).join(" · ");
  card.querySelector<HTMLElement>(".reason")!.textContent = model.reason;
  const chips = card.querySelector<HTMLElement>(".chips")!;
  for (const tag of model.tags) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = tag;
    chips.appendChild(chip);
  }
  openButton.addEventListener("click", () => {
    selectedRestaurantId = item.restaurantId;
    renderPopup(state);
    popupContent.querySelector<HTMLButtonElement>(".detail-back")?.focus();
  });
  return card;
}

function createRecommendationDetail(
  state: RecommendationState,
  item: GroupTodayRecommendationItem,
  readOnly: boolean
): HTMLElement {
  const model = toRecommendationCardModel(item);
  const detail = document.createElement("section");
  detail.className = "detail-panel";

  const backButton = createButton("← 返回今日推荐", "detail-back");
  backButton.addEventListener("click", () => {
    const originatingRestaurantId = item.restaurantId;
    selectedRestaurantId = null;
    renderPopup(state);
    const cardTargets = Array.from(
      popupContent.querySelectorAll<HTMLButtonElement>(".card-open")
    ).map((button) => ({
      restaurantId: button.dataset.restaurantId ?? "",
      focus: () => button.focus()
    }));
    restoreRecommendationFocus(
      cardTargets,
      originatingRestaurantId,
      { focus: () => settingsButton.focus() }
    );
  });
  detail.appendChild(backButton);

  const rank = document.createElement("span");
  rank.className = "rank";
  rank.textContent = model.rankLabel;
  const name = document.createElement("h2");
  name.className = "detail-name";
  name.textContent = model.name;
  detail.append(rank, name);

  if (model.dish) {
    const dish = document.createElement("p");
    dish.className = "detail-dish";
    dish.textContent = model.dish;
    detail.appendChild(dish);
  }

  const metadata = document.createElement("p");
  metadata.className = "detail-metadata";
  metadata.textContent = [
    model.distanceLabel,
    model.priceLabel,
    model.modeLabel
  ].filter(Boolean).join(" · ");
  detail.appendChild(metadata);

  if (model.tags.length > 0) {
    const chips = document.createElement("div");
    chips.className = "chips";
    for (const tag of model.tags) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = tag;
      chips.appendChild(chip);
    }
    detail.appendChild(chips);
  }

  const reasonTitle = document.createElement("strong");
  reasonTitle.textContent = "推荐理由";
  const reason = document.createElement("p");
  reason.className = "detail-reason";
  reason.textContent = model.reason;
  detail.append(reasonTitle, reason);

  const scoreTitle = document.createElement("div");
  scoreTitle.className = "detail-heading";
  const scoreLabel = document.createElement("strong");
  scoreLabel.textContent = "推荐分数";
  const scoreValue = document.createElement("span");
  scoreValue.textContent = model.scoreLabel;
  scoreTitle.append(scoreLabel, scoreValue);
  detail.appendChild(scoreTitle);

  const scoreGrid = document.createElement("div");
  scoreGrid.className = "score-grid";
  for (const row of scoreBreakdownRows(item)) {
    const label = document.createElement("span");
    label.textContent = row.label;
    const value = document.createElement("strong");
    value.textContent = row.value > 0 ? `+${row.value}` : String(row.value);
    scoreGrid.append(label, value);
  }
  detail.appendChild(scoreGrid);

  if (readOnly) {
    const note = document.createElement("p");
    note.className = "read-only-note";
    note.textContent = "缓存内容仅供查看";
    detail.append(note, createCacheRetryButton());
  }

  const feedbackTitle = document.createElement("strong");
  feedbackTitle.textContent = "这家怎么样？";
  const feedback = document.createElement("div");
  feedback.className = "feedback-grid";
  for (const [type, label] of [
    ["want", "想吃"],
    ["skip", "不想吃"],
    ["ate", "已吃过"],
    ["avoid", "避雷"]
  ] as const) {
    const button = createButton(label, "button ghost feedback-button");
    button.disabled = readOnly;
    if (!readOnly) {
      button.addEventListener("click", () => {
        runExclusive(() => submitFeedback(button, state, item, type));
      });
    }
    feedback.appendChild(button);
  }
  detail.append(feedbackTitle, feedback);

  const alreadyDecided = state.kind === "ready"
    && state.currentMember?.status === "decided"
    && state.currentMember.restaurantId === item.restaurantId;
  const decideButton = createButton(
    alreadyDecided ? "已决定，就是这家" : "就决定是你了",
    "button primary decision-button"
  );
  decideButton.disabled = readOnly || alreadyDecided;
  if (!decideButton.disabled) {
    decideButton.addEventListener("click", () => {
      runExclusive(() => submitDecision(decideButton, item));
    });
  }
  detail.appendChild(decideButton);
  return detail;
}

async function updateParticipation(
  button: HTMLButtonElement,
  syncDisabledState: (pending: boolean) => void,
  status: ParticipationStatus,
  successMessage: string
): Promise<void> {
  const renderedState = currentState;
  let result: PopupActionContextResult<PutParticipationTodayResponse>
    | undefined;
  await runButtonAction({
    button,
    pendingText: "记录中...",
    successText: "已记录",
    failureMessage: "记录参与状态失败，请重试。",
    action: async () => {
      result = await runPopupActionWithContext(
        renderedState,
        getStorageState,
        (storage) => putTodayParticipationForStorage(storage, { status })
      );
    },
    onStart: () => {
      hideStatus();
      syncDisabledState(true);
    },
    onFailure: handlePopupActionFailure
  });

  if (!result) {
    syncDisabledState(false);
    return;
  }
  if (result.kind === "stale") {
    await handleStalePopupAction(result);
    return;
  }
  if (renderedState.kind === "ready") {
    currentState = applyParticipationUpdate(renderedState, result.value);
    renderPopup(currentState);
    setStatus(
      currentState.kind === "ready"
        ? successMessage
        : "操作结果无法确认，请重试。"
    );
  }
}

async function submitFeedback(
  button: HTMLButtonElement,
  state: RecommendationState,
  item: GroupTodayRecommendationItem,
  type: FeedbackType
): Promise<void> {
  let result: PopupActionContextResult<void> | undefined;
  await runButtonAction({
    button,
    pendingText: "提交中...",
    successText: "已记录",
    failureMessage: "记录反馈失败，请重试。",
    action: async () => {
      result = await runPopupActionWithContext(
        state,
        getStorageState,
        (storage) => postFeedbackForStorage(storage, {
          date: state.response.officeDate,
          restaurantId: item.restaurantId,
          ...(item.recommendationId
            ? { recommendationId: item.recommendationId }
            : {}),
          type
        })
      );
    },
    onStart: hideStatus,
    onFailure: handlePopupActionFailure
  });
  if (!result) return;
  if (result.kind === "stale") {
    await handleStalePopupAction(result);
    return;
  }
  setStatus("反馈已记录。");
}

async function submitDecision(
  button: HTMLButtonElement,
  item: GroupTodayRecommendationItem
): Promise<void> {
  const renderedState = currentState;
  let result: PopupActionContextResult<PutParticipationTodayResponse>
    | undefined;
  await runButtonAction({
    button,
    pendingText: "提交中...",
    successText: "已决定",
    failureMessage: "记录决定失败，请重试。",
    action: async () => {
      result = await runPopupActionWithContext(
        renderedState,
        getStorageState,
        (storage) => putTodayParticipationForStorage(storage, {
          status: "decided",
          restaurantId: item.restaurantId,
          ...(item.recommendationId
            ? { recommendationId: item.recommendationId }
            : {})
        })
      );
    },
    onStart: hideStatus,
    onFailure: handlePopupActionFailure
  });
  if (!result) return;
  if (result.kind === "stale") {
    await handleStalePopupAction(result);
    return;
  }
  if (renderedState.kind === "ready") {
    currentState = applyParticipationUpdate(renderedState, result.value);
    renderPopup(currentState);
    setStatus(
      currentState.kind === "ready"
        ? "今天的午饭决定已记录。"
        : "操作结果无法确认，请重试。"
    );
  }
}

async function runRecommendationRefresh(
  button: HTMLButtonElement,
  pendingText: string,
  successMessage: string,
  failureMessage: string
): Promise<void> {
  const renderedState = currentState;
  let result: PopupActionContextResult<PopupViewState> | undefined;
  await runButtonAction({
    button,
    pendingText,
    successText: "已更新",
    failureMessage,
    action: async () => {
      result = await runPopupActionWithContext(
        renderedState,
        getStorageState,
        (storage) => loadRefreshedPopupStateForStorage(storage, {
          loadStorage: getStorageState,
          loadRecommendations:
            fetchGroupTodayRecommendationsWithCacheFallbackForStorage,
          loadParticipation: fetchTodayParticipationForStorage,
          loadCapabilities: fetchGroupCapabilitiesForStorage,
          refreshRecommendations: refreshGroupTodayRecommendationsForStorage
        })
      );
    },
    onStart: hideStatus,
    onFailure: handlePopupActionFailure
  });
  if (!result) return;
  if (result.kind === "stale") {
    await handleStalePopupAction(result);
    return;
  }

  currentState = result.value;
  selectedRestaurantId = null;
  renderPopup(currentState);
  if (currentState.kind === "ready" || currentState.kind === "empty") {
    setStatus(successMessage);
  }
}

function createCacheRetryButton(): HTMLButtonElement {
  const button = createButton("重试获取最新推荐", "button secondary cache-retry");
  button.addEventListener("click", () => {
    runExclusive(() => retryPopup(button));
  });
  return button;
}

async function retryPopup(button: HTMLButtonElement): Promise<void> {
  let retryState: PopupViewState | undefined;
  await runButtonAction({
    button,
    pendingText: "重试中...",
    successText: "已重试",
    failureMessage: "重试失败，请重试。",
    action: async () => {
      retryState = await loadCurrentPopupState();
    },
    onStart: hideStatus,
    onFailure: handlePopupActionFailure
  });
  if (!retryState) return;

  currentState = retryState;
  renderPopup(currentState);
  const outcome = classifyPopupRetryOutcome(retryState);
  if (outcome.announcement) setStatus(outcome.announcement);
}

function renderEmptyRecommendationLibrary(): void {
  popupContent.appendChild(createStatePanel(
    "暂时没有可推荐的饭馆",
    "给小组加几家真实饭馆和推荐理由，再回来生成午饭选择。"
  ));
}

function createStatePanel(
  titleText: string,
  bodyText: string
): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "state-panel";
  const title = document.createElement("h2");
  title.textContent = titleText;
  const body = document.createElement("p");
  body.textContent = bodyText;
  panel.append(title, body);
  return panel;
}

function createSettingsButton(label: string): HTMLButtonElement {
  const button = createButton(label, "button secondary");
  button.addEventListener("click", openSettings);
  return button;
}

function createButton(label: string, className: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  return button;
}

function createAccentText(text: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.textContent = text;
  return span;
}

function openSettings(): void {
  void chrome.runtime.openOptionsPage();
}

function runExclusive(action: () => Promise<void>): void {
  void actionGate.run(action).catch(() => {
    setStatus("操作失败，请重试。");
  });
}

function handlePopupActionFailure(
  safeMessage: string,
  error: unknown
): void {
  const resolution = resolvePopupActionFailure(
    currentState,
    error,
    safeMessage
  );
  if (resolution.kind === "message") {
    setStatus(resolution.message);
    return;
  }

  currentState = resolution.state;
  selectedRestaurantId = null;
  renderPopup(currentState);
}

async function handleStalePopupAction(
  result: Extract<PopupActionContextResult<unknown>, { kind: "stale" }>
): Promise<void> {
  selectedRestaurantId = null;
  const reloadedState = await reloadPopup(result.storage);
  const finalStatus = composeStaleReloadStatus(reloadedState, result.message);
  if (finalStatus && popupStatus.textContent !== finalStatus) {
    setStatus(finalStatus);
  }
}

function hideStatus(): void {
  popupStatus.classList.remove("visually-hidden");
  popupStatus.replaceChildren();
}

function setStatus(text: string): void {
  popupStatus.classList.remove("visually-hidden");
  popupStatus.textContent = text;
}
