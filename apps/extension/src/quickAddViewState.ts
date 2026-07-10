import type { QuickAddState } from "./quickAddController";

export interface QuickAddControls {
  cancelDisabled: boolean;
  cancelHidden: boolean;
  fieldsDisabled: boolean;
  partialSuccessVisible: boolean;
  submitDisabled: boolean;
  submitHidden: boolean;
}

interface DisabledTarget {
  disabled: boolean;
}

interface ButtonTarget extends DisabledTarget {
  hidden: boolean;
}

export interface QuickAddControlTargets {
  cancelButton: ButtonTarget;
  fields: DisabledTarget[];
  partialSuccess: { hidden: boolean };
  submitButton: ButtonTarget;
}

export function quickAddControlsForState(state: QuickAddState): QuickAddControls {
  if (
    state.kind === "submitting-restaurant"
    || state.kind === "submitting-recommendation"
  ) {
    return {
      cancelDisabled: true,
      cancelHidden: false,
      fieldsDisabled: true,
      partialSuccessVisible: false,
      submitDisabled: true,
      submitHidden: false
    };
  }
  if (state.kind === "recommendation-error") {
    return {
      cancelDisabled: true,
      cancelHidden: true,
      fieldsDisabled: true,
      partialSuccessVisible: true,
      submitDisabled: true,
      submitHidden: true
    };
  }
  if (state.kind === "complete") {
    return {
      cancelDisabled: true,
      cancelHidden: true,
      fieldsDisabled: true,
      partialSuccessVisible: false,
      submitDisabled: true,
      submitHidden: true
    };
  }
  return {
    cancelDisabled: false,
    cancelHidden: false,
    fieldsDisabled: false,
    partialSuccessVisible: false,
    submitDisabled: false,
    submitHidden: false
  };
}

export function applyQuickAddControls(
  state: QuickAddState,
  targets: QuickAddControlTargets
): void {
  const controls = quickAddControlsForState(state);
  targets.cancelButton.disabled = controls.cancelDisabled;
  targets.cancelButton.hidden = controls.cancelHidden;
  for (const field of targets.fields) field.disabled = controls.fieldsDisabled;
  targets.partialSuccess.hidden = !controls.partialSuccessVisible;
  targets.submitButton.disabled = controls.submitDisabled;
  targets.submitButton.hidden = controls.submitHidden;
}
