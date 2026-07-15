import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerAdminStaticRoutes } from "../src/routes/adminStatic";

async function createAdminBuild(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "lunch-admin-static-"));
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "index.html"), "<!doctype html><title>Stage 6 Admin</title>");
  await writeFile(join(root, "assets", "index-hash.js"), "console.log('stage6')");
  return root;
}

describe("Stage 6 Admin static hosting", () => {
  it("serves Admin entrypoints without long-lived HTML caching", async () => {
    const app = Fastify({ logger: false });
    const root = await createAdminBuild();
    await registerAdminStaticRoutes(app, { enabled: true, root });

    for (const url of ["/", "/index.html"]) {
      const response = await app.inject({ method: "GET", url });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("Stage 6 Admin");
      expect(response.headers["cache-control"]).toContain("no-store");
    }
    await app.close();
  });

  it("serves hashed assets immutably without swallowing API 404s", async () => {
    const app = Fastify({ logger: false });
    const root = await createAdminBuild();
    app.get("/api/health", async () => ({ ok: true }));
    await registerAdminStaticRoutes(app, { enabled: true, root });

    const asset = await app.inject({ method: "GET", url: "/assets/index-hash.js" });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers["cache-control"]).toContain("immutable");

    const api = await app.inject({ method: "GET", url: "/api/health" });
    expect(api.json()).toEqual({ ok: true });

    const missing = await app.inject({ method: "GET", url: "/api/missing" });
    expect(missing.statusCode).toBe(404);
    expect(missing.headers["content-type"]).toContain("application/json");
    expect(missing.body).not.toContain("Stage 6 Admin");
    await app.close();
  });

  it("fails production registration when the Admin build is missing", async () => {
    const app = Fastify({ logger: false });
    await expect(registerAdminStaticRoutes(app, {
      enabled: true,
      root: join(tmpdir(), "missing-lunch-admin-build")
    })).rejects.toThrow(/Admin production build/);
    await app.close();
  });

  it("does not require an Admin build outside production", async () => {
    const app = Fastify({ logger: false });
    await registerAdminStaticRoutes(app, {
      enabled: false,
      root: join(tmpdir(), "missing-lunch-admin-build")
    });
    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
