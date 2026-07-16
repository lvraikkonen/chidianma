import { createHmac, timingSafeEqual } from "node:crypto";
import type { GroupRole } from "@lunch/shared";
import { AuthError } from "./errors.js";

export interface IdentityTokenClaims {
  identityId: string;
  authVersion?: number;
  exp: number;
}

export interface GroupSessionClaims {
  identityId: string;
  groupId: string;
  membershipId: string;
  role: GroupRole;
  authVersion?: number;
  exp: number;
}

function signPayload(payload: object, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyPayload<T>(token: string, secret: string): T {
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new AuthError("unauthorized", "invalid_token", "Invalid token");
  }

  const [payload, signature] = parts;
  if (!payload || !signature) {
    throw new AuthError("unauthorized", "invalid_token", "Invalid token");
  }

  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new AuthError("unauthorized", "invalid_token", "Invalid token signature");
  }

  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new AuthError("unauthorized", "invalid_token", "Invalid token payload");
  }

  if (claims === null || typeof claims !== "object" || Array.isArray(claims)) {
    throw new AuthError("unauthorized", "invalid_token", "Invalid token payload");
  }

  const claimsWithExpiry = claims as T & { exp?: unknown };
  if (typeof claimsWithExpiry.exp !== "number" || claimsWithExpiry.exp <= Date.now()) {
    throw new AuthError("unauthorized", "expired_token", "Token expired");
  }
  return claimsWithExpiry as T;
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new AuthError("unauthorized", "invalid_token", `Invalid token ${field}`);
  }
}

function assertGroupRole(value: unknown): asserts value is GroupRole {
  if (value !== "admin" && value !== "member") {
    throw new AuthError("unauthorized", "invalid_token", "Invalid token role");
  }
}

function normalizedAuthVersion(value: unknown): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new AuthError("unauthorized", "invalid_token", "Invalid token authVersion");
  }
  return value as number;
}

function hasClaim(claims: object, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(claims, field);
}

export function signIdentityToken(claims: IdentityTokenClaims, secret: string): string {
  return signPayload(claims, secret);
}

export function verifyIdentityToken(
  token: string,
  secret: string
): IdentityTokenClaims & { authVersion: number } {
  const claims = verifyPayload<IdentityTokenClaims>(token, secret);
  assertString(claims.identityId, "identityId");
  if (hasClaim(claims, "groupId") || hasClaim(claims, "membershipId") || hasClaim(claims, "role")) {
    throw new AuthError("unauthorized", "invalid_token", "Invalid identity token");
  }
  return { ...claims, authVersion: normalizedAuthVersion(claims.authVersion) };
}

export function signGroupSessionToken(claims: GroupSessionClaims, secret: string): string {
  return signPayload(claims, secret);
}

export function verifyGroupSessionToken(
  token: string,
  secret: string
): GroupSessionClaims & { authVersion: number } {
  const claims = verifyPayload<GroupSessionClaims>(token, secret);
  assertString(claims.identityId, "identityId");
  assertString(claims.groupId, "groupId");
  assertString(claims.membershipId, "membershipId");
  assertGroupRole(claims.role);
  return { ...claims, authVersion: normalizedAuthVersion(claims.authVersion) };
}

export function addDays(date: Date, days: number): number {
  return date.getTime() + days * 24 * 60 * 60 * 1000;
}

export function expiryIso(exp: number): string {
  return new Date(exp).toISOString();
}
