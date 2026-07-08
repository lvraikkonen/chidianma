import type { RecommendationItem, TodayRecommendationResponse } from "@lunch/shared";
import { fetchTodayRecommendations, postFeedback } from "./recommendationClient";

const dateEl = document.querySelector<HTMLSpanElement>("#date")!;
const statusEl = document.querySelector<HTMLElement>("#status")!;
const weatherEl = document.querySelector<HTMLElement>("#weather")!;
const itemsEl = document.querySelector<HTMLElement>("#items")!;
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh")!;
const settingsButton = document.querySelector<HTMLButtonElement>("#settings")!;

refreshButton.addEventListener("click", () => {
  void render(true);
});
settingsButton.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

void render(false);

async function render(forceRefresh: boolean) {
  setStatus("正在挑今天中午吃什么...");
  itemsEl.replaceChildren();

  try {
    const response = await fetchTodayRecommendations({ forceRefresh });
    renderResponse(response);
  } catch (error) {
    setStatus(`加载失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

function renderResponse(response: TodayRecommendationResponse) {
  dateEl.textContent = response.fromCache ? `${response.date}｜缓存` : response.date;
  weatherEl.textContent = response.weatherSummary ?? "今天先按距离和历史推荐来挑。";
  statusEl.hidden = true;
  statusEl.textContent = "";

  if (response.items.length === 0) {
    setStatus("还没有可用推荐，先去管理页添加几家饭馆。");
    return;
  }

  for (const item of response.items) {
    itemsEl.appendChild(createCard(item));
  }
}

function createCard(item: RecommendationItem): HTMLElement {
  const card = document.createElement("article");
  card.className = "card";

  const title = document.createElement("h2");
  title.textContent = item.restaurantName;
  card.appendChild(title);

  const meta = document.createElement("p");
  meta.className = "meta";
  meta.textContent = [item.dish, item.distanceMinutes ? `${item.distanceMinutes} 分钟` : ""]
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
  for (const [type, label] of [["want", "想吃"], ["skip", "不想吃"], ["ate", "已吃过"]] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", async () => {
      await postFeedback({
        date: dateEl.textContent?.slice(0, 10) ?? "",
        restaurantId: item.restaurantId,
        ...(item.recommendationId ? { recommendationId: item.recommendationId } : {}),
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

function setStatus(text: string) {
  statusEl.hidden = false;
  statusEl.textContent = text;
}
