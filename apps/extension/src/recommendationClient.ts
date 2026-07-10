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
  getRecommendationCache,
  getStorageState,
  saveGroupRecommendationCache,
  saveRecommendationCache,
  type ExtensionStorageShape
} from "./storage";

class ApiError extends Error {
  constructor(public readonly status: number, public readonly error?: string | undefined) {
    super(error ? `HTTP ${status}: ${error}` : `HTTP ${status}`);
  }
}

interface ActiveGroupRequestContext {
  apiBaseUrl: string;
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

function getActiveGroupRequestContext(
  state: ExtensionStorageShape
): ActiveGroupRequestContext | null {
  const groupId = state.activeGroupId;
  if (!groupId) return null;
  const token = state.sessionsByGroupId[groupId]?.token;
  if (!token) return null;
  return { apiBaseUrl: state.apiBaseUrl, groupId, token };
}

async function requireActiveGroupRequestContext(): Promise<ActiveGroupRequestContext> {
  const context = getActiveGroupRequestContext(await getStorageState());
  if (!context) throw new Error("No active group session configured");
  return context;
}

async function activeGroupRequest(
  context: ActiveGroupRequestContext,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const response = await fetch(new URL(path, context.apiBaseUrl), {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      [AUTHORIZATION_HEADER]: `Bearer ${context.token}`
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

async function fetchGroupTodayRecommendationsNetworkOnlyForContext(
  context: ActiveGroupRequestContext
): Promise<GroupTodayRecommendationsResponse> {
  const response = await activeGroupRequest(
    context,
    GROUP_ROUTES.todayRecommendations(context.groupId)
  );
  const data = (await response.json()) as GroupTodayRecommendationsResponse;
  await saveGroupRecommendationCache(context.groupId, data);
  return data;
}

async function getGroupCacheFallback(
  groupId: string
): Promise<GroupTodayRecommendationsResponse | null> {
  const cached = await getActiveGroupRecommendationCache();
  return cached?.groupId === groupId ? { ...cached, fromCache: true } : null;
}

async function fetchGroupTodayRecommendationsWithCacheFallbackForContext(
  context: ActiveGroupRequestContext
): Promise<GroupTodayRecommendationsResponse> {
  try {
    return await fetchGroupTodayRecommendationsNetworkOnlyForContext(context);
  } catch (error) {
    const cached = await getGroupCacheFallback(context.groupId);
    if (cached) return cached;
    throw error;
  }
}

async function refreshGroupTodayRecommendationsForContext(
  context: ActiveGroupRequestContext
): Promise<GroupTodayRecommendationsResponse> {
  const response = await activeGroupRequest(
    context,
    GROUP_ROUTES.refreshTodayRecommendations(context.groupId),
    { method: "POST" }
  );
  const data = (await response.json()) as GroupTodayRecommendationsResponse;
  await saveGroupRecommendationCache(context.groupId, data);
  return data;
}

export async function fetchGroupTodayRecommendationsNetworkOnly(): Promise<GroupTodayRecommendationsResponse> {
  const context = await requireActiveGroupRequestContext();
  return fetchGroupTodayRecommendationsNetworkOnlyForContext(context);
}

export async function fetchGroupTodayRecommendationsWithCacheFallback(): Promise<GroupTodayRecommendationsResponse> {
  const context = await requireActiveGroupRequestContext();
  return fetchGroupTodayRecommendationsWithCacheFallbackForContext(context);
}

export const fetchGroupTodayRecommendations =
  fetchGroupTodayRecommendationsWithCacheFallback;

export async function refreshGroupTodayRecommendations(): Promise<GroupTodayRecommendationsResponse> {
  const context = await requireActiveGroupRequestContext();
  return refreshGroupTodayRecommendationsForContext(context);
}

export async function ensureGroupTodayRecommendations(): Promise<GroupTodayRecommendationsResponse> {
  const context = await requireActiveGroupRequestContext();
  try {
    return await fetchGroupTodayRecommendationsNetworkOnlyForContext(context);
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 404 &&
      error.error === "no_current_batch"
    ) {
      return refreshGroupTodayRecommendationsForContext(context);
    }
    const cached = await getGroupCacheFallback(context.groupId);
    if (cached) return cached;
    throw error;
  }
}

async function fetchLegacyTodayRecommendations(
  settings: ExtensionStorageShape,
  options: { forceRefresh?: boolean } = {}
): Promise<TodayRecommendationResponse> {
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

export async function fetchTodayRecommendations(options: {
  forceRefresh?: boolean;
} = {}): Promise<ExtensionRecommendationResponse> {
  const settings = await getStorageState();
  const context = getActiveGroupRequestContext(settings);
  if (context) {
    return fetchGroupTodayRecommendationsWithCacheFallbackForContext(context);
  }

  return fetchLegacyTodayRecommendations(settings, options);
}

export async function refreshTodayRecommendations(): Promise<ExtensionRecommendationResponse> {
  const settings = await getStorageState();
  const context = getActiveGroupRequestContext(settings);
  if (context) {
    return refreshGroupTodayRecommendationsForContext(context);
  }
  return fetchLegacyTodayRecommendations(settings, { forceRefresh: true });
}

export async function putTodayParticipation(
  input: PutParticipationTodayRequest
): Promise<void> {
  const context = await requireActiveGroupRequestContext();
  await activeGroupRequest(
    context,
    GROUP_ROUTES.participationToday(context.groupId),
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
  const settings = await getStorageState();
  const context = getActiveGroupRequestContext(settings);
  if (context) {
    await activeGroupRequest(context, GROUP_ROUTES.feedback(context.groupId), {
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
