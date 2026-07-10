import type {
  GroupSessionResponse,
  GroupSummary,
  GroupTodayRecommendationsResponse,
  TodayRecommendationResponse
} from "@lunch/shared";
import { STORAGE_KEYS } from "./config";

export interface ExtensionSettings {
  apiBaseUrl: string;
  readToken: string;
  reminderTime: string;
  enabled: boolean;
}

export interface GroupSessionStorage {
  token: string;
  expiresAt?: string | undefined;
}

export interface LocalReminderOverride {
  reminderTime?: string | undefined;
  enabled?: boolean | undefined;
}

export interface ExtensionStorageShape extends ExtensionSettings {
  activeGroupId?: string | undefined;
  identityDisplayName?: string | undefined;
  identityToken?: string | undefined;
  sessionsByGroupId: Record<string, GroupSessionStorage>;
  groupSummariesById: Record<string, GroupSummary>;
  lastRecommendationsByGroupId: Record<string, GroupTodayRecommendationsResponse>;
  localReminderOverridesByGroupId: Record<string, LocalReminderOverride>;
}

export const STORAGE_STATE_LOCK_NAME = "lunch-extension-storage-state";

export type StorageStateUpdater = (
  state: ExtensionStorageShape
) => ExtensionStorageShape;

export function getDefaultStorageState(): ExtensionStorageShape {
  return {
    apiBaseUrl: "http://localhost:3000",
    readToken: "dev-read-token",
    reminderTime: "11:30",
    enabled: true,
    sessionsByGroupId: {},
    groupSummariesById: {},
    lastRecommendationsByGroupId: {},
    localReminderOverridesByGroupId: {}
  };
}

export function getDefaultSettings(): ExtensionSettings {
  const state = getDefaultStorageState();
  return toExtensionSettings(state);
}

export async function getStorageState(): Promise<ExtensionStorageShape> {
  const data = await chrome.storage.local.get([STORAGE_KEYS.settings, STORAGE_KEYS.state]);
  return {
    ...getDefaultStorageState(),
    ...(data[STORAGE_KEYS.settings] ?? {}),
    ...(data[STORAGE_KEYS.state] ?? {})
  };
}

function getStorageLockManager(): LockManager {
  const locks = globalThis.navigator?.locks;
  if (!locks) throw new Error("storage_lock_unavailable");
  return locks;
}

async function writeStorageStateUnlocked(
  state: ExtensionStorageShape
): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.state]: state });
}

export async function saveStorageState(state: ExtensionStorageShape): Promise<void> {
  await getStorageLockManager().request(
    STORAGE_STATE_LOCK_NAME,
    { mode: "exclusive" },
    () => writeStorageStateUnlocked(state)
  );
}

export async function updateStorageState(
  updater: StorageStateUpdater
): Promise<ExtensionStorageShape> {
  return getStorageLockManager().request(
    STORAGE_STATE_LOCK_NAME,
    { mode: "exclusive" },
    async () => {
      const current = await getStorageState();
      const next = updater(current);
      await writeStorageStateUnlocked(next);
      return next;
    }
  );
}

export async function getSettings(): Promise<ExtensionSettings> {
  const state = await getStorageState();
  return toExtensionSettings(state);
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await updateStorageState((state) => ({ ...state, ...settings }));
  await chrome.runtime.sendMessage({ type: "settingsChanged" }).catch(() => undefined);
}

export async function saveIdentityConnection(
  displayName: string,
  identityToken: string
): Promise<void> {
  await updateStorageState((state) => {
    const next: ExtensionStorageShape = {
      ...state,
      identityDisplayName: displayName.trim(),
      identityToken,
      sessionsByGroupId: {},
      groupSummariesById: {},
      lastRecommendationsByGroupId: {},
      localReminderOverridesByGroupId: {}
    };
    delete next.activeGroupId;
    return next;
  });
}

export async function saveGroupConnection(
  response: GroupSessionResponse
): Promise<void> {
  await updateStorageState((state) => ({
    ...state,
    identityToken: response.identityToken,
    activeGroupId: response.group.groupId,
    sessionsByGroupId: {
      ...state.sessionsByGroupId,
      [response.group.groupId]: { token: response.groupSessionToken }
    },
    groupSummariesById: {
      ...state.groupSummariesById,
      [response.group.groupId]: response.group
    }
  }));
}

export async function syncGroupSummaries(groups: GroupSummary[]): Promise<void> {
  const allowed = new Set(groups.map((group) => group.groupId));
  await updateStorageState((state) => {
    const next: ExtensionStorageShape = {
      ...state,
      groupSummariesById: Object.fromEntries(
        groups.map((group) => [group.groupId, group])
      ),
      sessionsByGroupId: Object.fromEntries(
        Object.entries(state.sessionsByGroupId).filter(([groupId]) =>
          allowed.has(groupId)
        )
      )
    };
    if (next.activeGroupId && !allowed.has(next.activeGroupId)) {
      delete next.activeGroupId;
    }
    return next;
  });
}

export async function clearGroupSession(groupId: string): Promise<void> {
  await updateStorageState((state) => {
    const sessionsByGroupId = { ...state.sessionsByGroupId };
    delete sessionsByGroupId[groupId];
    return { ...state, sessionsByGroupId };
  });
}

export async function disconnectIdentity(): Promise<void> {
  await updateStorageState((state) => {
    const next: ExtensionStorageShape = {
      ...state,
      readToken: "",
      sessionsByGroupId: {},
      groupSummariesById: {},
      lastRecommendationsByGroupId: {},
      localReminderOverridesByGroupId: {}
    };
    delete next.identityToken;
    delete next.identityDisplayName;
    delete next.activeGroupId;
    return next;
  });
}

export async function replaceApiBaseUrl(apiBaseUrl: string): Promise<void> {
  const normalized = new URL(apiBaseUrl).toString().replace(/\/$/, "");
  await updateStorageState((state) => ({
    apiBaseUrl: normalized,
    readToken: "",
    reminderTime: state.reminderTime,
    enabled: state.enabled,
    sessionsByGroupId: {},
    groupSummariesById: {},
    lastRecommendationsByGroupId: {},
    localReminderOverridesByGroupId: {}
  }));
}

export async function saveActiveGroupReminderOverride(input: {
  reminderTime: string;
  enabled: boolean;
}): Promise<void> {
  await updateStorageState((state) => {
    if (!state.activeGroupId) {
      return {
        ...state,
        reminderTime: input.reminderTime,
        enabled: input.enabled
      };
    }
    return {
      ...state,
      localReminderOverridesByGroupId: {
        ...state.localReminderOverridesByGroupId,
        [state.activeGroupId]: input
      }
    };
  });
  await chrome.runtime.sendMessage({ type: "settingsChanged" }).catch(() => undefined);
}

export async function getActiveGroupSession(): Promise<{
  groupId: string;
  token: string;
} | null> {
  const state = await getStorageState();
  const groupId = state.activeGroupId;
  if (!groupId) return null;

  const session = state.sessionsByGroupId[groupId];
  if (!session?.token) return null;

  return { groupId, token: session.token };
}

export async function saveGroupRecommendationCache(
  groupId: string,
  response: GroupTodayRecommendationsResponse
): Promise<void> {
  if (response.groupId !== groupId) {
    throw new Error("recommendation_cache_group_mismatch");
  }
  await updateStorageState((state) => ({
    ...state,
    lastRecommendationsByGroupId: {
      ...state.lastRecommendationsByGroupId,
      [groupId]: { ...response, fromCache: true }
    }
  }));
}

export async function getActiveGroupRecommendationCache(): Promise<GroupTodayRecommendationsResponse | null> {
  const state = await getStorageState();
  const groupId = state.activeGroupId;
  if (!groupId) return null;
  const cached = state.lastRecommendationsByGroupId[groupId];
  return cached?.groupId === groupId ? cached : null;
}

export async function getReminderSettingsForActiveGroup(): Promise<
  Pick<ExtensionSettings, "reminderTime" | "enabled">
> {
  const state = await getStorageState();
  const override = state.activeGroupId
    ? state.localReminderOverridesByGroupId[state.activeGroupId]
    : undefined;

  return {
    reminderTime: override?.reminderTime ?? state.reminderTime,
    enabled: override?.enabled ?? state.enabled
  };
}

export async function saveRecommendationCache(response: TodayRecommendationResponse): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.lastRecommendation]: {
      ...response,
      fromCache: true
    }
  });
}

export async function getRecommendationCache(): Promise<TodayRecommendationResponse | null> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.lastRecommendation);
  return data[STORAGE_KEYS.lastRecommendation] ?? null;
}

function toExtensionSettings(state: ExtensionStorageShape): ExtensionSettings {
  return {
    apiBaseUrl: state.apiBaseUrl,
    readToken: state.readToken,
    reminderTime: state.reminderTime,
    enabled: state.enabled
  };
}
