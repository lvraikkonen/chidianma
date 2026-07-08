import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppEnv } from "../../env.js";

export interface AdminSession {
  teammateId: string;
  name: string;
  exp: number;
}

export function signSessionToken(session: AdminSession, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string, secret: string): AdminSession {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) throw new Error("Invalid session token");

  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new Error("Invalid session signature");
  }

  const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AdminSession;
  if (session.exp <= Date.now()) throw new Error("Session expired");
  return session;
}

export function requireAdminSession(request: FastifyRequest, reply: FastifyReply, env: AppEnv): AdminSession {
  const authorization = request.headers.authorization;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  try {
    return verifySessionToken(token, env.SESSION_SECRET);
  } catch {
    reply.code(401);
    throw new Error("Admin session required");
  }
}
