import { describe, expect, it } from "vitest";
import type { QuickAddState } from "../src/quickAddController";
import {
  applyQuickAddControls,
  quickAddControlsForState
} from "../src/quickAddViewState";

describe("popup quick add cancel lifecycle", () => {
  it.each<QuickAddState>([
    { kind: "submitting-restaurant" },
    { kind: "submitting-recommendation", restaurantId: "restaurant-1" },
    { kind: "checking", target: "restaurant", verdict: "checking" }
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

  it("keeps the editable form available before submission", () => {
    expect(quickAddControlsForState({ kind: "idle" })).toEqual({
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
      kind: "recovery",
      target: "recommendation",
      verdict: "confirmed-missing",
      restaurantId: "restaurant-1",
      message: "已确认餐厅保存成功、推荐尚未保存，可以安全重试推荐。"
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
