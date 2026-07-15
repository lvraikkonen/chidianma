import { useEffect, useId, useRef, type ReactNode } from "react";

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
    const first = dialogRef.current?.querySelector<HTMLElement>(
      "[data-autofocus], input, select, textarea, button"
    );
    first?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pendingRef.current) {
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previous?.focus();
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
            ×
          </button>
        </header>
        {props.children}
      </div>
    </div>
  );
}
