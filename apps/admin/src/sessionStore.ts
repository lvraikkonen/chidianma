import type { CreateIdentityResponse, GroupSessionResponse, GroupSummary } from "@lunch/shared";

export const ADMIN_SESSION_KEY = "lunchAdminSessionState.v2";
const API_BASE_URL = import.meta.env.PROD ? "" : (import.meta.env.VITE_API_BASE_URL ?? "");

export interface AdminSessionState {
  version: 2;
  apiBaseUrl: string;
  identityId?: string | undefined;
  displayName?: string | undefined;
  identityToken?: string | undefined;
  identityTokenExpiresAt?: string | undefined;
  activeGroupId?: string | undefined;
  sessionsByGroupId: Record<string, { token: string; expiresAt?: string | undefined }>;
  groupSummariesById: Record<string, GroupSummary>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getDefaultAdminSession(): AdminSessionState {
  return {
    version: 2,
    apiBaseUrl: API_BASE_URL,
    sessionsByGroupId: {},
    groupSummariesById: {}
  };
}

export function readAdminSession(): AdminSessionState {
  const raw = window.localStorage.getItem(ADMIN_SESSION_KEY);
  if (!raw) return getDefaultAdminSession();

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)
      || parsed.version !== 2
      || typeof parsed.apiBaseUrl !== "string"
      || !isRecord(parsed.sessionsByGroupId)
      || !isRecord(parsed.groupSummariesById)) {
      return getDefaultAdminSession();
    }
    return {
      version: 2,
      apiBaseUrl: parsed.apiBaseUrl,
      ...(typeof parsed.identityId === "string" ? { identityId: parsed.identityId } : {}),
      ...(typeof parsed.displayName === "string" ? { displayName: parsed.displayName } : {}),
      ...(typeof parsed.identityToken === "string" ? { identityToken: parsed.identityToken } : {}),
      ...(typeof parsed.identityTokenExpiresAt === "string"
        ? { identityTokenExpiresAt: parsed.identityTokenExpiresAt }
        : {}),
      ...(typeof parsed.activeGroupId === "string" ? { activeGroupId: parsed.activeGroupId } : {}),
      sessionsByGroupId: parsed.sessionsByGroupId as AdminSessionState["sessionsByGroupId"],
      groupSummariesById: parsed.groupSummariesById as AdminSessionState["groupSummariesById"]
    };
  } catch {
    return getDefaultAdminSession();
  }
}

export function writeAdminSession(state: AdminSessionState): void {
  window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(state));
}

export function saveIdentity(response: CreateIdentityResponse): void {
  writeAdminSession({
    ...getDefaultAdminSession(),
    identityId: response.identityId,
    displayName: response.displayName.trim(),
    identityToken: response.identityToken,
    identityTokenExpiresAt: response.identityTokenExpiresAt
  });
}

export function saveRenewedIdentity(response: CreateIdentityResponse): void {
  const state = readAdminSession();
  writeAdminSession({
    ...state,
    identityId: response.identityId,
    displayName: response.displayName.trim(),
    identityToken: response.identityToken,
    identityTokenExpiresAt: response.identityTokenExpiresAt
  });
}

export function saveResetIdentity(response: CreateIdentityResponse): void {
  const state = readAdminSession();
  const next: AdminSessionState = {
    ...state,
    identityId: response.identityId,
    displayName: response.displayName.trim(),
    identityToken: response.identityToken,
    identityTokenExpiresAt: response.identityTokenExpiresAt,
    sessionsByGroupId: {}
  };
  delete next.activeGroupId;
  writeAdminSession(next);
}

export function saveGroupSession(response: GroupSessionResponse): void {
  const state = readAdminSession();
  writeAdminSession({
    ...state,
    identityToken: response.identityToken,
    identityTokenExpiresAt: response.identityTokenExpiresAt,
    activeGroupId: response.group.groupId,
    sessionsByGroupId: {
      ...state.sessionsByGroupId,
      [response.group.groupId]: {
        token: response.groupSessionToken,
        expiresAt: response.groupSessionTokenExpiresAt
      }
    },
    groupSummariesById: {
      ...state.groupSummariesById,
      [response.group.groupId]: response.group
    }
  });
}

export function syncGroups(groups: GroupSummary[]): void {
  const state = readAdminSession();
  const ids = new Set(groups.map((group) => group.groupId));
  const next: AdminSessionState = {
    ...state,
    groupSummariesById: Object.fromEntries(
      groups.map((group) => [group.groupId, group])
    ),
    sessionsByGroupId: Object.fromEntries(
      Object.entries(state.sessionsByGroupId).filter(([groupId]) => ids.has(groupId))
    )
  };
  if (next.activeGroupId && !ids.has(next.activeGroupId)) delete next.activeGroupId;
  writeAdminSession(next);
}

export function clearGroupSession(groupId: string): void {
  const state = readAdminSession();
  const sessionsByGroupId = { ...state.sessionsByGroupId };
  delete sessionsByGroupId[groupId];
  const next: AdminSessionState = { ...state, sessionsByGroupId };
  if (next.activeGroupId === groupId) delete next.activeGroupId;
  writeAdminSession(next);
}

export function disconnectAdmin(): void {
  window.localStorage.removeItem(ADMIN_SESSION_KEY);
}

export function getIdentityContext() {
  const state = readAdminSession();
  return state.identityToken
    ? { apiBaseUrl: state.apiBaseUrl, token: state.identityToken }
    : null;
}

export function getActiveGroupContext() {
  const state = readAdminSession();
  const groupId = state.activeGroupId;
  if (!groupId) return null;
  const session = state.sessionsByGroupId[groupId];
  const group = state.groupSummariesById[groupId];
  return session && group
    ? { apiBaseUrl: state.apiBaseUrl, groupId, token: session.token, group }
    : null;
}
