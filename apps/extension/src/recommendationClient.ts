import {
  AUTHORIZATION_HEADER,
  GROUP_ROUTES,
  READ_TOKEN_HEADER,
  type FeedbackType,
  type GroupTodayRecommendationItem,
  type GroupTodayRecommendationsResponse,
  type PutParticipationTodayRequest,
  type TodayRecommendationResponse
} from "@lunch/shared";
import {
  getActiveGroupRecommendationCache,
  getActiveGroupSession,
  getRecommendationCache,
  getStorageState,
  saveGroupRecommendationCache,
  saveRecommendationCache
} from "./storage";

class ApiError extends Error {
  constructor(public readonly status: number, public readonly error?: string | undefined) {
    super(error ? `HTTP ${status}: ${error}` : `HTTP ${status}`);
  }
}

interface ActiveGroupSession {
  groupId: string;
  token: string;
}

export type ExtensionRecommendationResponse =
  | TodayRecommendationResponse
  | GroupTodayRecommendationsResponse;

export function isGroupResponse(
  response: ExtensionRecommendationResponse
): response is GroupTodayRecommendationsResponse {
  return "groupId" in response && "officeDate" in response;
}

async function requireActiveGroupSession(): Promise<ActiveGroupSession> {
  const session = await getActiveGroupSession();
  if (!session) throw new Error("No active group session configured");
  return session;
}

async function activeGroupRequest(
  session: ActiveGroupSession,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const state = await getStorageState();
  const response = await fetch(new URL(path, state.apiBaseUrl), {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      [AUTHORIZATION_HEADER]: `Bearer ${session.token}`
    }
  });
  if (!response.ok) {
    let error: string | undefined;
    try {
      error = ((await response.json()) as { error?: string }).error;
    } catch {
      error = undefined;
    }
    throw new ApiError(response.status, error);
  }
  return response;
}

async function fetchGroupTodayRecommendationsNetworkOnlyForSession(
  session: ActiveGroupSession
): Promise<GroupTodayRecommendationsResponse> {
  const response = await activeGroupRequest(
    session,
    GROUP_ROUTES.todayRecommendations(session.groupId)
  );
  const data = (await response.json()) as GroupTodayRecommendationsResponse;
  await saveGroupRecommendationCache(session.groupId, data);
  return data;
}

async function getGroupCacheFallback(
  groupId: string
): Promise<GroupTodayRecommendationsResponse | null> {
  const cached = await getActiveGroupRecommendationCache();
  return cached?.groupId === groupId ? { ...cached, fromCache: true } : null;
}

async function fetchGroupTodayRecommendationsWithCacheFallbackForSession(
  session: ActiveGroupSession
): Promise<GroupTodayRecommendationsResponse> {
  try {
    return await fetchGroupTodayRecommendationsNetworkOnlyForSession(session);
  } catch (error) {
    const cached = await getGroupCacheFallback(session.groupId);
    if (cached) return cached;
    throw error;
  }
}

async function refreshGroupTodayRecommendationsForSession(
  session: ActiveGroupSession
): Promise<GroupTodayRecommendationsResponse> {
  const response = await activeGroupRequest(
    session,
    GROUP_ROUTES.refreshTodayRecommendations(session.groupId),
    { method: "POST" }
  );
  const data = (await response.json()) as GroupTodayRecommendationsResponse;
  await saveGroupRecommendationCache(session.groupId, data);
  return data;
}

export async function fetchGroupTodayRecommendationsNetworkOnly(): Promise<GroupTodayRecommendationsResponse> {
  const session = await requireActiveGroupSession();
  return fetchGroupTodayRecommendationsNetworkOnlyForSession(session);
}

export async function fetchGroupTodayRecommendationsWithCacheFallback(): Promise<GroupTodayRecommendationsResponse> {
  const session = await requireActiveGroupSession();
  return fetchGroupTodayRecommendationsWithCacheFallbackForSession(session);
}

export const fetchGroupTodayRecommendations =
  fetchGroupTodayRecommendationsWithCacheFallback;

export async function refreshGroupTodayRecommendations(): Promise<GroupTodayRecommendationsResponse> {
  const session = await requireActiveGroupSession();
  return refreshGroupTodayRecommendationsForSession(session);
}

export async function ensureGroupTodayRecommendations(): Promise<GroupTodayRecommendationsResponse> {
  const session = await requireActiveGroupSession();
  try {
    return await fetchGroupTodayRecommendationsNetworkOnlyForSession(session);
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 404 &&
      error.error === "no_current_batch"
    ) {
      return refreshGroupTodayRecommendationsForSession(session);
    }
    const cached = await getGroupCacheFallback(session.groupId);
    if (cached) return cached;
    throw error;
  }
}

export async function fetchTodayRecommendations(options: {
  forceRefresh?: boolean;
} = {}): Promise<ExtensionRecommendationResponse> {
  const session = await getActiveGroupSession();
  if (session) {
    return fetchGroupTodayRecommendationsWithCacheFallbackForSession(session);
  }

  const settings = await getStorageState();
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

export async function putTodayParticipation(
  input: PutParticipationTodayRequest
): Promise<void> {
  const session = await requireActiveGroupSession();
  await activeGroupRequest(
    session,
    GROUP_ROUTES.participationToday(session.groupId),
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input)
    }
  );
}

export async function decideTodayRecommendation(
  item: GroupTodayRecommendationItem
): Promise<void> {
  await putTodayParticipation({
    status: "decided",
    restaurantId: item.restaurantId,
    ...(item.recommendationId
      ? { recommendationId: item.recommendationId }
      : {})
  });
}

export async function postFeedback(input: {
  date: string;
  restaurantId: string;
  recommendationId?: string | undefined;
  type: FeedbackType;
}): Promise<void> {
  const session = await getActiveGroupSession();
  if (session) {
    await activeGroupRequest(session, GROUP_ROUTES.feedback(session.groupId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        officeDate: input.date,
        restaurantId: input.restaurantId,
        ...(input.recommendationId
          ? { recommendationId: input.recommendationId }
          : {}),
        type: input.type
      })
    });
    return;
  }

  const settings = await getStorageState();
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
