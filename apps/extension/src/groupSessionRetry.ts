import {
  AUTHORIZATION_HEADER,
  GROUP_ROUTES,
  type GroupsListResponse,
  type RefreshGroupSessionResponse
} from "@lunch/shared";
import { ExtensionApiError, requestJson } from "./apiClient";
import {
  clearGroupSession,
  disconnectIdentity,
  getStorageState,
  saveGroupConnection,
  syncGroupSummaries
} from "./storage";

const refreshFlights = new Map<string, Promise<RefreshGroupSessionResponse>>();

function isRemovedMembership(error: unknown): error is ExtensionApiError {
  return error instanceof ExtensionApiError
    && error.status === 403
    && ["removed_member", "active_membership_required"].includes(error.code ?? "");
}

async function clearAndResyncMembership(groupId: string): Promise<void> {
  await clearGroupSession(groupId);
  const storage = await getStorageState();
  if (!storage.identityToken) return;
  try {
    const response = await requestJson<GroupsListResponse>(
      new URL(GROUP_ROUTES.groups, storage.apiBaseUrl),
      { headers: { [AUTHORIZATION_HEADER]: `Bearer ${storage.identityToken}` } }
    );
    await syncGroupSummaries(response.groups);
  } catch (error) {
    if (error instanceof ExtensionApiError && error.status === 401) {
      await disconnectIdentity().catch(() => undefined);
    }
  }
}

async function renewGroupSession(groupId: string): Promise<RefreshGroupSessionResponse> {
  const storage = await getStorageState();
  if (!storage.identityToken || storage.activeGroupId !== groupId) {
    throw new ExtensionApiError({
      kind: "http",
      status: 401,
      code: "identity_connection_required"
    });
  }
  const key = `${storage.apiBaseUrl}\n${storage.identityId ?? "unknown"}\n${groupId}`;
  const existing = refreshFlights.get(key);
  if (existing) return existing;

  const flight = requestJson<RefreshGroupSessionResponse>(
    new URL(GROUP_ROUTES.groupSession(groupId), storage.apiBaseUrl),
    {
      method: "POST",
      headers: { [AUTHORIZATION_HEADER]: `Bearer ${storage.identityToken}` }
    }
  ).then(async (response) => {
    await saveGroupConnection(response);
    return response;
  }).catch(async (error: unknown) => {
    if (error instanceof ExtensionApiError && error.status === 401) {
      await disconnectIdentity().catch(() => undefined);
    } else if (isRemovedMembership(error)) {
      await clearAndResyncMembership(groupId).catch(() => undefined);
    }
    throw error;
  }).finally(() => {
    refreshFlights.delete(key);
  });

  refreshFlights.set(key, flight);
  return flight;
}

export async function withGroupSessionRetry<T>(
  groupId: string,
  token: string,
  operation: (token: string) => Promise<T>
): Promise<T> {
  try {
    return await operation(token);
  } catch (error) {
    if (isRemovedMembership(error)) {
      await clearAndResyncMembership(groupId).catch(() => undefined);
      throw error;
    }
    if (!(error instanceof ExtensionApiError) || error.status !== 401) throw error;
    const renewed = await renewGroupSession(groupId);
    try {
      return await operation(renewed.groupSessionToken);
    } catch (retryError) {
      if (retryError instanceof ExtensionApiError && retryError.status === 401) {
        await disconnectIdentity().catch(() => undefined);
      } else if (isRemovedMembership(retryError)) {
        await clearAndResyncMembership(groupId).catch(() => undefined);
      }
      throw retryError;
    }
  }
}
