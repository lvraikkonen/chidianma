import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { registerHealthRoutes } from "../src/routes/health";

describe("Stage 6 health routes", () => {
  it("keeps the shallow liveness response unchanged", async () => {
    const app = Fastify({ logger: false });
    await registerHealthRoutes(app, {
      databaseProbe: vi.fn(async () => undefined),
      revision: "revision-1"
    });

    const response = await app.inject({ method: "GET", url: "/api/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    await app.close();
  });

  it("reports database readiness and the deployed revision", async () => {
    const app = Fastify({ logger: false });
    const databaseProbe = vi.fn(async () => undefined);
    await registerHealthRoutes(app, { databaseProbe, revision: "revision-2" });

    const response = await app.inject({ method: "GET", url: "/api/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      database: "ready",
      revision: "revision-2"
    });
    expect(databaseProbe).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("returns a generic 503 without leaking database errors", async () => {
    const app = Fastify({ logger: false });
    await registerHealthRoutes(app, {
      databaseProbe: vi.fn(async () => {
        throw new Error("postgresql://user:secret@private-host/database");
      }),
      revision: "revision-3"
    });

    const response = await app.inject({ method: "GET", url: "/api/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ ok: false, error: "not_ready" });
    expect(response.body).not.toContain("secret");
    expect(response.body).not.toContain("private-host");
    await app.close();
  });
});
