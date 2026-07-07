export type RestaurantStatus = "active" | "paused" | "blocked";
export type FeedbackType = "want" | "skip" | "ate" | "blocked";
export type WeatherTag = "rainy" | "hot" | "cold" | "clear" | "windy";
export type WeekdayTag = "monday" | "tuesday" | "wednesday" | "thursday" | "friday";

export interface RecommendationItem {
  restaurantId: string;
  recommendationId?: string | undefined;
  restaurantName: string;
  dish?: string | undefined;
  reason: string;
  distanceMinutes?: number | undefined;
  tags: string[];
}

export interface TodayRecommendationResponse {
  date: string;
  headline: string;
  weatherSummary?: string | undefined;
  weatherUnavailable?: boolean | undefined;
  fromCache?: boolean | undefined;
  items: RecommendationItem[];
}
