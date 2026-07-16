import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspaceRoot = resolve(process.cwd(), "../..");
const rootPackage = JSON.parse(readFileSync(resolve(workspaceRoot, "package.json"), "utf8")) as {
  engines: Record<string, string>;
  scripts: Record<string, string>;
  pnpm: { overrides: Record<string, string> };
};
const railway = JSON.parse(readFileSync(resolve(workspaceRoot, "railway.json"), "utf8")) as {
  build: Record<string, unknown>;
  deploy: Record<string, unknown>;
};

describe("Stage 6 Railway release contract", () => {
  it("pins Node 22 and a deterministic non-extension build", () => {
    expect(rootPackage.engines.node).toBe("22.x");
    expect(readFileSync(resolve(workspaceRoot, ".node-version"), "utf8").trim()).toBe("22");

    const build = rootPackage.scripts["build:railway"]!;
    expect(build.indexOf("@lunch/shared build")).toBeLessThan(build.indexOf("@lunch/server prisma:generate"));
    expect(build.indexOf("@lunch/server prisma:generate")).toBeLessThan(build.indexOf("@lunch/admin build"));
    expect(build.indexOf("@lunch/admin build")).toBeLessThan(build.indexOf("@lunch/server build"));
    expect(build).not.toContain("@lunch/extension");
    expect(rootPackage.pnpm.overrides["@fastify/static>glob"]).toMatch(/11\.1/);
    expect(rootPackage.scripts["check:release-artifacts"])
      .toBe("node scripts/check-stage6-artifacts.mjs");
    expect(rootPackage.scripts["check:production-vulnerabilities"])
      .toBe("node scripts/classify-production-osv-report.mjs");
  });

  it("runs environment, migration, and invariant checks in order before deploy", () => {
    const command = rootPackage.scripts["predeploy:railway"]!;
    expect(command.indexOf("env:check")).toBeLessThan(command.indexOf("prisma migrate deploy"));
    expect(command.indexOf("prisma migrate deploy")).toBeLessThan(command.indexOf("db:verify"));
  });

  it("uses Railpack readiness, failure restart, overlap, and draining settings", () => {
    expect(railway.build).toEqual({
      builder: "RAILPACK",
      buildCommand: "pnpm build:railway"
    });
    expect(railway.deploy).toMatchObject({
      preDeployCommand: "pnpm predeploy:railway",
      startCommand: "pnpm start:railway",
      healthcheckPath: "/api/ready",
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 3,
      overlapSeconds: 10,
      drainingSeconds: 30
    });
  });
});
