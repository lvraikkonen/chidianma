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

export interface RecommendationSummary {
  id: string;
  groupId: string;
  restaurantId: string;
  dish?: string | undefined;
  reason: string;
  weatherTags: string[];
  weekdayTags: string[];
  moodTags: string[];
  createdByMembershipId?: string | undefined;
  createdByName?: string | undefined;
  createdAt: string;
  updatedAt: string;
}

export interface RestaurantSummary {
  id: string;
  groupId: string;
  name: string;
  area?: string | undefined;
  address?: string | undefined;
  distanceMinutes?: number | undefined;
  cuisine?: string | undefined;
  priceBand?: string | undefined;
  averagePriceCents?: number | undefined;
  supportsDineIn: boolean;
  supportsTakeout: boolean;
  tags: string[];
  status: RestaurantStatus;
  createdByMembershipId?: string | undefined;
  createdByName?: string | undefined;
  createdAt: string;
  updatedAt: string;
  recommendations: RecommendationSummary[];
}

export interface RestaurantListResponse {
  groupId: string;
  restaurants: RestaurantSummary[];
}

export interface CreateRestaurantRequest {
  name: string;
  area?: string | undefined;
  address?: string | undefined;
  distanceMinutes?: number | undefined;
  cuisine?: string | undefined;
  priceBand?: string | undefined;
  averagePriceCents?: number | undefined;
  supportsDineIn?: boolean | undefined;
  supportsTakeout?: boolean | undefined;
  tags?: string[] | undefined;
}

export interface PatchRestaurantRequest {
  name?: string | undefined;
  area?: string | null | undefined;
  address?: string | null | undefined;
  distanceMinutes?: number | null | undefined;
  cuisine?: string | null | undefined;
  priceBand?: string | null | undefined;
  averagePriceCents?: number | null | undefined;
  supportsDineIn?: boolean | undefined;
  supportsTakeout?: boolean | undefined;
  tags?: string[] | undefined;
  status?: RestaurantStatus | undefined;
}

export interface RestaurantMutationResponse {
  groupId: string;
  restaurant: RestaurantSummary;
}

export interface CreateRecommendationRequest {
  restaurantId: string;
  dish?: string | undefined;
  reason: string;
  weatherTags?: WeatherTag[] | undefined;
  weekdayTags?: WeekdayTag[] | undefined;
  moodTags?: string[] | undefined;
}

export interface PatchRecommendationRequest {
  dish?: string | null | undefined;
  reason?: string | undefined;
  weatherTags?: WeatherTag[] | undefined;
  weekdayTags?: WeekdayTag[] | undefined;
  moodTags?: string[] | undefined;
}

export interface RecommendationMutationResponse {
  groupId: string;
  recommendation: RecommendationSummary;
}

export interface CreateGroupFeedbackRequest {
  officeDate: string;
  restaurantId: string;
  recommendationId?: string | undefined;
  type: FeedbackType;
}

export interface FeedbackSummary {
  id: string;
  groupId: string;
  officeDate: string;
  restaurantId: string;
  recommendationId?: string | undefined;
  membershipId?: string | undefined;
  type: FeedbackType;
  createdAt: string;
}

export interface CreateGroupFeedbackResponse {
  groupId: string;
  feedback: FeedbackSummary;
}
