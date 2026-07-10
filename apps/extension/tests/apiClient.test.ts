import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ExtensionApiError,
  isServiceUnavailable,
  requestJson
} from "../src/apiClient";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("extension api client", () => {
  it("preserves HTTP status and server error code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValue({
        error: "no_current_batch",
        message: "No current recommendation batch exists"
      })
    }));

    await expect(requestJson("https://lunch.example/api/test")).rejects.toMatchObject({
      name: "ExtensionApiError",
      kind: "http",
      status: 404,
      code: "no_current_batch"
    });
  });

  it("preserves HTTP status when the error body is valid non-object JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: vi.fn().mockResolvedValue(null)
    }));

    await expect(requestJson("https://lunch.example/api/test")).rejects.toMatchObject({
      name: "ExtensionApiError",
      kind: "http",
      status: 503,
      message: "HTTP 503"
    });
  });

  it("classifies fetch rejection as a retryable network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    const error = await requestJson("https://lunch.example/api/test").catch(
      (caught) => caught
    );

    expect(error).toBeInstanceOf(ExtensionApiError);
    expect(error).toMatchObject({ kind: "network" });
    expect(isServiceUnavailable(error)).toBe(true);
  });

  it("treats 5xx as unavailable but not 401", () => {
    expect(isServiceUnavailable(
      new ExtensionApiError({ kind: "http", status: 503, code: "unavailable" })
    )).toBe(true);
    expect(isServiceUnavailable(
      new ExtensionApiError({ kind: "http", status: 401, code: "invalid_token" })
    )).toBe(false);
  });

  it("does not treat status 600 as a 5xx service failure", () => {
    expect(isServiceUnavailable(
      new ExtensionApiError({ kind: "http", status: 600, code: "invalid_status" })
    )).toBe(false);
  });
});
