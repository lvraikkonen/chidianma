export type GroupRole = "admin" | "member";
export type MembershipStatus = "active" | "removed";
export type RestaurantStatus = "active" | "paused" | "blocked";
export type FeedbackType = "want" | "skip" | "ate" | "avoid";
export type WeatherTag = "rainy" | "hot" | "cold" | "clear" | "windy";
export type WeekdayTag = "monday" | "tuesday" | "wednesday" | "thursday" | "friday";

export interface GroupSummary {
  groupId: string;
  name: string;
  subtitle?: string | undefined;
  role: GroupRole;
  membershipId: string;
}

export interface GroupSessionResponse {
  identityToken: string;
  groupSessionToken: string;
  group: GroupSummary;
}

export interface CreateIdentityRequest {
  displayName: string;
}

export interface CreateIdentityResponse {
  identityId: string;
  identityToken: string;
}

export interface CreateGroupRequest {
  displayName?: string | undefined;
  groupName: string;
  subtitle?: string | undefined;
}

export interface CreateGroupResponse extends GroupSessionResponse {
  inviteCode: string;
}

export interface JoinGroupRequest {
  displayName?: string | undefined;
  inviteCode: string;
}

export type JoinGroupResponse = GroupSessionResponse;

export interface GroupsListResponse {
  groups: GroupSummary[];
}

export type RefreshGroupSessionResponse = GroupSessionResponse;

export interface ApiErrorResponse {
  error: string;
  message: string;
}

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
