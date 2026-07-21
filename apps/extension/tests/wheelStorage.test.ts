import type { WheelTicketCount } from "@lunch/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS, STORAGE_STATE_LOCK_NAME } from "../src/config";
import { getDefaultStorageState } from "../src/storage";
import {
  clearLuckyWheelSession,
  loadLuckyWheelSession,
  saveLuckyWheelSession,
  type LuckyWheelSessionV1
} from "../src/wheelStorage";

function serialLockManager() {
  let queue = Promise.resolve();
  return {
    request: vi.fn(
      (
        _name: string,
        _options: LockOptions,
        callback: () => Promise<unknown>
      ) => {
        const run = queue.then(callback);
        queue = run.then(() => undefined, () => undefined);
        return run;
      }
    )
  };
}

function session(overrides: Partial<LuckyWheelSessionV1> = {}): LuckyWheelSessionV1 {
  return {
    version: 1,
    apiBaseUrl: "https://lunch.example",
    groupId: "group-1",
    membershipId: "membership-1",
    officeDate: "2026-07-20",
    batchId: "batch-1",
    algorithmVersion: "explainable-v1",
    mode: "weighted",
    spinNumber: 1,
    excludedRestaurantIds: [],
    lastSpin: {
      selectedRestaurantId: "restaurant-2",
      selectedRecommendationId: "recommendation-2",
      candidateTickets: [
        { restaurantId: "restaurant-1", tickets: 1 },
        { restaurantId: "restaurant-2", tickets: 3 }
      ]
    },
    accepted: false,
    acceptancePending: false,
    ...overrides
  };
}

function stubStorage(initialWheel: unknown = undefined) {
  const locks = serialLockManager();
  const values: Record<string, unknown> = {
    [STORAGE_KEYS.state]: {
      ...getDefaultStorageState(),
      apiBaseUrl: "https://lunch.example",
      activeGroupId: "group-1",
      sessionsByGroupId: { "group-1": { token: "group-token" } },
      groupSummariesById: {
        "group-1": {
          groupId: "group-1",
          name: "设计组",
          role: "member",
          membershipId: "membership-1"
        }
      }
    },
    ...(initialWheel === undefined
      ? {}
      : { [STORAGE_KEYS.luckyWheelSession]: initialWheel })
  };
  const get = vi.fn(async (keys: string | string[]) => {
    const requested = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(
      requested.filter((key) => key in values).map((key) => [key, structuredClone(values[key])])
    );
  });
  const set = vi.fn(async (input: Record<string, unknown>) => {
    Object.assign(values, structuredClone(input));
  });
  const remove = vi.fn(async (key: string | string[]) => {
    for (const item of Array.isArray(key) ? key : [key]) delete values[item];
  });
  vi.stubGlobal("navigator", { locks });
  vi.stubGlobal("chrome", { storage: { local: { get, set, remove } } });
  return { locks, values, get, set, remove };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("lucky wheel session storage", () => {
  it("uses an independent versioned key and returns null when absent", async () => {
    const { get } = stubStorage();

    await expect(loadLuckyWheelSession()).resolves.toBeNull();
    expect(STORAGE_KEYS.luckyWheelSession).toBe("luckyWheelSession.v1");
    expect(get).toHaveBeenCalledWith(STORAGE_KEYS.luckyWheelSession);
  });

  it("round-trips a minimal session under the shared storage lock", async () => {
    const { locks, values } = stubStorage();
    const value = session();

    await expect(saveLuckyWheelSession(value, null)).resolves.toBe(true);
    await expect(loadLuckyWheelSession()).resolves.toEqual(value);
    expect(values[STORAGE_KEYS.luckyWheelSession]).toEqual(value);
    expect(locks.request).toHaveBeenCalledWith(
      STORAGE_STATE_LOCK_NAME,
      { mode: "exclusive" },
      expect.any(Function)
    );
    expect(JSON.stringify(value)).not.toContain("group-token");
  });

  it("persists a zero-spin context marker before any result exists", async () => {
    const { values } = stubStorage();
    const marker = session({
      spinNumber: 0,
      lastSpin: undefined,
      accepted: false,
      acceptancePending: false
    });

    await expect(saveLuckyWheelSession(marker, null)).resolves.toBe(true);
    await expect(loadLuckyWheelSession()).resolves.toEqual(marker);
    expect(values[STORAGE_KEYS.luckyWheelSession]).toEqual(marker);
  });

  it("round-trips an acceptance claim without marking it accepted", async () => {
    const pending = session({ acceptancePending: true });
    stubStorage(pending);

    await expect(loadLuckyWheelSession()).resolves.toEqual(pending);
  });

  it("preserves an explicitly absent recommendation on the selected result", async () => {
    const withoutRecommendation = session({
      lastSpin: {
        ...session().lastSpin!,
        selectedRecommendationId: null
      }
    });
    stubStorage(withoutRecommendation);

    await expect(loadLuckyWheelSession()).resolves.toEqual(withoutRecommendation);
  });

  it.each([
    { ...session(), version: 2 },
    { ...session(), spinNumber: 3 },
    { ...session(), spinNumber: 0, lastSpin: session().lastSpin },
    { ...session(), accepted: true, acceptancePending: true },
    { ...session(), accepted: true, lastSpin: undefined },
    { ...session(), acceptancePending: true, lastSpin: undefined },
    {
      ...session(),
      lastSpin: {
        selectedRestaurantId: "restaurant-3",
        selectedRecommendationId: "recommendation-3",
        candidateTickets: session().lastSpin!.candidateTickets
      }
    },
    {
      ...session(),
      lastSpin: {
        ...session().lastSpin!,
        selectedRecommendationId: 42
      }
    },
    {
      ...session(),
      lastSpin: {
        selectedRestaurantId: "restaurant-2",
        candidateTickets: [
          { restaurantId: "restaurant-1", tickets: 0 as WheelTicketCount },
          { restaurantId: "restaurant-2", tickets: 3 }
        ]
      }
    }
  ])("removes malformed or incompatible stored sessions", async (stored) => {
    const { values, remove } = stubStorage(stored);

    await expect(loadLuckyWheelSession()).resolves.toBeNull();
    expect(remove).toHaveBeenCalledWith(STORAGE_KEYS.luckyWheelSession);
    expect(values).not.toHaveProperty(STORAGE_KEYS.luckyWheelSession);
  });

  it("rejects stale writes after the active group changes", async () => {
    const { values } = stubStorage();
    const state = values[STORAGE_KEYS.state] as ReturnType<typeof getDefaultStorageState>;
    state.activeGroupId = "group-2";

    await expect(saveLuckyWheelSession(session(), null)).resolves.toBe(false);
    expect(values).not.toHaveProperty(STORAGE_KEYS.luckyWheelSession);
  });

  it("uses compare-and-swap so a stale popup cannot overwrite a newer spin", async () => {
    const current = session();
    const { values } = stubStorage(current);
    const staleExpected = session({ spinNumber: 1 });
    const newer = session({ spinNumber: 2 });
    values[STORAGE_KEYS.luckyWheelSession] = newer;

    await expect(saveLuckyWheelSession(
      session({ spinNumber: 2, accepted: true }),
      staleExpected
    )).resolves.toBe(false);
    expect(values[STORAGE_KEYS.luckyWheelSession]).toEqual(newer);
  });

  it("conditionally clears only the session that was read", async () => {
    const original = session();
    const { values } = stubStorage(original);

    await expect(clearLuckyWheelSession(original)).resolves.toBe(true);
    expect(values).not.toHaveProperty(STORAGE_KEYS.luckyWheelSession);

    values[STORAGE_KEYS.luckyWheelSession] = session({ spinNumber: 2 });
    await expect(clearLuckyWheelSession(original)).resolves.toBe(false);
    expect(values[STORAGE_KEYS.luckyWheelSession]).toMatchObject({ spinNumber: 2 });
  });
});
