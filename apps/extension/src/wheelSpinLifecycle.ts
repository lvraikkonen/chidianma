import type { LuckyWheelControllerState } from "./wheelController";
import {
  createWheelAnimationPlan,
  type WheelAnimationPlan
} from "./wheelPopupModel";

export type { WheelAnimationPlan } from "./wheelPopupModel";

export interface WheelSpinLifecycleDependencies<TTimer> {
  spin: () => Promise<boolean>;
  finishSpin: () => boolean;
  getState: () => LuckyWheelControllerState;
  getCurrentRotationDegrees: () => number;
  reducedMotion: () => boolean;
  animate: (plan: WheelAnimationPlan) => void;
  schedule: (callback: () => void, milliseconds: number) => TTimer;
  cancelScheduled: (timer: TTimer) => void;
  onFinished?: (() => void) | undefined;
}

export interface WheelSpinLifecycle {
  start: () => Promise<boolean>;
  cancel: () => void;
}

export function createWheelSpinLifecycle<TTimer>(
  dependencies: WheelSpinLifecycleDependencies<TTimer>
): WheelSpinLifecycle {
  let generation = 0;
  let timer: TTimer | undefined;

  const clearPendingTimer = (): void => {
    if (timer === undefined) return;
    dependencies.cancelScheduled(timer);
    timer = undefined;
  };

  const cancel = (): void => {
    generation += 1;
    clearPendingTimer();
  };

  const start = async (): Promise<boolean> => {
    cancel();
    const operation = generation;
    const spun = await dependencies.spin();
    if (!spun || operation !== generation) return false;

    const state = dependencies.getState();
    if (state.kind !== "spinning") return false;
    const plan = createWheelAnimationPlan({
      candidates: state.candidates,
      selectedRestaurantId: state.selected.restaurantId,
      currentRotationDegrees: dependencies.getCurrentRotationDegrees(),
      reducedMotion: dependencies.reducedMotion()
    });
    dependencies.animate(plan);

    let finished = false;
    const finish = (): void => {
      if (finished || operation !== generation) return;
      finished = true;
      timer = undefined;
      if (dependencies.finishSpin()) dependencies.onFinished?.();
    };
    if (plan.durationMs === 0) {
      finish();
    } else {
      timer = dependencies.schedule(finish, plan.durationMs);
    }
    return true;
  };

  return { start, cancel };
}
