export interface FocusTarget {
  focus: () => void;
}

export interface RestorableFocusTarget extends FocusTarget {
  isConnected: boolean;
}

export interface FocusCandidateState {
  tabIndex: number;
  disabled: boolean;
  hidden: boolean;
  ancestorHidden: boolean;
  display: string;
  visibility: string;
}

export function isFocusableCandidate(
  candidate: FocusCandidateState
): boolean {
  return candidate.tabIndex >= 0
    && !candidate.disabled
    && !candidate.hidden
    && !candidate.ancestorHidden
    && candidate.display !== "none"
    && candidate.visibility !== "hidden";
}

export function shouldCloseDialog(
  key: string,
  pending: boolean
): boolean {
  return key === "Escape" && !pending;
}

export function restoreFocusTarget(
  target: RestorableFocusTarget | null
): boolean {
  if (!target?.isConnected) return false;
  target.focus();
  return true;
}

export function focusInitialTarget(
  targets: readonly FocusTarget[],
  fallback: FocusTarget
): FocusTarget {
  const target = targets[0] ?? fallback;
  target.focus();
  return target;
}

export function cycleDialogFocus(
  targets: readonly FocusTarget[],
  active: FocusTarget | null,
  fallback: FocusTarget,
  reverse: boolean
): FocusTarget {
  if (targets.length === 0) {
    fallback.focus();
    return fallback;
  }

  const activeIndex = active ? targets.indexOf(active) : -1;
  const target = activeIndex === -1
    ? (reverse ? targets.at(-1)! : targets[0]!)
    : reverse
      ? targets[(activeIndex - 1 + targets.length) % targets.length]!
      : targets[(activeIndex + 1) % targets.length]!;
  target.focus();
  return target;
}
