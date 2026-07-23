import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExtensionApiError } from "../src/apiClient";
import { withGroupSessionRetry } from "../src/groupSessionRetry";
import { getDefaultStorageState } from "../src/storage";

const dependencies = vi.hoisted(() => ({
  requestJson: vi.fn(),
  getStorageState: vi.fn(),
  saveGroupConnectionIfCurrent: vi.fn(),
  disconnectIdentityIfCurrent: vi.fn(),
  clearGroupSessionIfCurrent: vi.fn(),
  syncGroupSummariesIfCurrent: vi.fn()
}));

vi.mock("../src/apiClient", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/apiClient")>()),
  requestJson: dependencies.requestJson
}));
vi.mock("../src/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/storage")>()),
  getStorageState: dependencies.getStorageState,
  saveGroupConnectionIfCurrent: dependencies.saveGroupConnectionIfCurrent,
  disconnectIdentityIfCurrent: dependencies.disconnectIdentityIfCurrent,
  clearGroupSessionIfCurrent: dependencies.clearGroupSessionIfCurrent,
  syncGroupSummariesIfCurrent: dependencies.syncGroupSummariesIfCurrent
}));

const renewed = {
  identityToken: "new-identity-token",
  identityTokenExpiresAt: "2026-10-13T00:00:00.000Z",
  groupSessionToken: "new-group-token",
  groupSessionTokenExpiresAt: "2026-07-29T00:00:00.000Z",
  group: {
    groupId: "group-1",
    name: "设计组",
    role: "admin" as const,
    membershipId: "membership-1"
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.getStorageState.mockResolvedValue({
    ...getDefaultStorageState(),
    apiBaseUrl: "https://lunch.example",
    identityId: "identity-1",
    identityToken: "identity-token",
    activeGroupId: "group-1",
    sessionsByGroupId: { "group-1": { token: "old-group-token" } },
    groupSummariesById: { "group-1": renewed.group }
  });
  dependencies.requestJson.mockResolvedValue(renewed);
  dependencies.saveGroupConnectionIfCurrent.mockResolvedValue(true);
  dependencies.disconnectIdentityIfCurrent.mockResolvedValue(true);
  dependencies.clearGroupSessionIfCurrent.mockResolvedValue(true);
  dependencies.syncGroupSummariesIfCurrent.mockResolvedValue(true);
});

describe("extension group session retry", () => {
  it("shares one renewal across concurrent 401 responses and retries each request once", async () => {
    const operations = [vi.fn(), vi.fn()];
    for (const operation of operations) {
      operation.mockImplementation(async (token: string) => {
        if (token === "old-group-token") {
          throw new ExtensionApiError({ kind: "http", status: 401, code: "expired_token" });
        }
        return token;
      });
    }
    await expect(Promise.all(operations.map((operation) => (
      withGroupSessionRetry("group-1", "old-group-token", operation)
    )))).resolves.toEqual(["new-group-token", "new-group-token"]);
    expect(dependencies.requestJson).toHaveBeenCalledOnce();
    expect(dependencies.saveGroupConnectionIfCurrent).toHaveBeenCalledOnce();
    expect(operations[0]).toHaveBeenCalledTimes(2);
    expect(operations[1]).toHaveBeenCalledTimes(2);
  });

  it("clears only the affected group if renewal finds a removed membership", async () => {
    dependencies.requestJson
      .mockRejectedValueOnce(new ExtensionApiError({
        kind: "http", status: 403, code: "active_membership_required"
      }))
      .mockResolvedValueOnce({ groups: [] });
    await expect(withGroupSessionRetry("group-1", "old-group-token", async () => {
      throw new ExtensionApiError({ kind: "http", status: 401 });
    })).rejects.toMatchObject({ status: 403 });
    expect(dependencies.clearGroupSessionIfCurrent).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "group-1",
        groupSessionToken: "old-group-token"
      })
    );
    expect(dependencies.syncGroupSummariesIfCurrent).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ identityToken: "identity-token" })
    );
    expect(dependencies.disconnectIdentityIfCurrent).not.toHaveBeenCalled();
  });

  it("clears and resynchronizes a membership rejected by the business route", async () => {
    dependencies.requestJson.mockResolvedValueOnce({ groups: [] });
    await expect(withGroupSessionRetry("group-1", "old-group-token", async () => {
      throw new ExtensionApiError({
        kind: "http", status: 403, code: "removed_member"
      });
    })).rejects.toMatchObject({ status: 403, code: "removed_member" });
    expect(dependencies.clearGroupSessionIfCurrent).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: "group-1",
        groupSessionToken: "old-group-token"
      })
    );
    expect(dependencies.syncGroupSummariesIfCurrent).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ identityToken: "identity-token" })
    );
    expect(dependencies.saveGroupConnectionIfCurrent).not.toHaveBeenCalled();
  });

  it("disconnects the identity atomically if identity renewal is no longer possible", async () => {
    dependencies.requestJson.mockRejectedValue(new ExtensionApiError({
      kind: "http", status: 401, code: "invalid_token"
    }));
    await expect(withGroupSessionRetry("group-1", "old-group-token", async () => {
      throw new ExtensionApiError({ kind: "http", status: 401 });
    })).rejects.toMatchObject({ status: 401 });
    expect(dependencies.disconnectIdentityIfCurrent).toHaveBeenCalledOnce();
    expect(dependencies.clearGroupSessionIfCurrent).not.toHaveBeenCalled();
  });

  it("disconnects the identity when the single retried business request is still 401", async () => {
    const operation = vi.fn(async () => {
      throw new ExtensionApiError({ kind: "http", status: 401, code: "invalid_token" });
    });
    await expect(withGroupSessionRetry(
      "group-1",
      "old-group-token",
      operation
    )).rejects.toMatchObject({ status: 401 });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(dependencies.requestJson).toHaveBeenCalledOnce();
    expect(dependencies.disconnectIdentityIfCurrent).toHaveBeenCalledOnce();
  });

  it("does not persist or retry a renewal after the captured group context changes", async () => {
    dependencies.saveGroupConnectionIfCurrent.mockResolvedValue(false);
    const operation = vi.fn(async (token: string) => {
      if (token === "old-group-token") {
        throw new ExtensionApiError({ kind: "http", status: 401 });
      }
      return token;
    });

    await expect(withGroupSessionRetry(
      "group-1",
      "old-group-token",
      operation
    )).rejects.toMatchObject({
      kind: "invalid-response",
      code: "group_context_stale"
    });

    expect(operation).toHaveBeenCalledOnce();
    expect(dependencies.saveGroupConnectionIfCurrent).toHaveBeenCalledWith(
      renewed,
      expect.objectContaining({
        apiBaseUrl: "https://lunch.example",
        groupId: "group-1",
        membershipId: "membership-1",
        groupSessionToken: "old-group-token"
      })
    );
    expect(dependencies.disconnectIdentityIfCurrent).not.toHaveBeenCalled();
  });

  it("rejects a newer token that could come from an explicit session reset", async () => {
    dependencies.getStorageState.mockResolvedValue({
      ...getDefaultStorageState(),
      apiBaseUrl: "https://lunch.example",
      identityId: "identity-1",
      identityToken: "newer-identity-token",
      activeGroupId: "group-1",
      sessionsByGroupId: { "group-1": { token: "newer-group-token" } },
      groupSummariesById: { "group-1": renewed.group }
    });
    const operation = vi.fn(async (token: string) => {
      if (token === "old-group-token") {
        throw new ExtensionApiError({ kind: "http", status: 401 });
      }
      return token;
    });

    await expect(withGroupSessionRetry(
      "group-1",
      "old-group-token",
      operation,
      {
        apiBaseUrl: "https://lunch.example",
        identityId: "identity-1",
        identityToken: "identity-token",
        membershipId: "membership-1",
        authorizationRevision: 0
      }
    )).rejects.toMatchObject({
      kind: "invalid-response",
      code: "group_context_stale"
    });

    expect(operation).toHaveBeenCalledOnce();
    expect(dependencies.requestJson).not.toHaveBeenCalled();
    expect(dependencies.saveGroupConnectionIfCurrent).not.toHaveBeenCalled();
    expect(dependencies.disconnectIdentityIfCurrent).not.toHaveBeenCalled();
    expect(dependencies.clearGroupSessionIfCurrent).not.toHaveBeenCalled();
  });
});
