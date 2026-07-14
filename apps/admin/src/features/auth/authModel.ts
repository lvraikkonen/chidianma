import type {
  CreateGroupRequest,
  CreateGroupResponse,
  CreateIdentityResponse,
  GroupSessionResponse,
  GroupSummary,
  GroupsListResponse,
  JoinGroupResponse,
  RefreshGroupSessionResponse
} from "@lunch/shared";
import { AdminApiError } from "../../api";
import type { AdminSessionState } from "../../sessionStore";

export type AuthViewState =
  | { kind: "loading" }
  | { kind: "identity-entry"; error?: string | undefined }
  | {
      kind: "group-entry";
      session: AdminSessionState;
      groups: GroupSummary[];
      inviteCode?: string | undefined;
      error?: string | undefined;
    }
  | {
      kind: "switching";
      session: AdminSessionState;
      groups: GroupSummary[];
      pendingGroupId: string;
    }
  | {
      kind: "authenticated";
      session: AdminSessionState;
      groups: GroupSummary[];
      inviteCode?: string | undefined;
      error?: string | undefined;
    };

export interface AuthControllerDependencies {
  readSession: () => AdminSessionState;
  saveIdentity: (displayName: string, identityToken: string) => void;
  saveGroupSession: (response: GroupSessionResponse) => void;
  syncGroups: (groups: GroupSummary[]) => void;
  clearGroupSession: (groupId: string) => void;
  disconnectAdmin: () => void;
  createIdentity: (
    apiBaseUrl: string,
    displayName: string
  ) => Promise<CreateIdentityResponse>;
  createGroup: (
    context: { apiBaseUrl: string; token: string },
    input: CreateGroupRequest
  ) => Promise<CreateGroupResponse>;
  joinGroup: (
    context: { apiBaseUrl: string; token: string },
    inviteCode: string
  ) => Promise<JoinGroupResponse>;
  listGroups: (
    context: { apiBaseUrl: string; token: string }
  ) => Promise<GroupsListResponse>;
  refreshGroupSession: (
    context: { apiBaseUrl: string; token: string },
    groupId: string
  ) => Promise<RefreshGroupSessionResponse>;
  onState?: ((state: AuthViewState) => void) | undefined;
}

function authMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.code === "invalid_invite_code") return "邀请码无效或已经失效。";
    if (error.code === "removed_member") return "你已被移出该小组，请联系管理员。";
    if (error.status === 401) return "身份连接已失效，请重新进入。";
  }
  return "操作没有完成，请检查网络后重试。";
}

export function isMembershipInvalid(error: unknown): boolean {
  return error instanceof AdminApiError && (
    error.status === 401
    || (error.status === 403 && [
      "active_membership_required",
      "removed_member"
    ].includes(error.code ?? ""))
  );
}

function hasUsableActiveGroup(session: AdminSessionState): boolean {
  const groupId = session.activeGroupId;
  return Boolean(
    groupId
    && session.sessionsByGroupId[groupId]
    && session.groupSummariesById[groupId]
  );
}

function groupEntryFailureState(
  session: AdminSessionState,
  error: unknown,
  inviteCode?: string
): AuthViewState {
  const common = {
    session,
    groups: Object.values(session.groupSummariesById),
    ...(inviteCode ? { inviteCode } : {}),
    error: authMessage(error)
  };
  return hasUsableActiveGroup(session)
    ? { kind: "authenticated", ...common }
    : { kind: "group-entry", ...common };
}

export function createAuthController(dependencies: AuthControllerDependencies) {
  let state: AuthViewState = { kind: "loading" };
  const commit = (next: AuthViewState) => {
    state = next;
    dependencies.onState?.(next);
  };

  async function load(inviteCode?: string): Promise<AuthViewState> {
    const session = dependencies.readSession();
    if (!session.identityToken) {
      commit({ kind: "identity-entry" });
      return state;
    }
    commit({ kind: "loading" });
    try {
      const response = await dependencies.listGroups({
        apiBaseUrl: session.apiBaseUrl,
        token: session.identityToken
      });
      dependencies.syncGroups(response.groups);
      const synced = dependencies.readSession();
      const next: AuthViewState = hasUsableActiveGroup(synced)
        ? {
            kind: "authenticated",
            session: synced,
            groups: response.groups,
            ...(inviteCode ? { inviteCode } : {})
          }
        : {
            kind: "group-entry",
            session: synced,
            groups: response.groups,
            ...(inviteCode ? { inviteCode } : {})
          };
      commit(next);
      return state;
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) {
        dependencies.disconnectAdmin();
        commit({ kind: "identity-entry", error: authMessage(error) });
      } else {
        commit(groupEntryFailureState(session, error, inviteCode));
      }
      return state;
    }
  }

  async function createIdentity(displayName: string): Promise<void> {
    const session = dependencies.readSession();
    commit({ kind: "loading" });
    try {
      const response = await dependencies.createIdentity(
        session.apiBaseUrl,
        displayName
      );
      dependencies.saveIdentity(displayName, response.identityToken);
      await load();
    } catch (error) {
      commit({ kind: "identity-entry", error: authMessage(error) });
    }
  }

  function identityContext() {
    const session = dependencies.readSession();
    if (!session.identityToken) return null;
    return {
      session,
      context: { apiBaseUrl: session.apiBaseUrl, token: session.identityToken }
    };
  }

  async function createGroupEntry(input: CreateGroupRequest): Promise<void> {
    const current = identityContext();
    if (!current) {
      commit({ kind: "identity-entry" });
      return;
    }
    try {
      const response = await dependencies.createGroup(current.context, input);
      dependencies.saveGroupSession(response);
      await load(response.inviteCode);
    } catch (error) {
      commit(groupEntryFailureState(current.session, error));
    }
  }

  async function joinGroupEntry(inviteCode: string): Promise<void> {
    const current = identityContext();
    if (!current) {
      commit({ kind: "identity-entry" });
      return;
    }
    try {
      const response = await dependencies.joinGroup(current.context, inviteCode);
      dependencies.saveGroupSession(response);
      await load();
    } catch (error) {
      commit(groupEntryFailureState(current.session, error));
    }
  }

  async function switchGroup(groupId: string): Promise<void> {
    const current = identityContext();
    if (!current) {
      commit({ kind: "identity-entry" });
      return;
    }
    const groups = Object.values(current.session.groupSummariesById);
    commit({
      kind: "switching",
      session: current.session,
      groups,
      pendingGroupId: groupId
    });
    try {
      const response = await dependencies.refreshGroupSession(
        current.context,
        groupId
      );
      dependencies.saveGroupSession(response);
      await load();
    } catch (error) {
      commit({
        kind: "authenticated",
        session: current.session,
        groups,
        error: authMessage(error)
      });
    }
  }

  async function handleGroupError(error: unknown, groupId: string): Promise<void> {
    if (isMembershipInvalid(error)) {
      dependencies.clearGroupSession(groupId);
      await load();
    }
  }

  function disconnect(): void {
    dependencies.disconnectAdmin();
    commit({ kind: "identity-entry" });
  }

  return {
    load,
    createIdentity,
    createGroup: createGroupEntry,
    joinGroup: joinGroupEntry,
    switchGroup,
    handleGroupError,
    disconnect,
    getState: () => state
  };
}
