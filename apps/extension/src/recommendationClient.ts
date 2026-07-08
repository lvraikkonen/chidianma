import { READ_TOKEN_HEADER, type FeedbackType, type TodayRecommendationResponse } from "@lunch/shared";
import { getRecommendationCache, getSettings, saveRecommendationCache } from "./storage";

export async function fetchTodayRecommendations(options: {
  forceRefresh?: boolean;
} = {}): Promise<TodayRecommendationResponse> {
  const settings = await getSettings();
  const url = new URL("/api/today-recommendations", settings.apiBaseUrl);
  if (options.forceRefresh) url.searchParams.set("forceRefresh", "true");

  try {
    const response = await fetch(url, {
      headers: {
        [READ_TOKEN_HEADER]: settings.readToken
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as TodayRecommendationResponse;
    await saveRecommendationCache(data);
    return data;
  } catch (error) {
    const cached = await getRecommendationCache();
    if (cached) return { ...cached, fromCache: true };
    throw error;
  }
}

export async function postFeedback(input: {
  date: string;
  restaurantId: string;
  recommendationId?: string | undefined;
  type: FeedbackType;
}): Promise<void> {
  const settings = await getSettings();
  const url = new URL("/api/feedback", settings.apiBaseUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [READ_TOKEN_HEADER]: settings.readToken
    },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
}
