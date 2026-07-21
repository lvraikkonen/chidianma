import { describe, expect, it, vi } from "vitest";
import type { LuckyWheelControllerState } from "../src/wheelController";
import {
  createWheelSpinLifecycle,
  type WheelAnimationPlan
} from "../src/wheelSpinLifecycle";

function spinningState(): Extract<LuckyWheelControllerState, { kind: "spinning" }> {
  const candidates = [
    {
      restaurantId: "restaurant-1",
      recommendationId: "recommendation-1",
      name: "餐厅 1",
      reason: "真实理由 1",
      tags: ["近"],
      recommendationScore: 10,
      selectedWithinLast7Days: false,
      tickets: 1 as const,
      probability: 1 / 3,
      cumulativeProbabilityStart: 0,
      cumulativeProbabilityEnd: 1 / 3
    },
    {
      restaurantId: "restaurant-2",
      recommendationId: "recommendation-2",
      name: "餐厅 2",
      reason: "真实理由 2",
      tags: ["稳"],
      recommendationScore: 30,
      selectedWithinLast7Days: false,
      tickets: 2 as const,
      probability: 2 / 3,
      cumulativeProbabilityStart: 1 / 3,
      cumulativeProbabilityEnd: 1
    }
  ];
  return {
    kind: "spinning",
    response: {
      groupId: "group-1",
      officeDate: "2026-07-21",
      batchId: "batch-1",
      algorithmVersion: "explainable-v1",
      candidates
    },
    mode: "weighted",
    modeLocked: true,
    spinNumber: 1,
    excludedRestaurantIds: [],
    candidates,
    selected: candidates[1]!
  };
}

describe("wheel spin lifecycle", () => {
  it("waits for the authoritative selection, animates it, and finishes once on its timer", async () => {
    const state = spinningState();
    const spin = vi.fn().mockResolvedValue(true);
    const finishSpin = vi.fn().mockReturnValue(true);
    const animate = vi.fn<(plan: WheelAnimationPlan) => void>();
    let scheduled: (() => void) | undefined;
    const schedule = vi.fn((callback: () => void, milliseconds: number) => {
      scheduled = callback;
      expect(milliseconds).toBe(3_000);
      return 7;
    });
    const onFinished = vi.fn();
    const lifecycle = createWheelSpinLifecycle({
      spin,
      finishSpin,
      getState: () => state,
      getCurrentRotationDegrees: () => 10,
      reducedMotion: () => false,
      animate,
      schedule,
      cancelScheduled: vi.fn(),
      onFinished
    });

    await expect(lifecycle.start()).resolves.toBe(true);
    expect(spin).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledWith(expect.objectContaining({
      selectedRestaurantId: "restaurant-2",
      durationMs: 3_000
    }));
    expect(finishSpin).not.toHaveBeenCalled();

    scheduled?.();
    scheduled?.();
    expect(finishSpin).toHaveBeenCalledOnce();
    expect(onFinished).toHaveBeenCalledOnce();
  });

  it("finishes immediately with the identical selected restaurant under reduced motion", async () => {
    const state = spinningState();
    const finishSpin = vi.fn().mockReturnValue(true);
    const animate = vi.fn<(plan: WheelAnimationPlan) => void>();
    const schedule = vi.fn();
    const lifecycle = createWheelSpinLifecycle({
      spin: vi.fn().mockResolvedValue(true),
      finishSpin,
      getState: () => state,
      getCurrentRotationDegrees: () => 0,
      reducedMotion: () => true,
      animate,
      schedule,
      cancelScheduled: vi.fn()
    });

    await expect(lifecycle.start()).resolves.toBe(true);
    expect(animate).toHaveBeenCalledWith(expect.objectContaining({
      selectedRestaurantId: "restaurant-2",
      durationMs: 0
    }));
    expect(schedule).not.toHaveBeenCalled();
    expect(finishSpin).toHaveBeenCalledOnce();
  });

  it("cancels a pending completion when the user leaves the wheel", async () => {
    const state = spinningState();
    const finishSpin = vi.fn().mockReturnValue(true);
    let scheduled: (() => void) | undefined;
    const cancelScheduled = vi.fn();
    const lifecycle = createWheelSpinLifecycle({
      spin: vi.fn().mockResolvedValue(true),
      finishSpin,
      getState: () => state,
      getCurrentRotationDegrees: () => 0,
      reducedMotion: () => false,
      animate: vi.fn(),
      schedule: (callback) => {
        scheduled = callback;
        return 9;
      },
      cancelScheduled
    });

    await lifecycle.start();
    lifecycle.cancel();
    scheduled?.();

    expect(cancelScheduled).toHaveBeenCalledWith(9);
    expect(finishSpin).not.toHaveBeenCalled();
  });

  it("ignores an authoritative selection that resolves after the wheel was left", async () => {
    let resolveSpin: ((value: boolean) => void) | undefined;
    const spin = vi.fn(() => new Promise<boolean>((resolve) => {
      resolveSpin = resolve;
    }));
    const animate = vi.fn();
    const schedule = vi.fn();
    const finishSpin = vi.fn();
    const onFinished = vi.fn();
    const lifecycle = createWheelSpinLifecycle({
      spin,
      finishSpin,
      getState: spinningState,
      getCurrentRotationDegrees: () => 0,
      reducedMotion: () => false,
      animate,
      schedule,
      cancelScheduled: vi.fn(),
      onFinished
    });

    const start = lifecycle.start();
    lifecycle.cancel();
    resolveSpin?.(true);

    await expect(start).resolves.toBe(false);
    expect(animate).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    expect(finishSpin).not.toHaveBeenCalled();
    expect(onFinished).not.toHaveBeenCalled();
  });

  it("does not animate if the controller state changes before animation starts", async () => {
    const animate = vi.fn();
    const schedule = vi.fn();
    const finishSpin = vi.fn();
    const lifecycle = createWheelSpinLifecycle({
      spin: vi.fn().mockResolvedValue(true),
      finishSpin,
      getState: () => ({ kind: "loading" }),
      getCurrentRotationDegrees: () => 0,
      reducedMotion: () => false,
      animate,
      schedule,
      cancelScheduled: vi.fn()
    });

    await expect(lifecycle.start()).resolves.toBe(false);
    expect(animate).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
    expect(finishSpin).not.toHaveBeenCalled();
  });

  it("does not announce completion when the controller rejects finish", async () => {
    const state = spinningState();
    const onFinished = vi.fn();
    const lifecycle = createWheelSpinLifecycle({
      spin: vi.fn().mockResolvedValue(true),
      finishSpin: vi.fn().mockReturnValue(false),
      getState: () => state,
      getCurrentRotationDegrees: () => 0,
      reducedMotion: () => true,
      animate: vi.fn(),
      schedule: vi.fn(),
      cancelScheduled: vi.fn(),
      onFinished
    });

    await expect(lifecycle.start()).resolves.toBe(true);
    expect(onFinished).not.toHaveBeenCalled();
  });

  it("does not animate when the controller rejects the spin", async () => {
    const animate = vi.fn();
    const lifecycle = createWheelSpinLifecycle({
      spin: vi.fn().mockResolvedValue(false),
      finishSpin: vi.fn(),
      getState: () => ({ kind: "loading" }),
      getCurrentRotationDegrees: () => 0,
      reducedMotion: () => false,
      animate,
      schedule: vi.fn(),
      cancelScheduled: vi.fn()
    });

    await expect(lifecycle.start()).resolves.toBe(false);
    expect(animate).not.toHaveBeenCalled();
  });
});
