import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app";
import type { AppEnv } from "../src/env";
import {
  signIdentityToken,
  verifyGroupSessionToken,
  verifyIdentityToken
} from "../src/services/auth/tokens";

const prisma = vi.hoisted(() => {
  type Identity = {
    id: string;
    displayName: string;
    authVersion: number;
    anonymizedAt: Date | null;
    lastSeenAt: Date | null;
  };
  type Code = {
    id: string;
    identityId: string;
    codeHash: string;
    expiresAt: Date;
    consumedAt: Date | null;
  };
  const identities = new Map<string, Identity>();
  const codes = new Map<string, Code>();
  let identitySequence = 0;
  let codeSequence = 0;

  const client = {
    __reset() {
      identities.clear();
      codes.clear();
      identitySequence = 0;
      codeSequence = 0;
    },
    __identity(id: string) { return identities.get(id); },
    __codes() { return [...codes.values()]; },
    __expireCodes() {
      for (const code of codes.values()) code.expiresAt = new Date(Date.now() - 1);
    },
    identity: {
      create: vi.fn(async ({ data }: { data: { displayName: string; lastSeenAt: Date } }) => {
        const identity = {
          id: `identity-${++identitySequence}`,
          displayName: data.displayName,
          authVersion: 0,
          anonymizedAt: null,
          lastSeenAt: data.lastSeenAt
        };
        identities.set(identity.id, identity);
        return identity;
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => identities.get(where.id) ?? null),
      update: vi.fn(async ({ where, data }: {
        where: { id: string };
        data: { lastSeenAt?: Date; authVersion?: { increment: number } };
      }) => {
        const identity = identities.get(where.id);
        if (!identity) throw new Error("identity_not_found");
        if (data.lastSeenAt) identity.lastSeenAt = data.lastSeenAt;
        if (data.authVersion) identity.authVersion += data.authVersion.increment;
        return identity;
      })
    },
    identityLinkCode: {
      create: vi.fn(async ({ data }: { data: Omit<Code, "id" | "consumedAt"> }) => {
        const code = { id: `code-${++codeSequence}`, consumedAt: null, ...data };
        codes.set(code.codeHash, code);
        return code;
      }),
      findUnique: vi.fn(async ({ where }: { where: { codeHash: string } }) => codes.get(where.codeHash) ?? null),
      updateMany: vi.fn(async ({ where, data }: {
        where: { id?: string; identityId?: string; consumedAt: null; expiresAt?: { gt: Date } };
        data: { consumedAt: Date };
      }) => {
        let count = 0;
        for (const code of codes.values()) {
          if (where.id && code.id !== where.id) continue;
          if (where.identityId && code.identityId !== where.identityId) continue;
          if (code.consumedAt !== null) continue;
          if (where.expiresAt && code.expiresAt <= where.expiresAt.gt) continue;
          code.consumedAt = data.consumedAt;
          count += 1;
        }
        return { count };
      }),
      deleteMany: vi.fn(async ({ where }: { where: { identityId: string } }) => {
        let count = 0;
        for (const [hash, code] of codes) {
          if (code.identityId === where.identityId) {
            codes.delete(hash);
            count += 1;
          }
        }
        return { count };
      })
    },
    groupMembership: {
      findUnique: vi.fn(async ({ where }: {
        where: { groupId_identityId: { groupId: string; identityId: string } };
      }) => {
        const identity = identities.get(where.groupId_identityId.identityId);
        if (!identity || where.groupId_identityId.groupId !== "group-1") return null;
        return {
          id: "membership-1",
          groupId: "group-1",
          identityId: identity.id,
          role: "admin" as const,
          status: "active" as const,
          group: { id: "group-1", name: "设计组", subtitle: null }
        };
      })
    },
    $transaction: vi.fn(async (callback: (tx: typeof client) => Promise<unknown>) => callback(client))
  };
  return client;
});

vi.mock("../src/plugins/prisma", () => ({ prisma }));

const env = {
  DATABASE_URL: "postgresql://example",
  SESSION_SECRET: "stage7b-session-secret",
  ALLOW_PUBLIC_GROUP_CREATION: true,
  IDENTITY_TOKEN_TTL_DAYS: 90,
  GROUP_SESSION_TTL_DAYS: 14,
  WEATHER_API_BASE_URL: "https://api.open-meteo.com/v1",
  OFFICE_CITY: "Shanghai",
  OFFICE_LATITUDE: 31.2304,
  OFFICE_LONGITUDE: 121.4737,
  OFFICE_TIMEZONE: "Asia/Shanghai",
  PUBLIC_API_BASE_URL: "http://localhost:3000",
  NODE_ENV: "test",
  PORT: 3000
} satisfies AppEnv;

beforeEach(() => {
  prisma.__reset();
  vi.clearAllMocks();
});

afterEach(() => vi.useRealTimers());

async function createIdentity(app: Awaited<ReturnType<typeof buildApp>>) {
  const response = await app.inject({
    method: "POST",
    url: "/api/identities",
    payload: { displayName: "小林" }
  });
  expect(response.statusCode).toBe(200);
  return response.json<{
    identityId: string;
    displayName: string;
    identityToken: string;
    identityTokenExpiresAt: string;
  }>();
}

describe("identity sessions and link codes", () => {
  it("rate limits public identity entry with a stable 429 contract", async () => {
    const app = await buildApp({ env });
    const responses = [];
    for (let index = 0; index < 6; index += 1) {
      responses.push(await app.inject({
        method: "POST",
        url: "/api/identities",
        remoteAddress: "203.0.113.10",
        payload: { displayName: `成员${index}` }
      }));
    }
    const limited = responses.at(-1)!;
    expect(limited.statusCode).toBe(429);
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
    expect(limited.json()).toMatchObject({
      error: "rate_limit_exceeded",
      retryAfterSeconds: expect.any(Number)
    });
    expect((await app.inject({
      method: "POST", url: "/api/identities", remoteAddress: "203.0.113.11",
      payload: { displayName: "独立 IP" }
    })).statusCode).toBe(200);
    await app.close();
  });

  it.each([
    ["identity session", "/api/identities/session", 30],
    ["reset", "/api/identities/sessions/reset", 3]
  ] as const)("rate limits %s issuance per configured bucket", async (_name, url, max) => {
    const app = await buildApp({ env });
    const responses = [];
    for (let index = 0; index <= max; index += 1) {
      responses.push(await app.inject({
        method: "POST",
        url,
        remoteAddress: "203.0.113.20",
        headers: { authorization: "Bearer stable-invalid-token" }
      }));
    }
    expect(responses.at(-1)?.statusCode).toBe(429);
    expect(responses.at(-1)?.json()).toMatchObject({ error: "rate_limit_exceeded" });
    await app.close();
  });

  it("rate limits identity-scoped link-code generation by an irreversible token key", async () => {
    const app = await buildApp({ env });
    const created = await createIdentity(app);
    const responses = [];
    for (let index = 0; index < 6; index += 1) {
      responses.push(await app.inject({
        method: "POST",
        url: "/api/identities/link-codes",
        headers: { authorization: `Bearer ${created.identityToken}` }
      }));
    }
    expect(responses.at(-1)?.statusCode).toBe(429);
    await app.close();
  });

  it("creates a versioned identity token and slides its 90-day expiry", async () => {
    const app = await buildApp({ env });
    const created = await createIdentity(app);
    expect(created).toMatchObject({ identityId: "identity-1", displayName: "小林" });
    expect(verifyIdentityToken(created.identityToken, env.SESSION_SECRET).authVersion).toBe(0);

    const shortLivedToken = signIdentityToken({
      identityId: created.identityId,
      authVersion: 0,
      exp: Date.now() + 24 * 60 * 60 * 1000
    }, env.SESSION_SECRET);
    const renewedAt = Date.now();
    const renewed = await app.inject({
      method: "POST",
      url: "/api/identities/session",
      headers: { authorization: `Bearer ${shortLivedToken}` }
    });
    expect(renewed.statusCode).toBe(200);
    expect(Date.parse(renewed.json().identityTokenExpiresAt)).toBeGreaterThanOrEqual(
      renewedAt + 90 * 24 * 60 * 60 * 1000
    );
    await app.close();
  });

  it("accepts a pre-version token only while the database version remains zero", async () => {
    const app = await buildApp({ env });
    const created = await createIdentity(app);
    const legacy = signIdentityToken({
      identityId: created.identityId,
      exp: Date.now() + 60_000
    }, env.SESSION_SECRET);
    expect((await app.inject({
      method: "POST", url: "/api/identities/session",
      headers: { authorization: `Bearer ${legacy}` }
    })).statusCode).toBe(200);
    prisma.__identity(created.identityId)!.authVersion = 1;
    expect((await app.inject({
      method: "POST", url: "/api/identities/session",
      headers: { authorization: `Bearer ${legacy}` }
    })).json()).toMatchObject({ error: "invalid_token" });
    await app.close();
  });

  it.each(["missing", "anonymized", "version-mismatch"] as const)(
    "rejects %s identities without leaking the reason",
    async (state) => {
      const app = await buildApp({ env });
      const created = await createIdentity(app);
      const identity = prisma.__identity(created.identityId)!;
      if (state === "missing") prisma.__reset();
      if (state === "anonymized") identity.anonymizedAt = new Date();
      if (state === "version-mismatch") identity.authVersion += 1;
      const response = await app.inject({
        method: "POST", url: "/api/identities/session",
        headers: { authorization: `Bearer ${created.identityToken}` }
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: "invalid_token" });
      await app.close();
    }
  );

  it("stores only an HMAC hash, expires codes, and invalidates the previous code", async () => {
    const app = await buildApp({ env });
    const created = await createIdentity(app);
    const issue = () => app.inject({
      method: "POST", url: "/api/identities/link-codes",
      headers: { authorization: `Bearer ${created.identityToken}` }
    });
    const first = (await issue()).json<{ linkCode: string }>();
    const second = (await issue()).json<{ linkCode: string }>();
    expect(second.linkCode).toMatch(/^LINK-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(prisma.__codes().some((code) => code.codeHash.includes(second.linkCode))).toBe(false);
    expect((await app.inject({
      method: "POST", url: "/api/identities/link-codes/redeem", payload: { linkCode: first.linkCode }
    })).json()).toMatchObject({ error: "invalid_identity_link_code" });
    prisma.__expireCodes();
    expect((await app.inject({
      method: "POST", url: "/api/identities/link-codes/redeem", payload: { linkCode: second.linkCode }
    })).json()).toMatchObject({ error: "invalid_identity_link_code" });
    await app.close();
  });

  it("allows only one winner when the same link code is redeemed concurrently", async () => {
    const app = await buildApp({ env });
    const created = await createIdentity(app);
    const issued = await app.inject({
      method: "POST", url: "/api/identities/link-codes",
      headers: { authorization: `Bearer ${created.identityToken}` }
    });
    const payload = { linkCode: issued.json().linkCode };
    const responses = await Promise.all([
      app.inject({ method: "POST", url: "/api/identities/link-codes/redeem", payload }),
      app.inject({ method: "POST", url: "/api/identities/link-codes/redeem", payload })
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 401]);
    await app.close();
  });

  it("keeps the same identity, membership, and admin role after cross-device linking", async () => {
    const app = await buildApp({ env });
    const original = await createIdentity(app);
    const issued = await app.inject({
      method: "POST", url: "/api/identities/link-codes",
      headers: { authorization: `Bearer ${original.identityToken}` }
    });
    const redeemed = await app.inject({
      method: "POST", url: "/api/identities/link-codes/redeem",
      payload: { linkCode: issued.json().linkCode }
    });
    expect(redeemed.statusCode).toBe(200);
    expect(redeemed.json().identityId).toBe(original.identityId);

    const [firstDevice, secondDevice] = await Promise.all([
      app.inject({
        method: "POST", url: "/api/groups/group-1/session",
        headers: { authorization: `Bearer ${original.identityToken}` }
      }),
      app.inject({
        method: "POST", url: "/api/groups/group-1/session",
        headers: { authorization: `Bearer ${redeemed.json().identityToken}` }
      })
    ]);
    expect(firstDevice.json().group).toEqual(secondDevice.json().group);
    expect(secondDevice.json().group).toMatchObject({
      membershipId: "membership-1",
      role: "admin"
    });
    await app.close();
  });

  it("resets identity and group authorization while returning a usable new token", async () => {
    const app = await buildApp({ env });
    const created = await createIdentity(app);
    const reset = await app.inject({
      method: "POST", url: "/api/identities/sessions/reset",
      headers: { authorization: `Bearer ${created.identityToken}` }
    });
    expect(reset.statusCode).toBe(200);
    const newIdentityToken = reset.json().identityToken as string;
    expect(verifyIdentityToken(newIdentityToken, env.SESSION_SECRET).authVersion).toBe(1);
    expect((await app.inject({
      method: "POST", url: "/api/identities/session",
      headers: { authorization: `Bearer ${created.identityToken}` }
    })).statusCode).toBe(401);

    const groupSession = await app.inject({
      method: "POST", url: "/api/groups/group-1/session",
      headers: { authorization: `Bearer ${newIdentityToken}` }
    });
    expect(groupSession.statusCode).toBe(200);
    expect(verifyGroupSessionToken(
      groupSession.json().groupSessionToken,
      env.SESSION_SECRET
    ).authVersion).toBe(1);
    await app.close();
  });
});
