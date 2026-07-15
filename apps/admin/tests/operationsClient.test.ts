import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminGroupContext } from "../src/clients/today";
import {
  getDashboard,
  getHistory,
  getMembers,
  getSettings,
  patchMember,
  patchSettings,
  rotateInviteCode
} from "../src/clients/operations";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Stage 5 Admin clients", () => {
  it("uses the exact group routes, cursor query, methods, and captured token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ groupId: "group-1" })
    });
    vi.stubGlobal("fetch", fetchMock);
    const context: AdminGroupContext = {
      apiBaseUrl: "https://lunch.example",
      groupId: "group-1",
      token: "group-session-token"
    };

    await getDashboard(context);
    await getHistory(context);
    await getHistory(context, "opaque+/=", 50);
    await getSettings(context);
    await patchSettings(context, { scoringWeights: { weatherMatch: 40 } });
    await getMembers(context);
    await patchMember(context, "membership-1", { status: "removed" });
    await rotateInviteCode(context);

    expect(fetchMock.mock.calls.map(([url, init]) => [url, init?.method, init?.body])).toEqual([
      ["https://lunch.example/api/groups/group-1/dashboard", undefined, undefined],
      ["https://lunch.example/api/groups/group-1/history?limit=20", undefined, undefined],
      ["https://lunch.example/api/groups/group-1/history?limit=50&cursor=opaque%2B%2F%3D", undefined, undefined],
      ["https://lunch.example/api/groups/group-1/settings", undefined, undefined],
      ["https://lunch.example/api/groups/group-1/settings", "PATCH", JSON.stringify({ scoringWeights: { weatherMatch: 40 } })],
      ["https://lunch.example/api/groups/group-1/members", undefined, undefined],
      ["https://lunch.example/api/groups/group-1/members/membership-1", "PATCH", JSON.stringify({ status: "removed" })],
      ["https://lunch.example/api/groups/group-1/invite-code/rotate", "POST", undefined]
    ]);
    expect(fetchMock.mock.calls.every(([, init]) =>
      (init?.headers as Record<string, string>).authorization === "Bearer group-session-token"
    )).toBe(true);
  });
});
