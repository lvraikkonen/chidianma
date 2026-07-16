import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../plugins/prisma.js";
import {
  anonymizeIdentity,
  collectIdentityExport,
  exportIdentityToFile,
  inspectAnonymizeIdentity,
  inspectRecoverAdmin,
  inspectRevokeSessions,
  recoverAdmin,
  revokeIdentitySessions
} from "./identityOperations.js";

function option(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

function required(argv: string[], name: string): string {
  const value = option(argv, name)?.trim();
  if (!value) throw new Error(`missing_option:${name}`);
  return value;
}

function applying(argv: string[], expectedConfirmation: string): boolean {
  if (!argv.includes("--apply")) return false;
  if (option(argv, "confirm") !== expectedConfirmation) {
    throw new Error(`confirmation_required:${expectedConfirmation}`);
  }
  return true;
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function runIdentityCommand(
  argv: string[],
  client: PrismaClient,
  output: (value: unknown) => void
): Promise<void> {
  const command = argv[2];
  if (command === "export") {
    const identityId = required(argv, "identity-id");
    const outputPath = resolve(required(argv, "output"));
    const preview = await collectIdentityExport(client, identityId);
    const confirmation = `EXPORT:${identityId}`;
    if (!applying(argv, confirmation)) {
      output({
        ok: true,
        dryRun: true,
        confirmation,
        identityId,
        output: outputPath,
        counts: {
          memberships: preview.identity.memberships.length,
          createdGroups: preview.identity.createdGroups.length,
          createdRestaurants: preview.createdRestaurants.length,
          createdRecommendations: preview.createdRecommendations.length,
          participation: preview.participation.length,
          feedback: preview.feedback.length,
          generatedBatches: preview.generatedBatches.length
        }
      });
      return;
    }
    await exportIdentityToFile(client, identityId, outputPath);
    output({ ok: true, dryRun: false, identityId, output: outputPath });
    return;
  }
  if (command === "anonymize") {
    const identityId = required(argv, "identity-id");
    const preview = await inspectAnonymizeIdentity(client, identityId);
    const confirmation = `ANONYMIZE:${identityId}`;
    if (!applying(argv, confirmation)) {
      output({ ok: true, dryRun: true, confirmation, ...preview });
      return;
    }
    if (preview.blockingLastAdminGroupIds.length > 0) {
      throw new Error(`last_admin:${preview.blockingLastAdminGroupIds.join(",")}`);
    }
    output({ ok: true, dryRun: false, ...(await anonymizeIdentity(client, identityId)) });
    return;
  }
  if (command === "recover-admin") {
    const groupId = required(argv, "group-id");
    const oldIdentityId = required(argv, "old-identity-id");
    const replacementIdentityId = required(argv, "replacement-identity-id");
    const preview = await inspectRecoverAdmin(client, groupId, oldIdentityId, replacementIdentityId);
    const confirmation = `RECOVER-ADMIN:${groupId}:${replacementIdentityId}`;
    if (!applying(argv, confirmation)) {
      output({ ok: true, dryRun: true, confirmation, ...preview });
      return;
    }
    output({
      ok: true,
      dryRun: false,
      ...(await recoverAdmin(client, groupId, oldIdentityId, replacementIdentityId))
    });
    return;
  }
  if (command === "revoke-sessions") {
    const identityId = required(argv, "identity-id");
    const preview = await inspectRevokeSessions(client, identityId);
    const confirmation = `REVOKE-SESSIONS:${identityId}`;
    if (!applying(argv, confirmation)) {
      output({ ok: true, dryRun: true, confirmation, ...preview });
      return;
    }
    output({ ok: true, dryRun: false, ...(await revokeIdentitySessions(client, identityId)) });
    return;
  }
  throw new Error("usage: identityCli <export|anonymize|recover-admin|revoke-sessions>");
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(resolve(entry)).href) {
  runIdentityCommand(process.argv, prisma, print).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : "identity_command_failed"}\n`);
    process.exitCode = 1;
  }).finally(async () => {
    await prisma.$disconnect();
  });
}
