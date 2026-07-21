import type {
  GroupTodayRecommendationsResponse,
  GroupWheelCandidatesResponse
} from "@lunch/shared";
import { describe, expect, it } from "vitest";
import type { PopupViewState } from "../src/popupController";
import type {
  LuckyWheelControllerState,
  LuckyWheelDisplayCandidate
} from "../src/wheelController";
import {
  createWheelAnimationPlan,
  createWheelSectors,
  formatWheelProbability,
  luckyWheelEntryAvailable,
  toWheelPopupModel
} from "../src/wheelPopupModel";

function response(): GroupTodayRecommendationsResponse {
  return {
    groupId: "group-1",
    officeDate: "2026-07-21",
    batchId: "batch-1",
    batchNo: 1,
    generatedAt: "2026-07-21T18:00:00.000Z",
    weatherUnavailable: true,
    participationSummary: {
      joiningCount: 0,
      decidedCount: 0,
      awayCount: 0,
      undecidedCount: 1
    },
    items: []
  };
}

function popupState(
  kind: "ready" | "empty" | "cached",
  enabled: boolean
): PopupViewState {
  const common = {
    response: response(),
    group: {
      groupId: "group-1",
      name: "设计组",
      role: "member" as const,
      membershipId: "membership-1"
    },
    capabilities: {
      groupId: "group-1",
      features: {
        luckyRestaurantWheel: enabled,
        poiReferenceSearch: false,
        poiReferenceDraft: false,
        poiOfficePreset: false,
        poiProvider: null
      }
    }
  };
  if (kind === "cached") return { kind, ...common, readOnly: true };
  return { kind, ...common };
}

function candidate(
  index: number,
  tickets: 1 | 2 | 3,
  start: number,
  end: number
): LuckyWheelDisplayCandidate {
  return {
    restaurantId: `restaurant-${index}`,
    recommendationId: `recommendation-${index}`,
    name: `餐厅 ${index}`,
    dish: index === 1 ? "番茄牛腩" : undefined,
    reason: `真实推荐理由 ${index}`,
    distanceMinutes: index === 1 ? 8 : undefined,
    tags: index === 1 ? ["热乎", "近"] : [],
    recommendationScore: index * 10,
    selectedWithinLast7Days: index === 2,
    tickets,
    probability: end - start,
    cumulativeProbabilityStart: start,
    cumulativeProbabilityEnd: end
  };
}

function wheelResponse(
  candidates: LuckyWheelDisplayCandidate[]
): GroupWheelCandidatesResponse {
  return {
    groupId: "group-1",
    officeDate: "2026-07-21",
    batchId: "batch-1",
    algorithmVersion: "explainable-v1",
    candidates
  };
}

function readyWheelState(
  candidates: LuckyWheelDisplayCandidate[]
): Extract<LuckyWheelControllerState, { kind: "ready" }> {
  return {
    kind: "ready",
    response: wheelResponse(candidates),
    mode: "weighted",
    modeLocked: false,
    spinNumber: 0,
    excludedRestaurantIds: [],
    candidates,
    canSpin: true
  };
}

describe("lucky wheel Popup entry policy", () => {
  it.each([
    ["ready with capability", popupState("ready", true), true],
    ["empty with capability", popupState("empty", true), true],
    ["ready with flag off", popupState("ready", false), false],
    ["cached response", popupState("cached", true), false],
    ["disconnected", { kind: "disconnected" } satisfies PopupViewState, false],
    [
      "no current batch",
      {
        kind: "no-current-batch",
        groupId: "group-1",
        group: {
          groupId: "group-1",
          name: "设计组",
          role: "member",
          membershipId: "membership-1"
        }
      } satisfies PopupViewState,
      false
    ]
  ])("exposes the wheel only for a fresh enabled state: %s", (_label, state, expected) => {
    expect(luckyWheelEntryAvailable(state)).toBe(expected);
  });
});

describe("lucky wheel Popup presentation", () => {
  it("maps ticket probabilities to proportional sectors and a numbered accessible list", () => {
    const candidates = [
      candidate(1, 1, 0, 1 / 6),
      candidate(2, 2, 1 / 6, 3 / 6),
      candidate(3, 3, 3 / 6, 1)
    ];

    expect(createWheelSectors(candidates)).toEqual([
      expect.objectContaining({
        number: 1,
        restaurantId: "restaurant-1",
        startDegrees: 0,
        endDegrees: 60,
        midpointDegrees: 30
      }),
      expect.objectContaining({
        number: 2,
        restaurantId: "restaurant-2",
        startDegrees: 60,
        endDegrees: 180,
        midpointDegrees: 120
      }),
      expect.objectContaining({
        number: 3,
        restaurantId: "restaurant-3",
        startDegrees: 180,
        endDegrees: 360,
        midpointDegrees: 270
      })
    ]);

    const model = toWheelPopupModel(readyWheelState(candidates));
    expect(model.kind).toBe("ready");
    if (model.kind !== "ready") throw new Error("expected ready model");
    expect(model.candidates).toEqual([
      expect.objectContaining({ number: 1, name: "餐厅 1", tickets: 1, probabilityLabel: "16.7%" }),
      expect.objectContaining({ number: 2, name: "餐厅 2", tickets: 2, probabilityLabel: "33.3%" }),
      expect.objectContaining({ number: 3, name: "餐厅 3", tickets: 3, probabilityLabel: "50%" })
    ]);
    expect(model.mode).toBe("weighted");
    expect(model.modeLocked).toBe(false);
    expect(model.busy).toBe(false);
    expect(model.gradient).toBe(
      "conic-gradient(var(--wheel-sector-1) 0deg 60deg, "
      + "var(--wheel-sector-2) 60deg 180deg, "
      + "var(--wheel-sector-3) 180deg 360deg)"
    );
  });

  it("supports eight candidates without moving restaurant names into the wheel graphic", () => {
    const candidates = Array.from({ length: 8 }, (_, index) => (
      candidate(index + 1, 1, index / 8, (index + 1) / 8)
    ));
    const model = toWheelPopupModel(readyWheelState(candidates));
    if (model.kind !== "ready") throw new Error("expected ready model");

    expect(model.sectors).toHaveLength(8);
    expect(model.sectors.map((sector) => sector.label)).toEqual([
      "1", "2", "3", "4", "5", "6", "7", "8"
    ]);
    expect(model.candidates.map(({ name }) => name)).toEqual(
      candidates.map(({ name }) => name)
    );
  });

  it("marks spinning busy without announcing the preselected restaurant early", () => {
    const candidates = [
      candidate(1, 1, 0, 1 / 2),
      candidate(2, 1, 1 / 2, 1)
    ];
    const state: Extract<LuckyWheelControllerState, { kind: "spinning" }> = {
      ...readyWheelState(candidates),
      kind: "spinning",
      spinNumber: 1,
      modeLocked: true,
      selected: candidates[1]!
    };

    const model = toWheelPopupModel(state);
    expect(model).toMatchObject({
      kind: "spinning",
      busy: true,
      modeLocked: true,
      status: "转盘正在转动，结果即将揭晓。"
    });
    expect(model).not.toHaveProperty("selected");
    expect(model.status).not.toContain("餐厅 2");
  });

  it("uses only real candidate fields for the result and describes one remaining reroll", () => {
    const selected = candidate(1, 2, 0, 1 / 2);
    const other = candidate(2, 2, 1 / 2, 1);
    const state: Extract<LuckyWheelControllerState, { kind: "result" }> = {
      ...readyWheelState([selected, other]),
      kind: "result",
      source: "live",
      selected,
      spinNumber: 1,
      modeLocked: true,
      accepted: false,
      acceptancePending: false,
      accepting: false,
      canReroll: true
    };

    const model = toWheelPopupModel(state);
    expect(model).toMatchObject({
      kind: "result",
      selected: {
        name: "餐厅 1",
        dish: "番茄牛腩",
        distanceLabel: "步行约 8 分钟",
        reason: "真实推荐理由 1",
        tags: ["热乎", "近"]
      },
      rerollLabel: "再转一次（剩余 1 次）"
    });
    if (model.kind !== "result") throw new Error("expected result model");
    expect(model.selected).not.toHaveProperty("recentVisitLabel");
    expect(JSON.stringify(model)).not.toContain("680 米");
    expect(JSON.stringify(model)).not.toContain("21 天");
  });

  it.each([
    [0, "当前没有符合条件的转盘候选。"],
    [1, "至少需要 2 家符合条件的餐厅才能转动。"]
  ])("gives an explicit insufficient message for %s candidate(s)", (count, message) => {
    const candidates = count === 0 ? [] : [candidate(1, 1, 0, 1)];
    const state: Extract<LuckyWheelControllerState, { kind: "insufficient" }> = {
      ...readyWheelState(candidates),
      kind: "insufficient",
      candidateCount: count,
      canSpin: false
    };

    expect(toWheelPopupModel(state)).toMatchObject({
      kind: "insufficient",
      message,
      canRetry: true
    });
  });

  it("removes reroll and write actions after an accepted result", () => {
    const selected = candidate(1, 1, 0, 1 / 2);
    const state: Extract<LuckyWheelControllerState, { kind: "result" }> = {
      ...readyWheelState([selected, candidate(2, 1, 1 / 2, 1)]),
      kind: "result",
      source: "restored",
      selected,
      spinNumber: 2,
      modeLocked: true,
      accepted: true,
      acceptancePending: false,
      accepting: false,
      canReroll: false
    };

    expect(toWheelPopupModel(state)).toMatchObject({
      kind: "result",
      accepted: true,
      canAccept: false,
      canExclude: false,
      canReroll: false,
      acceptLabel: "已选定",
      status: "已选定 餐厅 1。"
    });
    expect(toWheelPopupModel(state)).not.toHaveProperty("rerollLabel");
  });

  it.each([
    {
      label: "records a pending acceptance",
      accepting: true,
      acceptError: undefined,
      expected: {
        busy: true,
        canAccept: false,
        canExclude: false,
        canReroll: false,
        acceptLabel: "正在记录...",
        status: "正在确认 餐厅 1。"
      }
    },
    {
      label: "allows retry after an acceptance error",
      accepting: false,
      acceptError: "暂时无法确认，请重试。",
      expected: {
        busy: false,
        canAccept: true,
        canExclude: false,
        canReroll: false,
        acceptLabel: "重试确认",
        acceptError: "暂时无法确认，请重试。",
        status: "暂时无法确认，请重试。"
      }
    }
  ])("$label", ({ accepting, acceptError, expected }) => {
    const selected = candidate(1, 1, 0, 1 / 2);
    const state: Extract<LuckyWheelControllerState, { kind: "result" }> = {
      ...readyWheelState([selected, candidate(2, 1, 1 / 2, 1)]),
      kind: "result",
      source: "live",
      selected,
      spinNumber: 1,
      modeLocked: true,
      accepted: false,
      acceptancePending: true,
      accepting,
      canReroll: false,
      ...(acceptError ? { acceptError } : {})
    };

    expect(toWheelPopupModel(state)).toMatchObject({
      kind: "result",
      acceptancePending: true,
      accepting,
      ...expected
    });
  });

  it("does not claim a recent-visit weight reduction in equal mode", () => {
    const selected = candidate(2, 1, 0, 1 / 2);
    const state: Extract<LuckyWheelControllerState, { kind: "result" }> = {
      ...readyWheelState([candidate(1, 1, 0, 1 / 2), selected]),
      kind: "result",
      source: "live",
      selected,
      mode: "equal",
      spinNumber: 1,
      modeLocked: true,
      accepted: false,
      acceptancePending: false,
      accepting: false,
      canReroll: true
    };

    const model = toWheelPopupModel(state);
    if (model.kind !== "result") throw new Error("expected result model");
    expect(model.selected).not.toHaveProperty("recentVisitLabel");
  });

  it("explains when a ready pool has no remaining spin", () => {
    const candidates = [
      candidate(1, 1, 0, 1 / 2),
      candidate(2, 1, 1 / 2, 1)
    ];
    const state: Extract<LuckyWheelControllerState, { kind: "ready" }> = {
      ...readyWheelState(candidates),
      spinNumber: 2,
      modeLocked: true,
      canSpin: false
    };

    expect(toWheelPopupModel(state)).toMatchObject({
      kind: "ready",
      canSpin: false,
      status: "本轮的两次抽签机会已经用完。"
    });
  });

  it("locks every ready interaction while an authoritative spin is being prepared", () => {
    const model = toWheelPopupModel(readyWheelState([
      candidate(1, 1, 0, 1 / 2),
      candidate(2, 1, 1 / 2, 1)
    ]), { interactionPending: true });

    expect(model).toMatchObject({
      kind: "ready",
      busy: true,
      canSpin: true,
      status: "正在处理转盘操作，请稍候。"
    });
  });

  it("locks accept, exclude, and reroll together while a result action is pending", () => {
    const selected = candidate(1, 1, 0, 1 / 2);
    const state: Extract<LuckyWheelControllerState, { kind: "result" }> = {
      ...readyWheelState([selected, candidate(2, 1, 1 / 2, 1)]),
      kind: "result",
      source: "live",
      selected,
      spinNumber: 1,
      modeLocked: true,
      accepted: false,
      acceptancePending: false,
      accepting: false,
      canReroll: true
    };

    const model = toWheelPopupModel(state, { interactionPending: true });
    expect(model).toMatchObject({
      kind: "result",
      busy: true,
      canAccept: false,
      canExclude: false,
      canReroll: false,
      status: "正在处理转盘操作，请稍候。"
    });
    expect(model).not.toHaveProperty("rerollLabel");
  });

  it("formats exact and repeating probabilities without implying hidden precision", () => {
    expect(formatWheelProbability(0.5)).toBe("50%");
    expect(formatWheelProbability(1 / 3)).toBe("33.3%");
  });
});

describe("lucky wheel animation plan", () => {
  it("targets the already selected sector midpoint after several full rotations", () => {
    const candidates = [
      candidate(1, 1, 0, 1 / 6),
      candidate(2, 2, 1 / 6, 3 / 6),
      candidate(3, 3, 3 / 6, 1)
    ];
    const plan = createWheelAnimationPlan({
      candidates,
      selectedRestaurantId: "restaurant-2",
      currentRotationDegrees: 47,
      reducedMotion: false
    });

    expect(plan.durationMs).toBe(3_000);
    expect(plan.selectedMidpointDegrees).toBe(120);
    expect(plan.targetRotationDegrees).toBeGreaterThanOrEqual(47 + 5 * 360);
    expect(((plan.targetRotationDegrees + 120) % 360 + 360) % 360).toBeCloseTo(0);
  });

  it("keeps the same business result while skipping the long rotation for reduced motion", () => {
    const candidates = [
      candidate(1, 1, 0, 1 / 2),
      candidate(2, 1, 1 / 2, 1)
    ];
    const normal = createWheelAnimationPlan({
      candidates,
      selectedRestaurantId: "restaurant-2",
      currentRotationDegrees: 0,
      reducedMotion: false
    });
    const reduced = createWheelAnimationPlan({
      candidates,
      selectedRestaurantId: "restaurant-2",
      currentRotationDegrees: 0,
      reducedMotion: true
    });

    expect(reduced.durationMs).toBe(0);
    expect(reduced.selectedRestaurantId).toBe(normal.selectedRestaurantId);
    expect(reduced.selectedMidpointDegrees).toBe(normal.selectedMidpointDegrees);
    expect(reduced.targetRotationDegrees % 360).toBe(normal.targetRotationDegrees % 360);
  });
});
