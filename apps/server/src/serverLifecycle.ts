export interface ShutdownDependencies {
  close: () => Promise<void>;
  disconnect: () => Promise<void>;
  reportFailure: (message: string) => void;
}

export function createShutdownHandler(dependencies: ShutdownDependencies): () => Promise<void> {
  let shutdown: Promise<void> | undefined;

  return () => {
    shutdown ??= (async () => {
      let failed = false;

      try {
        await dependencies.close();
      } catch {
        failed = true;
      }

      try {
        await dependencies.disconnect();
      } catch {
        failed = true;
      }

      if (failed) {
        dependencies.reportFailure("server_shutdown_failed");
      }
    })();

    return shutdown;
  };
}
