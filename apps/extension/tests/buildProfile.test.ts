import { describe, expect, it } from "vitest";
import {
  DEFAULT_API_BASE_URL,
  DEV_ALLOWED_API_BASE_URLS,
  EXTENSION_BUILD_PROFILE,
  IS_INTERNAL_BUILD,
  PRODUCTION_API_ORIGIN,
  isAllowedDevApiBaseUrl
} from "../src/buildProfile";

describe("extension dev test profile", () => {
  it("keeps development separate and limits editable hosts to declared permissions", () => {
    expect(EXTENSION_BUILD_PROFILE).toBe("dev");
    expect(IS_INTERNAL_BUILD).toBe(false);
    expect(DEFAULT_API_BASE_URL).toBe("http://localhost:3000");
    expect(DEV_ALLOWED_API_BASE_URLS).toEqual([
      "http://localhost:3000",
      PRODUCTION_API_ORIGIN
    ]);
    expect(isAllowedDevApiBaseUrl("http://localhost:3000")).toBe(true);
    expect(isAllowedDevApiBaseUrl(PRODUCTION_API_ORIGIN)).toBe(true);
    expect(isAllowedDevApiBaseUrl("https://staging.example")).toBe(false);
  });
});
