import { describe, expect, it, vi } from "vitest";
import { signSessionToken, verifySessionToken } from "../src/services/auth/sessionToken";

describe("admin session tokens", () => {
  it("verifies a signed session before expiry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-07T04:00:00.000Z"));

    const token = signSessionToken(
      { teammateId: "teammate-1", name: "Demo 同事", exp: Date.now() + 60_000 },
      "session-secret"
    );

    expect(verifySessionToken(token, "session-secret")).toEqual({
      teammateId: "teammate-1",
      name: "Demo 同事",
      exp: Date.now() + 60_000
    });

    vi.useRealTimers();
  });

  it("rejects tampered or expired sessions", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-07T04:00:00.000Z"));

    const token = signSessionToken(
      { teammateId: "teammate-1", name: "Demo 同事", exp: Date.now() + 60_000 },
      "session-secret"
    );
    const [payload] = token.split(".");

    expect(() => verifySessionToken(`${payload}.bad-signature`, "session-secret")).toThrow(
      "Invalid session signature"
    );

    vi.setSystemTime(new Date("2026-07-07T04:02:00.000Z"));
    expect(() => verifySessionToken(token, "session-secret")).toThrow("Session expired");

    vi.useRealTimers();
  });
});
