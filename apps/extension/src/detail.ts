import type {
  FeedbackType,
  GroupTodayRecommendationItem,
  PutParticipationTodayResponse,
  RecommendationSummary
} from "@lunch/shared";
import { classifyPopupError } from "./popupController";
import {
  applyDetailDecisionUpdate,
  loadDetailState,
  mergeDetailAnnouncement,
  runDetailActionWithContext,
  type DetailActionContextResult,
  type DetailItem,
  type DetailRecommendationState,
  type DetailViewState
} from "./detailController";
import { listGroupRestaurants, type GroupApiContext } from "./groupClient";
import {
  fetchGroupTodayRecommendationsWithCacheFallbackForStorage,
  postFeedbackForStorage,
  putTodayParticipationForStorage
} from "./recommendationClient";
import {
  scoreBreakdownRows,
  toRecommendationCardModel
} from "./recommendationViewModel";
import { getStorageState } from "./storage";
import { createExclusiveActionGate, runButtonAction } from "./uiAction";

const status = document.querySelector<HTMLElement>("#detail-status")!;
const content = document.querySelector<HTMLElement>("#detail-content")!;
const settingsButton = document.querySelector<HTMLButtonElement>(
  "#detail-settings"
)!;
const restaurantId = new URLSearchParams(location.search).get("restaurantId")
  ?? undefined;
const actionGate = createExclusiveActionGate({
  onPendingChange: syncWriteActionButtons
});

settingsButton.addEventListener("click", openSettings);
void reloadDetail();

async function reloadDetail(announcement?: string): Promise<void> {
  content.replaceChildren();
  status.textContent = "正在加载推荐详情...";
  const state = await loadCurrentDetailState();
  renderDetailState(state);
  if (announcement) {
    status.textContent = mergeDetailAnnouncement(state, announcement);
  }
}

async function loadCurrentDetailState(): Promise<DetailViewState> {
  try {
    const storage = await getStorageState();
    const groupId = storage.activeGroupId;
    const group = groupId ? storage.groupSummariesById[groupId] : undefined;
    const token = groupId
      ? storage.sessionsByGroupId[groupId]?.token
      : undefined;
    if (!groupId || !group || !token) return { kind: "disconnected" };

    const context: GroupApiContext = {
      apiBaseUrl: storage.apiBaseUrl,
      groupId,
      token
    };
    return loadDetailState({
      loadRecommendations: () =>
        fetchGroupTodayRecommendationsWithCacheFallbackForStorage(storage),
      loadRestaurants: () => listGroupRestaurants(context)
    }, restaurantId);
  } catch {
    return {
      kind: "error",
      message: "暂时无法加载推荐详情，请重试。",
      retryable: true
    };
  }
}

function renderDetailState(state: DetailViewState): void {
  content.replaceChildren();
  status.replaceChildren();
  if (state.kind === "disconnected") {
    renderRecoveryState(
      "请先在设置中连接小组。",
      createSettingsButton()
    );
    return;
  }
  if (state.kind === "no-current-batch") {
    const link = document.createElement("a");
    link.href = "index.html";
    link.textContent = "打开插件生成推荐";
    renderRecoveryState("今天还没有生成推荐。", link);
    return;
  }
  if (state.kind === "session-expired") {
    renderRecoveryState(
      "当前小组连接已失效，请在设置中重新连接。",
      createSettingsButton()
    );
    return;
  }
  if (state.kind === "forbidden") {
    renderRecoveryState(
      "你已被移出当前小组，请在设置中选择其他小组。",
      createSettingsButton()
    );
    return;
  }
  if (state.kind === "error") {
    const retryButton = state.retryable
      ? createButton("重试", "detail-retry")
      : undefined;
    retryButton?.addEventListener("click", () => {
      void reloadDetail();
    });
    renderRecoveryState(state.message, retryButton);
    return;
  }

  status.textContent = state.readOnly
    ? "缓存内容仅供查看"
    : state.response.weather?.summary
      ?? "今天先按距离、星期和同事推荐来挑。";

  if (state.items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "detail-error";
    empty.textContent = "今天还没有可用推荐。";
    content.appendChild(empty);
    return;
  }

  for (const detailItem of state.items) {
    content.appendChild(createExpandedCard(detailItem, state));
  }
  syncWriteActionButtons(actionGate.isPending());
}

function renderRecoveryState(
  message: string,
  control?: HTMLElement
): void {
  const panel = document.createElement("section");
  panel.className = "detail-error";
  const copy = document.createElement("p");
  copy.textContent = message;
  panel.appendChild(copy);
  if (control) panel.appendChild(control);
  content.appendChild(panel);
}

function createExpandedCard(
  detailItem: DetailItem,
  state: DetailRecommendationState
): HTMLElement {
  const { item, recommendations } = detailItem;
  const model = toRecommendationCardModel(item);
  const card = document.createElement("article");
  card.className = "expanded-card";

  const rank = document.createElement("span");
  rank.textContent = model.rankLabel;
  const title = document.createElement("h2");
  title.textContent = model.name;
  card.append(rank, title);

  if (model.dish) {
    const dish = document.createElement("p");
    dish.textContent = model.dish;
    card.appendChild(dish);
  }

  const metadata = document.createElement("p");
  metadata.className = "expanded-meta";
  metadata.textContent = [
    model.distanceLabel,
    model.priceLabel,
    model.modeLabel
  ].filter(Boolean).join(" · ");
  card.appendChild(metadata);

  if (model.tags.length > 0) {
    const tags = document.createElement("p");
    tags.className = "expanded-meta";
    tags.textContent = model.tags.join(" · ");
    card.appendChild(tags);
  }

  const reasonTitle = document.createElement("strong");
  reasonTitle.textContent = "推荐理由";
  const reason = document.createElement("p");
  reason.textContent = model.reason;
  card.append(reasonTitle, reason);

  appendTeamRecommendations(card, recommendations);
  appendScoreBreakdown(card, item, model.scoreLabel);
  if (state.kind === "ready") appendWriteActions(card, state, item);
  return card;
}

function appendTeamRecommendations(
  card: HTMLElement,
  recommendations: RecommendationSummary[]
): void {
  if (recommendations.length === 0) return;
  const title = document.createElement("strong");
  title.textContent = "小组推荐";
  const list = document.createElement("ul");
  for (const recommendation of recommendations) {
    const entry = document.createElement("li");
    entry.textContent = [recommendation.dish, recommendation.reason]
      .filter(Boolean)
      .join("：");
    list.appendChild(entry);
  }
  card.append(title, list);
}

function appendScoreBreakdown(
  card: HTMLElement,
  item: GroupTodayRecommendationItem,
  scoreLabel: string
): void {
  const title = document.createElement("strong");
  title.textContent = `推荐分数 ${scoreLabel}`;
  const grid = document.createElement("div");
  grid.className = "score-grid";
  for (const row of scoreBreakdownRows(item)) {
    const label = document.createElement("span");
    label.textContent = row.label;
    const value = document.createElement("strong");
    value.textContent = row.value > 0 ? `+${row.value}` : String(row.value);
    grid.append(label, value);
  }
  card.append(title, grid);
}

function appendWriteActions(
  card: HTMLElement,
  state: Extract<DetailViewState, { kind: "ready" }>,
  item: GroupTodayRecommendationItem
): void {
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
    const button = createButton(label, "feedback-button");
    button.dataset.writeAction = "true";
    button.addEventListener("click", () => {
      runExclusive(() => submitFeedback(button, state, item, type));
    });
    feedback.appendChild(button);
  }

  const alreadyDecided = state.decidedRestaurantId === item.restaurantId;
  const decideButton = createButton(
    alreadyDecided ? "已决定，就是这家" : "就决定是你了",
    "decision-button"
  );
  decideButton.disabled = alreadyDecided;
  if (!alreadyDecided) {
    decideButton.dataset.writeAction = "true";
    decideButton.addEventListener("click", () => {
      runExclusive(() => submitDecision(decideButton, state, item));
    });
  }
  card.append(feedbackTitle, feedback, decideButton);
}

async function submitFeedback(
  button: HTMLButtonElement,
  renderedState: Extract<DetailViewState, { kind: "ready" }>,
  item: GroupTodayRecommendationItem,
  type: FeedbackType
): Promise<void> {
  let result: DetailActionContextResult<void> | undefined;
  await runButtonAction({
    button,
    pendingText: "提交中...",
    successText: "已记录",
    failureMessage: "记录反馈失败，请重试。",
    action: async () => {
      result = await runDetailActionWithContext(
        renderedState,
        getStorageState,
        (storage) => postFeedbackForStorage(storage, {
          date: renderedState.response.officeDate,
          restaurantId: item.restaurantId,
          ...(item.recommendationId
            ? { recommendationId: item.recommendationId }
            : {}),
          type
        })
      );
    },
    onStart: () => status.replaceChildren(),
    onFailure: handleActionFailure
  });
  if (!result) return;
  if (result.kind === "stale") {
    await reloadDetail(result.message);
    return;
  }
  status.textContent = "反馈已记录。";
}

async function submitDecision(
  button: HTMLButtonElement,
  renderedState: Extract<DetailViewState, { kind: "ready" }>,
  item: GroupTodayRecommendationItem
): Promise<void> {
  let result: DetailActionContextResult<PutParticipationTodayResponse>
    | undefined;
  await runButtonAction({
    button,
    pendingText: "提交中...",
    successText: "已决定",
    failureMessage: "记录决定失败，请重试。",
    action: async () => {
      result = await runDetailActionWithContext(
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
    onStart: () => status.replaceChildren(),
    onFailure: handleActionFailure
  });
  if (!result) return;
  if (result.kind === "stale") {
    await reloadDetail(result.message);
    return;
  }
  const nextState = applyDetailDecisionUpdate(renderedState, result.value);
  if (nextState === renderedState) {
    await reloadDetail("操作结果无法确认，已重新加载当前详情。");
    return;
  }
  renderDetailState(nextState);
  status.textContent = "今天的午饭决定已记录。";
}

function handleActionFailure(message: string, error: unknown): void {
  const kind = classifyPopupError(error);
  if (kind === "session-expired") {
    renderDetailState({ kind });
    return;
  }
  if (kind === "forbidden") {
    renderDetailState({ kind });
    return;
  }
  status.textContent = message;
}

function syncWriteActionButtons(pending: boolean): void {
  content.querySelectorAll<HTMLButtonElement>(
    '[data-write-action="true"]'
  ).forEach((button) => {
    button.disabled = pending;
  });
}

function createSettingsButton(): HTMLButtonElement {
  const button = createButton("设置", "detail-settings-action");
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

function openSettings(): void {
  void chrome.runtime.openOptionsPage();
}

function runExclusive(action: () => Promise<void>): void {
  void actionGate.run(action).catch(() => {
    status.textContent = "操作失败，请重试。";
  });
}
