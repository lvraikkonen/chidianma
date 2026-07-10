export function createOptionsController<T>(input: {
  loadState: () => Promise<T>;
  applyState: (state: T) => void;
  saveState: () => Promise<void>;
  notifySettingsChanged: () => Promise<void>;
  setMessage: (message: string) => void;
}) {
  return {
    load: async (): Promise<void> => {
      input.setMessage("");
      try {
        input.applyState(await input.loadState());
      } catch {
        input.setMessage("加载设置失败：无法读取浏览器存储。请重试。");
      }
    },
    save: async (): Promise<void> => {
      input.setMessage("");
      try {
        await input.saveState();
        await input.notifySettingsChanged();
        input.setMessage("设置已保存。");
      } catch (error) {
        input.setMessage(
          error instanceof Error && error.message === "storage_lock_unavailable"
            ? "保存设置失败：浏览器暂不支持安全保存。请重试。"
            : "保存设置失败：无法写入浏览器存储。请重试。"
        );
      }
    }
  };
}
