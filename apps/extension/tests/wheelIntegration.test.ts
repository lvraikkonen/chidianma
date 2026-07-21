import type { GroupWheelCandidatesResponse } from "@lunch/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../src/config";
import { getDefaultStorageState } from "../src/storage";
import { createExtensionLuckyWheelController } from "../src/wheelController";
import type { LuckyWheelSessionV1 } from "../src/wheelStorage";

function serialLockManager() {
  let queue = Promise.resolve();
  return {
    request: vi.fn((
      _name: string,
      _options: LockOptions,
      callback: () => Promise<unknown>
    ) => {
      const run = queue.then(callback);
      queue = run.then(() => undefined, () => undefined);
      return run;
    })
  };
}

function wheelResponse(): GroupWheelCandidatesResponse {
  return {
    groupId: "group-1",
    officeDate: "2026-07-20",
    batchId: "batch-1",
    algorithmVersion: "explainable-v1",
    candidates: [
      {
        restaurantId: "restaurant-1",
        recommendationId: "recommendation-1",
        name: "餐厅 1",
        reason: "离公司近",
        tags: ["近"],
        recommendationScore: 10,
        selectedWithinLast7Days: false
      },
      {
        restaurantId: "restaurant-2",
        recommendationId: "recommendation-2",
        name: "餐厅 2",
        reason: "适合今天",
        tags: ["稳"],
        recommendationScore: 30,
        selectedWithinLast7Days: false
      }
    ]
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("extension lucky wheel production composition", () => {
  it("renews a 401 session, spins, and accepts through the real client and storage wiring", async () => {
    const state = {
      ...getDefaultStorageState(),
      apiBaseUrl: "https://lunch.example",
      identityId: "identity-1",
      identityToken: "old-identity-token",
      identityTokenExpiresAt: "2026-08-01T00:00:00.000Z",
      activeGroupId: "group-1",
      sessionsByGroupId: { "group-1": { token: "old-group-token" } },
      groupSummariesById: {
        "group-1": {
          groupId: "group-1",
          name: "设计组",
          role: "member" as const,
          membershipId: "membership-1"
        }
      }
    };
    const values: Record<string, unknown> = {
      [STORAGE_KEYS.state]: structuredClone(state)
    };
    const get = vi.fn(async (keys: string | string[]) => {
      const requested = Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(requested.flatMap((key) => (
        key in values ? [[key, structuredClone(values[key])]] : []
      )));
    });
    const set = vi.fn(async (input: Record<string, unknown>) => {
      Object.assign(values, structuredClone(input));
    });
    const remove = vi.fn(async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) delete values[key];
    });
    vi.stubGlobal("navigator", { locks: serialLockManager() });
    vi.stubGlobal("chrome", {
      storage: { local: { get, set, remove } },
      runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) }
    });

    let firstCandidateRequest = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const authorization = new Headers(init?.headers).get("authorization");
      const json = (body: unknown, status = 200) => new Response(
        JSON.stringify(body),
        { status, headers: { "content-type": "application/json" } }
      );
      if (
        url.pathname === "/api/groups/group-1/today-recommendations/wheel-candidates"
        && firstCandidateRequest
      ) {
        firstCandidateRequest = false;
        expect(authorization).toBe("Bearer old-group-token");
        return json({ error: "expired_token" }, 401);
      }
      if (url.pathname === "/api/groups/group-1/session") {
        expect(init?.method).toBe("POST");
        expect(authorization).toBe("Bearer old-identity-token");
        return json({
          identityToken: "new-identity-token",
          identityTokenExpiresAt: "2026-08-02T00:00:00.000Z",
          groupSessionToken: "new-group-token",
          groupSessionTokenExpiresAt: "2026-07-21T00:00:00.000Z",
          group: state.groupSummariesById["group-1"]
        });
      }
      if (url.pathname.endsWith("/wheel-candidates")) {
        expect(authorization).toBe("Bearer new-group-token");
        return json(wheelResponse());
      }
      if (url.pathname === "/api/groups/group-1/participation/today") {
        expect(init?.method).toBe("PUT");
        expect(authorization).toBe("Bearer new-group-token");
        expect(JSON.parse(String(init?.body))).toEqual({
          status: "decided",
          restaurantId: "restaurant-2",
          recommendationId: "recommendation-2"
        });
        return json({
          groupId: "group-1",
          officeDate: "2026-07-20",
          participation: {
            membershipId: "membership-1",
            displayName: "小林",
            status: "decided",
            restaurantId: "restaurant-2",
            recommendationId: "recommendation-2"
          },
          summary: {
            joiningCount: 0,
            decidedCount: 1,
            awayCount: 0,
            undecidedCount: 0
          }
        });
      }
      return json({ error: "not_found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    const controller = createExtensionLuckyWheelController({
      randomSource: () => 0.99
    });
    await controller.load({
      storage: structuredClone(state),
      enabled: true,
      readOnly: false
    });
    await expect(controller.spin()).resolves.toBe(true);
    expect(controller.finishSpin()).toBe(true);
    await expect(controller.acceptSelected()).resolves.toBe(true);

    expect(values[STORAGE_KEYS.state]).toMatchObject({
      identityToken: "new-identity-token",
      sessionsByGroupId: { "group-1": { token: "new-group-token" } }
    });
    expect(values[STORAGE_KEYS.luckyWheelSession] as LuckyWheelSessionV1)
      .toMatchObject({
        spinNumber: 1,
        accepted: true,
        acceptancePending: false,
        lastSpin: {
          selectedRestaurantId: "restaurant-2",
          selectedRecommendationId: "recommendation-2"
        }
      });
    expect(fetchMock.mock.calls.filter(([input]) => (
      new URL(String(input)).pathname === "/api/groups/group-1/session"
    ))).toHaveLength(1);
  });
});
