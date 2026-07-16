import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  anonymizeIdentity,
  collectIdentityExport,
  exportIdentityToFile,
  recoverAdmin,
  revokeIdentitySessions
} from "../src/operator/identityOperations";
import { runIdentityCommand } from "../src/operator/identityCli";

const tempDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function exportPrisma() {
  return {
    identity: {
      findUnique: vi.fn(async () => ({
        id: "identity-1",
        displayName: "小林",
        createdAt: new Date("2026-07-01T00:00:00Z"),
        lastSeenAt: new Date("2026-07-15T00:00:00Z"),
        anonymizedAt: null,
        memberships: [{
          id: "membership-1",
          role: "admin",
          status: "active",
          joinedAt: new Date("2026-07-01T00:00:00Z"),
          removedAt: null,
          group: { id: "group-1", name: "设计组", subtitle: null }
        }],
        createdGroups: []
      }))
    },
    restaurant: { findMany: vi.fn(async () => [{ id: "restaurant-1", name: "面馆" }]) },
    recommendation: { findMany: vi.fn(async () => [{ id: "recommendation-1", reason: "近" }]) },
    dailyParticipation: { findMany: vi.fn(async () => [{ id: "participation-1" }]) },
    feedback: { findMany: vi.fn(async () => [{ id: "feedback-1", type: "want" }]) },
    dailyRecommendationBatch: { findMany: vi.fn(async () => [{ id: "batch-1" }]) }
  };
}

describe("identity operator operations", () => {
  it("exports only the selected identity attribution and excludes secret fields", async () => {
    const prisma = exportPrisma();
    const result = await collectIdentityExport(prisma as never, "identity-1");
    expect(result).toMatchObject({
      identity: { id: "identity-1", displayName: "小林" },
      createdRestaurants: [{ id: "restaurant-1" }],
      createdRecommendations: [{ id: "recommendation-1" }],
      participation: [{ id: "participation-1" }],
      feedback: [{ id: "feedback-1" }],
      generatedBatches: [{ id: "batch-1" }]
    });
    for (const call of [
      prisma.restaurant.findMany,
      prisma.recommendation.findMany,
      prisma.dailyParticipation.findMany,
      prisma.feedback.findMany,
      prisma.dailyRecommendationBatch.findMany
    ]) {
      expect(call).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          [call === prisma.dailyParticipation.findMany || call === prisma.feedback.findMany
            ? "membershipId"
            : call === prisma.dailyRecommendationBatch.findMany
              ? "generatedByMembershipId"
              : "createdByMembershipId"]: { in: ["membership-1"] }
        })
      }));
    }
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("identityToken");
    expect(serialized).not.toContain("inviteCode");
    expect(serialized).not.toContain("codeHash");
  });

  it("creates export files with 0600 and refuses to overwrite", async () => {
    const directory = await mkdtemp(join(tmpdir(), "identity-export-"));
    tempDirectories.push(directory);
    const output = join(directory, "identity.json");
    await exportIdentityToFile(exportPrisma() as never, "identity-1", output);
    expect((await stat(output)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(output, "utf8"))).toMatchObject({ identity: { id: "identity-1" } });
    await expect(exportIdentityToFile(exportPrisma() as never, "identity-1", output))
      .rejects.toMatchObject({ code: "EEXIST" });
    await writeFile(join(directory, "unrelated"), "kept");
  });

  it("keeps export dry-run until the exact apply confirmation is supplied", async () => {
    const directory = await mkdtemp(join(tmpdir(), "identity-export-command-"));
    tempDirectories.push(directory);
    const output = join(directory, "identity.json");
    const printed: unknown[] = [];
    const baseArgs = [
      "node", "identityCli", "export", "--identity-id", "identity-1", "--output", output
    ];

    await runIdentityCommand(baseArgs, exportPrisma() as never, (value) => printed.push(value));
    await expect(stat(output)).rejects.toMatchObject({ code: "ENOENT" });
    expect(printed).toEqual([expect.objectContaining({
      dryRun: true,
      confirmation: "EXPORT:identity-1",
      counts: expect.objectContaining({ memberships: 1, feedback: 1 })
    })]);

    await expect(runIdentityCommand(
      [...baseArgs, "--apply", "--confirm", "wrong"],
      exportPrisma() as never,
      vi.fn()
    )).rejects.toThrow("confirmation_required:EXPORT:identity-1");

    await runIdentityCommand(
      [...baseArgs, "--apply", "--confirm", "EXPORT:identity-1"],
      exportPrisma() as never,
      vi.fn()
    );
    expect((await stat(output)).mode & 0o777).toBe(0o600);
  });

  it("keeps anonymize, Admin recovery and session revoke behind apply confirmation", async () => {
    const anonymizePrisma = {
      identity: {
        findUnique: vi.fn(async () => ({
          id: "identity-1", anonymizedAt: null, memberships: []
        }))
      },
      groupMembership: { count: vi.fn() },
      $transaction: vi.fn()
    };
    const recoverPrisma = {
      groupMembership: {
        findUnique: vi.fn(async ({ where }: {
          where: { groupId_identityId: { identityId: string } };
        }) => where.groupId_identityId.identityId === "old"
          ? { id: "old-membership", role: "admin", status: "active" }
          : {
              id: "new-membership", role: "member", status: "active",
              identity: { anonymizedAt: null }
            })
      },
      $transaction: vi.fn()
    };
    const revokePrisma = {
      identity: {
        findUnique: vi.fn(async () => ({
          id: "identity-1", authVersion: 2, anonymizedAt: null
        }))
      },
      $transaction: vi.fn()
    };
    const cases = [
      {
        args: ["node", "identityCli", "anonymize", "--identity-id", "identity-1"],
        confirmation: "ANONYMIZE:identity-1",
        prisma: anonymizePrisma
      },
      {
        args: [
          "node", "identityCli", "recover-admin", "--group-id", "group-1",
          "--old-identity-id", "old", "--replacement-identity-id", "new"
        ],
        confirmation: "RECOVER-ADMIN:group-1:new",
        prisma: recoverPrisma
      },
      {
        args: ["node", "identityCli", "revoke-sessions", "--identity-id", "identity-1"],
        confirmation: "REVOKE-SESSIONS:identity-1",
        prisma: revokePrisma
      }
    ];

    for (const item of cases) {
      const printed: unknown[] = [];
      await runIdentityCommand(item.args, item.prisma as never, (value) => printed.push(value));
      expect(printed).toEqual([expect.objectContaining({
        dryRun: true,
        confirmation: item.confirmation
      })]);
      expect(item.prisma.$transaction).not.toHaveBeenCalled();
      await expect(runIdentityCommand(
        [...item.args, "--apply", "--confirm", "wrong"],
        item.prisma as never,
        vi.fn()
      )).rejects.toThrow(`confirmation_required:${item.confirmation}`);
      expect(item.prisma.$transaction).not.toHaveBeenCalled();
    }
  });

  it("blocks last-admin anonymization atomically before any write", async () => {
    const tx = {
      $queryRaw: vi.fn(async () => []),
      identity: {
        findUnique: vi.fn(async () => ({
          id: "identity-1",
          anonymizedAt: null,
          memberships: [{ id: "membership-1", groupId: "group-1", role: "admin" }]
        })),
        update: vi.fn()
      },
      groupMembership: { count: vi.fn(async () => 1), updateMany: vi.fn() },
      identityLinkCode: { deleteMany: vi.fn() }
    };
    const prisma = { $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) };
    await expect(anonymizeIdentity(prisma as never, "identity-1")).rejects.toThrow("last_admin:group-1");
    expect(tx.groupMembership.updateMany).not.toHaveBeenCalled();
    expect(tx.identity.update).not.toHaveBeenCalled();
    expect(tx.identityLinkCode.deleteMany).not.toHaveBeenCalled();
  });

  it("anonymizes identity while preserving historical content tables", async () => {
    const tx = {
      $queryRaw: vi.fn(async () => []),
      identity: {
        findUnique: vi.fn(async () => ({
          id: "identity-1",
          anonymizedAt: null,
          memberships: [
            { id: "membership-1", groupId: "group-1", role: "admin" },
            { id: "membership-2", groupId: "group-2", role: "member" }
          ]
        })),
        update: vi.fn(async () => ({ id: "identity-1", anonymizedAt: new Date(), authVersion: 2 }))
      },
      groupMembership: { count: vi.fn(async () => 2), updateMany: vi.fn(async () => ({ count: 2 })) },
      identityLinkCode: { deleteMany: vi.fn(async () => ({ count: 1 })) }
    };
    const prisma = { $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) };
    await expect(anonymizeIdentity(prisma as never, "identity-1"))
      .resolves.toMatchObject({ id: "identity-1", removedMembershipCount: 2 });
    expect(tx.groupMembership.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { identityId: "identity-1", status: "active" },
      data: expect.objectContaining({ status: "removed" })
    }));
    expect(tx.identity.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        displayName: "匿名身份",
        lastSeenAt: null,
        authVersion: { increment: 1 }
      })
    }));
    expect(tx).not.toHaveProperty("restaurant.deleteMany");
    expect(tx).not.toHaveProperty("recommendation.deleteMany");
    expect(tx).not.toHaveProperty("feedback.deleteMany");
  });

  it("promotes the replacement before removing the old administrator", async () => {
    const writes: string[] = [];
    const tx = {
      groupMembership: {
        findUnique: vi.fn(async ({ where }: { where: { groupId_identityId: { identityId: string } } }) => (
          where.groupId_identityId.identityId === "old"
            ? { id: "old-membership", role: "admin", status: "active" }
            : {
                id: "new-membership", role: "member", status: "active",
                identity: { anonymizedAt: null }
              }
        )),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: { role?: string; status?: string } }) => {
          writes.push(`${where.id}:${data.role ?? data.status}`);
          return {};
        })
      }
    };
    const prisma = { $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) };
    await recoverAdmin(prisma as never, "group-1", "old", "new");
    expect(writes).toEqual(["new-membership:admin", "old-membership:removed"]);
  });

  it("revokes every session version and clears pending link codes", async () => {
    const tx = {
      identity: { update: vi.fn(async () => ({ id: "identity-1", authVersion: 4 })) },
      identityLinkCode: { deleteMany: vi.fn(async () => ({ count: 2 })) }
    };
    const prisma = { $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) };
    await expect(revokeIdentitySessions(prisma as never, "identity-1"))
      .resolves.toEqual({ id: "identity-1", authVersion: 4, deletedLinkCodeCount: 2 });
    expect(tx.identity.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { authVersion: { increment: 1 } }
    }));
  });
});
