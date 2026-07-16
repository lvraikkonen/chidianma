import type {
  CreateGroupRequest,
  CreateGroupResponse,
  CreateIdentityLinkCodeResponse,
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
      identityLinkCode?: CreateIdentityLinkCodeResponse | undefined;
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
      identityLinkCode?: CreateIdentityLinkCodeResponse | undefined;
      error?: string | undefined;
    };

export interface AuthControllerDependencies {
  readSession: () => AdminSessionState;
  saveIdentity: (response: CreateIdentityResponse) => void;
  saveRenewedIdentity: (response: CreateIdentityResponse) => void;
  saveResetIdentity: (response: CreateIdentityResponse) => void;
  saveGroupSession: (response: GroupSessionResponse) => void;
  syncGroups: (groups: GroupSummary[]) => void;
  clearGroupSession: (groupId: string) => void;
  disconnectAdmin: () => void;
  createIdentity: (
    apiBaseUrl: string,
    displayName: string
  ) => Promise<CreateIdentityResponse>;
  refreshIdentitySession: (
    context: { apiBaseUrl: string; token: string }
  ) => Promise<CreateIdentityResponse>;
  redeemIdentityLinkCode: (
    apiBaseUrl: string,
    linkCode: string
  ) => Promise<CreateIdentityResponse>;
  createIdentityLinkCode: (
    context: { apiBaseUrl: string; token: string }
  ) => Promise<CreateIdentityLinkCodeResponse>;
  resetIdentitySessions: (
    context: { apiBaseUrl: string; token: string }
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
    if (error.code === "invalid_identity_link_code") return "身份连接码无效或已经失效。";
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
  const groupSessionFlights = new Map<string, Promise<string>>();
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
      const renewed = await dependencies.refreshIdentitySession({
        apiBaseUrl: session.apiBaseUrl,
        token: session.identityToken
      });
      dependencies.saveRenewedIdentity(renewed);
      const response = await dependencies.listGroups({
        apiBaseUrl: session.apiBaseUrl,
        token: renewed.identityToken
      });
      dependencies.syncGroups(response.groups);
      let synced = dependencies.readSession();
      const activeGroupId = synced.activeGroupId;
      if (
        activeGroupId
        && response.groups.some((group) => group.groupId === activeGroupId)
      ) {
        try {
          dependencies.saveGroupSession(await dependencies.refreshGroupSession(
            { apiBaseUrl: synced.apiBaseUrl, token: renewed.identityToken },
            activeGroupId
          ));
          synced = dependencies.readSession();
        } catch (error) {
          if (error instanceof AdminApiError && error.status === 403) {
            dependencies.clearGroupSession(activeGroupId);
            synced = dependencies.readSession();
          } else {
            throw error;
          }
        }
      }
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
      dependencies.saveIdentity(response);
      await load();
    } catch (error) {
      commit({ kind: "identity-entry", error: authMessage(error) });
    }
  }

  async function redeemIdentity(linkCode: string): Promise<void> {
    const session = dependencies.readSession();
    if (session.identityToken) {
      commit(groupEntryFailureState(session, new Error("disconnect_required")));
      return;
    }
    commit({ kind: "loading" });
    try {
      const response = await dependencies.redeemIdentityLinkCode(session.apiBaseUrl, linkCode);
      dependencies.saveIdentity(response);
      await load();
    } catch (error) {
      commit({ kind: "identity-entry", error: authMessage(error) });
    }
  }

  async function generateIdentityLinkCode(): Promise<void> {
    const currentIdentity = identityContext();
    if (!currentIdentity) return;
    try {
      const identityLinkCode = await dependencies.createIdentityLinkCode(currentIdentity.context);
      if (state.kind === "group-entry" || state.kind === "authenticated") {
        commit({ ...state, identityLinkCode });
      }
    } catch (error) {
      commit(groupEntryFailureState(currentIdentity.session, error));
    }
  }

  async function resetAllConnections(): Promise<void> {
    const currentIdentity = identityContext();
    if (!currentIdentity) return;
    commit({ kind: "loading" });
    try {
      const response = await dependencies.resetIdentitySessions(currentIdentity.context);
      dependencies.saveResetIdentity(response);
      await load();
    } catch (error) {
      commit(groupEntryFailureState(currentIdentity.session, error));
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

  async function renewGroupSession(groupId: string): Promise<string> {
    const existing = groupSessionFlights.get(groupId);
    if (existing) return existing;
    const flight = (async () => {
      const current = identityContext();
      if (!current) throw new AdminApiError({ kind: "http", status: 401, code: "missing_token" });
      try {
        const response = await dependencies.refreshGroupSession(current.context, groupId);
        dependencies.saveGroupSession(response);
        const session = dependencies.readSession();
        if (state.kind === "authenticated") {
          commit({ ...state, session, groups: Object.values(session.groupSummariesById) });
        }
        return response.groupSessionToken;
      } catch (error) {
        if (error instanceof AdminApiError && error.status === 401) {
          dependencies.disconnectAdmin();
          commit({ kind: "identity-entry", error: authMessage(error) });
        } else if (error instanceof AdminApiError && error.status === 403) {
          dependencies.clearGroupSession(groupId);
          await load();
        }
        throw error;
      }
    })().finally(() => {
      groupSessionFlights.delete(groupId);
    });
    groupSessionFlights.set(groupId, flight);
    return flight;
  }

  async function handleGroupError(error: unknown, groupId: string): Promise<void> {
    if (error instanceof AdminApiError && error.status === 401) {
      dependencies.disconnectAdmin();
      commit({ kind: "identity-entry", error: authMessage(error) });
      return;
    }
    if (error instanceof AdminApiError && error.status === 403 && [
      "active_membership_required",
      "removed_member"
    ].includes(error.code ?? "")) {
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
    redeemIdentity,
    generateIdentityLinkCode,
    resetAllConnections,
    createGroup: createGroupEntry,
    joinGroup: joinGroupEntry,
    switchGroup,
    renewGroupSession,
    handleGroupError,
    disconnect,
    getState: () => state
  };
}
