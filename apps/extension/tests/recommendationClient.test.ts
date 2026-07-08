import { afterEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../src/config";
import { postFeedback } from "../src/recommendationClient";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("postFeedback", () => {
  it("posts feedback with the configured read token", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({ ok: true } as Response));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            [STORAGE_KEYS.settings]: {
              apiBaseUrl: "https://lunch.example",
              readToken: "read-token"
            }
          })
        }
      }
    });

    await postFeedback({
      date: "2026-07-07",
      restaurantId: "restaurant-1",
      recommendationId: "recommendation-1",
      type: "want"
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect((url as URL).toString()).toBe("https://lunch.example/api/feedback");
    expect(init).toEqual({
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lunch-read-token": "read-token"
      },
      body: JSON.stringify({
        date: "2026-07-07",
        restaurantId: "restaurant-1",
        recommendationId: "recommendation-1",
        type: "want"
      })
    });
  });
});
