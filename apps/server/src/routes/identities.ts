import type {
  CreateIdentityLinkCodeResponse,
  CreateIdentityResponse,
  IdentitySessionResponse,
  RedeemIdentityLinkCodeRequest,
  RedeemIdentityLinkCodeResponse,
  ResetIdentitySessionsResponse
} from "@lunch/shared";
import type { FastifyInstance } from "fastify";
import type { AppEnv } from "../env.js";
import { prisma } from "../plugins/prisma.js";
import { AuthError } from "../services/auth/errors.js";
import { requireActiveIdentity } from "../services/auth/identity.js";
import {
  generateIdentityLinkCode,
  hashIdentityLinkCode,
  normalizeIdentityLinkCode
} from "../services/auth/identityLinkCodes.js";
import { addDays, expiryIso, signIdentityToken } from "../services/auth/tokens.js";
import { authErrorResponse } from "./routeErrors.js";
import { irreversibleAuthorizationKey } from "../security/requestSecurity.js";

const LINK_CODE_TTL_MS = 10 * 60 * 1000;

function stringField(body: unknown, field: string): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string" ? value.trim() : "";
}

function identityResponse(
  identity: { id: string; displayName: string; authVersion: number },
  env: AppEnv,
  now = new Date()
): CreateIdentityResponse {
  const exp = addDays(now, env.IDENTITY_TOKEN_TTL_DAYS);
  return {
    identityId: identity.id,
    displayName: identity.displayName,
    identityToken: signIdentityToken(
      { identityId: identity.id, authVersion: identity.authVersion, exp },
      env.SESSION_SECRET
    ),
    identityTokenExpiresAt: expiryIso(exp)
  };
}

function invalidLinkCode(): AuthError {
  return new AuthError("unauthorized", "invalid_identity_link_code", "Identity link code is invalid");
}

export async function registerIdentityRoutes(app: FastifyInstance, env: AppEnv) {
  app.post<{ Body: { displayName: string } }>("/api/identities", {
    config: { rateLimit: { max: 5, timeWindow: 10 * 60 * 1000, groupId: "identity-entry" } }
  }, async (request, reply) => {
    const displayName = stringField(request.body, "displayName");
    if (!displayName) {
      reply.code(400);
      return { error: "display_name_required", message: "Display name is required" };
    }
    const identity = await prisma.identity.create({ data: { displayName, lastSeenAt: new Date() } });
    return identityResponse(identity, env);
  });

  app.post("/api/identities/session", {
    config: { rateLimit: { max: 30, timeWindow: 60 * 1000 } }
  }, async (request, reply) => {
    try {
      const { identity } = await requireActiveIdentity({
        prisma,
        env,
        ...(request.headers.authorization ? { authorization: request.headers.authorization } : {})
      });
      return identityResponse(identity, env) satisfies IdentitySessionResponse;
    } catch (error) {
      return authErrorResponse(reply, error);
    }
  });

  app.post("/api/identities/link-codes", {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: 60 * 60 * 1000,
        keyGenerator: irreversibleAuthorizationKey
      }
    }
  }, async (request, reply) => {
    try {
      const { identity } = await requireActiveIdentity({
        prisma,
        env,
        ...(request.headers.authorization ? { authorization: request.headers.authorization } : {})
      });
      const now = new Date();
      const linkCode = generateIdentityLinkCode();
      const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MS);
      await prisma.$transaction(async (tx) => {
        await tx.identityLinkCode.updateMany({
          where: { identityId: identity.id, consumedAt: null },
          data: { consumedAt: now }
        });
        await tx.identityLinkCode.create({
          data: {
            identityId: identity.id,
            codeHash: hashIdentityLinkCode(linkCode, env.SESSION_SECRET),
            expiresAt
          }
        });
      });
      return { linkCode, expiresAt: expiresAt.toISOString() } satisfies CreateIdentityLinkCodeResponse;
    } catch (error) {
      return authErrorResponse(reply, error);
    }
  });

  app.post<{ Body: RedeemIdentityLinkCodeRequest }>(
    "/api/identities/link-codes/redeem",
    { config: { rateLimit: { max: 5, timeWindow: 10 * 60 * 1000, groupId: "identity-entry" } } },
    async (request, reply) => {
      try {
        const linkCode = normalizeIdentityLinkCode(stringField(request.body, "linkCode"));
        if (!/^LINK-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(linkCode)) {
          throw invalidLinkCode();
        }
        const now = new Date();
        const identity = await prisma.$transaction(async (tx) => {
          const stored = await tx.identityLinkCode.findUnique({
            where: { codeHash: hashIdentityLinkCode(linkCode, env.SESSION_SECRET) }
          });
          if (!stored || stored.consumedAt || stored.expiresAt <= now) return null;
          const consumed = await tx.identityLinkCode.updateMany({
            where: { id: stored.id, consumedAt: null, expiresAt: { gt: now } },
            data: { consumedAt: now }
          });
          if (consumed.count !== 1) return null;
          const candidate = await tx.identity.findUnique({ where: { id: stored.identityId } });
          if (!candidate || candidate.anonymizedAt) return null;
          return tx.identity.update({ where: { id: candidate.id }, data: { lastSeenAt: now } });
        });
        if (!identity) throw invalidLinkCode();
        return identityResponse(identity, env, now) satisfies RedeemIdentityLinkCodeResponse;
      } catch (error) {
        return authErrorResponse(reply, error);
      }
    }
  );

  app.post("/api/identities/sessions/reset", {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: 60 * 60 * 1000,
        keyGenerator: irreversibleAuthorizationKey
      }
    }
  }, async (request, reply) => {
    try {
      const { identity } = await requireActiveIdentity({
        prisma,
        env,
        ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
        touch: false
      });
      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.identity.update({
          where: { id: identity.id },
          data: { authVersion: { increment: 1 }, lastSeenAt: new Date() }
        });
        await tx.identityLinkCode.deleteMany({ where: { identityId: identity.id } });
        return next;
      });
      return identityResponse(updated, env) satisfies ResetIdentitySessionsResponse;
    } catch (error) {
      return authErrorResponse(reply, error);
    }
  });
}
