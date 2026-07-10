import { afterEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../src/config";
import { createOptionsController } from "../src/optionsController";
import {
  getDefaultStorageState,
  getStorageState,
  updateStorageState
} from "../src/storage";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function immediateLockManager() {
  return {
    request: vi.fn(async (
      _name: string,
      _options: LockOptions,
      callback: () => Promise<unknown>
    ) => callback())
  };
}

describe("options controller", () => {
  it("shows a retryable Chinese error when loading from storage rejects", async () => {
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockRejectedValue(new Error("storage read failed"))
        }
      }
    });
    const applyState = vi.fn();
    const setMessage = vi.fn();
    const controller = createOptionsController({
      loadState: getStorageState,
      applyState,
      saveState: vi.fn(),
      notifySettingsChanged: vi.fn(),
      setMessage
    });

    await expect(controller.load()).resolves.toBeUndefined();

    expect(applyState).not.toHaveBeenCalled();
    expect(setMessage).toHaveBeenLastCalledWith(
      "加载设置失败：无法读取浏览器存储。请重试。"
    );
  });

  it("shows a retryable Chinese error when Web Locks is unavailable", async () => {
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            [STORAGE_KEYS.state]: getDefaultStorageState()
          }),
          set: vi.fn()
        }
      }
    });
    const notifySettingsChanged = vi.fn();
    const setMessage = vi.fn();
    const controller = createOptionsController({
      loadState: getStorageState,
      applyState: vi.fn(),
      saveState: () => updateStorageState((state) => state).then(() => undefined),
      notifySettingsChanged,
      setMessage
    });

    await expect(controller.save()).resolves.toBeUndefined();

    expect(notifySettingsChanged).not.toHaveBeenCalled();
    expect(setMessage).toHaveBeenLastCalledWith(
      "保存设置失败：浏览器暂不支持安全保存。请重试。"
    );
  });

  it("shows a retryable Chinese error and no success when storage save rejects", async () => {
    vi.stubGlobal("navigator", { locks: immediateLockManager() });
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({
            [STORAGE_KEYS.state]: getDefaultStorageState()
          }),
          set: vi.fn().mockRejectedValue(new Error("storage write failed"))
        }
      }
    });
    const notifySettingsChanged = vi.fn();
    const messages: string[] = [];
    const controller = createOptionsController({
      loadState: getStorageState,
      applyState: vi.fn(),
      saveState: () => updateStorageState((state) => state).then(() => undefined),
      notifySettingsChanged,
      setMessage: (text) => messages.push(text)
    });

    await expect(controller.save()).resolves.toBeUndefined();

    expect(notifySettingsChanged).not.toHaveBeenCalled();
    expect(messages).not.toContain("设置已保存。");
    expect(messages.at(-1)).toBe(
      "保存设置失败：无法写入浏览器存储。请重试。"
    );
  });

  it("clears stale messages and reports success only after save completes", async () => {
    let finishSave!: () => void;
    const saveState = vi.fn(() => new Promise<void>((resolve) => {
      finishSave = resolve;
    }));
    const notifySettingsChanged = vi.fn().mockResolvedValue(undefined);
    const messages: string[] = ["旧错误"];
    const controller = createOptionsController({
      loadState: vi.fn().mockResolvedValue(getDefaultStorageState()),
      applyState: vi.fn(),
      saveState,
      notifySettingsChanged,
      setMessage: (text) => messages.push(text)
    });

    const saving = controller.save();
    expect(messages.at(-1)).toBe("");
    expect(messages).not.toContain("设置已保存。");

    finishSave();
    await saving;

    expect(notifySettingsChanged).toHaveBeenCalledOnce();
    expect(messages.at(-1)).toBe("设置已保存。");
  });
});
