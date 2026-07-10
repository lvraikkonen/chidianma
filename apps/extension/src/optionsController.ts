import type {
  CreateGroupRequest,
  CreateGroupResponse,
  CreateIdentityResponse,
  GroupsListResponse,
  JoinGroupResponse,
  RefreshGroupSessionResponse
} from "@lunch/shared";
import { ExtensionApiError } from "./apiClient";
import type { ExtensionStorageShape } from "./storage";

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
    error?: string | undefined;
  };

export interface OptionsControllerDependencies {
  loadStorage: () => Promise<ExtensionStorageShape>;
  createIdentity: (
    apiBaseUrl: string,
    displayName: string
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
    displayName: string,
    identityToken: string
  ) => Promise<void>;
  saveGroupConnection: (response: RefreshGroupSessionResponse) => Promise<void>;
  syncGroupSummaries: (groups: GroupsListResponse["groups"]) => Promise<void>;
  saveReminder: (input: {
    reminderTime: string;
    enabled: boolean;
  }) => Promise<void>;
  replaceApiBaseUrl: (apiBaseUrl: string) => Promise<void>;
  disconnectIdentity: () => Promise<void>;
  render: (state: OptionsViewState) => void;
}

function mapOptionsError(error: unknown): string {
  if (error instanceof ExtensionApiError) {
    if (error.code === "invalid_invite_code") return "邀请码无效或已经失效。";
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
    readToken: "",
    sessionsByGroupId: {},
    groupSummariesById: {},
    lastRecommendationsByGroupId: {},
    localReminderOverridesByGroupId: {}
  };
  delete cleared.activeGroupId;
  delete cleared.identityDisplayName;
  delete cleared.identityToken;
  return cleared;
}

function normalizeApiBaseUrl(apiBaseUrl: string): string {
  return new URL(apiBaseUrl).toString().replace(/\/$/, "");
}

export function createOptionsController(
  dependencies: OptionsControllerDependencies
) {
  let current: OptionsViewState = {
    kind: "loading",
    storage: {
      apiBaseUrl: "http://localhost:3000",
      readToken: "",
      reminderTime: "11:30",
      enabled: true,
      sessionsByGroupId: {},
      groupSummariesById: {},
      lastRecommendationsByGroupId: {},
      localReminderOverridesByGroupId: {}
    }
  };

  function commit(next: OptionsViewState): void {
    current = next;
    dependencies.render(next);
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
    const storage = await readStorage(inviteCode);
    if (!storage) return;
    commit({ kind: "loading", storage });
    if (!storage.identityToken) {
      commit({ kind: "identity-required", storage });
      return;
    }
    try {
      const response = await dependencies.listGroups(
        storage.apiBaseUrl,
        storage.identityToken
      );
      await dependencies.syncGroupSummaries(response.groups);
      const synced = await dependencies.loadStorage();
      commit({
        kind: "ready",
        storage: synced,
        ...(inviteCode ? { inviteCode } : {})
      });
    } catch (error) {
      commit({
        kind: "ready",
        storage,
        ...(inviteCode ? { inviteCode } : {}),
        error: mapOptionsError(error)
      });
    }
  }

  async function createIdentity(displayName: string): Promise<void> {
    const storage = await readStorage();
    if (!storage) return;
    commit({ kind: "loading", storage });
    try {
      const response = await dependencies.createIdentity(
        storage.apiBaseUrl,
        displayName
      );
      await dependencies.saveIdentityConnection(
        displayName,
        response.identityToken
      );
      await load();
    } catch (error) {
      commit({
        kind: "identity-required",
        storage,
        error: mapOptionsError(error)
      });
    }
  }

  async function createGroup(input: CreateGroupRequest): Promise<void> {
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
      const response = await dependencies.createGroup(
        storage.apiBaseUrl,
        storage.identityToken,
        input
      );
      await dependencies.saveGroupConnection(response);
      await load(response.inviteCode);
    } catch (error) {
      commit({ kind: "ready", storage, error: mapOptionsError(error) });
    }
  }

  async function joinGroup(inviteCode: string): Promise<void> {
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

  async function replaceHost(apiBaseUrl: string) {
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
    createGroup,
    joinGroup,
    switchGroup,
    saveReminder,
    replaceHost,
    disconnect,
    getState: () => current
  };
}
