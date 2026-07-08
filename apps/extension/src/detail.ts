import { fetchTodayRecommendations } from "./recommendationClient";

const root = document.querySelector<HTMLElement>("#detail-root")!;

void fetchTodayRecommendations()
  .then((response) => {
    root.replaceChildren();
    const summary = document.createElement("p");
    summary.textContent = response.weatherSummary ?? "今天先按距离和历史推荐来挑。";
    root.appendChild(summary);
    for (const item of response.items) {
      const article = document.createElement("article");
      const title = document.createElement("h2");
      title.textContent = item.restaurantName;
      const reason = document.createElement("p");
      reason.textContent = item.reason;
      article.append(title, reason);
      root.appendChild(article);
    }
  })
  .catch((error) => {
    root.textContent = `加载失败：${error instanceof Error ? error.message : String(error)}`;
  });
