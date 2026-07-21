import {
  AUTHORIZATION_HEADER,
  GROUP_ROUTES,
  type FeedbackType,
  type GroupTodayRecommendationItem,
  type GroupTodayRecommendationsResponse,
  type ParticipationTodayResponse,
  type PutParticipationTodayRequest,
  type PutParticipationTodayResponse
} from "@lunch/shared";
import {
  ExtensionApiError,
  isServiceUnavailable,
  requestJson
} from "./apiClient";
import {
  getStorageState,
  saveGroupRecommendationCache,
  type ExtensionStorageShape
} from "./storage";
import {
  groupSessionRetrySnapshotForStorage,
  withGroupSessionRetry,
  type GroupSessionRetrySnapshot
} from "./groupSessionRetry";

interface ActiveGroupRequestContext {
  apiBaseUrl: string;
  groupId: string;
  token: string;
  retrySnapshot?: GroupSessionRetrySnapshot | undefined;
}

export type ExtensionRecommendationResponse = GroupTodayRecommendationsResponse;

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
  if (!token) throw new Error("No active group session configured");
  return {
    apiBaseUrl: state.apiBaseUrl,
    groupId,
    token,
    retrySnapshot: groupSessionRetrySnapshotForStorage(state, groupId)
  };
}

async function requireActiveGroupRequestContext(): Promise<ActiveGroupRequestContext> {
  return requireActiveGroupRequestContextForStorage(await getStorageState());
}

function requireActiveGroupRequestContextForStorage(
  storage: ExtensionStorageShape
): ActiveGroupRequestContext {
  const context = getActiveGroupRequestContext(storage);
  if (!context) throw new Error("No active group session configured");
  return context;
}

async function activeGroupJson<T>(
  context: ActiveGroupRequestContext,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  return withGroupSessionRetry(
    context.groupId,
    context.token,
    (token) => requestJson<T>(new URL(path, context.apiBaseUrl), {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        [AUTHORIZATION_HEADER]: `Bearer ${token}`
      }
    }),
    context.retrySnapshot
  );
}

async function fetchGroupTodayRecommendationsNetworkOnlyForContext(
  context: ActiveGroupRequestContext
): Promise<GroupTodayRecommendationsResponse> {
  const data = await activeGroupJson<GroupTodayRecommendationsResponse>(
    context,
    GROUP_ROUTES.todayRecommendations(context.groupId)
  );
  await saveGroupRecommendationCache(context.groupId, data);
  return data;
}

function getGroupCacheFallback(
  state: ExtensionStorageShape,
  groupId: string
): GroupTodayRecommendationsResponse | null {
  const cached = state.lastRecommendationsByGroupId[groupId];
  return cached?.groupId === groupId ? { ...cached, fromCache: true } : null;
}

function isCacheFallbackEligible(error: unknown): boolean {
  return isServiceUnavailable(error);
}

async function fetchGroupTodayRecommendationsWithCacheFallbackForContext(
  context: ActiveGroupRequestContext,
  cached: GroupTodayRecommendationsResponse | null
): Promise<GroupTodayRecommendationsResponse> {
  try {
    return await fetchGroupTodayRecommendationsNetworkOnlyForContext(context);
  } catch (error) {
    if (!isCacheFallbackEligible(error)) throw error;
    if (cached) return cached;
    throw error;
  }
}

async function refreshGroupTodayRecommendationsForContext(
  context: ActiveGroupRequestContext
): Promise<GroupTodayRecommendationsResponse> {
  const data = await activeGroupJson<GroupTodayRecommendationsResponse>(
    context,
    GROUP_ROUTES.refreshTodayRecommendations(context.groupId),
    { method: "POST" }
  );
  await saveGroupRecommendationCache(context.groupId, data);
  return data;
}

export async function fetchGroupTodayRecommendationsNetworkOnly(): Promise<GroupTodayRecommendationsResponse> {
  const context = await requireActiveGroupRequestContext();
  return fetchGroupTodayRecommendationsNetworkOnlyForContext(context);
}

export async function fetchGroupTodayRecommendationsWithCacheFallbackForStorage(
  storage: ExtensionStorageShape
): Promise<GroupTodayRecommendationsResponse> {
  const context = requireActiveGroupRequestContextForStorage(storage);
  return fetchGroupTodayRecommendationsWithCacheFallbackForContext(
    context,
    getGroupCacheFallback(storage, context.groupId)
  );
}

export async function fetchGroupTodayRecommendationsWithCacheFallback(): Promise<GroupTodayRecommendationsResponse> {
  return fetchGroupTodayRecommendationsWithCacheFallbackForStorage(
    await getStorageState()
  );
}

export const fetchGroupTodayRecommendations =
  fetchGroupTodayRecommendationsWithCacheFallback;

export async function refreshGroupTodayRecommendations(): Promise<GroupTodayRecommendationsResponse> {
  return refreshGroupTodayRecommendationsForStorage(await getStorageState());
}

export async function refreshGroupTodayRecommendationsForStorage(
  storage: ExtensionStorageShape
): Promise<GroupTodayRecommendationsResponse> {
  return refreshGroupTodayRecommendationsForContext(
    requireActiveGroupRequestContextForStorage(storage)
  );
}

export async function ensureGroupTodayRecommendationsForStorage(
  storage: ExtensionStorageShape
): Promise<GroupTodayRecommendationsResponse> {
  const context = requireActiveGroupRequestContextForStorage(storage);
  try {
    return await fetchGroupTodayRecommendationsNetworkOnlyForContext(context);
  } catch (error) {
    if (
      error instanceof ExtensionApiError &&
      error.status === 404 &&
      error.code === "no_current_batch"
    ) {
      return refreshGroupTodayRecommendationsForContext(context);
    }
    if (!isCacheFallbackEligible(error)) throw error;
    const cached = getGroupCacheFallback(storage, context.groupId);
    if (cached) return cached;
    throw error;
  }
}

export async function ensureGroupTodayRecommendations(): Promise<GroupTodayRecommendationsResponse> {
  return ensureGroupTodayRecommendationsForStorage(await getStorageState());
}

export async function fetchTodayRecommendations(options: {
  forceRefresh?: boolean;
} = {}): Promise<ExtensionRecommendationResponse> {
  const settings = await getStorageState();
  const context = requireActiveGroupRequestContextForStorage(settings);
  return options.forceRefresh
    ? refreshGroupTodayRecommendationsForContext(context)
    : fetchGroupTodayRecommendationsWithCacheFallbackForContext(
        context,
        getGroupCacheFallback(settings, context.groupId)
      );
}

export async function getPrimaryRecommendationsForStorage(
  storage: ExtensionStorageShape
): Promise<ExtensionRecommendationResponse> {
  return ensureGroupTodayRecommendationsForStorage(storage);
}

export async function refreshTodayRecommendations(): Promise<ExtensionRecommendationResponse> {
  const settings = await getStorageState();
  return refreshGroupTodayRecommendationsForContext(
    requireActiveGroupRequestContextForStorage(settings)
  );
}

export async function fetchTodayParticipation(): Promise<ParticipationTodayResponse> {
  return fetchTodayParticipationForStorage(await getStorageState());
}

export async function fetchTodayParticipationForStorage(
  storage: ExtensionStorageShape
): Promise<ParticipationTodayResponse> {
  const context = requireActiveGroupRequestContextForStorage(storage);
  return activeGroupJson<ParticipationTodayResponse>(
    context,
    GROUP_ROUTES.participationToday(context.groupId)
  );
}

export async function putTodayParticipation(
  input: PutParticipationTodayRequest
): Promise<PutParticipationTodayResponse> {
  return putTodayParticipationForStorage(await getStorageState(), input);
}

export async function putTodayParticipationForStorage(
  storage: ExtensionStorageShape,
  input: PutParticipationTodayRequest
): Promise<PutParticipationTodayResponse> {
  const context = requireActiveGroupRequestContextForStorage(storage);
  return activeGroupJson<PutParticipationTodayResponse>(
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

export interface PostFeedbackInput {
  date: string;
  restaurantId: string;
  recommendationId?: string | undefined;
  type: FeedbackType;
}

export async function postFeedback(input: PostFeedbackInput): Promise<void> {
  return postFeedbackForStorage(await getStorageState(), input);
}

export async function postFeedbackForStorage(
  settings: ExtensionStorageShape,
  input: PostFeedbackInput
): Promise<void> {
  const context = requireActiveGroupRequestContextForStorage(settings);
  await activeGroupJson(context, GROUP_ROUTES.feedback(context.groupId), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      officeDate: input.date,
      restaurantId: input.restaurantId,
      ...(input.recommendationId
        ? { recommendationId: input.recommendationId }
        : {}),
      type: input.type
    })
  });
}
