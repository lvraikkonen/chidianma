export interface ButtonActionTarget {
  textContent: string | null;
  disabled: boolean;
}

export async function runButtonAction(input: {
  button: ButtonActionTarget;
  pendingText: string;
  successText: string;
  failurePrefix: string;
  action: () => Promise<void>;
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
