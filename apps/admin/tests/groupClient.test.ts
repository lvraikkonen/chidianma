import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGroup,
  createIdentity,
  joinGroup,
  listGroups,
  refreshGroupSession
} from "../src/clients/groups";

function group(groupId = "group-1") {
  return {
    groupId,
    name: "设计组",
    role: "admin" as const,
    membershipId: "membership-1"
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("group client", () => {
  it("uses exact routes and the captured identity token", async () => {
    const responses = [
      { identityId: "identity-1", identityToken: "identity-token" },
      {
        identityToken: "identity-token",
        groupSessionToken: "group-session-token",
        group: group(),
        inviteCode: "LUNCH-ABC123"
      },
      {
        identityToken: "identity-token",
        groupSessionToken: "group-session-token",
        group: group()
      },
      { groups: [group()] },
      {
        identityToken: "identity-token",
        groupSessionToken: "group-session-token",
        group: group()
      }
    ];
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      status: 200,
      json: async () => responses.shift()
    }));
    vi.stubGlobal("fetch", fetchMock);

    const identityContext = {
      apiBaseUrl: "https://lunch.example",
      token: "identity-token"
    };
    await createIdentity("https://lunch.example", "小林");
    await createGroup(identityContext, { groupName: "设计组" });
    await joinGroup(identityContext, "LUNCH-ABC123");
    await listGroups(identityContext);
    await refreshGroupSession(identityContext, "group-1");

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ["https://lunch.example/api/identities", "POST"],
      ["https://lunch.example/api/groups", "POST"],
      ["https://lunch.example/api/groups/join", "POST"],
      ["https://lunch.example/api/groups", undefined],
      ["https://lunch.example/api/groups/group-1/session", "POST"]
    ]);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
      "content-type": "application/json"
    });
    for (const call of fetchMock.mock.calls.slice(1)) {
      expect(call[1]?.headers).toMatchObject({
        authorization: "Bearer identity-token"
      });
    }
  });
});
