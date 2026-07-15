import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminApiError, requestJson } from "../src/api";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("admin api", () => {
  it("uses the token passed in the captured request context", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ saved: true })
    });
    vi.stubGlobal("fetch", fetchMock);

    await requestJson<{ saved: boolean }>(
      "/api/groups/group-1/restaurants",
      { apiBaseUrl: "https://lunch.example", token: "group-session-token" },
      { method: "POST", body: JSON.stringify({ name: "巷口砂锅" }) }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://lunch.example/api/groups/group-1/restaurants",
      {
        method: "POST",
        body: JSON.stringify({ name: "巷口砂锅" }),
        headers: {
          "content-type": "application/json",
          authorization: "Bearer group-session-token"
        }
      }
    );
  });

  it("omits the JSON content type for a request without a body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ refreshed: true })
    });
    vi.stubGlobal("fetch", fetchMock);

    await requestJson(
      "/api/groups/group-1/session",
      { apiBaseUrl: "https://lunch.example", token: "identity-token" },
      { method: "POST" }
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://lunch.example/api/groups/group-1/session",
      {
        method: "POST",
        headers: { authorization: "Bearer identity-token" }
      }
    );
  });

  it("preserves status and server code without leaking the token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: "restaurant_owner_required",
        message: "Only the creator or an admin can edit restaurant"
      })
    }));

    const error = await requestJson(
      "/api/groups/group-1/restaurants/restaurant-1",
      { apiBaseUrl: "https://lunch.example", token: "secret-token" }
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AdminApiError);
    expect(error).toMatchObject({
      status: 403,
      code: "restaurant_owner_required",
      kind: "http"
    });
    expect(String(error)).not.toContain("secret-token");
  });

  it("classifies fetch failures as network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(requestJson(
      "/api/groups",
      { apiBaseUrl: "https://lunch.example", token: "identity-token" }
    )).rejects.toMatchObject({ kind: "network" });
  });

  it("classifies malformed success responses without leaking context", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => { throw new Error("bad json"); }
    }));

    await expect(requestJson(
      "/api/groups",
      { apiBaseUrl: "https://lunch.example", token: "identity-token" }
    )).rejects.toMatchObject({
      kind: "invalid-response",
      status: 200,
      code: "invalid_json_response"
    });
  });
});
