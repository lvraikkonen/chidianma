import type { Prisma, PrismaClient } from "@prisma/client";
import type { AppEnv } from "../../env.js";
import { AuthError } from "./errors.js";
import { verifyIdentityToken } from "./tokens.js";

type IdentityPrisma = PrismaClient | Prisma.TransactionClient;

export function bearerToken(authorization?: string): string {
  if (!authorization?.startsWith("Bearer ")) {
    throw new AuthError("unauthorized", "missing_token", "Authorization bearer token is required");
  }
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) {
    throw new AuthError("unauthorized", "missing_token", "Authorization bearer token is required");
  }
  return token;
}

export async function requireActiveIdentity(input: {
  prisma: IdentityPrisma;
  env: AppEnv;
  authorization?: string;
  touch?: boolean;
}) {
  const token = bearerToken(input.authorization);
  const claims = verifyIdentityToken(token, input.env.SESSION_SECRET);
  const identity = await input.prisma.identity.findUnique({ where: { id: claims.identityId } });
  if (!identity || identity.anonymizedAt || identity.authVersion !== claims.authVersion) {
    throw new AuthError("unauthorized", "invalid_token", "Identity token is no longer valid");
  }
  if (input.touch === false) return { identity, claims, token };
  const touched = await input.prisma.identity.update({
    where: { id: identity.id },
    data: { lastSeenAt: new Date() }
  });
  return { identity: touched, claims, token };
}
