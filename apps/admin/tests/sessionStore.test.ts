import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_SESSION_KEY,
  clearGroupSession,
  disconnectAdmin,
  getActiveGroupContext,
  getDefaultAdminSession,
  readAdminSession,
  saveGroupSession,
  saveIdentity,
  syncGroups
} from "../src/sessionStore";

function stubStorage(initial?: unknown) {
  let stored = initial === undefined ? null : JSON.stringify(initial);
  const localStorage = {
    getItem: vi.fn(() => stored),
    setItem: vi.fn((_key: string, value: string) => { stored = value; }),
    removeItem: vi.fn(() => { stored = null; })
  };
  vi.stubGlobal("window", { localStorage });
  return { read: () => stored === null ? null : JSON.parse(stored) as unknown };
}

function groupSummary(groupId = "group-1") {
  return {
    groupId,
    name: groupId === "group-1" ? "设计组" : "产品组",
    role: "admin" as const,
    membershipId: `membership-${groupId}`
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("admin session store", () => {
  it("ignores malformed and legacy token-only storage", () => {
    stubStorage({ token: "legacy-token" });
    expect(readAdminSession()).toEqual(getDefaultAdminSession());
  });

  it("saves identity before a group exists", () => {
    const storage = stubStorage();
    saveIdentity(" 小林 ", "identity-token");
    expect(storage.read()).toMatchObject({
      version: 2,
      displayName: "小林",
      identityToken: "identity-token",
      sessionsByGroupId: {},
      groupSummariesById: {}
    });
  });

  it("commits group session and active group together", () => {
    const storage = stubStorage({
      ...getDefaultAdminSession(),
      displayName: "小林",
      identityToken: "identity-token"
    });
    saveGroupSession({
      identityToken: "fresh-identity-token",
      groupSessionToken: "group-session-token",
      group: groupSummary()
    });

    expect(getActiveGroupContext()).toEqual({
      apiBaseUrl: "",
      groupId: "group-1",
      token: "group-session-token",
      group: expect.objectContaining({ name: "设计组" })
    });
    expect(storage.read()).toMatchObject({
      identityToken: "fresh-identity-token",
      activeGroupId: "group-1"
    });
  });

  it("removes sessions for memberships absent from a synced group list", () => {
    const storage = stubStorage({
      ...getDefaultAdminSession(),
      identityToken: "identity-token",
      activeGroupId: "group-1",
      sessionsByGroupId: {
        "group-1": { token: "token-1" },
        "group-2": { token: "token-2" }
      },
      groupSummariesById: {
        "group-1": groupSummary("group-1"),
        "group-2": groupSummary("group-2")
      }
    });

    syncGroups([groupSummary("group-2")]);

    expect(storage.read()).toMatchObject({
      sessionsByGroupId: { "group-2": { token: "token-2" } },
      groupSummariesById: { "group-2": groupSummary("group-2") }
    });
    expect(storage.read()).not.toHaveProperty("activeGroupId");
  });

  it("clears only the selected group session", () => {
    const storage = stubStorage({
      ...getDefaultAdminSession(),
      identityToken: "identity-token",
      activeGroupId: "group-1",
      sessionsByGroupId: {
        "group-1": { token: "token-1" },
        "group-2": { token: "token-2" }
      },
      groupSummariesById: {
        "group-1": groupSummary("group-1"),
        "group-2": groupSummary("group-2")
      }
    });

    clearGroupSession("group-1");

    expect(storage.read()).toMatchObject({
      identityToken: "identity-token",
      sessionsByGroupId: { "group-2": { token: "token-2" } }
    });
    expect(storage.read()).not.toHaveProperty("activeGroupId");
  });

  it("disconnects without mutating any server state", () => {
    const storage = stubStorage(getDefaultAdminSession());
    disconnectAdmin();
    expect(storage.read()).toBeNull();
    expect(window.localStorage.removeItem).toHaveBeenCalledWith(ADMIN_SESSION_KEY);
  });
});
