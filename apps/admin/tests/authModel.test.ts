import type {
  CreateGroupResponse,
  GroupSessionResponse,
  GroupSummary
} from "@lunch/shared";
import { describe, expect, it, vi } from "vitest";
import { AdminApiError } from "../src/api";
import {
  createAuthController,
  type AuthControllerDependencies
} from "../src/features/auth/authModel";
import type { AdminSessionState } from "../src/sessionStore";

function groupSummary(groupId = "group-1", name = "设计组"): GroupSummary {
  return {
    groupId,
    name,
    role: "admin",
    membershipId: `membership-${groupId}`
  };
}

function disconnectedSession(): AdminSessionState {
  return {
    version: 2,
    apiBaseUrl: "https://lunch.example",
    sessionsByGroupId: {},
    groupSummariesById: {}
  };
}

function identityOnlySession(): AdminSessionState {
  return {
    ...disconnectedSession(),
    displayName: "小林",
    identityToken: "identity-token"
  };
}

function authenticatedSession(): AdminSessionState {
  const first = groupSummary();
  const second = groupSummary("group-2", "产品组");
  return {
    ...identityOnlySession(),
    activeGroupId: first.groupId,
    sessionsByGroupId: {
      [first.groupId]: { token: "group-session-token-1" }
    },
    groupSummariesById: {
      [first.groupId]: first,
      [second.groupId]: second
    }
  };
}

function groupSessionResponse(groupId = "group-1"): GroupSessionResponse {
  return {
    identityToken: "fresh-identity-token",
    identityTokenExpiresAt: "2026-10-13T00:00:00.000Z",
    groupSessionToken: `group-session-token-${groupId}`,
    groupSessionTokenExpiresAt: "2026-10-13T00:00:00.000Z",
    group: groupSummary(groupId, groupId === "group-1" ? "设计组" : "产品组")
  };
}

function identityResponse() {
  return {
    identityId: "identity-1",
    displayName: "小林",
    identityToken: "identity-token",
    identityTokenExpiresAt: "2026-10-13T00:00:00.000Z"
  };
}

function createGroupResponse(groupId = "group-1"): CreateGroupResponse {
  return {
    ...groupSessionResponse(groupId),
    inviteCode: "LUNCH-ABC123"
  };
}

function authHarness(input: {
  initial?: AdminSessionState;
  overrides?: Partial<AuthControllerDependencies>;
} = {}) {
  let session = structuredClone(input.initial ?? authenticatedSession());
  const dependencies: AuthControllerDependencies = {
    readSession: () => structuredClone(session),
    saveIdentity: (response) => {
      session = {
        ...disconnectedSession(),
        identityId: response.identityId,
        displayName: response.displayName.trim(),
        identityToken: response.identityToken,
        identityTokenExpiresAt: response.identityTokenExpiresAt
      };
    },
    saveRenewedIdentity: (response) => {
      session = {
        ...session,
        identityId: response.identityId,
        displayName: response.displayName,
        identityToken: response.identityToken,
        identityTokenExpiresAt: response.identityTokenExpiresAt
      };
    },
    saveResetIdentity: (response) => {
      session = {
        ...session,
        identityId: response.identityId,
        displayName: response.displayName,
        identityToken: response.identityToken,
        identityTokenExpiresAt: response.identityTokenExpiresAt,
        sessionsByGroupId: {}
      };
      delete session.activeGroupId;
    },
    saveGroupSession: (response) => {
      session = {
        ...session,
        identityToken: response.identityToken,
        activeGroupId: response.group.groupId,
        sessionsByGroupId: {
          ...session.sessionsByGroupId,
          [response.group.groupId]: { token: response.groupSessionToken }
        },
        groupSummariesById: {
          ...session.groupSummariesById,
          [response.group.groupId]: response.group
        }
      };
    },
    syncGroups: (groups) => {
      const groupIds = new Set(groups.map((group) => group.groupId));
      session = {
        ...session,
        sessionsByGroupId: Object.fromEntries(
          Object.entries(session.sessionsByGroupId)
            .filter(([groupId]) => groupIds.has(groupId))
        ),
        groupSummariesById: Object.fromEntries(
          groups.map((group) => [group.groupId, group])
        )
      };
      if (session.activeGroupId && !groupIds.has(session.activeGroupId)) {
        delete session.activeGroupId;
      }
    },
    clearGroupSession: (groupId) => {
      const sessionsByGroupId = { ...session.sessionsByGroupId };
      delete sessionsByGroupId[groupId];
      session = { ...session, sessionsByGroupId };
      if (session.activeGroupId === groupId) delete session.activeGroupId;
    },
    disconnectAdmin: () => { session = disconnectedSession(); },
    createIdentity: vi.fn().mockResolvedValue(identityResponse()),
    refreshIdentitySession: vi.fn().mockImplementation(async () => identityResponse()),
    redeemIdentityLinkCode: vi.fn().mockResolvedValue(identityResponse()),
    createIdentityLinkCode: vi.fn().mockResolvedValue({
      linkCode: "LINK-ABCD-EFGH-JKLM",
      expiresAt: "2026-07-15T00:10:00.000Z"
    }),
    resetIdentitySessions: vi.fn().mockResolvedValue(identityResponse()),
    createGroup: vi.fn().mockResolvedValue(createGroupResponse()),
    joinGroup: vi.fn().mockResolvedValue(groupSessionResponse()),
    listGroups: vi.fn().mockImplementation(async () => ({
      groups: Object.values(session.groupSummariesById)
    })),
    refreshGroupSession: vi.fn().mockImplementation(async (_context, groupId) => (
      groupSessionResponse(groupId)
    )),
    ...input.overrides
  };
  return {
    dependencies,
    readSession: () => structuredClone(session)
  };
}

describe("auth model", () => {
  it("retains a created identity after group join fails", async () => {
    const harness = authHarness({
      initial: disconnectedSession(),
      overrides: {
        joinGroup: vi.fn().mockRejectedValue(new AdminApiError({
          kind: "http",
          status: 400,
          code: "invalid_invite_code"
        }))
      }
    });
    const saveIdentity = vi.spyOn(harness.dependencies, "saveIdentity");
    const controller = createAuthController(harness.dependencies);

    await controller.createIdentity("小林");
    await controller.joinGroup("BAD-CODE");

    expect(saveIdentity).toHaveBeenCalledWith(identityResponse());
    expect(harness.readSession()).toMatchObject({
      displayName: "小林",
      identityToken: "identity-token"
    });
    expect(controller.getState()).toMatchObject({
      kind: "group-entry",
      error: "邀请码无效或已经失效。"
    });
  });

  it("commits the requested group only after fresh session succeeds", async () => {
    let resolveSession!: (response: GroupSessionResponse) => void;
    const refreshGroupSession = vi.fn()
      .mockImplementationOnce(() => new Promise<GroupSessionResponse>((resolve) => {
        resolveSession = resolve;
      }))
      .mockResolvedValue(groupSessionResponse("group-2"));
    const harness = authHarness({
      overrides: {
        refreshGroupSession
      }
    });
    const saveGroupSession = vi.spyOn(harness.dependencies, "saveGroupSession");
    const controller = createAuthController(harness.dependencies);

    const switching = controller.switchGroup("group-2");
    expect(saveGroupSession).not.toHaveBeenCalled();
    expect(harness.readSession().activeGroupId).toBe("group-1");

    resolveSession(groupSessionResponse("group-2"));
    await switching;

    expect(saveGroupSession).toHaveBeenCalledWith(groupSessionResponse("group-2"));
    expect(harness.readSession().activeGroupId).toBe("group-2");
  });

  it("surfaces the one-time invite code after creating a group", async () => {
    const harness = authHarness({ initial: identityOnlySession() });
    const controller = createAuthController(harness.dependencies);

    await controller.createGroup({ groupName: "设计组" });

    expect(controller.getState()).toMatchObject({
      kind: "authenticated",
      inviteCode: "LUNCH-ABC123"
    });
  });

  it.each(["create", "join"] as const)(
    "keeps the prior authenticated group when %s another group fails",
    async (operation) => {
      const failure = new AdminApiError({ kind: "network" });
      const harness = authHarness({
        overrides: operation === "create"
          ? { createGroup: vi.fn().mockRejectedValue(failure) }
          : { joinGroup: vi.fn().mockRejectedValue(failure) }
      });
      const saveGroupSession = vi.spyOn(harness.dependencies, "saveGroupSession");
      const controller = createAuthController(harness.dependencies);

      if (operation === "create") {
        await controller.createGroup({ groupName: "新小组" });
      } else {
        await controller.joinGroup("LUNCH-NEW123");
      }

      expect(saveGroupSession).not.toHaveBeenCalled();
      expect(harness.readSession()).toMatchObject({
        identityToken: "identity-token",
        activeGroupId: "group-1"
      });
      expect(controller.getState()).toMatchObject({
        kind: "authenticated",
        session: {
          identityToken: "identity-token",
          activeGroupId: "group-1"
        },
        error: "操作没有完成，请检查网络后重试。"
      });
    }
  );

  it("preserves the previous active group when switching fails", async () => {
    const harness = authHarness({
      overrides: {
        refreshGroupSession: vi.fn().mockRejectedValue(new Error("offline"))
      }
    });
    const controller = createAuthController(harness.dependencies);

    await controller.switchGroup("group-2");

    expect(harness.readSession().activeGroupId).toBe("group-1");
    expect(controller.getState()).toMatchObject({
      kind: "authenticated",
      session: { activeGroupId: "group-1" },
      error: "操作没有完成，请检查网络后重试。"
    });
  });

  it("shares one group-session renewal across concurrent 401 retries", async () => {
    let resolve!: (response: GroupSessionResponse) => void;
    const refreshGroupSession = vi.fn(() => new Promise<GroupSessionResponse>((done) => {
      resolve = done;
    }));
    const harness = authHarness({ overrides: { refreshGroupSession } });
    const controller = createAuthController(harness.dependencies);

    const renewals = Promise.all([
      controller.renewGroupSession("group-1"),
      controller.renewGroupSession("group-1")
    ]);
    expect(refreshGroupSession).toHaveBeenCalledOnce();
    resolve(groupSessionResponse("group-1"));
    await expect(renewals).resolves.toEqual([
      "group-session-token-group-1",
      "group-session-token-group-1"
    ]);
    expect(harness.readSession().sessionsByGroupId["group-1"]?.token)
      .toBe("group-session-token-group-1");
  });

  it.each(["active_membership_required", "removed_member"])(
    "exits the active group for membership error %s",
    async (code) => {
      const clearGroupSession = vi.fn();
      const harness = authHarness({ overrides: { clearGroupSession } });
      const controller = createAuthController(harness.dependencies);

      await controller.handleGroupError(new AdminApiError({
        kind: "http",
        status: 403,
        code
      }), "group-1");

      expect(clearGroupSession).toHaveBeenCalledWith("group-1");
    }
  );

  it("clears the whole identity after a final group-request 401", async () => {
    const disconnectAdmin = vi.fn();
    const clearGroupSession = vi.fn();
    const harness = authHarness({ overrides: { disconnectAdmin, clearGroupSession } });
    const controller = createAuthController(harness.dependencies);

    await controller.handleGroupError(new AdminApiError({
      kind: "http",
      status: 401,
      code: "invalid_token"
    }), "group-1");

    expect(disconnectAdmin).toHaveBeenCalledOnce();
    expect(clearGroupSession).not.toHaveBeenCalled();
    expect(controller.getState()).toMatchObject({
      kind: "identity-entry",
      error: "身份连接已失效，请重新进入。"
    });
  });

  it("keeps the session for an operation permission error", async () => {
    const clearGroupSession = vi.fn();
    const harness = authHarness({ overrides: { clearGroupSession } });
    const controller = createAuthController(harness.dependencies);

    await controller.handleGroupError(new AdminApiError({
      kind: "http",
      status: 403,
      code: "restaurant_owner_required"
    }), "group-1");

    expect(clearGroupSession).not.toHaveBeenCalled();
  });
});
