import { createHmac, randomBytes } from "node:crypto";

const LINK_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateIdentityLinkCode(): string {
  const bytes = randomBytes(8);
  let value = BigInt(`0x${bytes.toString("hex")}`) & ((1n << 60n) - 1n);
  let encoded = "";
  for (let index = 0; index < 12; index += 1) {
    encoded = LINK_CODE_ALPHABET[Number(value & 31n)] + encoded;
    value >>= 5n;
  }
  return `LINK-${encoded.slice(0, 4)}-${encoded.slice(4, 8)}-${encoded.slice(8, 12)}`;
}

export function normalizeIdentityLinkCode(code: string): string {
  return code.trim().toUpperCase();
}

export function hashIdentityLinkCode(code: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`identity-link:${normalizeIdentityLinkCode(code)}`)
    .digest("hex");
}
