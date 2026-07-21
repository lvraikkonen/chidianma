import type {
  GroupWheelCandidatesResponse,
  PutParticipationTodayResponse,
  WheelMode
} from "@lunch/shared";
import { describe, expect, it, vi } from "vitest";
import { ExtensionApiError } from "../src/apiClient";
import { getDefaultStorageState } from "../src/storage";
import {
  createLuckyWheelController,
  type LuckyWheelControllerDependencies
} from "../src/wheelController";
import type { LuckyWheelSessionV1 } from "../src/wheelStorage";

function connectedStorage(groupId = "group-1") {
  return {
    ...getDefaultStorageState(),
    apiBaseUrl: "https://lunch.example",
    activeGroupId: groupId,
    sessionsByGroupId: { [groupId]: { token: `${groupId}-token` } },
    groupSummariesById: {
      [groupId]: {
        groupId,
        name: `${groupId} 小组`,
        role: "member" as const,
        membershipId: `${groupId}-membership`
      }
    }
  };
}

function candidate(index: number) {
  return {
    restaurantId: `restaurant-${index}`,
    recommendationId: `recommendation-${index}`,
    name: `餐厅 ${index}`,
    dish: `招牌菜 ${index}`,
    reason: `推荐理由 ${index}`,
    distanceMinutes: 5 + index,
    tags: ["近"],
    recommendationScore: index === 1 ? 10 : 30 + index,
    selectedWithinLast7Days: false
  };
}

function response(count = 2): GroupWheelCandidatesResponse {
  return {
    groupId: "group-1",
    officeDate: "2026-07-20",
    batchId: "batch-1",
    algorithmVersion: "explainable-v1",
    candidates: Array.from({ length: count }, (_, index) => candidate(index + 1))
  };
}

function responseForBatch(
  batchId: string,
  candidates = response().candidates
): GroupWheelCandidatesResponse {
  return { ...response(0), batchId, candidates };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function participation(
  restaurantId: string,
  overrides: Partial<PutParticipationTodayResponse> = {}
): PutParticipationTodayResponse {
  return {
    groupId: "group-1",
    officeDate: "2026-07-20",
    participation: {
      membershipId: "group-1-membership",
      displayName: "小林",
      status: "decided",
      restaurantId,
      recommendationId: restaurantId.replace("restaurant", "recommendation")
    },
    summary: {
      joiningCount: 0,
      decidedCount: 1,
      awayCount: 0,
      undecidedCount: 0
    },
    ...overrides
  };
}

function storedSession(
  overrides: Partial<LuckyWheelSessionV1> = {}
): LuckyWheelSessionV1 {
  return {
    version: 1,
    apiBaseUrl: "https://lunch.example",
    groupId: "group-1",
    membershipId: "group-1-membership",
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

function setup({
  count = 2,
  mode,
  randomValue = 0.99,
  session = null,
  loadCandidates,
  loadStorage,
  saveSession,
  acceptDecision
}: {
  count?: number;
  mode?: WheelMode;
  randomValue?: number;
  session?: LuckyWheelSessionV1 | null;
  loadCandidates?: LuckyWheelControllerDependencies["loadCandidates"];
  loadStorage?: LuckyWheelControllerDependencies["loadStorage"];
  saveSession?: LuckyWheelControllerDependencies["saveSession"];
  acceptDecision?: LuckyWheelControllerDependencies["acceptDecision"];
} = {}) {
  let persisted = session;
  const randomSource = vi.fn(() => randomValue);
  const dependencies: LuckyWheelControllerDependencies = {
    loadStorage: loadStorage ?? vi.fn().mockResolvedValue(connectedStorage()),
    loadCandidates: loadCandidates ?? vi.fn().mockResolvedValue(response(count)),
    loadSession: vi.fn(async () => persisted),
    saveSession: saveSession ?? vi.fn(async (next, expected) => {
      if (persisted !== expected) return false;
      persisted = next;
      return true;
    }),
    clearSession: vi.fn(async (expected) => {
      if (expected && persisted !== expected) return false;
      persisted = null;
      return true;
    }),
    acceptDecision: acceptDecision ?? vi.fn(async (_storage, input) => (
      participation(input.restaurantId!)
    )),
    randomSource,
    onStateChange: vi.fn()
  };
  const controller = createLuckyWheelController(dependencies);
  return {
    controller,
    dependencies,
    randomSource,
    persisted: () => persisted,
    load: (input: { enabled?: boolean; readOnly?: boolean } = {}) => controller.load({
      storage: connectedStorage(),
      enabled: input.enabled ?? true,
      readOnly: input.readOnly ?? false,
      ...(mode ? { initialMode: mode } : {})
    })
  };
}

describe("lucky wheel controller", () => {
  it.each([0, 1])("returns insufficient for %i candidates without consuming randomness", async (count) => {
    const test = setup({ count });

    await test.load();

    expect(test.controller.getState()).toMatchObject({
      kind: "insufficient",
      candidateCount: count,
      spinNumber: 0
    });
    expect(test.randomSource).not.toHaveBeenCalled();
  });

  it.each([2, 8])("loads %i live candidates in weighted mode", async (count) => {
    const test = setup({ count });

    await test.load();

    expect(test.controller.getState()).toMatchObject({
      kind: "ready",
      mode: "weighted",
      modeLocked: false,
      spinNumber: 0,
      canSpin: true
    });
    const state = test.controller.getState();
    expect(state.kind === "ready" && state.candidates).toHaveLength(count);
    expect(test.persisted()).toMatchObject({
      spinNumber: 0,
      batchId: "batch-1",
      accepted: false,
      acceptancePending: false
    });
  });

  it("allows equal mode before the first spin and locks it afterward", async () => {
    const test = setup();
    await test.load();

    expect(test.controller.setMode("equal")).toBe(true);
    await test.controller.spin();

    expect(test.controller.getState()).toMatchObject({
      kind: "spinning",
      mode: "equal",
      spinNumber: 1
    });
    expect(test.controller.setMode("weighted")).toBe(false);
    expect(test.persisted()).toMatchObject({ mode: "equal", spinNumber: 1 });
  });

  it("persists one deterministic result before exposing the spinning state", async () => {
    const events: string[] = [];
    let persisted: LuckyWheelSessionV1 | null = null;
    const saveSession = vi.fn(async (next: LuckyWheelSessionV1) => {
      events.push("saved");
      persisted = next;
      return true;
    });
    const test = setup({ saveSession, randomValue: 0.99 });
    test.dependencies.onStateChange = vi.fn((state) => events.push(state.kind));
    const controller = createLuckyWheelController(test.dependencies);
    await controller.load({ storage: connectedStorage(), enabled: true, readOnly: false });
    events.length = 0;

    await controller.spin();

    expect(events).toEqual(["saved", "spinning"]);
    expect(test.randomSource).toHaveBeenCalledOnce();
    expect(controller.getState()).toMatchObject({
      kind: "spinning",
      selected: { restaurantId: "restaurant-2" }
    });
    expect(persisted).toMatchObject({
      spinNumber: 1,
      lastSpin: { selectedRestaurantId: "restaurant-2" }
    });

    controller.finishSpin();
    expect(controller.getState()).toMatchObject({
      kind: "result",
      selected: { restaurantId: "restaurant-2" }
    });
    expect(test.randomSource).toHaveBeenCalledOnce();
  });

  it("allows one reroll but rejects a third draw before calling the RNG", async () => {
    const test = setup();
    await test.load();
    await test.controller.spin();
    test.controller.finishSpin();
    await test.controller.spin();
    test.controller.finishSpin();

    expect(test.controller.getState()).toMatchObject({
      kind: "result",
      spinNumber: 2,
      canReroll: false
    });
    await expect(test.controller.spin()).resolves.toBe(false);
    expect(test.randomSource).toHaveBeenCalledTimes(2);
  });

  it("excludes only within the session, recalculates the pool, and preserves consumed spins", async () => {
    const test = setup({ count: 3 });
    await test.load();
    await test.controller.spin();
    test.controller.finishSpin();
    const resultState = test.controller.getState();
    const selectedId = resultState.kind === "result"
      ? resultState.selected.restaurantId
      : "";

    await expect(test.controller.excludeSelected()).resolves.toBe(true);

    expect(test.controller.getState()).toMatchObject({
      kind: "ready",
      spinNumber: 1,
      modeLocked: true,
      canSpin: true,
      excludedRestaurantIds: [selectedId]
    });
    expect(test.persisted()).toMatchObject({
      spinNumber: 1,
      excludedRestaurantIds: [selectedId],
      accepted: false,
      acceptancePending: false
    });
    expect(test.persisted()).not.toHaveProperty("lastSpin");
    expect(test.dependencies.acceptDecision).not.toHaveBeenCalled();
    const state = test.controller.getState();
    expect(state.kind === "ready" && state.candidates)
      .not.toEqual(expect.arrayContaining([
        expect.objectContaining({ restaurantId: selectedId })
      ]));
    expect(state.kind === "ready" && state.candidates.reduce(
      (total, item) => total + item.probability,
      0
    )).toBeCloseTo(1);
  });

  it("does not grant a third spin after excluding the second result", async () => {
    const test = setup({ count: 3 });
    await test.load();
    await test.controller.spin();
    test.controller.finishSpin();
    await test.controller.spin();
    test.controller.finishSpin();
    await test.controller.excludeSelected();

    expect(test.controller.getState()).toMatchObject({
      kind: "ready",
      spinNumber: 2,
      canSpin: false
    });
    await expect(test.controller.spin()).resolves.toBe(false);
    expect(test.randomSource).toHaveBeenCalledTimes(2);
  });

  it("becomes insufficient when excluding leaves only one candidate", async () => {
    const test = setup({ count: 2 });
    await test.load();
    await test.controller.spin();
    test.controller.finishSpin();

    await test.controller.excludeSelected();

    expect(test.controller.getState()).toMatchObject({
      kind: "insufficient",
      candidateCount: 1,
      spinNumber: 1,
      canSpin: false
    });
  });

  it("does not expose an unpersisted random result", async () => {
    let persisted: LuckyWheelSessionV1 | null = null;
    const saveSession = vi.fn(async (
      next: LuckyWheelSessionV1,
      expected: LuckyWheelSessionV1 | null
    ) => {
      if (persisted !== expected || next.spinNumber > 0) return false;
      persisted = next;
      return true;
    });
    const test = setup({ saveSession });
    await test.load();

    await expect(test.controller.spin()).resolves.toBe(false);

    expect(test.randomSource).toHaveBeenCalledOnce();
    expect(test.controller.getState()).toMatchObject({
      kind: "error",
      code: "wheel_context_stale"
    });
    expect(test.controller.getState()).not.toHaveProperty("selected");
  });

  it("restores the persisted result and exact ticket mapping without rerandomizing", async () => {
    const test = setup({ session: storedSession() });

    await test.load();

    expect(test.controller.getState()).toMatchObject({
      kind: "result",
      source: "restored",
      spinNumber: 1,
      selected: { restaurantId: "restaurant-2", tickets: 3 },
      candidates: [
        { restaurantId: "restaurant-1", tickets: 1, probability: 0.25 },
        { restaurantId: "restaurant-2", tickets: 3, probability: 0.75 }
      ]
    });
    expect(test.randomSource).not.toHaveBeenCalled();
  });

  it("restores an accepted result without offering another draw", async () => {
    const test = setup({ session: storedSession({ accepted: true }) });

    await test.load();

    expect(test.controller.getState()).toMatchObject({
      kind: "result",
      accepted: true,
      canReroll: false
    });
    await expect(test.controller.spin()).resolves.toBe(false);
    await expect(test.controller.excludeSelected()).resolves.toBe(false);
    expect(test.randomSource).not.toHaveBeenCalled();
  });

  it("keeps a consumed spin but drops a result whose candidate set changed", async () => {
    const changedResponse = {
      ...response(2),
      candidates: [candidate(1), candidate(3)]
    };
    const test = setup({
      session: storedSession(),
      loadCandidates: vi.fn().mockResolvedValue(changedResponse)
    });

    await test.load();

    expect(test.controller.getState()).toMatchObject({
      kind: "ready",
      spinNumber: 1,
      canSpin: true,
      notice: "候选餐厅已变化，之前的结果不再可用。"
    });
    expect(test.persisted()).toMatchObject({ spinNumber: 1 });
    expect(test.persisted()).not.toHaveProperty("lastSpin");
  });

  it("keeps an accepted result terminal when its candidate set changes", async () => {
    const accepted = storedSession({ accepted: true });
    const changedResponse = {
      ...response(2),
      candidates: [candidate(1), candidate(3)]
    };
    const test = setup({
      session: accepted,
      loadCandidates: vi.fn().mockResolvedValue(changedResponse)
    });

    await test.load();

    expect(test.controller.getState()).toMatchObject({
      kind: "error",
      code: "wheel_terminal_result_changed",
      retryable: false
    });
    expect(test.persisted()).toEqual(accepted);
  });

  it.each([
    { accepted: true, acceptancePending: false },
    { accepted: false, acceptancePending: true }
  ])("keeps a terminal result bound to its original recommendation", async (terminal) => {
    const original = storedSession(terminal);
    const changedRecommendation = response();
    changedRecommendation.candidates = changedRecommendation.candidates.map((item) => (
      item.restaurantId === "restaurant-2"
        ? { ...item, recommendationId: "recommendation-new" }
        : item
    ));
    const test = setup({
      session: original,
      loadCandidates: vi.fn().mockResolvedValue(changedRecommendation)
    });

    await test.load();

    expect(test.controller.getState()).toMatchObject({
      kind: "error",
      code: "wheel_terminal_result_changed",
      retryable: false
    });
    expect(test.persisted()).toEqual(original);
  });

  it("atomically replaces a session from a different batch with a zero-spin marker", async () => {
    const old = storedSession({ batchId: "batch-old" });
    const test = setup({ session: old });

    await test.load();

    expect(test.dependencies.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ batchId: "batch-1", spinNumber: 0 }),
      old
    );
    expect(test.controller.getState()).toMatchObject({
      kind: "ready",
      spinNumber: 0,
      modeLocked: false
    });
  });

  it("does not replace a same-day pending acceptance when the batch changes", async () => {
    const pending = storedSession({
      batchId: "batch-old",
      acceptancePending: true
    });
    const test = setup({ session: pending });

    await test.load();

    expect(test.controller.getState()).toMatchObject({
      kind: "error",
      code: "wheel_acceptance_pending_context_changed",
      retryable: false
    });
    expect(test.persisted()).toEqual(pending);
    expect(test.dependencies.saveSession).not.toHaveBeenCalled();
  });

  it("refreshes the authoritative batch before drawing and never randomizes the old batch", async () => {
    const loadCandidates = vi.fn()
      .mockResolvedValueOnce(responseForBatch("batch-1"))
      .mockResolvedValueOnce(responseForBatch("batch-2"));
    const test = setup({ loadCandidates });
    await test.load();

    await expect(test.controller.spin()).resolves.toBe(false);

    expect(test.randomSource).not.toHaveBeenCalled();
    expect(test.persisted()).toMatchObject({ batchId: "batch-2", spinNumber: 0 });
    expect(test.controller.getState()).toMatchObject({
      kind: "ready",
      spinNumber: 0,
      notice: "推荐批次已更新，请基于新候选重新转动。",
      response: { batchId: "batch-2" }
    });
  });

  it("honors a Server flag shutdown before drawing", async () => {
    const loadCandidates = vi.fn()
      .mockResolvedValueOnce(response())
      .mockRejectedValueOnce(new ExtensionApiError({
        kind: "http",
        status: 404,
        code: "lucky_restaurant_wheel_not_enabled"
      }));
    const test = setup({ loadCandidates });
    await test.load();

    await expect(test.controller.spin()).resolves.toBe(false);

    expect(test.randomSource).not.toHaveBeenCalled();
    expect(test.controller.getState()).toMatchObject({
      kind: "error",
      code: "lucky_restaurant_wheel_not_enabled",
      retryable: false
    });
  });

  it.each([
    { accepted: true, acceptancePending: false },
    { accepted: false, acceptancePending: true }
  ])("does not reopen a terminal result won by another popup during batch refresh", async (terminal) => {
    const loadCandidates = vi.fn()
      .mockResolvedValueOnce(responseForBatch("batch-1"))
      .mockResolvedValueOnce(responseForBatch("batch-2"));
    const test = setup({
      session: storedSession(),
      loadCandidates
    });
    await test.load();
    const terminalSession = storedSession({
      batchId: "batch-2",
      ...terminal
    });
    test.dependencies.saveSession = vi.fn().mockResolvedValue(false);
    test.dependencies.loadSession = vi.fn().mockResolvedValue(terminalSession);

    await expect(test.controller.spin()).resolves.toBe(false);

    expect(test.randomSource).not.toHaveBeenCalled();
    expect(test.controller.getState()).toMatchObject({
      kind: "result",
      source: "restored",
      accepted: terminal.accepted,
      acceptancePending: terminal.acceptancePending,
      canReroll: false,
      response: { batchId: "batch-2" }
    });
  });

  it("does not call the candidate API or RNG for a cached host state", async () => {
    const test = setup();

    await test.load({ readOnly: true });

    expect(test.controller.getState()).toMatchObject({
      kind: "error",
      code: "wheel_read_only",
      retryable: false
    });
    expect(test.dependencies.loadCandidates).not.toHaveBeenCalled();
    expect(test.randomSource).not.toHaveBeenCalled();
  });

  it("does not call the candidate API when the capability is disabled", async () => {
    const test = setup();

    await test.load({ enabled: false });

    expect(test.controller.getState()).toMatchObject({
      kind: "error",
      code: "wheel_not_enabled",
      retryable: false
    });
    expect(test.dependencies.loadCandidates).not.toHaveBeenCalled();
  });

  it("drops a late candidate response after the active group changes", async () => {
    let resolveCandidates!: (value: GroupWheelCandidatesResponse) => void;
    const pending = new Promise<GroupWheelCandidatesResponse>((resolve) => {
      resolveCandidates = resolve;
    });
    const loadStorage = vi.fn()
      .mockResolvedValueOnce(connectedStorage("group-2"));
    const test = setup({
      loadCandidates: vi.fn(() => pending),
      loadStorage
    });
    const load = test.load();
    resolveCandidates(response());
    await load;

    expect(test.controller.getState()).toMatchObject({
      kind: "error",
      code: "wheel_context_stale",
      retryable: false
    });
  });

  it("does not let an old spin continuation overwrite a newer load", async () => {
    const oldSpinCandidates = deferred<GroupWheelCandidatesResponse>();
    const loadCandidates = vi.fn()
      .mockResolvedValueOnce(responseForBatch("batch-1"))
      .mockImplementationOnce(() => oldSpinCandidates.promise)
      .mockResolvedValueOnce(responseForBatch("batch-2"));
    const test = setup({ loadCandidates });
    await test.load();
    const oldSpin = test.controller.spin();

    await test.controller.load({
      storage: connectedStorage(),
      enabled: true,
      readOnly: false
    });
    oldSpinCandidates.resolve(responseForBatch("batch-1"));
    await oldSpin;

    expect(test.controller.getState()).toMatchObject({
      kind: "ready",
      response: { batchId: "batch-2" },
      spinNumber: 0
    });
    expect(test.randomSource).not.toHaveBeenCalled();
  });

  it("allows only one of two controllers sharing CAS storage to persist a spin", async () => {
    let persisted: LuckyWheelSessionV1 | null = null;
    let queue = Promise.resolve();
    const same = (
      left: LuckyWheelSessionV1 | null,
      right: LuckyWheelSessionV1 | null
    ) => JSON.stringify(left) === JSON.stringify(right);
    const loadSession = vi.fn(() => queue.then(() => (
      persisted ? structuredClone(persisted) : null
    )));
    const saveSession = vi.fn((
      next: LuckyWheelSessionV1,
      expected: LuckyWheelSessionV1 | null
    ) => {
      const run = queue.then(() => {
        if (!same(persisted, expected)) return false;
        persisted = structuredClone(next);
        return true;
      });
      queue = run.then(() => undefined, () => undefined);
      return run;
    });
    const makeController = (randomValue: number) => createLuckyWheelController({
      loadStorage: vi.fn().mockResolvedValue(connectedStorage()),
      loadCandidates: vi.fn().mockResolvedValue(response()),
      loadSession,
      saveSession,
      clearSession: vi.fn().mockResolvedValue(true),
      acceptDecision: vi.fn(async (_storage, input) => participation(input.restaurantId!)),
      randomSource: vi.fn(() => randomValue)
    });
    const first = makeController(0.1);
    const second = makeController(0.99);

    await Promise.all([first, second].map((controller) => controller.load({
      storage: connectedStorage(),
      enabled: true,
      readOnly: false
    })));
    const outcomes = await Promise.all([first.spin(), second.spin()]);

    expect(outcomes.filter(Boolean)).toHaveLength(1);
    expect(persisted).toMatchObject({ spinNumber: 1 });
    const loser = outcomes[0] ? second : first;
    expect(loser.getState()).toMatchObject({
      kind: "error",
      code: "wheel_context_stale"
    });
    expect(loser.getState()).not.toHaveProperty("selected");

    const reopened = makeController(0.5);
    await reopened.load({
      storage: connectedStorage(),
      enabled: true,
      readOnly: false
    });
    expect(reopened.getState()).toMatchObject({
      kind: "result",
      source: "restored",
      spinNumber: 1
    });
  });

  it("prevents another controller from rerolling after acceptance claims the result", async () => {
    let persisted: LuckyWheelSessionV1 | null = storedSession();
    let queue = Promise.resolve();
    const same = (
      left: LuckyWheelSessionV1 | null,
      right: LuckyWheelSessionV1 | null
    ) => JSON.stringify(left) === JSON.stringify(right);
    const loadSession = vi.fn(() => queue.then(() => (
      persisted ? structuredClone(persisted) : null
    )));
    const saveSession = vi.fn((
      next: LuckyWheelSessionV1,
      expected: LuckyWheelSessionV1 | null
    ) => {
      const run = queue.then(() => {
        if (!same(persisted, expected)) return false;
        persisted = structuredClone(next);
        return true;
      });
      queue = run.then(() => undefined, () => undefined);
      return run;
    });
    const request = deferred<PutParticipationTodayResponse>();
    const acceptingController = createLuckyWheelController({
      loadStorage: vi.fn().mockResolvedValue(connectedStorage()),
      loadCandidates: vi.fn().mockResolvedValue(response()),
      loadSession,
      saveSession,
      clearSession: vi.fn().mockResolvedValue(true),
      acceptDecision: vi.fn(() => request.promise),
      randomSource: vi.fn(() => 0.99)
    });
    const rerollRandom = vi.fn(() => 0.1);
    const rerollController = createLuckyWheelController({
      loadStorage: vi.fn().mockResolvedValue(connectedStorage()),
      loadCandidates: vi.fn().mockResolvedValue(response()),
      loadSession,
      saveSession,
      clearSession: vi.fn().mockResolvedValue(true),
      acceptDecision: vi.fn(async (_storage, input) => participation(input.restaurantId!)),
      randomSource: rerollRandom
    });
    await Promise.all([acceptingController, rerollController].map((controller) => (
      controller.load({
        storage: connectedStorage(),
        enabled: true,
        readOnly: false
      })
    )));

    const accepting = acceptingController.acceptSelected();
    await vi.waitFor(() => {
      expect(persisted).toMatchObject({ acceptancePending: true });
    });
    await expect(rerollController.spin()).resolves.toBe(false);

    expect(rerollRandom).toHaveBeenCalledOnce();
    expect(rerollController.getState()).toMatchObject({
      kind: "error",
      code: "wheel_context_stale"
    });
    expect(persisted).toMatchObject({
      spinNumber: 1,
      acceptancePending: true,
      accepted: false
    });

    request.resolve(participation("restaurant-2"));
    await expect(accepting).resolves.toBe(true);
    expect(persisted).toMatchObject({
      spinNumber: 1,
      acceptancePending: false,
      accepted: true,
      lastSpin: { selectedRestaurantId: "restaurant-2" }
    });
  });

  it("drops a load continuation cancelled during its context check", async () => {
    const contextCheck = deferred<ReturnType<typeof connectedStorage>>();
    const test = setup({
      loadStorage: vi.fn(() => contextCheck.promise)
    });
    const loading = test.load();
    await vi.waitFor(() => {
      expect(test.dependencies.loadStorage).toHaveBeenCalledOnce();
    });

    test.controller.cancel();
    contextCheck.resolve(connectedStorage());
    await loading;

    expect(test.controller.getState()).toEqual({ kind: "loading" });
    expect(test.dependencies.saveSession).not.toHaveBeenCalled();
  });

  it("accepts the selected restaurant through participation PUT and persists success", async () => {
    const test = setup();
    await test.load();
    await test.controller.spin();
    test.controller.finishSpin();

    await expect(test.controller.acceptSelected()).resolves.toBe(true);

    expect(test.dependencies.acceptDecision).toHaveBeenCalledWith(
      expect.objectContaining({ activeGroupId: "group-1" }),
      {
        status: "decided",
        restaurantId: "restaurant-2",
        recommendationId: "recommendation-2"
      }
    );
    expect(test.controller.getState()).toMatchObject({
      kind: "result",
      accepted: true,
      canReroll: false
    });
    expect(test.persisted()).toMatchObject({
      accepted: true,
      acceptancePending: false
    });
  });

  it("claims the selected result before PUT and keeps reroll disabled when acceptance fails", async () => {
    const acceptDecision = vi.fn().mockRejectedValue(new Error("offline"));
    const test = setup({ acceptDecision });
    await test.load();
    await test.controller.spin();
    test.controller.finishSpin();

    await expect(test.controller.acceptSelected()).resolves.toBe(false);

    expect(test.controller.getState()).toMatchObject({
      kind: "result",
      accepted: false,
      acceptancePending: true,
      canReroll: false,
      acceptError: "暂时无法确认这次选择，请重试。"
    });
    expect(test.persisted()).toMatchObject({
      accepted: false,
      acceptancePending: true
    });
    await expect(test.controller.spin()).resolves.toBe(false);
    await expect(test.controller.excludeSelected()).resolves.toBe(false);
  });

  it("persists the acceptance claim before calling the server", async () => {
    const request = deferred<PutParticipationTodayResponse>();
    const acceptDecision = vi.fn(() => request.promise);
    const test = setup({ acceptDecision });
    await test.load();
    await test.controller.spin();
    test.controller.finishSpin();

    const accepting = test.controller.acceptSelected();
    await vi.waitFor(() => expect(acceptDecision).toHaveBeenCalledOnce());

    expect(test.persisted()).toMatchObject({
      accepted: false,
      acceptancePending: true
    });
    expect(test.controller.getState()).toMatchObject({
      kind: "result",
      acceptancePending: true,
      accepting: true,
      canReroll: false
    });
    request.resolve(participation("restaurant-2"));
    await expect(accepting).resolves.toBe(true);
  });

  it("keeps a pending claim terminal when the final accepted save loses its CAS", async () => {
    let persisted: LuckyWheelSessionV1 | null = null;
    const saveSession = vi.fn(async (
      next: LuckyWheelSessionV1,
      expected: LuckyWheelSessionV1 | null
    ) => {
      if (persisted !== expected || next.accepted) return false;
      persisted = next;
      return true;
    });
    const test = setup({ saveSession });
    await test.load();
    await test.controller.spin();
    test.controller.finishSpin();

    await expect(test.controller.acceptSelected()).resolves.toBe(false);

    expect(persisted).toMatchObject({
      acceptancePending: true,
      accepted: false
    });
    expect(test.controller.getState()).toMatchObject({
      kind: "result",
      acceptancePending: true,
      canReroll: false,
      acceptError: "选择已提交，但本机状态未能确认，请重新打开转盘核对。"
    });

    const reopened = setup({ session: persisted });
    await reopened.load();
    expect(reopened.controller.getState()).toMatchObject({
      kind: "result",
      source: "restored",
      acceptancePending: true,
      canReroll: false
    });
  });

  it("retries a restored pending claim without claiming it again", async () => {
    const pending = storedSession({ acceptancePending: true });
    const test = setup({ session: pending });
    await test.load();

    await expect(test.controller.acceptSelected()).resolves.toBe(true);

    expect(test.dependencies.acceptDecision).toHaveBeenCalledOnce();
    expect(test.dependencies.saveSession).toHaveBeenCalledOnce();
    expect(test.dependencies.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accepted: true,
        acceptancePending: false
      }),
      pending
    );
    expect(test.controller.getState()).toMatchObject({
      kind: "result",
      accepted: true,
      acceptancePending: false,
      canReroll: false
    });
  });

  it("keeps a persisted pending claim when a late PUT succeeds after cancel", async () => {
    const request = deferred<PutParticipationTodayResponse>();
    const test = setup({
      acceptDecision: vi.fn(() => request.promise)
    });
    await test.load();
    await test.controller.spin();
    test.controller.finishSpin();
    const accepting = test.controller.acceptSelected();
    await vi.waitFor(() => {
      expect(test.dependencies.acceptDecision).toHaveBeenCalledOnce();
    });
    expect(test.persisted()).toMatchObject({ acceptancePending: true });

    test.controller.cancel();
    request.resolve(participation("restaurant-2"));
    await expect(accepting).resolves.toBe(false);

    expect(test.persisted()).toMatchObject({
      accepted: false,
      acceptancePending: true
    });
    const reopened = setup({ session: test.persisted() });
    await reopened.load();
    expect(reopened.controller.getState()).toMatchObject({
      kind: "result",
      source: "restored",
      acceptancePending: true,
      canReroll: false
    });
  });

  it("does not render old scoped data after the group changes during PUT", async () => {
    let currentStorage = connectedStorage();
    const request = deferred<PutParticipationTodayResponse>();
    const test = setup({
      loadStorage: vi.fn(async () => currentStorage),
      acceptDecision: vi.fn(() => request.promise)
    });
    await test.load();
    await test.controller.spin();
    test.controller.finishSpin();
    const accepting = test.controller.acceptSelected();
    await vi.waitFor(() => {
      expect(test.dependencies.acceptDecision).toHaveBeenCalledOnce();
    });

    currentStorage = connectedStorage("group-2");
    request.resolve(participation("restaurant-2"));
    await expect(accepting).resolves.toBe(false);

    expect(test.controller.getState()).toMatchObject({
      kind: "error",
      code: "wheel_context_stale",
      retryable: false
    });
  });

  it("rejects a mismatched participation response without marking accepted", async () => {
    const acceptDecision = vi.fn().mockResolvedValue(participation("restaurant-1", {
      groupId: "group-2"
    }));
    const test = setup({ acceptDecision });
    await test.load();
    await test.controller.spin();
    test.controller.finishSpin();

    await expect(test.controller.acceptSelected()).resolves.toBe(false);
    expect(test.controller.getState()).toMatchObject({
      kind: "result",
      accepted: false,
      acceptancePending: true,
      acceptError: "暂时无法确认这次选择，请重试。"
    });
  });

  it("requires recommendation equality even when the candidate has no recommendation", async () => {
    const withoutRecommendation = response();
    withoutRecommendation.candidates = withoutRecommendation.candidates.map((item) => {
      if (item.restaurantId !== "restaurant-2") return item;
      const { recommendationId: _recommendationId, ...rest } = item;
      return rest;
    });
    const test = setup({
      loadCandidates: vi.fn().mockResolvedValue(withoutRecommendation),
      acceptDecision: vi.fn().mockResolvedValue(participation("restaurant-2"))
    });
    await test.load();
    await test.controller.spin();
    test.controller.finishSpin();

    await expect(test.controller.acceptSelected()).resolves.toBe(false);
    expect(test.controller.getState()).toMatchObject({
      kind: "result",
      accepted: false,
      acceptancePending: true
    });
  });

  it("accepts when both candidate and response omit recommendationId", async () => {
    const withoutRecommendation = response();
    withoutRecommendation.candidates = withoutRecommendation.candidates.map((item) => {
      if (item.restaurantId !== "restaurant-2") return item;
      const { recommendationId: _recommendationId, ...rest } = item;
      return rest;
    });
    const accepted = participation("restaurant-2");
    const {
      recommendationId: _recommendationId,
      ...participationWithoutRecommendation
    } = accepted.participation;
    const acceptDecision = vi.fn().mockResolvedValue({
      ...accepted,
      participation: participationWithoutRecommendation
    });
    const test = setup({
      loadCandidates: vi.fn().mockResolvedValue(withoutRecommendation),
      acceptDecision
    });
    await test.load();
    await test.controller.spin();
    test.controller.finishSpin();

    await expect(test.controller.acceptSelected()).resolves.toBe(true);
    expect(acceptDecision).toHaveBeenCalledWith(
      expect.anything(),
      { status: "decided", restaurantId: "restaurant-2" }
    );
  });

  it("does not PUT a result removed from the current candidate set", async () => {
    const changed = {
      ...response(),
      candidates: [candidate(1), candidate(3)]
    };
    const loadCandidates = vi.fn()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(changed);
    const test = setup({ loadCandidates });
    await test.load();
    await test.controller.spin();
    test.controller.finishSpin();

    await expect(test.controller.acceptSelected()).resolves.toBe(false);

    expect(test.dependencies.acceptDecision).not.toHaveBeenCalled();
    expect(test.controller.getState()).toMatchObject({
      kind: "result",
      accepted: false,
      acceptancePending: false,
      acceptError: "候选餐厅已变化，请重新转动或重新打开转盘。"
    });
  });
});
