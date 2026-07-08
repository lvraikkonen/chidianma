import { describe, expect, it, vi } from "vitest";
import { getDefaultSettings } from "../src/storage";

describe("getDefaultSettings", () => {
  it("uses 11:30 as the default reminder time", () => {
    expect(getDefaultSettings()).toMatchObject({
      apiBaseUrl: "http://localhost:3000",
      readToken: "dev-read-token",
      reminderTime: "11:30",
      enabled: true
    });
  });
});
