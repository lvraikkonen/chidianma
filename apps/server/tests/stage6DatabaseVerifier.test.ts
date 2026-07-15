import { describe, expect, it, vi } from "vitest";
import {
  DATABASE_CHECKS,
  verifyDatabase,
  type DatabaseQueryClient
} from "../src/databaseVerifier";
import { checkDeploymentEnvironment } from "../src/deploymentEnvironment";

const validEnv: NodeJS.ProcessEnv = {
  DATABASE_URL: "postgresql://user:database-password@localhost:5432/lunch",
  TEAM_INVITE_CODE: "private-invite-code",
  SESSION_SECRET: "x".repeat(32),
  EXTENSION_READ_TOKEN: "private-read-token",
  ALLOW_PUBLIC_GROUP_CREATION: "false",
  IDENTITY_TOKEN_TTL_DAYS: "90",
  GROUP_SESSION_TTL_DAYS: "14",
  WEATHER_API_BASE_URL: "https://api.open-meteo.com/v1",
  OFFICE_CITY: "Shanghai",
  OFFICE_LATITUDE: "31.2304",
  OFFICE_LONGITUDE: "121.4737",
  OFFICE_TIMEZONE: "Asia/Shanghai",
  PUBLIC_API_BASE_URL: "https://lunch.example.com",
  NODE_ENV: "production",
  PORT: "3000"
};

function clientWithCounts(counts: Array<number | bigint>): DatabaseQueryClient {
  const query = vi.fn();
  for (const count of counts) {
    query.mockResolvedValueOnce([{ count }]);
  }
  return { $queryRawUnsafe: query } as unknown as DatabaseQueryClient;
}

describe("Stage 6 database verifier", () => {
  it("reports only named checks and counts when every invariant passes", async () => {
    const result = await verifyDatabase(clientWithCounts(DATABASE_CHECKS.map(() => 0n)));

    expect(result.ok).toBe(true);
    expect(result.checks).toEqual(DATABASE_CHECKS.map((check) => ({
      name: check.name,
      ok: true,
      count: 0
    })));
    expect(JSON.stringify(result)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(result)).not.toContain("password");
  });

  it("fails closed when an invariant has a non-zero count", async () => {
    const counts = DATABASE_CHECKS.map(() => 0);
    counts[2] = 1;

    const result = await verifyDatabase(clientWithCounts(counts));

    expect(result.ok).toBe(false);
    expect(result.checks[2]).toMatchObject({ ok: false, count: 1 });
  });

  it("validates production environment without printing configured values", () => {
    const output = checkDeploymentEnvironment(validEnv);

    expect(JSON.parse(output)).toEqual({ ok: true, check: "environment" });
    expect(output).not.toContain(validEnv.TEAM_INVITE_CODE!);
    expect(output).not.toContain(validEnv.EXTENSION_READ_TOKEN!);
    expect(output).not.toContain("database-password");
  });
});
