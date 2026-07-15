import type {
  GroupSettingsResponse,
  GroupSessionResponse,
  GroupSummary,
  GroupTodayRecommendationsResponse,
  TodayRecommendationResponse
} from "@lunch/shared";
import { STORAGE_KEYS } from "./config";
import {
  getReminderFingerprint,
  isStrictReminderTime,
  validateGroupSettingsForReminder
} from "./reminderPolicy";

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
  readonly enabled?: boolean | undefined;
  weekdayReminderEnabled?: boolean | undefined;
  secondReminderEnabled?: boolean | undefined;
}

export interface GroupSettingsCacheEntry {
  response: GroupSettingsResponse;
  cachedAt: string;
}

export type ScheduledPrimaryReminder =
  | { revision: number; mode: "legacy"; scheduledFor: number }
  | {
    revision: number;
    mode: "group";
    groupId: string;
    scheduledFor: number;
  };

export interface PendingSecondReminder {
  revision: number;
  groupId: string;
  officeDate: string;
  scheduledFor: number;
}

export interface ExtensionStorageShape extends ExtensionSettings {
  activeGroupId?: string | undefined;
  identityDisplayName?: string | undefined;
  identityToken?: string | undefined;
  sessionsByGroupId: Record<string, GroupSessionStorage>;
  groupSummariesById: Record<string, GroupSummary>;
  lastRecommendationsByGroupId: Record<string, GroupTodayRecommendationsResponse>;
  localReminderOverridesByGroupId: Record<string, LocalReminderOverride>;
  groupSettingsCacheByGroupId: Record<string, GroupSettingsCacheEntry>;
  reminderRevision: number;
  scheduledPrimaryReminder?: ScheduledPrimaryReminder | undefined;
  pendingSecondReminder?: PendingSecondReminder | undefined;
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
    localReminderOverridesByGroupId: {},
    groupSettingsCacheByGroupId: {},
    reminderRevision: 0
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
  await updateStorageState((state) => invalidateReminderContext({
    ...state,
    ...settings
  }));
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
      localReminderOverridesByGroupId: {},
      groupSettingsCacheByGroupId: {},
      reminderRevision: state.reminderRevision + 1
    };
    delete next.activeGroupId;
    delete next.scheduledPrimaryReminder;
    delete next.pendingSecondReminder;
    return next;
  });
  await notifyReminderContextChanged();
}

export async function saveGroupConnection(
  response: GroupSessionResponse
): Promise<void> {
  let contextChanged = false;
  await updateStorageState((state) => {
    const next = {
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
    };
    contextChanged = state.activeGroupId !== response.group.groupId
      || state.sessionsByGroupId[response.group.groupId]?.token
        !== response.groupSessionToken;
    return contextChanged ? invalidateReminderContext(next) : next;
  });
  if (contextChanged) await notifyReminderContextChanged();
}

export async function syncGroupSummaries(groups: GroupSummary[]): Promise<void> {
  const allowed = new Set(groups.map((group) => group.groupId));
  let contextChanged = false;
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
      ),
      groupSettingsCacheByGroupId: Object.fromEntries(
        Object.entries(state.groupSettingsCacheByGroupId).filter(([groupId]) =>
          allowed.has(groupId)
        )
      )
    };
    if (next.activeGroupId && !allowed.has(next.activeGroupId)) {
      contextChanged = true;
      delete next.activeGroupId;
      return invalidateReminderContext(next);
    }
    return next;
  });
  if (contextChanged) await notifyReminderContextChanged();
}

export async function clearGroupSession(groupId: string): Promise<void> {
  let contextChanged = false;
  await updateStorageState((state) => {
    const sessionsByGroupId = { ...state.sessionsByGroupId };
    contextChanged = state.activeGroupId === groupId
      && Boolean(sessionsByGroupId[groupId]?.token);
    delete sessionsByGroupId[groupId];
    const next = { ...state, sessionsByGroupId };
    return contextChanged
      ? invalidateReminderContext(next)
      : next;
  });
  if (contextChanged) await notifyReminderContextChanged();
}

export async function disconnectIdentity(): Promise<void> {
  await updateStorageState((state) => {
    const next: ExtensionStorageShape = {
      ...state,
      readToken: "",
      sessionsByGroupId: {},
      groupSummariesById: {},
      lastRecommendationsByGroupId: {},
      localReminderOverridesByGroupId: {},
      groupSettingsCacheByGroupId: {},
      reminderRevision: state.reminderRevision + 1
    };
    delete next.identityToken;
    delete next.identityDisplayName;
    delete next.activeGroupId;
    delete next.scheduledPrimaryReminder;
    delete next.pendingSecondReminder;
    return next;
  });
  await notifyReminderContextChanged();
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
    localReminderOverridesByGroupId: {},
    groupSettingsCacheByGroupId: {},
    reminderRevision: state.reminderRevision + 1
  }));
  await notifyReminderContextChanged();
}

export async function saveActiveGroupReminderOverride(input: {
  reminderTime: string;
  enabled: boolean;
}): Promise<void> {
  await updateStorageState((state) => {
    if (!state.activeGroupId) {
      return invalidateReminderContext({
        ...state,
        reminderTime: input.reminderTime,
        enabled: input.enabled
      });
    }
    return invalidateReminderContext({
      ...state,
      localReminderOverridesByGroupId: {
        ...state.localReminderOverridesByGroupId,
        [state.activeGroupId]: input
      }
    });
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

function invalidateReminderContext(
  state: ExtensionStorageShape
): ExtensionStorageShape {
  const next: ExtensionStorageShape = {
    ...state,
    reminderRevision: state.reminderRevision + 1
  };
  delete next.scheduledPrimaryReminder;
  delete next.pendingSecondReminder;
  return next;
}

async function notifyReminderContextChanged(): Promise<void> {
  await chrome.runtime.sendMessage({ type: "reminderContextChanged" })
    .catch(() => undefined);
}

function requireActiveGroupContext(
  state: ExtensionStorageShape,
  groupId: string
): void {
  if (
    state.activeGroupId !== groupId
    || !state.sessionsByGroupId[groupId]?.token
  ) {
    throw new Error("stale_group_context");
  }
}

export async function saveGroupSettingsCache(
  groupId: string,
  response: GroupSettingsResponse,
  cachedAt: string,
  options: { notify?: boolean } = {}
): Promise<void> {
  validateGroupSettingsForReminder(groupId, response);
  if (!Number.isFinite(Date.parse(cachedAt))) throw new Error("invalid_cached_at");
  let changed = false;
  await updateStorageState((state) => {
    requireActiveGroupContext(state, groupId);
    const before = getReminderFingerprint(state);
    const next: ExtensionStorageShape = {
      ...state,
      groupSettingsCacheByGroupId: {
        ...state.groupSettingsCacheByGroupId,
        [groupId]: { response, cachedAt }
      }
    };
    changed = before !== getReminderFingerprint(next);
    return changed ? invalidateReminderContext(next) : next;
  });
  if (changed && options.notify !== false) await notifyReminderContextChanged();
}

export async function saveGroupReminderOverride(
  groupId: string,
  input: {
    reminderTime: string;
    weekdayReminderEnabled: boolean;
    secondReminderEnabled: boolean;
  }
): Promise<void> {
  if (!isStrictReminderTime(input.reminderTime)) {
    throw new Error("invalid_reminder_time");
  }
  let changed = false;
  await updateStorageState((state) => {
    requireActiveGroupContext(state, groupId);
    const current = state.localReminderOverridesByGroupId[groupId];
    const canonical: LocalReminderOverride = {
      reminderTime: input.reminderTime,
      weekdayReminderEnabled: input.weekdayReminderEnabled,
      secondReminderEnabled: input.secondReminderEnabled
    };
    changed = JSON.stringify(current ?? null) !== JSON.stringify(canonical);
    if (!changed) return state;
    return invalidateReminderContext({
      ...state,
      localReminderOverridesByGroupId: {
        ...state.localReminderOverridesByGroupId,
        [groupId]: canonical
      }
    });
  });
  if (changed) await notifyReminderContextChanged();
}

export async function clearGroupReminderOverride(groupId: string): Promise<void> {
  let changed = false;
  await updateStorageState((state) => {
    requireActiveGroupContext(state, groupId);
    if (!state.localReminderOverridesByGroupId[groupId]) return state;
    changed = true;
    const overrides = { ...state.localReminderOverridesByGroupId };
    delete overrides[groupId];
    return invalidateReminderContext({
      ...state,
      localReminderOverridesByGroupId: overrides
    });
  });
  if (changed) await notifyReminderContextChanged();
}

function isPrimaryContextCurrent(
  state: ExtensionStorageShape,
  context: ScheduledPrimaryReminder
): boolean {
  if (context.revision !== state.reminderRevision) return false;
  if (context.mode === "legacy") return !state.activeGroupId;
  return state.activeGroupId === context.groupId
    && Boolean(state.sessionsByGroupId[context.groupId]?.token);
}

function isSecondContextCurrent(
  state: ExtensionStorageShape,
  context: PendingSecondReminder
): boolean {
  return context.revision === state.reminderRevision
    && state.activeGroupId === context.groupId
    && Boolean(state.sessionsByGroupId[context.groupId]?.token);
}

export async function saveScheduledPrimaryReminder(
  context: ScheduledPrimaryReminder
): Promise<void> {
  await updateStorageState((state) => {
    if (!isPrimaryContextCurrent(state, context)) {
      throw new Error("stale_reminder_context");
    }
    return { ...state, scheduledPrimaryReminder: context };
  });
}

export async function claimScheduledPrimaryReminder(): Promise<
  ScheduledPrimaryReminder | null
> {
  let claimed: ScheduledPrimaryReminder | null = null;
  await updateStorageState((state) => {
    const context = state.scheduledPrimaryReminder;
    const next = { ...state };
    delete next.scheduledPrimaryReminder;
    if (context && isPrimaryContextCurrent(state, context)) claimed = context;
    return next;
  });
  return claimed;
}

export async function savePendingSecondReminder(
  context: PendingSecondReminder
): Promise<void> {
  await updateStorageState((state) => {
    if (!isSecondContextCurrent(state, context)) {
      throw new Error("stale_reminder_context");
    }
    return { ...state, pendingSecondReminder: context };
  });
}

export async function claimPendingSecondReminder(): Promise<
  PendingSecondReminder | null
> {
  let claimed: PendingSecondReminder | null = null;
  await updateStorageState((state) => {
    const context = state.pendingSecondReminder;
    const next = { ...state };
    delete next.pendingSecondReminder;
    if (context && isSecondContextCurrent(state, context)) claimed = context;
    return next;
  });
  return claimed;
}

export async function clearReminderAlarmContexts(): Promise<void> {
  await updateStorageState((state) => {
    const next = { ...state };
    delete next.scheduledPrimaryReminder;
    delete next.pendingSecondReminder;
    return next;
  });
}

export async function clearScheduledPrimaryReminder(): Promise<void> {
  await updateStorageState((state) => {
    if (!state.scheduledPrimaryReminder) return state;
    const next = { ...state };
    delete next.scheduledPrimaryReminder;
    return next;
  });
}

export async function clearPendingSecondReminder(): Promise<void> {
  await updateStorageState((state) => {
    if (!state.pendingSecondReminder) return state;
    const next = { ...state };
    delete next.pendingSecondReminder;
    return next;
  });
}

export function isStoredReminderContextCurrent(
  state: ExtensionStorageShape,
  input: { revision: number; groupId?: string | undefined }
): boolean {
  if (input.revision !== state.reminderRevision) return false;
  if (!input.groupId) return !state.activeGroupId;
  return state.activeGroupId === input.groupId
    && Boolean(state.sessionsByGroupId[input.groupId]?.token);
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
    enabled: override?.weekdayReminderEnabled ?? override?.enabled ?? state.enabled
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
