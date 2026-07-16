import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { FastifyRequest } from "fastify";
import type { AppEnv } from "../env.js";

const CHROME_EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

export function isAllowedCorsOrigin(origin: string | undefined, env: AppEnv): boolean {
  if (!origin) return true;
  if (origin === new URL(env.PUBLIC_API_BASE_URL).origin) return true;
  if (env.NODE_ENV !== "production") {
    if (origin === "http://localhost:5173" || origin === "http://127.0.0.1:5173") return true;
  }
  return CHROME_EXTENSION_ORIGIN.test(origin);
}

export function rateLimitClientIp(request: FastifyRequest, env: AppEnv): string {
  if (env.NODE_ENV !== "production") return request.ip;
  const value = request.headers["x-real-ip"];
  const candidate = Array.isArray(value) ? undefined : value?.trim();
  if (candidate && isIP(candidate) !== 0) return candidate;
  return request.socket.remoteAddress ?? "unknown";
}

export function irreversibleAuthorizationKey(request: FastifyRequest): string {
  const authorization = request.headers.authorization ?? "missing";
  return createHash("sha256").update(authorization).digest("hex");
}

export function classifiedDatabaseErrorCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "unknown";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && /^P\d{4}$/.test(code) ? code : "unknown";
}

export class SafeOperationalError extends Error {
  constructor(
    readonly operation: string,
    readonly context: {
      groupId?: string | undefined;
      officeDate?: string | undefined;
      retryCount: number;
    },
    options: { cause: unknown }
  ) {
    super("Operation failed", options);
    this.name = "SafeOperationalError";
  }
}

export function safeRequestLogContext(request: FastifyRequest) {
  const params = request.params && typeof request.params === "object"
    ? request.params as Record<string, unknown>
    : {};
  const railwayRequestId = request.headers["x-railway-request-id"];
  return {
    requestId: request.id,
    ...(typeof railwayRequestId === "string" ? { railwayRequestId } : {}),
    method: request.method,
    route: request.routeOptions.url,
    ...(typeof params.groupId === "string" ? { groupId: params.groupId } : {})
  };
}
