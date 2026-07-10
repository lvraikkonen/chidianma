import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGroup,
  createGroupRecommendation,
  createGroupRestaurant,
  createIdentity,
  joinGroup,
  listGroupRestaurants,
  listGroups,
  refreshGroupSession
} from "../src/groupClient";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubJsonResponse(value: unknown = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => value
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("extension group client", () => {
  it("creates a lightweight identity without an authorization header", async () => {
    const response = {
      identityId: "identity-1",
      identityToken: "identity-token"
    };
    const fetchMock = stubJsonResponse(response);

    await expect(
      createIdentity("https://lunch.example", " 小林 ")
    ).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://lunch.example/api/identities"),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: "小林" })
      }
    );
  });

  it("creates a group with the identity token", async () => {
    const fetchMock = stubJsonResponse();
    const input = { groupName: "设计组", subtitle: "五楼" };

    await createGroup(
      "https://lunch.example",
      "identity-token",
      input
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://lunch.example/api/groups"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer identity-token"
        },
        body: JSON.stringify(input)
      }
    );
  });

  it("joins a group with a trimmed invite code and the identity token", async () => {
    const fetchMock = stubJsonResponse();

    await joinGroup("https://lunch.example", "identity-token", " ABCD12 ");

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://lunch.example/api/groups/join"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer identity-token"
        },
        body: JSON.stringify({ inviteCode: "ABCD12" })
      }
    );
  });

  it("lists groups with the identity token", async () => {
    const fetchMock = stubJsonResponse({ groups: [] });

    await listGroups("https://lunch.example", "identity-token");

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://lunch.example/api/groups"),
      { headers: { authorization: "Bearer identity-token" } }
    );
  });

  it("refreshes a requested group session with the identity token", async () => {
    const fetchMock = stubJsonResponse();

    await refreshGroupSession(
      "https://lunch.example",
      "identity-token",
      "group-1"
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://lunch.example/api/groups/group-1/session"),
      {
        method: "POST",
        headers: { authorization: "Bearer identity-token" }
      }
    );
  });

  it("lists group restaurants with the group session token", async () => {
    const fetchMock = stubJsonResponse({
      groupId: "group-1",
      restaurants: []
    });

    await listGroupRestaurants({
      apiBaseUrl: "https://lunch.example",
      groupId: "group-1",
      token: "group-session-token"
    });

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://lunch.example/api/groups/group-1/restaurants"),
      { headers: { authorization: "Bearer group-session-token" } }
    );
  });

  it("creates a restaurant with the group session token", async () => {
    const fetchMock = stubJsonResponse();
    const input = {
      name: "面馆",
      distanceMinutes: 8,
      tags: ["noodles"]
    };

    await createGroupRestaurant(
      {
        apiBaseUrl: "https://lunch.example",
        groupId: "group-1",
        token: "group-session-token"
      },
      input
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://lunch.example/api/groups/group-1/restaurants"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer group-session-token"
        },
        body: JSON.stringify(input)
      }
    );
  });

  it("creates a recommendation with the group session token", async () => {
    const fetchMock = stubJsonResponse();
    const input = {
      restaurantId: "restaurant-1",
      dish: "牛肉面",
      reason: "出餐快",
      weatherTags: ["rainy" as const]
    };

    await createGroupRecommendation(
      {
        apiBaseUrl: "https://lunch.example",
        groupId: "group-1",
        token: "group-session-token"
      },
      input
    );

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://lunch.example/api/groups/group-1/recommendations"),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer group-session-token"
        },
        body: JSON.stringify(input)
      }
    );
  });
});
