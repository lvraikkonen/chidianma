import type {
  GroupTodayRecommendationItem,
  GroupTodayRecommendationsResponse,
  RecommendationItem,
  TodayRecommendationResponse
} from "@lunch/shared";
import {
  decideTodayRecommendation,
  fetchTodayRecommendations,
  isGroupResponse,
  postFeedback,
  putTodayParticipation,
  refreshGroupTodayRecommendations,
  type ExtensionRecommendationResponse
} from "./recommendationClient";

const dateEl = document.querySelector<HTMLSpanElement>("#date")!;
const statusEl = document.querySelector<HTMLElement>("#status")!;
const weatherEl = document.querySelector<HTMLElement>("#weather")!;
const itemsEl = document.querySelector<HTMLElement>("#items")!;
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh")!;
const settingsButton = document.querySelector<HTMLButtonElement>("#settings")!;

refreshButton.addEventListener("click", () => {
  void renderRefresh();
});
settingsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

void render();

async function render() {
  setStatus("正在挑今天中午吃什么...");
  itemsEl.replaceChildren();

  try {
    const response = await fetchTodayRecommendations();
    renderResponse(response);
  } catch (error) {
    setStatus(`加载失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function renderRefresh() {
  setStatus("正在重新生成今日推荐...");
  itemsEl.replaceChildren();
  try {
    const response = await refreshGroupTodayRecommendations();
    renderGroupResponse(response);
  } catch (error) {
    setStatus(`刷新失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function renderResponse(response: ExtensionRecommendationResponse) {
  if (isGroupResponse(response)) {
    renderGroupResponse(response);
    return;
  }
  renderLegacyResponse(response);
}

function renderGroupResponse(response: GroupTodayRecommendationsResponse) {
  dateEl.textContent = response.fromCache
    ? `${response.officeDate}｜缓存`
    : response.officeDate;
  weatherEl.textContent =
    response.weather?.summary ?? "今天先按距离、星期和同事推荐来挑。";
  hideStatus();

  const participation = document.createElement("div");
  participation.className = "tags";

  const joinButton = document.createElement("button");
  joinButton.type = "button";
  joinButton.textContent = "今天参与";
  joinButton.addEventListener("click", async () => {
    await putTodayParticipation({ status: "joining" });
    joinButton.textContent = "已记录参与";
  });
  participation.appendChild(joinButton);

  const awayButton = document.createElement("button");
  awayButton.type = "button";
  awayButton.textContent = "今天不吃";
  awayButton.addEventListener("click", async () => {
    await putTodayParticipation({ status: "away" });
    awayButton.textContent = "已记录不吃";
  });
  participation.appendChild(awayButton);
  itemsEl.appendChild(participation);

  if (response.items.length === 0) {
    setStatus("还没有可用推荐，先去管理页添加几家饭馆。");
    return;
  }

  for (const item of response.items) {
    itemsEl.appendChild(createGroupCard(item, response.officeDate));
  }
}

function renderLegacyResponse(response: TodayRecommendationResponse) {
  dateEl.textContent = response.fromCache ? `${response.date}｜缓存` : response.date;
  weatherEl.textContent = response.weatherSummary ?? "今天先按距离和历史推荐来挑。";
  hideStatus();

  if (response.items.length === 0) {
    setStatus("还没有可用推荐，先去管理页添加几家饭馆。");
    return;
  }

  for (const item of response.items) {
    itemsEl.appendChild(createCard(item, response.date));
  }
}

function createGroupCard(
  item: GroupTodayRecommendationItem,
  officeDate: string
): HTMLElement {
  const card = createCard(item, officeDate);
  const decideButton = document.createElement("button");
  decideButton.type = "button";
  decideButton.textContent = "就决定是你了";
  decideButton.addEventListener("click", async () => {
    await decideTodayRecommendation(item);
    decideButton.textContent = "已决定";
    decideButton.disabled = true;
  });
  card.appendChild(decideButton);
  return card;
}

function createCard(item: RecommendationItem, date: string): HTMLElement {
  const card = document.createElement("article");
  card.className = "card";

  const title = document.createElement("h2");
  title.textContent = item.restaurantName;
  card.appendChild(title);

  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = [
    item.dish,
    item.distanceMinutes ? `${item.distanceMinutes} 分钟` : ""
  ]
    .filter(Boolean)
    .join("｜");
  card.appendChild(meta);

  const reason = document.createElement("p");
  reason.className = "reason";
  reason.textContent = item.reason;
  card.appendChild(reason);

  const tags = document.createElement("div");
  tags.className = "tags";
  for (const tag of item.tags) {
    const chip = document.createElement("span");
    chip.className = "tag";
    chip.textContent = tag;
    tags.appendChild(chip);
  }
  card.appendChild(tags);

  const feedback = document.createElement("div");
  feedback.className = "tags";
  for (const [type, label] of [
    ["want", "想吃"],
    ["skip", "不想吃"],
    ["ate", "已吃过"],
    ["avoid", "避雷"]
  ] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", async () => {
      await postFeedback({
        date,
        restaurantId: item.restaurantId,
        ...(item.recommendationId
          ? { recommendationId: item.recommendationId }
          : {}),
        type
      });
      button.textContent = "已记录";
      button.disabled = true;
    });
    feedback.appendChild(button);
  }
  card.appendChild(feedback);

  return card;
}

function hideStatus() {
  statusEl.hidden = true;
  statusEl.textContent = "";
}

function setStatus(text: string) {
  statusEl.hidden = false;
  statusEl.textContent = text;
}
