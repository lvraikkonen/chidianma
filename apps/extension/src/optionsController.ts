import type {
  CreateGroupRequest,
  CreateGroupResponse,
  CreateIdentityLinkCodeResponse,
  CreateIdentityResponse,
  GroupSettingsResponse,
  GroupsListResponse,
  JoinGroupResponse,
  PersonalLunchHistoryResponse,
  RedeemIdentityLinkCodeResponse,
  RefreshGroupSessionResponse
} from "@lunch/shared";
import { ExtensionApiError } from "./apiClient";
import type { ReminderDraft } from "./reminderFormModel";
import type { ExtensionGroupContext } from "./stage5Client";
import type { ExtensionStorageShape } from "./storage";

export type OptionsResource<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error"; message: string };

export type OptionsViewState =
  | { kind: "loading"; storage: ExtensionStorageShape }
  | {
    kind: "identity-required";
    storage: ExtensionStorageShape;
    error?: string | undefined;
  }
  | {
    kind: "ready";
    storage: ExtensionStorageShape;
    inviteCode?: string | undefined;
    pendingGroupId?: string | undefined;
    identityLinkCode?: CreateIdentityLinkCodeResponse | undefined;
    error?: string | undefined;
    groupSettings?: OptionsResource<GroupSettingsResponse> | undefined;
    personalHistory?: OptionsResource<PersonalLunchHistoryResponse> | undefined;
  };

export interface OptionsControllerDependencies {
  loadStorage: () => Promise<ExtensionStorageShape>;
  createIdentity: (
    apiBaseUrl: string,
    displayName: string
  ) => Promise<CreateIdentityResponse>;
  redeemIdentityLinkCode: (
    apiBaseUrl: string,
    linkCode: string
  ) => Promise<RedeemIdentityLinkCodeResponse>;
  createIdentityLinkCode: (
    apiBaseUrl: string,
    identityToken: string
  ) => Promise<CreateIdentityLinkCodeResponse>;
  resetIdentitySessions: (
    apiBaseUrl: string,
    identityToken: string
  ) => Promise<CreateIdentityResponse>;
  createGroup: (
    apiBaseUrl: string,
    identityToken: string,
    input: CreateGroupRequest
  ) => Promise<CreateGroupResponse>;
  joinGroup: (
    apiBaseUrl: string,
    identityToken: string,
    inviteCode: string
  ) => Promise<JoinGroupResponse>;
  listGroups: (
    apiBaseUrl: string,
    identityToken: string
  ) => Promise<GroupsListResponse>;
  refreshSession: (
    apiBaseUrl: string,
    identityToken: string,
    groupId: string
  ) => Promise<RefreshGroupSessionResponse>;
  saveIdentityConnection: (
    response: CreateIdentityResponse
  ) => Promise<void>;
  saveRenewedIdentityConnection: (
    response: CreateIdentityResponse
  ) => Promise<void>;
  saveResetIdentityConnection: (
    response: CreateIdentityResponse
  ) => Promise<void>;
  refreshIdentitySession: (
    apiBaseUrl: string,
    identityToken: string
  ) => Promise<CreateIdentityResponse>;
  saveGroupConnection: (response: RefreshGroupSessionResponse) => Promise<void>;
  syncGroupSummaries: (groups: GroupsListResponse["groups"]) => Promise<void>;
  saveReminder: (input: {
    reminderTime: string;
    enabled: boolean;
  }) => Promise<void>;
  replaceApiBaseUrl: (apiBaseUrl: string) => Promise<void>;
  disconnectIdentity: () => Promise<void>;
  getGroupSettingsForContext?: (
    context: ExtensionGroupContext
  ) => Promise<GroupSettingsResponse>;
  getPersonalHistoryForContext?: (
    context: ExtensionGroupContext
  ) => Promise<PersonalLunchHistoryResponse>;
  saveGroupSettingsCache?: (
    groupId: string,
    response: GroupSettingsResponse,
    cachedAt: string
  ) => Promise<void>;
  clearGroupSession?: (groupId: string) => Promise<void>;
  saveGroupReminderOverride?: (
    groupId: string,
    input: ReminderDraft
  ) => Promise<void>;
  clearGroupReminderOverride?: (groupId: string) => Promise<void>;
  render: (state: OptionsViewState) => void;
}

function mapOptionsError(error: unknown): string {
  if (error instanceof ExtensionApiError) {
    if (error.code === "invalid_invite_code") return "邀请码无效或已经失效。";
    if (error.code === "invalid_identity_link_code") return "身份连接码无效或已经失效。";
    if (error.code === "removed_member") return "你已被移出该小组，请联系管理员。";
    if (error.status === 401) return "连接已失效，请重新建立身份。";
  }
  return "操作没有完成，请检查网络后重试。";
}

const STORAGE_READ_ERROR = "加载设置失败：无法读取浏览器存储。请重试。";

function clearConnectionState(
  storage: ExtensionStorageShape,
  apiBaseUrl = storage.apiBaseUrl
): ExtensionStorageShape {
  const cleared: ExtensionStorageShape = {
    ...storage,
    apiBaseUrl,
    sessionsByGroupId: {},
    groupSummariesById: {},
    lastRecommendationsByGroupId: {},
    localReminderOverridesByGroupId: {},
    groupSettingsCacheByGroupId: {},
    reminderRevision: storage.reminderRevision + 1
  };
  delete cleared.activeGroupId;
  delete cleared.identityDisplayName;
  delete cleared.identityToken;
  delete cleared.scheduledPrimaryReminder;
  delete cleared.pendingSecondReminder;
  return cleared;
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return new URL(apiBaseUrl).toString().replace(/\/$/, "");
}

export function createOptionsController(
  dependencies: OptionsControllerDependencies
) {
  let generation = 0;
  let current: OptionsViewState = {
    kind: "loading",
    storage: {
      apiBaseUrl: "http://localhost:3000",
      reminderTime: "11:30",
      enabled: true,
      sessionsByGroupId: {},
      groupSummariesById: {},
      lastRecommendationsByGroupId: {},
      localReminderOverridesByGroupId: {},
      groupSettingsCacheByGroupId: {},
      reminderRevision: 0
    }
  };

  function commit(next: OptionsViewState): void {
    current = next;
    dependencies.render(next);
  }

  function getGroupContext(
    storage: ExtensionStorageShape,
    expectedGroupId?: string
  ): ExtensionGroupContext | null {
    const groupId = storage.activeGroupId;
    if (!groupId || (expectedGroupId && groupId !== expectedGroupId)) return null;
    const membershipId = storage.groupSummariesById[groupId]?.membershipId;
    const groupSessionToken = storage.sessionsByGroupId[groupId]?.token;
    if (!membershipId || !groupSessionToken) return null;
    return {
      apiBaseUrl: storage.apiBaseUrl,
      groupId,
      membershipId,
      groupSessionToken
    };
  }

  function isCurrentContext(
    loadGeneration: number,
    context: ExtensionGroupContext
  ): boolean {
    if (generation !== loadGeneration || current.kind !== "ready") return false;
    const active = getGroupContext(current.storage, context.groupId);
    return active?.apiBaseUrl === context.apiBaseUrl
      && active.membershipId === context.membershipId;
  }

  function updateResource(
    loadGeneration: number,
    context: ExtensionGroupContext,
    key: "groupSettings" | "personalHistory",
    resource: OptionsResource<GroupSettingsResponse>
      | OptionsResource<PersonalLunchHistoryResponse>,
    storage?: ExtensionStorageShape
  ): void {
    if (!isCurrentContext(loadGeneration, context) || current.kind !== "ready") {
      return;
    }
    commit({
      ...current,
      ...(storage ? { storage } : {}),
      [key]: resource
    });
  }

  async function clearUnavailableSession(
    loadGeneration: number,
    context: ExtensionGroupContext,
    resyncGroups = false
  ): Promise<void> {
    if (generation !== loadGeneration) return;
    await dependencies.clearGroupSession?.(context.groupId);
    if (resyncGroups) {
      const latest = await dependencies.loadStorage().catch(() => undefined);
      if (latest?.identityToken && generation === loadGeneration) {
        try {
          const groups = await dependencies.listGroups(
            latest.apiBaseUrl,
            latest.identityToken
          );
          if (generation === loadGeneration) {
            await dependencies.syncGroupSummaries(groups.groups);
          }
        } catch {
          // Session cleanup remains authoritative when group resync is offline.
        }
      }
    }
    const storage = await dependencies.loadStorage().catch(() => undefined);
    if (
      storage
      && generation === loadGeneration
      && current.kind === "ready"
      && current.storage.activeGroupId === context.groupId
    ) {
      commit({
        ...current,
        storage,
        error: "身份连接已失效，请重新连接当前小组。"
      });
    }
  }

  async function clearInvalidIdentity(
    loadGeneration: number,
    error: unknown
  ): Promise<void> {
    if (generation !== loadGeneration) return;
    generation += 1;
    await dependencies.disconnectIdentity();
    const storage = await dependencies.loadStorage().catch(() => (
      clearConnectionState(current.storage)
    ));
    commit({
      kind: "identity-required",
      storage,
      error: mapOptionsError(error)
    });
  }

  async function requestResource<T>(
    context: ExtensionGroupContext,
    request: (context: ExtensionGroupContext) => Promise<T>
  ): Promise<{ context: ExtensionGroupContext; data: T }> {
    return { context, data: await request(context) };
  }

  async function handleResourceFailure(
    loadGeneration: number,
    context: ExtensionGroupContext,
    error: unknown
  ): Promise<void> {
    if (error instanceof ExtensionApiError && error.status === 401) {
      await clearInvalidIdentity(loadGeneration, error);
      return;
    }
    if (
      error instanceof ExtensionApiError
      && error.status === 403
      && ["removed_member", "active_membership_required"].includes(error.code ?? "")
    ) {
      await clearUnavailableSession(loadGeneration, context, true);
    }
  }

  async function loadGroupSettingsResource(
    loadGeneration: number,
    context: ExtensionGroupContext
  ): Promise<void> {
    const request = dependencies.getGroupSettingsForContext;
    if (!request) return;
    try {
      const result = await requestResource(context, request);
      if (!isCurrentContext(loadGeneration, result.context)) return;
      await dependencies.saveGroupSettingsCache?.(
        result.context.groupId,
        result.data,
        new Date().toISOString()
      );
      if (!isCurrentContext(loadGeneration, result.context)) return;
      const storage = await dependencies.loadStorage();
      updateResource(
        loadGeneration,
        result.context,
        "groupSettings",
        { status: "ready", data: result.data },
        storage
      );
    } catch (error) {
      await handleResourceFailure(loadGeneration, context, error);
      updateResource(loadGeneration, context, "groupSettings", {
        status: "error",
        message: "加载小组提醒默认值失败，请重试。"
      });
    }
  }

  async function loadPersonalHistoryResource(
    loadGeneration: number,
    context: ExtensionGroupContext
  ): Promise<void> {
    const request = dependencies.getPersonalHistoryForContext;
    if (!request) return;
    try {
      const result = await requestResource(context, request);
      updateResource(loadGeneration, result.context, "personalHistory", {
        status: "ready",
        data: result.data
      });
    } catch (error) {
      await handleResourceFailure(loadGeneration, context, error);
      updateResource(loadGeneration, context, "personalHistory", {
        status: "error",
        message: "加载个人午饭记录失败，请重试。"
      });
    }
  }

  async function loadStage5Resources(
    loadGeneration: number,
    storage: ExtensionStorageShape
  ): Promise<void> {
    const context = getGroupContext(storage);
    if (!context || current.kind !== "ready" || generation !== loadGeneration) return;
    const hasSettings = Boolean(dependencies.getGroupSettingsForContext);
    const hasHistory = Boolean(dependencies.getPersonalHistoryForContext);
    if (!hasSettings && !hasHistory) return;
    commit({
      ...current,
      ...(hasSettings ? { groupSettings: { status: "loading" } as const } : {}),
      ...(hasHistory ? { personalHistory: { status: "loading" } as const } : {})
    });
    await Promise.all([
      loadGroupSettingsResource(loadGeneration, context),
      loadPersonalHistoryResource(loadGeneration, context)
    ]);
  }

  function renderStorageReadError(inviteCode?: string): void {
    if (
      current.storage.identityToken
      && (current.kind === "ready" || inviteCode)
    ) {
      commit({
        kind: "ready",
        storage: current.storage,
        ...(inviteCode ? { inviteCode } : {}),
        error: STORAGE_READ_ERROR
      });
      return;
    }
    commit({
      kind: "identity-required",
      storage: current.storage,
      error: STORAGE_READ_ERROR
    });
  }

  async function readStorage(
    inviteCode?: string
  ): Promise<ExtensionStorageShape | undefined> {
    try {
      return await dependencies.loadStorage();
    } catch {
      renderStorageReadError(inviteCode);
      return undefined;
    }
  }

  async function load(inviteCode?: string): Promise<void> {
    const loadGeneration = ++generation;
    const storage = await readStorage(inviteCode);
    if (!storage || generation !== loadGeneration) return;
    commit({ kind: "loading", storage });
    if (!storage.identityToken) {
      commit({ kind: "identity-required", storage });
      return;
    }
    try {
      const renewed = await dependencies.refreshIdentitySession(
        storage.apiBaseUrl,
        storage.identityToken
      );
      await dependencies.saveRenewedIdentityConnection(renewed);
      const response = await dependencies.listGroups(
        storage.apiBaseUrl,
        renewed.identityToken
      );
      if (generation !== loadGeneration) return;
      await dependencies.syncGroupSummaries(response.groups);
      let synced = await dependencies.loadStorage();
      const activeGroupId = synced.activeGroupId;
      if (
        activeGroupId
        && response.groups.some((group) => group.groupId === activeGroupId)
      ) {
        try {
          const groupSession = await dependencies.refreshSession(
            synced.apiBaseUrl,
            renewed.identityToken,
            activeGroupId
          );
          await dependencies.saveGroupConnection(groupSession);
          synced = await dependencies.loadStorage();
        } catch (error) {
          if (error instanceof ExtensionApiError && error.status === 403) {
            await dependencies.clearGroupSession?.(activeGroupId);
            synced = await dependencies.loadStorage();
          } else {
            throw error;
          }
        }
      }
      if (generation !== loadGeneration) return;
      commit({
        kind: "ready",
        storage: synced,
        ...(inviteCode ? { inviteCode } : {})
      });
      await loadStage5Resources(loadGeneration, synced);
    } catch (error) {
      if (generation !== loadGeneration) return;
      if (error instanceof ExtensionApiError && error.status === 401) {
        await dependencies.disconnectIdentity();
        const disconnected = await dependencies.loadStorage().catch(() => clearConnectionState(storage));
        commit({
          kind: "identity-required",
          storage: disconnected,
          error: mapOptionsError(error)
        });
        return;
      }
      commit({
        kind: "ready",
        storage,
        ...(inviteCode ? { inviteCode } : {}),
        error: mapOptionsError(error)
      });
    }
  }

  async function createIdentity(displayName: string): Promise<void> {
    generation += 1;
    const storage = await readStorage();
    if (!storage) return;
    commit({ kind: "loading", storage });
    try {
      const response = await dependencies.createIdentity(
        storage.apiBaseUrl,
        displayName
      );
      await dependencies.saveIdentityConnection(response);
      await load();
    } catch (error) {
      commit({
        kind: "identity-required",
        storage,
        error: mapOptionsError(error)
      });
    }
  }

  async function redeemIdentity(linkCode: string): Promise<void> {
    generation += 1;
    const storage = await readStorage();
    if (!storage) return;
    if (storage.identityToken) {
      commit({ kind: "ready", storage, error: "请先断开当前身份，再输入连接码。" });
      return;
    }
    commit({ kind: "loading", storage });
    try {
      const response = await dependencies.redeemIdentityLinkCode(storage.apiBaseUrl, linkCode);
      await dependencies.saveIdentityConnection(response);
      await load();
    } catch (error) {
      commit({ kind: "identity-required", storage, error: mapOptionsError(error) });
    }
  }

  async function generateIdentityLinkCode(): Promise<void> {
    const storage = await readStorage();
    if (!storage?.identityToken) return;
    try {
      const identityLinkCode = await dependencies.createIdentityLinkCode(
        storage.apiBaseUrl,
        storage.identityToken
      );
      if (current.kind === "ready") commit({ ...current, identityLinkCode });
    } catch (error) {
      if (current.kind === "ready") commit({ ...current, error: mapOptionsError(error) });
    }
  }

  async function resetAllConnections(): Promise<void> {
    generation += 1;
    const storage = await readStorage();
    if (!storage?.identityToken) return;
    commit({ kind: "loading", storage });
    try {
      const response = await dependencies.resetIdentitySessions(
        storage.apiBaseUrl,
        storage.identityToken
      );
      await dependencies.saveResetIdentityConnection(response);
      await load();
    } catch (error) {
      commit({ kind: "ready", storage, error: mapOptionsError(error) });
    }
  }

  async function createGroup(input: CreateGroupRequest): Promise<void> {
    generation += 1;
    const storage = await readStorage();
    if (!storage) return;
    if (!storage.identityToken) {
      commit({
        kind: "identity-required",
        storage,
        error: "请先建立轻量身份。"
      });
      return;
    }
    commit({ kind: "loading", storage });
    let inviteCode: string | undefined;
    try {
      const response = await dependencies.createGroup(
        storage.apiBaseUrl,
        storage.identityToken,
        input
      );
      inviteCode = response.inviteCode;
      await dependencies.saveGroupConnection(response);
      await load(inviteCode);
    } catch (error) {
      commit({
        kind: "ready",
        storage,
        ...(inviteCode ? { inviteCode } : {}),
        error: mapOptionsError(error)
      });
    }
  }

  async function joinGroup(inviteCode: string): Promise<void> {
    generation += 1;
    const storage = await readStorage();
    if (!storage) return;
    if (!storage.identityToken) {
      commit({
        kind: "identity-required",
        storage,
        error: "请先建立轻量身份。"
      });
      return;
    }
    commit({ kind: "loading", storage });
    try {
      const response = await dependencies.joinGroup(
        storage.apiBaseUrl,
        storage.identityToken,
        inviteCode
      );
      await dependencies.saveGroupConnection(response);
      await load();
    } catch (error) {
      commit({ kind: "ready", storage, error: mapOptionsError(error) });
    }
  }

  async function switchGroup(groupId: string): Promise<void> {
    generation += 1;
    const storage = await readStorage();
    if (!storage) return;
    if (!storage.identityToken) {
      commit({ kind: "identity-required", storage });
      return;
    }
    commit({ kind: "ready", storage, pendingGroupId: groupId });
    try {
      const response = await dependencies.refreshSession(
        storage.apiBaseUrl,
        storage.identityToken,
        groupId
      );
      await dependencies.saveGroupConnection(response);
      await load();
    } catch (error) {
      commit({ kind: "ready", storage, error: mapOptionsError(error) });
    }
  }

  async function saveReminder(input: {
    reminderTime: string;
    enabled: boolean;
  }) {
    const storage = await readStorage();
    if (!storage) return;
    try {
      await dependencies.saveReminder(input);
      await load();
    } catch (error) {
      const message = error instanceof Error
        && error.message === "storage_lock_unavailable"
        ? "保存设置失败：浏览器暂不支持安全保存。请重试。"
        : "保存设置失败：无法写入浏览器存储。请重试。";
      commit({ kind: "ready", storage, error: message });
    }
  }

  async function saveReminderOverride(input: ReminderDraft): Promise<boolean> {
    const storage = await readStorage();
    if (!storage) return false;
    const context = getGroupContext(storage);
    if (!context || !dependencies.saveGroupReminderOverride) return false;
    try {
      await dependencies.saveGroupReminderOverride(context.groupId, input);
      const next = await dependencies.loadStorage();
      if (
        current.kind === "ready"
        && current.storage.activeGroupId === context.groupId
        && next.activeGroupId === context.groupId
      ) {
        commit({ ...current, storage: next });
      }
      return true;
    } catch {
      if (current.kind === "ready" && current.storage.activeGroupId === context.groupId) {
        commit({ ...current, error: "保存本机提醒失败，请重试。" });
      }
      return false;
    }
  }

  async function restoreGroupReminderDefault(): Promise<boolean> {
    const storage = await readStorage();
    if (!storage) return false;
    const context = getGroupContext(storage);
    if (!context || !dependencies.clearGroupReminderOverride) return false;
    try {
      await dependencies.clearGroupReminderOverride(context.groupId);
      const next = await dependencies.loadStorage();
      if (
        current.kind === "ready"
        && current.storage.activeGroupId === context.groupId
        && next.activeGroupId === context.groupId
      ) {
        commit({ ...current, storage: next });
      }
      return true;
    } catch {
      if (current.kind === "ready" && current.storage.activeGroupId === context.groupId) {
        commit({ ...current, error: "恢复小组默认失败，请重试。" });
      }
      return false;
    }
  }

  async function retrySettings(): Promise<void> {
    if (current.kind !== "ready") return;
    const context = getGroupContext(current.storage);
    if (!context || !dependencies.getGroupSettingsForContext) return;
    const loadGeneration = generation;
    updateResource(loadGeneration, context, "groupSettings", { status: "loading" });
    await loadGroupSettingsResource(loadGeneration, context);
  }

  async function retryHistory(): Promise<void> {
    if (current.kind !== "ready") return;
    const context = getGroupContext(current.storage);
    if (!context || !dependencies.getPersonalHistoryForContext) return;
    const loadGeneration = generation;
    updateResource(loadGeneration, context, "personalHistory", { status: "loading" });
    await loadPersonalHistoryResource(loadGeneration, context);
  }

  async function replaceHost(apiBaseUrl: string) {
    generation += 1;
    const storage = await readStorage();
    if (!storage) return;
    try {
      await dependencies.replaceApiBaseUrl(apiBaseUrl);
      current = {
        kind: "loading",
        storage: clearConnectionState(
          storage,
          normalizeApiBaseUrl(apiBaseUrl)
        )
      };
      await load();
    } catch {
      commit({ kind: "ready", storage, error: "API 地址没有保存，请重试。" });
    }
  }

  async function disconnect() {
    generation += 1;
    const storage = await readStorage();
    if (!storage) return;
    try {
      await dependencies.disconnectIdentity();
      current = { kind: "loading", storage: clearConnectionState(storage) };
      await load();
    } catch {
      commit({ kind: "ready", storage, error: "断开连接失败，请重试。" });
    }
  }

  return {
    load,
    createIdentity,
    redeemIdentity,
    generateIdentityLinkCode,
    resetAllConnections,
    createGroup,
    joinGroup,
    switchGroup,
    saveReminder,
    saveReminderOverride,
    restoreGroupReminderDefault,
    retrySettings,
    retryHistory,
    replaceHost,
    disconnect,
    getState: () => current
  };
}
