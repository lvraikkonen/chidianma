import { describe, expect, it } from "vitest";
import * as shared from "../src";
import type {
  ApiErrorResponse,
  CreateGroupRequest,
  CreateIdentityResponse,
  GroupSessionResponse,
  JoinGroupRequest
} from "../src";

describe("Stage 7B shared contracts", () => {
  it("defines identity connection and session routes", () => {
    expect(shared.GROUP_ROUTES.identitySession).toBe("/api/identities/session");
    expect(shared.GROUP_ROUTES.identityLinkCodes).toBe("/api/identities/link-codes");
    expect(shared.GROUP_ROUTES.redeemIdentityLinkCode).toBe("/api/identities/link-codes/redeem");
    expect(shared.GROUP_ROUTES.resetIdentitySessions).toBe("/api/identities/sessions/reset");
  });

  it("requires explicit token expiries and identity references", () => {
    const identity: CreateIdentityResponse = {
      identityId: "identity-1",
      displayName: "小林",
      identityToken: "identity-token",
      identityTokenExpiresAt: "2026-10-13T00:00:00.000Z"
    };
    const group: GroupSessionResponse = {
      identityToken: "identity-token",
      identityTokenExpiresAt: "2026-10-13T00:00:00.000Z",
      groupSessionToken: "group-token",
      groupSessionTokenExpiresAt: "2026-07-29T00:00:00.000Z",
      group: {
        groupId: "group-1",
        name: "设计组",
        role: "admin",
        membershipId: "membership-1"
      }
    };
    expect(identity.identityTokenExpiresAt).toMatch(/Z$/);
    expect(group.groupSessionTokenExpiresAt).toMatch(/Z$/);
  });

  it("keeps display names out of create and join group requests", () => {
    const create: CreateGroupRequest = { groupName: "设计组", subtitle: "上海" };
    const join: JoinGroupRequest = { inviteCode: "LUNCH-ABC123" };
    expect(create).not.toHaveProperty("displayName");
    expect(join).not.toHaveProperty("displayName");
  });

  it("exposes a stable rate-limit response without a legacy read header", () => {
    const response: ApiErrorResponse = {
      error: "rate_limit_exceeded",
      message: "Rate limit exceeded",
      retryAfterSeconds: 60
    };
    expect(response.retryAfterSeconds).toBe(60);
    expect(shared).not.toHaveProperty("READ_TOKEN_HEADER");
  });
});
