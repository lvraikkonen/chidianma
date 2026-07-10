import { describe, expect, it, vi } from "vitest";
import {
  createExclusiveActionGate,
  runButtonAction
} from "../src/uiAction";

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

  it("clears a previous failure banner before a successful retry", async () => {
    const button = { textContent: "今天参与", disabled: false };
    let status = "";
    const action = vi.fn()
      .mockRejectedValueOnce(new Error("网络断开"))
      .mockResolvedValueOnce(undefined);
    const input = {
      button,
      pendingText: "记录中...",
      successText: "已记录参与",
      failurePrefix: "记录参与失败",
      action,
      onStart: () => {
        status = "";
      },
      onFailure: (message: string) => {
        status = message;
      }
    };

    await runButtonAction(input);
    expect(status).toBe("记录参与失败：网络断开");

    await runButtonAction(input);

    expect(button).toEqual({ textContent: "已记录参与", disabled: true });
    expect(status).toBe("");
  });
});

describe("createExclusiveActionGate", () => {
  it("ignores a competing action and releases after the pending action succeeds", async () => {
    let resolveFirst!: () => void;
    const firstAction = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveFirst = resolve;
      })
    );
    const competingAction = vi.fn().mockResolvedValue(undefined);
    const nextAction = vi.fn().mockResolvedValue(undefined);
    const pendingChanges: boolean[] = [];
    const gate = createExclusiveActionGate({
      onPendingChange: (pending) => pendingChanges.push(pending)
    });

    const firstResult = gate.run(firstAction);

    expect(gate.isPending()).toBe(true);
    expect(pendingChanges).toEqual([true]);
    await expect(gate.run(competingAction)).resolves.toBe(false);
    expect(competingAction).not.toHaveBeenCalled();

    resolveFirst();
    await expect(firstResult).resolves.toBe(true);
    expect(gate.isPending()).toBe(false);
    expect(pendingChanges).toEqual([true, false]);

    await expect(gate.run(nextAction)).resolves.toBe(true);
    expect(nextAction).toHaveBeenCalledOnce();
  });

  it("releases after a failed action so a later action can run", async () => {
    const gate = createExclusiveActionGate();
    const nextAction = vi.fn().mockResolvedValue(undefined);

    await expect(gate.run(async () => {
      throw new Error("network failed");
    })).rejects.toThrow("network failed");

    expect(gate.isPending()).toBe(false);
    await expect(gate.run(nextAction)).resolves.toBe(true);
    expect(nextAction).toHaveBeenCalledOnce();
  });
});
