import type {
  CreateIdentityResponse,
  GroupSettingsResponse,
  GroupSessionResponse,
  GroupSummary,
  GroupTodayRecommendationsResponse
} from "@lunch/shared";
import { STORAGE_KEYS, STORAGE_STATE_LOCK_NAME } from "./config";
import {
  DEFAULT_API_BASE_URL,
  IS_INTERNAL_BUILD,
  PRODUCTION_API_ORIGIN
} from "./buildProfile";
import {
  getReminderFingerprint,
  isStrictReminderTime,
  validateGroupSettingsForReminder
} from "./reminderPolicy";

export interface ExtensionSettings {
  apiBaseUrl: string;
  reminderTime: string;
  enabled: boolean;
}

export interface GroupSessionStorage {
  token: string;
  expiresAt?: string | undefined;
}

export interface IdentityStorageGuard {
  apiBaseUrl: string;
  identityId?: string | undefined;
  identityToken: string;
}

export interface GroupSessionStorageGuard extends IdentityStorageGuard {
  groupId: string;
  membershipId: string;
  groupSessionToken: string;
}

export interface GroupSummariesStorageGuard extends IdentityStorageGuard {
  groupContextFingerprint: string;
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
  {
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
  identityId?: string | undefined;
  activeGroupId?: string | undefined;
  identityDisplayName?: string | undefined;
  identityToken?: string | undefined;
  identityTokenExpiresAt?: string | undefined;
  sessionsByGroupId: Record<string, GroupSessionStorage>;
  groupSummariesById: Record<string, GroupSummary>;
  lastRecommendationsByGroupId: Record<string, GroupTodayRecommendationsResponse>;
  localReminderOverridesByGroupId: Record<string, LocalReminderOverride>;
  groupSettingsCacheByGroupId: Record<string, GroupSettingsCacheEntry>;
  reminderRevision: number;
  scheduledPrimaryReminder?: ScheduledPrimaryReminder | undefined;
  pendingSecondReminder?: PendingSecondReminder | undefined;
}

export { STORAGE_STATE_LOCK_NAME } from "./config";

export type StorageStateUpdater = (
  state: ExtensionStorageShape
) => ExtensionStorageShape;

export function getDefaultStorageState(): ExtensionStorageShape {
  return {
    apiBaseUrl: DEFAULT_API_BASE_URL,
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
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.settings,
    STORAGE_KEYS.state,
    "lunchLastRecommendation"
  ]);
  const merged = {
    ...getDefaultStorageState(),
    ...(data[STORAGE_KEYS.settings] ?? {}),
    ...(data[STORAGE_KEYS.state] ?? {})
  } as ExtensionStorageShape & { readToken?: unknown };
  const { readToken: _legacyReadToken, ...withoutReadToken } = merged;
  const normalized = withoutReadToken as ExtensionStorageShape;
  const profileAdjusted = IS_INTERNAL_BUILD
    && normalized.apiBaseUrl !== PRODUCTION_API_ORIGIN;
  if (profileAdjusted) normalized.apiBaseUrl = PRODUCTION_API_ORIGIN;
  if (normalized.scheduledPrimaryReminder?.mode !== "group") {
    delete normalized.scheduledPrimaryReminder;
  }
  if (
    _legacyReadToken !== undefined
    || data[STORAGE_KEYS.settings] !== undefined
    || data.lunchLastRecommendation !== undefined
    || profileAdjusted
  ) {
    await chrome.storage.local.set({ [STORAGE_KEYS.state]: normalized });
    await chrome.storage.local.remove([
      STORAGE_KEYS.settings,
      "lunchLastRecommendation"
    ]);
  }
  return normalized;
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
  return mutateStorageState(updater);
}

async function mutateStorageState(
  updater: StorageStateUpdater,
  shouldClearLuckyWheelSession?: (
    current: ExtensionStorageShape,
    next: ExtensionStorageShape
  ) => boolean
): Promise<ExtensionStorageShape> {
  return getStorageLockManager().request(
    STORAGE_STATE_LOCK_NAME,
    { mode: "exclusive" },
    async () => {
      const current = await getStorageState();
      const next = updater(current);
      await writeStorageStateUnlocked(next);
      if (shouldClearLuckyWheelSession?.(current, next)) {
        await chrome.storage.local.remove(STORAGE_KEYS.luckyWheelSession);
      }
      return next;
    }
  );
}

export async function getSettings(): Promise<ExtensionSettings> {
  const state = await getStorageState();
  return toExtensionSettings(state);
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await mutateStorageState((state) => invalidateReminderContext({
    ...state,
    ...settings
  }), (current, next) => current.apiBaseUrl !== next.apiBaseUrl);
  await chrome.runtime.sendMessage({ type: "settingsChanged" }).catch(() => undefined);
}

export async function saveIdentityConnection(
  response: CreateIdentityResponse
): Promise<void> {
  await mutateStorageState((state) => {
    const next: ExtensionStorageShape = {
      ...state,
      identityId: response.identityId,
      identityDisplayName: response.displayName.trim(),
      identityToken: response.identityToken,
      identityTokenExpiresAt: response.identityTokenExpiresAt,
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
  }, () => true);
  await notifyReminderContextChanged();
}

export async function saveRenewedIdentityConnection(
  response: CreateIdentityResponse
): Promise<void> {
  await updateStorageState((state) => ({
    ...state,
    identityId: response.identityId,
    identityDisplayName: response.displayName.trim(),
    identityToken: response.identityToken,
    identityTokenExpiresAt: response.identityTokenExpiresAt
  }));
}

export async function saveResetIdentityConnection(
  response: CreateIdentityResponse
): Promise<void> {
  await mutateStorageState((state) => {
    const next: ExtensionStorageShape = {
      ...state,
      identityId: response.identityId,
      identityDisplayName: response.displayName.trim(),
      identityToken: response.identityToken,
      identityTokenExpiresAt: response.identityTokenExpiresAt,
      sessionsByGroupId: {},
      reminderRevision: state.reminderRevision + 1
    };
    delete next.activeGroupId;
    delete next.scheduledPrimaryReminder;
    delete next.pendingSecondReminder;
    return next;
  }, () => true);
  await notifyReminderContextChanged();
}

function identityGuardMatches(
  state: ExtensionStorageShape,
  guard: IdentityStorageGuard
): boolean {
  return state.apiBaseUrl === guard.apiBaseUrl
    && state.identityId === guard.identityId
    && state.identityToken === guard.identityToken;
}

function groupSessionGuardMatches(
  state: ExtensionStorageShape,
  guard: GroupSessionStorageGuard
): boolean {
  return identityGuardMatches(state, guard)
    && state.activeGroupId === guard.groupId
    && state.groupSummariesById[guard.groupId]?.membershipId
      === guard.membershipId
    && state.sessionsByGroupId[guard.groupId]?.token
      === guard.groupSessionToken;
}

function groupContextFingerprint(state: ExtensionStorageShape): string {
  const groupIds = [...new Set([
    ...Object.keys(state.sessionsByGroupId),
    ...Object.keys(state.groupSummariesById)
  ])].sort();
  return JSON.stringify({
    activeGroupId: state.activeGroupId ?? null,
    groups: groupIds.map((groupId) => {
      const group = state.groupSummariesById[groupId];
      const session = state.sessionsByGroupId[groupId];
      return [
        groupId,
        group?.membershipId ?? null,
        group?.role ?? null,
        group?.name ?? null,
        session?.token ?? null,
        session?.expiresAt ?? null
      ];
    })
  });
}

export function groupSummariesStorageGuardFor(
  state: ExtensionStorageShape
): GroupSummariesStorageGuard | null {
  if (!state.identityToken) return null;
  return {
    apiBaseUrl: state.apiBaseUrl,
    identityId: state.identityId,
    identityToken: state.identityToken,
    groupContextFingerprint: groupContextFingerprint(state)
  };
}

function groupSummariesGuardMatches(
  state: ExtensionStorageShape,
  guard: GroupSummariesStorageGuard
): boolean {
  return identityGuardMatches(state, guard)
    && groupContextFingerprint(state) === guard.groupContextFingerprint;
}

async function commitGroupConnection(
  response: GroupSessionResponse,
  guard?: GroupSessionStorageGuard
): Promise<boolean> {
  let committed = false;
  let contextChanged = false;
  await mutateStorageState((state) => {
    if (
      guard
      && (
        response.group.groupId !== guard.groupId
        || response.group.membershipId !== guard.membershipId
        || !groupSessionGuardMatches(state, guard)
      )
    ) {
      return state;
    }
    committed = true;
    const next = {
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
    };
    contextChanged = state.activeGroupId !== response.group.groupId
      || state.sessionsByGroupId[response.group.groupId]?.token
        !== response.groupSessionToken;
    return contextChanged ? invalidateReminderContext(next) : next;
  }, (current, next) => (
    current.activeGroupId !== next.activeGroupId
    || (
      next.activeGroupId !== undefined
      && current.groupSummariesById[next.activeGroupId]?.membershipId
        !== next.groupSummariesById[next.activeGroupId]?.membershipId
    )
  ));
  if (committed && contextChanged) await notifyReminderContextChanged();
  return committed;
}

export async function saveGroupConnection(
  response: GroupSessionResponse
): Promise<void> {
  await commitGroupConnection(response);
}

export async function saveGroupConnectionIfCurrent(
  response: GroupSessionResponse,
  guard: GroupSessionStorageGuard
): Promise<boolean> {
  return commitGroupConnection(response, guard);
}

async function commitGroupSummaries(
  groups: GroupSummary[],
  guard?: GroupSummariesStorageGuard
): Promise<boolean> {
  const allowed = new Set(groups.map((group) => group.groupId));
  let committed = false;
  let contextChanged = false;
  await mutateStorageState((state) => {
    if (guard && !groupSummariesGuardMatches(state, guard)) return state;
    committed = true;
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
  }, (current, next) => committed && (
    current.activeGroupId !== next.activeGroupId
    || (
      next.activeGroupId !== undefined
      && current.groupSummariesById[next.activeGroupId]?.membershipId
        !== next.groupSummariesById[next.activeGroupId]?.membershipId
    )
  ));
  if (committed && contextChanged) await notifyReminderContextChanged();
  return committed;
}

export async function syncGroupSummaries(groups: GroupSummary[]): Promise<void> {
  await commitGroupSummaries(groups);
}

export async function syncGroupSummariesIfCurrent(
  groups: GroupSummary[],
  guard: GroupSummariesStorageGuard
): Promise<boolean> {
  return commitGroupSummaries(groups, guard);
}

async function clearGroupSessionWithGuard(
  groupId: string,
  guard?: GroupSessionStorageGuard
): Promise<boolean> {
  let committed = false;
  let contextChanged = false;
  await mutateStorageState((state) => {
    if (guard && !groupSessionGuardMatches(state, guard)) return state;
    committed = true;
    const sessionsByGroupId = { ...state.sessionsByGroupId };
    contextChanged = state.activeGroupId === groupId
      && Boolean(sessionsByGroupId[groupId]?.token);
    delete sessionsByGroupId[groupId];
    const next = { ...state, sessionsByGroupId };
    return contextChanged
      ? invalidateReminderContext(next)
      : next;
  }, (current) => committed && current.activeGroupId === groupId);
  if (committed && contextChanged) await notifyReminderContextChanged();
  return committed;
}

export async function clearGroupSession(groupId: string): Promise<void> {
  await clearGroupSessionWithGuard(groupId);
}

export async function clearGroupSessionIfCurrent(
  guard: GroupSessionStorageGuard
): Promise<boolean> {
  return clearGroupSessionWithGuard(guard.groupId, guard);
}

async function disconnectIdentityWithGuard(
  guard?: IdentityStorageGuard | GroupSessionStorageGuard
): Promise<boolean> {
  let committed = false;
  await mutateStorageState((state) => {
    if (
      guard
      && (
        "groupId" in guard
          ? !groupSessionGuardMatches(state, guard)
          : !identityGuardMatches(state, guard)
      )
    ) {
      return state;
    }
    committed = true;
    const next: ExtensionStorageShape = {
      ...state,
      sessionsByGroupId: {},
      groupSummariesById: {},
      lastRecommendationsByGroupId: {},
      localReminderOverridesByGroupId: {},
      groupSettingsCacheByGroupId: {},
      reminderRevision: state.reminderRevision + 1
    };
    delete next.identityToken;
    delete next.identityTokenExpiresAt;
    delete next.identityId;
    delete next.identityDisplayName;
    delete next.activeGroupId;
    delete next.scheduledPrimaryReminder;
    delete next.pendingSecondReminder;
    return next;
  }, () => committed);
  if (committed) await notifyReminderContextChanged();
  return committed;
}

export async function disconnectIdentity(): Promise<void> {
  await disconnectIdentityWithGuard();
}

export async function disconnectIdentityIfCurrent(
  guard: IdentityStorageGuard | GroupSessionStorageGuard
): Promise<boolean> {
  return disconnectIdentityWithGuard(guard);
}

export async function replaceApiBaseUrl(apiBaseUrl: string): Promise<void> {
  const normalized = new URL(apiBaseUrl).toString().replace(/\/$/, "");
  await mutateStorageState((state) => ({
    apiBaseUrl: normalized,
    reminderTime: state.reminderTime,
    enabled: state.enabled,
    sessionsByGroupId: {},
    groupSummariesById: {},
    lastRecommendationsByGroupId: {},
    localReminderOverridesByGroupId: {},
    groupSettingsCacheByGroupId: {},
    reminderRevision: state.reminderRevision + 1
  }), () => true);
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
  if (!input.groupId) return false;
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

function toExtensionSettings(state: ExtensionStorageShape): ExtensionSettings {
  return {
    apiBaseUrl: state.apiBaseUrl,
    reminderTime: state.reminderTime,
    enabled: state.enabled
  };
}
