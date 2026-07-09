import { describe, expect, it, vi } from "vitest";
import { AuthError } from "../src/services/auth/errors";
import {
  signGroupSessionToken,
  signIdentityToken,
  verifyGroupSessionToken,
  verifyIdentityToken
} from "../src/services/auth/tokens";

describe("multi-group signed tokens", () => {
  it("verifies signed identity and group tokens before expiry", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T04:00:00.000Z"));

    const identity = signIdentityToken({ identityId: "identity-1", exp: Date.now() + 60_000 }, "session-secret");
    expect(verifyIdentityToken(identity, "session-secret")).toEqual({
      identityId: "identity-1",
      exp: Date.now() + 60_000
    });

    const group = signGroupSessionToken(
      {
        identityId: "identity-1",
        groupId: "group-1",
        membershipId: "membership-1",
        role: "admin",
        exp: Date.now() + 60_000
      },
      "session-secret"
    );
    expect(verifyGroupSessionToken(group, "session-secret")).toEqual({
      identityId: "identity-1",
      groupId: "group-1",
      membershipId: "membership-1",
      role: "admin",
      exp: Date.now() + 60_000
    });

    vi.useRealTimers();
  });

  it("rejects tampered and expired group tokens", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T04:00:00.000Z"));

    const token = signGroupSessionToken(
      {
        identityId: "identity-1",
        groupId: "group-1",
        membershipId: "membership-1",
        role: "member",
        exp: Date.now() + 60_000
      },
      "session-secret"
    );
    const [payload] = token.split(".");

    expect(() => verifyGroupSessionToken(`${payload}.bad-signature`, "session-secret")).toThrow(AuthError);

    vi.setSystemTime(new Date("2026-07-08T04:02:00.000Z"));
    expect(() => verifyGroupSessionToken(token, "session-secret")).toThrow(AuthError);

    vi.useRealTimers();
  });

  it("rejects malformed claim shapes", () => {
    const malformed = signIdentityToken({ identityId: "", exp: Date.now() + 60_000 }, "session-secret");
    expect(() => verifyIdentityToken(malformed, "session-secret")).toThrow(AuthError);
  });
});
