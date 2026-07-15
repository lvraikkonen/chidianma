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

export type RecommendationBatchSource = "auto" | "manual" | "legacy";
export type ParticipationStatus = "undecided" | "joining" | "away" | "decided";

export interface ScoringWeightsSnapshot {
  weekdayMatch: number;
  weatherMatch: number;
  distance: number;
  teammateRecommendation: number;
  recentDuplicatePenalty: number;
  negativeFeedbackPenalty: number;
}

export interface ScoreBreakdown {
  weekdayMatch: number;
  weatherMatch: number;
  distance: number;
  teammateRecommendation: number;
  recentDuplicatePenalty: number;
  negativeFeedbackPenalty: number;
  total: number;
}

export interface WeatherSummary {
  city: string;
  condition: WeatherTag | string;
  temperatureC?: number | undefined;
  precipitationProbability?: number | undefined;
  windLevel?: string | undefined;
  summary: string;
}

export interface GroupTodayRecommendationItem extends RecommendationItem {
  rank: number;
  priceBand?: string | undefined;
  averagePriceCents?: number | undefined;
  supportsDineIn?: boolean | undefined;
  supportsTakeout?: boolean | undefined;
  score: number;
  scoreBreakdown: ScoreBreakdown;
}

export interface ParticipationSummary {
  joiningCount: number;
  decidedCount: number;
  awayCount: number;
  undecidedCount: number;
}

export interface GroupTodayRecommendationsResponse {
  groupId: string;
  officeDate: string;
  batchId: string;
  batchNo: number;
  generatedAt: string;
  weather?: WeatherSummary | undefined;
  weatherUnavailable?: boolean | undefined;
  participationSummary: ParticipationSummary;
  items: GroupTodayRecommendationItem[];
  fromCache?: boolean | undefined;
}

export interface ParticipationMember {
  membershipId: string;
  displayName: string;
  status: ParticipationStatus;
  restaurantId?: string | undefined;
  recommendationId?: string | undefined;
  decidedAt?: string | undefined;
  updatedAt?: string | undefined;
}

export interface ParticipationTodayResponse {
  groupId: string;
  officeDate: string;
  members: ParticipationMember[];
  summary: ParticipationSummary;
}

export interface PutParticipationTodayRequest {
  status: ParticipationStatus;
  restaurantId?: string | undefined;
  recommendationId?: string | undefined;
}

export interface PutParticipationTodayResponse {
  groupId: string;
  officeDate: string;
  participation: ParticipationMember;
  summary: ParticipationSummary;
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

export type DataAvailabilityStatus = "ready" | "insufficient";

export interface DashboardParticipationSummary extends ParticipationSummary {
  activeMemberCount: number;
}

export type DashboardAveragePrice =
  | { status: "insufficient" }
  | {
      status: "ready";
      averagePriceCents: number;
      pricedDecisionCount: number;
    };

export interface DashboardCurrentWeekSummary {
  startDate: string;
  endDate: string;
  decidedCount: number;
  distinctMemberCount: number;
  averagePrice: DashboardAveragePrice;
}

export interface DashboardWeekSummary {
  startDate: string;
  endDate: string;
  decidedCount: number;
}

export interface DashboardRestaurantCounts {
  active: number;
  paused: number;
  blocked: number;
}

export interface DashboardRestaurantStat {
  restaurantId: string;
  restaurantName: string;
  cuisine: string;
  decisionCount: number;
  averagePriceCents?: number | undefined;
}

export interface DashboardCategoryStat {
  cuisine: string;
  decisionCount: number;
  percentage: number;
}

export type DashboardCategoryDistribution =
  | { status: "insufficient"; decidedCount: number }
  | {
      status: "ready";
      decidedCount: number;
      items: DashboardCategoryStat[];
    };

export interface DashboardActivityItem {
  kind: "restaurant_created" | "recommendation_created";
  occurredAt: string;
  membershipId?: string | undefined;
  memberName?: string | undefined;
  restaurantId: string;
  restaurantName: string;
  recommendationId?: string | undefined;
  dish?: string | undefined;
}

export interface DashboardResponse {
  groupId: string;
  officeDate: string;
  officeTimezone: string;
  today: DashboardParticipationSummary;
  currentWeek: DashboardCurrentWeekSummary;
  previousWeek: DashboardWeekSummary;
  restaurantCounts: DashboardRestaurantCounts;
  topRestaurants: DashboardRestaurantStat[];
  categoryDistribution: DashboardCategoryDistribution;
  recentActivity: DashboardActivityItem[];
}

export interface HistoryDecisionMember {
  membershipId: string;
  displayName: string;
  decidedAt?: string | undefined;
}

export interface HistoryDecisionGroup {
  restaurantId: string;
  restaurantName: string;
  dish?: string | undefined;
  memberCount: number;
  members: HistoryDecisionMember[];
}

export interface RecommendationHistoryBatch {
  batchId: string;
  officeDate: string;
  batchNo: number;
  source: RecommendationBatchSource;
  isCurrent: boolean;
  generatedAt: string;
  generatedByMembershipId?: string | undefined;
  generatedByName?: string | undefined;
  weather?: WeatherSummary | undefined;
  weatherUnavailable?: boolean | undefined;
  scoringWeightsSnapshot: ScoringWeightsSnapshot;
  algorithmVersion: string;
  participationSummary: ParticipationSummary;
  recommendations: GroupTodayRecommendationItem[];
  decisions: HistoryDecisionGroup[];
}

export interface RecommendationHistoryResponse {
  groupId: string;
  items: RecommendationHistoryBatch[];
  nextCursor?: string | undefined;
}

export interface PersonalLunchHistoryItem {
  officeDate: string;
  restaurantId: string;
  restaurantName: string;
  recommendationId?: string | undefined;
  dish?: string | undefined;
  cuisine: string;
  averagePriceCents?: number | undefined;
  decidedAt?: string | undefined;
  coDinerCount: number;
}

export interface PersonalPreferenceCategory {
  cuisine: string;
  decisionCount: number;
  percentage: number;
}

export type PersonalLunchPreference =
  | { status: "insufficient"; decidedCount: number }
  | {
      status: "ready";
      decidedCount: number;
      averagePriceCents?: number | undefined;
      categories: PersonalPreferenceCategory[];
    };

export interface PersonalLunchHistoryResponse {
  groupId: string;
  membershipId: string;
  window: { startDate: string; endDate: string };
  items: PersonalLunchHistoryItem[];
  preference: PersonalLunchPreference;
}

export interface GroupProfileSettings {
  name: string;
  subtitle?: string | undefined;
  officeTimezone: string;
  officeCity: string;
  officeLatitude: number;
  officeLongitude: number;
}

export interface GroupReminderSettings {
  reminderTime: string;
  weekdayReminderEnabled: boolean;
  secondReminderEnabled: boolean;
  notificationTitle: string;
  notificationGroupLabel?: string | undefined;
}

export interface GroupInviteMetadata {
  version: number;
  rotatedAt: string;
}

export interface GroupSettingsResponse {
  groupId: string;
  group: GroupProfileSettings;
  reminder: GroupReminderSettings;
  scoringWeights: ScoringWeightsSnapshot;
  invite: GroupInviteMetadata;
}

export interface PatchGroupSettingsRequest {
  group?: {
    name?: string | undefined;
    subtitle?: string | null | undefined;
    officeTimezone?: string | undefined;
    officeCity?: string | undefined;
    officeLatitude?: number | undefined;
    officeLongitude?: number | undefined;
  } | undefined;
  reminder?: {
    reminderTime?: string | undefined;
    weekdayReminderEnabled?: boolean | undefined;
    secondReminderEnabled?: boolean | undefined;
    notificationTitle?: string | undefined;
    notificationGroupLabel?: string | null | undefined;
  } | undefined;
  scoringWeights?: Partial<ScoringWeightsSnapshot> | undefined;
}

export interface MemberContributionSummary {
  restaurantCount: number;
  recommendationCount: number;
  feedbackCount: number;
  total: number;
}

export interface MemberSummary {
  membershipId: string;
  displayName: string;
  role: GroupRole;
  status: MembershipStatus;
  joinedAt: string;
  removedAt?: string | undefined;
  contribution: MemberContributionSummary;
}

export interface MembersResponse {
  groupId: string;
  contributionWindow: { startAt: string; endAt: string };
  members: MemberSummary[];
}

export interface PatchMemberRequest {
  role?: GroupRole | undefined;
  status?: MembershipStatus | undefined;
}

export interface MemberMutationResponse {
  groupId: string;
  member: MemberSummary;
}

export interface RotateInviteCodeResponse {
  groupId: string;
  inviteCode: string;
  version: number;
  rotatedAt: string;
}
