import { describe, expect, it, vi } from "vitest";
import { createShutdownHandler } from "../src/serverLifecycle";

describe("Stage 6 server lifecycle", () => {
  it("closes Fastify and Prisma exactly once across repeated signals", async () => {
    const close = vi.fn(async () => undefined);
    const disconnect = vi.fn(async () => undefined);
    const handler = createShutdownHandler({
      close,
      disconnect,
      reportFailure: vi.fn()
    });

    await Promise.all([handler(), handler()]);

    expect(close).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("still disconnects and reports a sanitized failure when close fails", async () => {
    const disconnect = vi.fn(async () => undefined);
    const reportFailure = vi.fn();
    const handler = createShutdownHandler({
      close: vi.fn(async () => { throw new Error("close failed"); }),
      disconnect,
      reportFailure
    });

    await handler();

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(reportFailure).toHaveBeenCalledWith("server_shutdown_failed");
  });
});
