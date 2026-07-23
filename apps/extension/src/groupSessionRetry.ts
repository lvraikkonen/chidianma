import {
  AUTHORIZATION_HEADER,
  GROUP_ROUTES,
  type GroupsListResponse,
  type RefreshGroupSessionResponse
} from "@lunch/shared";
import { ExtensionApiError, requestJson } from "./apiClient";
import {
  clearGroupSessionIfCurrent,
  disconnectIdentityIfCurrent,
  getStorageState,
  groupSummariesStorageGuardFor,
  saveGroupConnectionIfCurrent,
  syncGroupSummariesIfCurrent,
  type ExtensionStorageShape,
  type GroupSessionStorageGuard,
  type IdentityStorageGuard
} from "./storage";

interface RenewedGroupSession {
  groupSessionToken: string;
  guard: GroupSessionStorageGuard;
}

export interface GroupSessionRetrySnapshot {
  apiBaseUrl: string;
  identityId?: string | undefined;
  identityToken: string;
  membershipId: string;
  authorizationRevision: number;
}

const refreshFlights = new Map<string, Promise<RenewedGroupSession>>();

function isRemovedMembership(error: unknown): error is ExtensionApiError {
  return error instanceof ExtensionApiError
    && error.status === 403
    && ["removed_member", "active_membership_required"].includes(error.code ?? "");
}

function groupGuardFor(
  storage: ExtensionStorageShape,
  groupId: string,
  groupSessionToken: string
): GroupSessionStorageGuard | null {
  const group = storage.groupSummariesById[groupId];
  if (
    !storage.identityToken
    || storage.activeGroupId !== groupId
    || storage.sessionsByGroupId[groupId]?.token !== groupSessionToken
    || !group?.membershipId
  ) {
    return null;
  }
  return {
    apiBaseUrl: storage.apiBaseUrl,
    identityId: storage.identityId,
    identityToken: storage.identityToken,
    authorizationRevision: storage.authorizationRevision,
    groupId,
    membershipId: group.membershipId,
    groupSessionToken
  };
}

function identityGuardFor(storage: ExtensionStorageShape): IdentityStorageGuard | null {
  if (!storage.identityToken) return null;
  return {
    apiBaseUrl: storage.apiBaseUrl,
    identityId: storage.identityId,
    identityToken: storage.identityToken,
    authorizationRevision: storage.authorizationRevision
  };
}

function retrySnapshotMatches(
  storage: ExtensionStorageShape,
  groupId: string,
  snapshot: GroupSessionRetrySnapshot
): boolean {
  return storage.apiBaseUrl === snapshot.apiBaseUrl
    && storage.identityId === snapshot.identityId
    && storage.identityToken === snapshot.identityToken
    && storage.authorizationRevision === snapshot.authorizationRevision
    && storage.activeGroupId === groupId
    && storage.groupSummariesById[groupId]?.membershipId
      === snapshot.membershipId;
}

export function groupSessionRetrySnapshotForStorage(
  storage: ExtensionStorageShape,
  groupId: string
): GroupSessionRetrySnapshot | undefined {
  const identityToken = storage.identityToken;
  const membershipId = storage.groupSummariesById[groupId]?.membershipId;
  if (!identityToken || !membershipId) return undefined;
  return {
    apiBaseUrl: storage.apiBaseUrl,
    identityId: storage.identityId,
    identityToken,
    membershipId,
    authorizationRevision: storage.authorizationRevision
  };
}

async function clearAndResyncMembership(
  guard: GroupSessionStorageGuard
): Promise<void> {
  const cleared = await clearGroupSessionIfCurrent(guard);
  if (!cleared) return;

  const storage = await getStorageState();
  const identityGuard = identityGuardFor(storage);
  const summariesGuard = groupSummariesStorageGuardFor(storage);
  if (!identityGuard || !summariesGuard) return;
  try {
    const response = await requestJson<GroupsListResponse>(
      new URL(GROUP_ROUTES.groups, storage.apiBaseUrl),
      { headers: { [AUTHORIZATION_HEADER]: `Bearer ${storage.identityToken}` } }
    );
    await syncGroupSummariesIfCurrent(response.groups, summariesGuard);
  } catch (error) {
    if (error instanceof ExtensionApiError && error.status === 401) {
      await disconnectIdentityIfCurrent(identityGuard).catch(() => undefined);
    }
  }
}

async function clearCurrentMembership(
  groupId: string,
  groupSessionToken: string
): Promise<void> {
  const storage = await getStorageState();
  const guard = groupGuardFor(storage, groupId, groupSessionToken);
  if (guard) await clearAndResyncMembership(guard);
}

async function renewGroupSession(
  groupId: string,
  groupSessionToken: string,
  snapshot?: GroupSessionRetrySnapshot
): Promise<RenewedGroupSession> {
  const storage = await getStorageState();
  if (!storage.identityToken) {
    throw new ExtensionApiError({
      kind: "http",
      status: 401,
      code: "identity_connection_required"
    });
  }
  if (snapshot && !retrySnapshotMatches(storage, groupId, snapshot)) {
    throw new ExtensionApiError({
      kind: "invalid-response",
      code: "group_context_stale"
    });
  }
  const guard = groupGuardFor(storage, groupId, groupSessionToken);
  if (!guard) {
    throw new ExtensionApiError({
      kind: "invalid-response",
      code: "group_context_stale"
    });
  }

  const key = [
    guard.apiBaseUrl,
    guard.identityId ?? "unknown",
    guard.identityToken,
    guard.authorizationRevision,
    guard.groupId,
    guard.membershipId,
    guard.groupSessionToken
  ].join("\n");
  const existing = refreshFlights.get(key);
  if (existing) return existing;

  const flight = requestJson<RefreshGroupSessionResponse>(
    new URL(GROUP_ROUTES.groupSession(groupId), guard.apiBaseUrl),
    {
      method: "POST",
      headers: { [AUTHORIZATION_HEADER]: `Bearer ${guard.identityToken}` }
    }
  ).then(async (response): Promise<RenewedGroupSession> => {
    const committed = await saveGroupConnectionIfCurrent(response, guard);
    if (!committed) {
      throw new ExtensionApiError({
        kind: "invalid-response",
        code: "group_context_stale"
      });
    }
    return {
      groupSessionToken: response.groupSessionToken,
      guard: {
        ...guard,
        identityToken: response.identityToken,
        groupSessionToken: response.groupSessionToken,
        membershipId: response.group.membershipId
      }
    };
  }).catch(async (error: unknown) => {
    if (error instanceof ExtensionApiError && error.status === 401) {
      await disconnectIdentityIfCurrent(guard).catch(() => undefined);
    } else if (isRemovedMembership(error)) {
      await clearAndResyncMembership(guard).catch(() => undefined);
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
  operation: (token: string) => Promise<T>,
  snapshot?: GroupSessionRetrySnapshot
): Promise<T> {
  try {
    return await operation(token);
  } catch (error) {
    if (isRemovedMembership(error)) {
      await clearCurrentMembership(groupId, token).catch(() => undefined);
      throw error;
    }
    if (!(error instanceof ExtensionApiError) || error.status !== 401) throw error;
    const renewed = await renewGroupSession(groupId, token, snapshot);
    try {
      return await operation(renewed.groupSessionToken);
    } catch (retryError) {
      if (retryError instanceof ExtensionApiError && retryError.status === 401) {
        await disconnectIdentityIfCurrent(renewed.guard).catch(() => undefined);
      } else if (isRemovedMembership(retryError)) {
        await clearAndResyncMembership(renewed.guard).catch(() => undefined);
      }
      throw retryError;
    }
  }
}
