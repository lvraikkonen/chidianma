export interface ButtonActionTarget {
  textContent: string | null;
  disabled: boolean;
}

export interface ExclusiveActionGate {
  isPending: () => boolean;
  run: (action: () => Promise<unknown>) => Promise<boolean>;
}

export function createExclusiveActionGate(input: {
  onPendingChange?: ((pending: boolean) => void) | undefined;
} = {}): ExclusiveActionGate {
  let pending = false;

  return {
    isPending: () => pending,
    run: async (action) => {
      if (pending) return false;
      pending = true;
      input.onPendingChange?.(true);
      try {
        await action();
        return true;
      } finally {
        pending = false;
        input.onPendingChange?.(false);
      }
    }
  };
}

export async function runButtonAction(input: {
  button: ButtonActionTarget;
  pendingText: string;
  successText: string;
  failurePrefix: string;
  action: () => Promise<unknown>;
  onStart?: (() => void) | undefined;
  onFailure: (message: string) => void;
}): Promise<void> {
  const originalText = input.button.textContent;
  input.onStart?.();
  input.button.disabled = true;
  input.button.textContent = input.pendingText;

  try {
    await input.action();
    input.button.textContent = input.successText;
  } catch (error) {
    input.button.textContent = originalText;
    input.button.disabled = false;
    const detail = error instanceof Error ? error.message : String(error);
    input.onFailure(`${input.failurePrefix}：${detail}`);
  }
}
