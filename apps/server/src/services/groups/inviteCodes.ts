import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(6);
  const suffix = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
  return `LUNCH-${suffix}`;
}

export function hashInviteCode(code: string, secret: string): string {
  return createHmac("sha256", secret).update(normalizeInviteCode(code)).digest("base64url");
}

export function verifyInviteCode(code: string, hash: string, secret: string): boolean {
  const candidate = hashInviteCode(code, secret);
  const candidateBuffer = Buffer.from(candidate);
  const hashBuffer = Buffer.from(hash);
  return candidateBuffer.length === hashBuffer.length && timingSafeEqual(candidateBuffer, hashBuffer);
}

export function normalizeInviteCode(code: string): string {
  return code.trim().toUpperCase();
}
