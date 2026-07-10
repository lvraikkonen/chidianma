import { describe, expect, it, vi } from "vitest";
import { runButtonAction } from "../src/uiAction";

describe("runButtonAction", () => {
  it("shows pending state and keeps the successful action disabled", async () => {
    const button = { textContent: "今天参与", disabled: false };
    let resolveAction!: () => void;
    const action = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveAction = resolve;
      })
    );
    const onFailure = vi.fn();

    const result = runButtonAction({
      button,
      pendingText: "记录中...",
      successText: "已记录参与",
      failurePrefix: "记录参与失败",
      action,
      onFailure
    });

    expect(button).toEqual({ textContent: "记录中...", disabled: true });
    resolveAction();
    await result;

    expect(button).toEqual({ textContent: "已记录参与", disabled: true });
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("catches failures, restores a retryable button, and reports the error", async () => {
    const button = { textContent: "避雷", disabled: false };
    const onFailure = vi.fn();

    await expect(runButtonAction({
      button,
      pendingText: "提交中...",
      successText: "已记录",
      failurePrefix: "记录反馈失败",
      action: async () => {
        throw new Error("网络断开");
      },
      onFailure
    })).resolves.toBeUndefined();

    expect(button).toEqual({ textContent: "避雷", disabled: false });
    expect(onFailure).toHaveBeenCalledWith("记录反馈失败：网络断开");
  });
});
