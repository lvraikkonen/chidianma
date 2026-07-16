import { describe, expect, it, vi } from "vitest";
import {
  cycleDialogFocus,
  focusInitialTarget,
  isFocusableCandidate,
  restoreFocusTarget,
  shouldCloseDialog,
  type FocusTarget
} from "../src/components/modalFocus";

function target(name: string): FocusTarget & { name: string } {
  return { name, focus: vi.fn() };
}

describe("modal focus helpers", () => {
  it("focuses the first target or the dialog fallback", () => {
    const first = target("first");
    const fallback = target("dialog");

    expect(focusInitialTarget([first], fallback)).toBe(first);
    expect(first.focus).toHaveBeenCalledOnce();

    expect(focusInitialTarget([], fallback)).toBe(fallback);
    expect(fallback.focus).toHaveBeenCalledOnce();
  });

  it("cycles forward and backward at the edges", () => {
    const first = target("first");
    const middle = target("middle");
    const last = target("last");
    const fallback = target("dialog");
    const targets = [first, middle, last];

    expect(cycleDialogFocus(targets, last, fallback, false)).toBe(first);
    expect(cycleDialogFocus(targets, first, fallback, true)).toBe(last);
    expect(first.focus).toHaveBeenCalledOnce();
    expect(last.focus).toHaveBeenCalledOnce();
  });

  it("returns outside focus to the dialog in the requested direction", () => {
    const first = target("first");
    const last = target("last");
    const outside = target("outside");
    const fallback = target("dialog");

    expect(cycleDialogFocus([first, last], outside, fallback, false)).toBe(first);
    expect(cycleDialogFocus([first, last], outside, fallback, true)).toBe(last);
  });

  it("uses the dialog fallback when no enabled visible target remains", () => {
    const fallback = target("dialog");

    expect(cycleDialogFocus([], null, fallback, false)).toBe(fallback);
    expect(fallback.focus).toHaveBeenCalledOnce();
  });

  it("excludes disabled, hidden, and conditionally hidden controls", () => {
    const base = {
      tabIndex: 0,
      disabled: false,
      hidden: false,
      ancestorHidden: false,
      display: "block",
      visibility: "visible"
    };

    expect(isFocusableCandidate(base)).toBe(true);
    expect(isFocusableCandidate({ ...base, disabled: true })).toBe(false);
    expect(isFocusableCandidate({ ...base, hidden: true })).toBe(false);
    expect(isFocusableCandidate({ ...base, ancestorHidden: true })).toBe(false);
    expect(isFocusableCandidate({ ...base, display: "none" })).toBe(false);
    expect(isFocusableCandidate({ ...base, visibility: "hidden" })).toBe(false);
    expect(isFocusableCandidate({ ...base, tabIndex: -1 })).toBe(false);
  });

  it("closes on Escape only while the dialog is not pending", () => {
    expect(shouldCloseDialog("Escape", false)).toBe(true);
    expect(shouldCloseDialog("Escape", true)).toBe(false);
    expect(shouldCloseDialog("Tab", false)).toBe(false);
  });

  it("restores focus only when the original trigger is still connected", () => {
    const connected = { ...target("connected"), isConnected: true };
    const removed = { ...target("removed"), isConnected: false };

    expect(restoreFocusTarget(connected)).toBe(true);
    expect(connected.focus).toHaveBeenCalledOnce();
    expect(restoreFocusTarget(removed)).toBe(false);
    expect(removed.focus).not.toHaveBeenCalled();
    expect(restoreFocusTarget(null)).toBe(false);
  });
});
