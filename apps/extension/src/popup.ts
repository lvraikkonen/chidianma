import type {
  FeedbackType,
  GroupTodayRecommendationItem,
  ParticipationStatus,
  PutParticipationTodayResponse
} from "@lunch/shared";
import {
  applyParticipationUpdate,
  classifyPopupRetryOutcome,
  loadRefreshedPopupStateForStorage,
  loadPopupState,
  loadPopupStateForStorage,
  resolvePopupActionFailure,
  restoreRecommendationFocus,
  runPopupActionWithContext,
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
import { getStorageState, type ExtensionStorageShape } from "./storage";
import { createExclusiveActionGate, runButtonAction } from "./uiAction";

type RecommendationState = Extract<
  PopupViewState,
  { kind: "ready" | "cached" }
>;

const activeGroupName = document.querySelector<HTMLElement>(
  "#active-group-name"
)!;
const popupStatus = document.querySelector<HTMLElement>("#popup-status")!;
const popupContent = document.querySelector<HTMLElement>("#popup-content")!;
const popupActions = document.querySelector<HTMLElement>("#popup-actions")!;
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh")!;
const settingsButton = document.querySelector<HTMLButtonElement>(
  "#open-settings"
)!;
const recommendationCardTemplate = document.querySelector<HTMLTemplateElement>(
  "#recommendation-card-template"
)!;

let currentState: PopupViewState = { kind: "disconnected" };
let selectedRestaurantId: string | null = null;
const actionGate = createExclusiveActionGate();

settingsButton.addEventListener("click", openSettings);
refreshButton.addEventListener("click", () => {
  runExclusive(() => runRecommendationRefresh(
    refreshButton,
    "正在换一批...",
    "今日推荐已更新。",
    "刷新推荐失败，请重试。"
  ));
});

void reloadPopup();

async function reloadPopup(
  storage?: ExtensionStorageShape
): Promise<PopupViewState> {
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
    loadParticipation: fetchTodayParticipationForStorage
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
  activeGroupName.textContent =
    "group" in state && state.group ? state.group.name : "";
  popupActions.hidden = state.kind !== "ready" && state.kind !== "empty";
  refreshButton.disabled = false;
  refreshButton.textContent = "换一批";
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

  const question = document.createElement("h1");
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
  const name = document.createElement("h1");
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

function createStatePanel(titleText: string, bodyText: string): HTMLElement {
  const panel = document.createElement("section");
  panel.className = "state-panel";
  const title = document.createElement("h1");
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
  await reloadPopup(result.storage);
  setStatus(result.message);
}

function hideStatus(): void {
  popupStatus.replaceChildren();
}

function setStatus(text: string): void {
  popupStatus.textContent = text;
}
