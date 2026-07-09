import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AuthError } from "../src/services/auth/errors";
import {
  signGroupSessionToken,
  signIdentityToken,
  verifyGroupSessionToken,
  verifyIdentityToken
} from "../src/services/auth/tokens";

function signRawJson(json: string, secret: string): string {
  const encoded = Buffer.from(json).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function expectAuthError(fn: () => unknown, code: AuthError["code"], error: string): void {
  let thrown: unknown;
  try {
    fn();
  } catch (err) {
    thrown = err;
  }

  expect(thrown).toBeInstanceOf(AuthError);
  expect(thrown).toMatchObject({ code, error });
}

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

    expectAuthError(
      () => verifyGroupSessionToken(`${payload}.bad-signature`, "session-secret"),
      "unauthorized",
      "invalid_token"
    );

    vi.setSystemTime(new Date("2026-07-08T04:02:00.000Z"));
    expectAuthError(() => verifyGroupSessionToken(token, "session-secret"), "unauthorized", "expired_token");

    vi.useRealTimers();
  });

  it("rejects malformed claim shapes", () => {
    const malformed = signIdentityToken({ identityId: "", exp: Date.now() + 60_000 }, "session-secret");
    expectAuthError(() => verifyIdentityToken(malformed, "session-secret"), "unauthorized", "invalid_token");
  });

  it("rejects signed group session tokens as identity tokens", () => {
    const groupSessionToken = signGroupSessionToken(
      {
        identityId: "identity-1",
        groupId: "group-1",
        membershipId: "membership-1",
        role: "member",
        exp: Date.now() + 60_000
      },
      "session-secret"
    );

    expectAuthError(() => verifyIdentityToken(groupSessionToken, "session-secret"), "unauthorized", "invalid_token");
  });

  it("rejects extra token segments with a stable invalid-token error", () => {
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

    expectAuthError(() => verifyGroupSessionToken(`${token}.extra`, "session-secret"), "unauthorized", "invalid_token");
  });

  it("rejects signed null payloads with a stable invalid-token error", () => {
    const token = signRawJson("null", "session-secret");

    expectAuthError(() => verifyIdentityToken(token, "session-secret"), "unauthorized", "invalid_token");
  });
});
