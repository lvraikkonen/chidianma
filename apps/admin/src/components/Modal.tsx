import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  cycleDialogFocus,
  focusInitialTarget,
  isFocusableCandidate,
  restoreFocusTarget,
  shouldCloseDialog
} from "./modalFocus";

const FOCUSABLE_SELECTOR = [
  "[data-autofocus]",
  "a[href]",
  "button",
  "input:not([type='hidden'])",
  "select",
  "textarea",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => {
      const style = getComputedStyle(element);
      return isFocusableCandidate({
        tabIndex: element.tabIndex,
        disabled: "disabled" in element && Boolean(element.disabled),
        hidden: element.hidden,
        ancestorHidden: Boolean(element.closest("[hidden]")),
        display: style.display,
        visibility: style.visibility
      });
    });
}

export function Modal(props: {
  open: boolean;
  title: string;
  pending?: boolean | undefined;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(props.onClose);
  const pendingRef = useRef(props.pending);
  onCloseRef.current = props.onClose;
  pendingRef.current = props.pending;

  useEffect(() => {
    if (!props.open) return;
    const previous = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const autofocus = dialog.querySelector<HTMLElement>("[data-autofocus]");
    const targets = focusableElements(dialog);
    const initial = autofocus && targets.includes(autofocus)
      ? [autofocus, ...targets.filter((target) => target !== autofocus)]
      : targets;
    focusInitialTarget(initial, dialog);
    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldCloseDialog(event.key, Boolean(pendingRef.current))) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        const currentTargets = focusableElements(dialog);
        const active = document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
        cycleDialogFocus(
          currentTargets,
          active,
          dialog,
          event.shiftKey
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      restoreFocusTarget(previous);
    };
  }, [props.open]);

  if (!props.open) return null;
  return (
    <div className="overlay">
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="modal-header">
          <h2 id={titleId}>{props.title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭"
            disabled={props.pending}
            onClick={props.onClose}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        {props.children}
      </div>
    </div>
  );
}
