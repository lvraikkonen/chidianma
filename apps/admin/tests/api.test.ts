import { afterEach, describe, expect, it, vi } from "vitest";
import { api, getAdminToken, saveAdminToken } from "../src/api";

function stubWindowStorage(initialValue: string | null = null) {
  let storedToken = initialValue;
  const localStorage = {
    getItem: vi.fn((key: string) => (key === "lunchAdminSessionToken" ? storedToken : null)),
    setItem: vi.fn((key: string, value: string) => {
      if (key === "lunchAdminSessionToken") storedToken = value;
    })
  };

  vi.stubGlobal("window", { localStorage });
  return localStorage;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("admin API helpers", () => {
  it("saves and reads the admin session token from local storage", () => {
    const localStorage = stubWindowStorage();

    saveAdminToken("session-token");

    expect(localStorage.setItem).toHaveBeenCalledWith("lunchAdminSessionToken", "session-token");
    expect(getAdminToken()).toBe("session-token");
  });

  it("sends JSON requests with the stored bearer token", async () => {
    stubWindowStorage("session-token");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ saved: true })
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const result = await api<{ saved: boolean }>("/api/restaurants", {
      method: "POST",
      headers: { "x-request-id": "request-1" },
      body: JSON.stringify({ name: "Noodles" })
    });

    expect(result).toEqual({ saved: true });
    expect(vi.mocked(fetchMock).mock.calls[0]).toEqual([
      "/api/restaurants",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer session-token",
          "x-request-id": "request-1"
        },
        body: JSON.stringify({ name: "Noodles" })
      }
    ]);
  });

  it("throws an HTTP status error for failed responses", async () => {
    stubWindowStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: "unauthorized" })
      }))
    );

    await expect(api("/api/recommendations")).rejects.toThrow("HTTP 401");
  });
});
