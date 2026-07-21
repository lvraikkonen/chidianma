export const LUNCH_HEADLINE = "吃饭才是正事，中午吃点啥呢？";
export const AUTHORIZATION_HEADER = "authorization";

export const GROUP_ROUTES = {
  identities: "/api/identities",
  identitySession: "/api/identities/session",
  identityLinkCodes: "/api/identities/link-codes",
  redeemIdentityLinkCode: "/api/identities/link-codes/redeem",
  resetIdentitySessions: "/api/identities/sessions/reset",
  groups: "/api/groups",
  joinGroup: "/api/groups/join",
  groupSession: (groupId: string) => `/api/groups/${groupId}/session`,
  capabilities: (groupId: string) => `/api/groups/${groupId}/capabilities`,
  todayRecommendations: (groupId: string) => `/api/groups/${groupId}/today-recommendations`,
  wheelCandidates: (groupId: string) =>
    `/api/groups/${groupId}/today-recommendations/wheel-candidates`,
  refreshTodayRecommendations: (groupId: string) => `/api/groups/${groupId}/today-recommendations/refresh`,
  participationToday: (groupId: string) => `/api/groups/${groupId}/participation/today`,
  restaurants: (groupId: string) => `/api/groups/${groupId}/restaurants`,
  restaurant: (groupId: string, restaurantId: string) => `/api/groups/${groupId}/restaurants/${restaurantId}`,
  recommendations: (groupId: string) => `/api/groups/${groupId}/recommendations`,
  recommendation: (groupId: string, recommendationId: string) =>
    `/api/groups/${groupId}/recommendations/${recommendationId}`,
  feedback: (groupId: string) => `/api/groups/${groupId}/feedback`,
  dashboard: (groupId: string) => `/api/groups/${groupId}/dashboard`,
  history: (groupId: string) => `/api/groups/${groupId}/history`,
  personalHistory: (groupId: string) => `/api/groups/${groupId}/history/me`,
  settings: (groupId: string) => `/api/groups/${groupId}/settings`,
  rotateInviteCode: (groupId: string) => `/api/groups/${groupId}/invite-code/rotate`,
  members: (groupId: string) => `/api/groups/${groupId}/members`,
  member: (groupId: string, membershipId: string) =>
    `/api/groups/${groupId}/members/${membershipId}`
} as const;
