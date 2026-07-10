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
      failureMessage: "记录参与失败，请重试。",
      action,
      onFailure
    });

    expect(button).toEqual({ textContent: "记录中...", disabled: true });
    resolveAction();
    await result;

    expect(button).toEqual({ textContent: "已记录参与", disabled: true });
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("restores a retryable button and reports stable safe copy", async () => {
    const button = { textContent: "避雷", disabled: false };
    const onFailure = vi.fn();
    const error = new Error("Bearer private-session-token");

    await expect(runButtonAction({
      button,
      pendingText: "提交中...",
      successText: "已记录",
      failureMessage: "记录反馈失败，请重试。",
      action: async () => {
        throw error;
      },
      onFailure
    })).resolves.toBeUndefined();

    expect(button).toEqual({ textContent: "避雷", disabled: false });
    expect(onFailure).toHaveBeenCalledWith(
      "记录反馈失败，请重试。",
      error
    );
    expect(onFailure.mock.calls[0]?.[0]).not.toContain(
      "private-session-token"
    );
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
      failureMessage: "记录参与失败，请重试。",
      action,
      onStart: () => {
        status = "";
      },
      onFailure: (message: string) => {
        status = message;
      }
    };

    await runButtonAction(input);
    expect(status).toBe("记录参与失败，请重试。");

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
