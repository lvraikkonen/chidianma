import type {
  GroupTodayRecommendationItem,
  RecommendationSummary
} from "@lunch/shared";
import {
  loadDetailState,
  mergeDetailAnnouncement,
  type DetailItem,
  type DetailViewState
} from "./detailController";
import {
  createDetailPageActionCoordinator,
  toDetailPageRenderModel,
  type DetailPageControl,
  type DetailPageRenderModel
} from "./detailPageController";
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

const status = document.querySelector<HTMLElement>("#detail-status")!;
const content = document.querySelector<HTMLElement>("#detail-content")!;
const settingsButton = document.querySelector<HTMLButtonElement>(
  "#detail-settings"
)!;
const restaurantId = new URLSearchParams(location.search).get("restaurantId")
  ?? undefined;
const actionCoordinator = createDetailPageActionCoordinator({
  loadStorage: getStorageState,
  postFeedback: postFeedbackForStorage,
  putParticipation: putTodayParticipationForStorage,
  reload: reloadDetail,
  render: renderDetailState,
  announce: (message) => {
    status.textContent = message;
  },
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
  const model = toDetailPageRenderModel(state);
  if (model.kind === "recovery") {
    renderRecoveryState(
      model.message,
      createRecoveryControl(model.control)
    );
    return;
  }

  status.textContent = model.status;

  if (model.state.items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "detail-error";
    empty.textContent = "今天还没有可用推荐。";
    content.appendChild(empty);
    return;
  }

  for (const detailItem of model.state.items) {
    content.appendChild(createExpandedCard(detailItem, model));
  }
  syncWriteActionButtons(actionCoordinator.isPending());
}

function createRecoveryControl(
  control?: DetailPageControl
): HTMLElement | undefined {
  if (!control) return undefined;
  if (control.kind === "settings") {
    return createSettingsButton(control.label);
  }
  if (control.kind === "index") {
    const link = document.createElement("a");
    link.href = control.href;
    link.textContent = control.label;
    return link;
  }
  const button = createButton(control.label, "detail-retry");
  button.addEventListener("click", () => {
    void reloadDetail();
  });
  return button;
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
  pageModel: Extract<DetailPageRenderModel, { kind: "recommendations" }>
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
  if (pageModel.canWrite && pageModel.state.kind === "ready") {
    appendWriteActions(card, pageModel.state, item);
  }
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
      void actionCoordinator.submitFeedback(state, item, type);
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
      void actionCoordinator.submitDecision(state, item);
    });
  }
  card.append(feedbackTitle, feedback, decideButton);
}

function syncWriteActionButtons(pending: boolean): void {
  content.querySelectorAll<HTMLButtonElement>(
    '[data-write-action="true"]'
  ).forEach((button) => {
    button.disabled = pending;
  });
}

function createSettingsButton(label: string): HTMLButtonElement {
  const button = createButton(label, "detail-settings-action");
  button.addEventListener("click", openSettings);
  return button;
}

function createButton(label: string, className: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button ${className}`;
  button.textContent = label;
  return button;
}

function openSettings(): void {
  void chrome.runtime.openOptionsPage();
}
