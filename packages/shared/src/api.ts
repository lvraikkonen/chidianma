export const LUNCH_HEADLINE = "吃饭才是正事，中午吃点啥呢？";
export const READ_TOKEN_HEADER = "x-lunch-read-token";
export const AUTHORIZATION_HEADER = "authorization";

export const GROUP_ROUTES = {
  identities: "/api/identities",
  groups: "/api/groups",
  joinGroup: "/api/groups/join",
  groupSession: (groupId: string) => `/api/groups/${groupId}/session`,
  todayRecommendations: (groupId: string) => `/api/groups/${groupId}/today-recommendations`,
  refreshTodayRecommendations: (groupId: string) => `/api/groups/${groupId}/today-recommendations/refresh`,
  participationToday: (groupId: string) => `/api/groups/${groupId}/participation/today`,
  restaurants: (groupId: string) => `/api/groups/${groupId}/restaurants`,
  restaurant: (groupId: string, restaurantId: string) => `/api/groups/${groupId}/restaurants/${restaurantId}`,
  recommendations: (groupId: string) => `/api/groups/${groupId}/recommendations`,
  recommendation: (groupId: string, recommendationId: string) =>
    `/api/groups/${groupId}/recommendations/${recommendationId}`,
  feedback: (groupId: string) => `/api/groups/${groupId}/feedback`,
  members: (groupId: string) => `/api/groups/${groupId}/members`
} as const;
