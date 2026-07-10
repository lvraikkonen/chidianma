import { describe, expect, it } from "vitest";
import type { QuickAddState } from "../src/quickAddController";
import {
  applyQuickAddControls,
  quickAddControlsForState
} from "../src/quickAddViewState";

describe("popup quick add cancel lifecycle", () => {
  it.each<QuickAddState>([
    { kind: "submitting-restaurant" },
    { kind: "submitting-recommendation", restaurantId: "restaurant-1" }
  ])("disables cancellation while $kind is pending", (state) => {
    expect(quickAddControlsForState(state)).toEqual({
      cancelDisabled: true,
      cancelHidden: false,
      fieldsDisabled: true,
      partialSuccessVisible: false,
      submitDisabled: true,
      submitHidden: false
    });
  });

  it("restores cancellation when restaurant creation fails", () => {
    expect(quickAddControlsForState({
      kind: "restaurant-error",
      message: "餐厅没有保存，请重试。"
    })).toEqual({
      cancelDisabled: false,
      cancelHidden: false,
      fieldsDisabled: false,
      partialSuccessVisible: false,
      submitDisabled: false,
      submitHidden: false
    });
  });

  it("leaves only partial-success recovery actions after restaurant creation", () => {
    const state: QuickAddState = {
      kind: "recommendation-error",
      restaurantId: "restaurant-1",
      message: "餐厅已保存，推荐尚未保存。"
    };
    expect(quickAddControlsForState(state)).toEqual({
      cancelDisabled: true,
      cancelHidden: true,
      fieldsDisabled: true,
      partialSuccessVisible: true,
      submitDisabled: true,
      submitHidden: true
    });

    const targets = {
      cancelButton: { disabled: false, hidden: false },
      fields: [{ disabled: false }, { disabled: false }],
      partialSuccess: { hidden: true },
      submitButton: { disabled: false, hidden: false }
    };
    applyQuickAddControls(state, targets);

    expect(targets).toEqual({
      cancelButton: { disabled: true, hidden: true },
      fields: [{ disabled: true }, { disabled: true }],
      partialSuccess: { hidden: false },
      submitButton: { disabled: true, hidden: true }
    });
  });
});
