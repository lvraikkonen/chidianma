import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyBaseLogger } from 'fastify';
import { loadEnv } from '../src/env';
import { signGroupSessionToken } from '../src/services/auth/tokens';
const prisma = vi.hoisted(() => ({ groupMembership: { findUnique: vi.fn() }, $transaction: vi.fn() }));
vi.mock('../src/plugins/prisma', () => ({ prisma }));
const base = { DATABASE_URL: 'postgresql://example', SESSION_SECRET: 'session-secret', NODE_ENV: 'test', POI_TICKET_SECRET: 'independent-secret-12345678901234567890' };
const enabled = { ...base, POI_SEARCH_ENABLED: 'true', POI_SEARCH_GROUP_IDS: 'g', POI_SAVE_ENABLED: 'true', POI_SAVE_GROUP_IDS: 'g', RESTAURANT_BULK_IMPORT_ENABLED: 'true', RESTAURANT_BULK_IMPORT_GROUP_IDS: 'g' };
const headers = { authorization: `Bearer ${signGroupSessionToken({ identityId: 'i', membershipId: 'm', groupId: 'g', role: 'member', exp: Date.now() + 60_000 }, base.SESSION_SECRET)}` };
const center = { label: '园区', latitude: 31.2, longitude: 121.4, coordinateSystem: 'GCJ02' };
async function app(source = enabled) {
  const { buildApp } = await import('../src/app');
  return buildApp({ env: loadEnv(source) });
}
describe('group onboarding routes', () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.groupMembership.findUnique.mockResolvedValue({ id: 'm', groupId: 'g', identityId: 'i', role: 'member', status: 'active', identity: { authVersion: 0, anonymizedAt: null } });
  });
  it.each(['/poi/geocode', '/poi/search', '/restaurants/import'])('requires active group authentication at %s', async path => {
    const server = await app();
    const result = await server.inject({ method: 'POST', url: `/api/groups/g${path}`, payload: {} });
    expect(result.statusCode).toBe(401);
    expect(result.json().error).toBe('missing_token');
    await server.close();
  });
  it.each(['/poi/geocode', '/poi/search'])('fails closed for disabled search at %s', async path => {
    const server = await app(base as typeof enabled);
    const result = await server.inject({ method: 'POST', url: `/api/groups/g${path}`, headers, payload: {} });
    expect(result.statusCode).toBe(403);
    expect(result.json().error).toBe('poi_search_disabled');
    await server.close();
  });
  it('returns normalized centers and signed candidates with explicit defaults and pagination', async () => {
    const server = await app();
    const geo = await server.inject({ method: 'POST', url: '/api/groups/g/poi/geocode', headers, payload: { address: '园区' } });
    expect(geo.statusCode).toBe(200);
    expect(geo.json()).toMatchObject({ provider: 'mock', centers: [{ coordinateSystem: 'GCJ02' }] });
    const search = await server.inject({ method: 'POST', url: '/api/groups/g/poi/search', headers, payload: { center } });
    expect(search.statusCode).toBe(200);
    expect(search.json()).toMatchObject({ provider: 'mock', page: 1, radius: 3000, hasMore: true, attribution: '模拟数据，仅供测试' });
    expect(search.json().candidates[0].ticket).toMatch(/^[\w-]+\.[\w-]+$/);
    expect(search.json().candidates).toHaveLength(20);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    await server.close();
  });
  it.each([{ radius: 499 }, { radius: 5001 }, { page: 0 }, { page: 4 }, { center: { ...center, coordinateSystem: 'WGS84' } }, { sourceProvider: 'fake' }])('rejects out-of-scope search inputs', async invalid => {
    const server = await app();
    const result = await server.inject({ method: 'POST', url: '/api/groups/g/poi/search', headers, payload: { center, ...invalid } });
    expect(result.statusCode).toBe(400);
    expect(result.json().error).toBe('invalid_poi_request');
    await server.close();
  });
  it('rejects cross-group and removed/reset memberships', async () => {
    const server = await app();
    expect((await server.inject({ method: 'POST', url: '/api/groups/other/poi/search', headers, payload: { center } })).statusCode).toBe(403);
    prisma.groupMembership.findUnique.mockResolvedValueOnce({ id: 'm', groupId: 'g', identityId: 'i', role: 'member', status: 'removed', identity: { authVersion: 0 } });
    expect((await server.inject({ method: 'POST', url: '/api/groups/g/poi/search', headers, payload: { center } })).statusCode).toBe(403);
    prisma.groupMembership.findUnique.mockResolvedValueOnce({ id: 'm', groupId: 'g', identityId: 'i', role: 'member', status: 'active', identity: { authVersion: 1 } });
    expect((await server.inject({ method: 'POST', url: '/api/groups/g/poi/search', headers, payload: { center } })).statusCode).toBe(401);
    await server.close();
  });
  it('returns fixed provider errors and logs only safe operational counts/codes', async () => {
    const entries: unknown[] = [];
    const logger = { level: 'info', fatal: (v: unknown) => entries.push(v), error: (v: unknown) => entries.push(v), warn: (v: unknown) => entries.push(v), info: (v: unknown) => entries.push(v), debug() {}, trace() {}, silent() {}, child() { return this; } } as FastifyBaseLogger;
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ status: '0', info: 'provider-raw-private-key' })));
    const { buildApp } = await import('../src/app');
    const server = await buildApp({ env: loadEnv({ ...enabled, POI_PROVIDER: 'amap', AMAP_WEB_SERVICE_KEY: 'private-amap-key' }), loggerInstance: logger });
    const response = await server.inject({ method: 'POST', url: '/api/groups/g/poi/search?private=query-secret', headers, payload: { center, keyword: '私人搜索' } });
    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({ error: 'poi_provider_unavailable', message: '附近搜索暂时不可用，请稍后重试' });
    expect(entries).toContainEqual(expect.objectContaining({ operation: 'poi_search', provider: 'amap', errorCode: 'poi_provider_unavailable' }));
    for (const value of ['provider-raw-private-key', 'private-amap-key', 'query-secret', '私人搜索', headers.authorization, base.POI_TICKET_SECRET]) expect(JSON.stringify(entries)).not.toContain(value);
    await server.close();
  });
  it('enforces manual and POI save gates at the import endpoint before transaction', async () => {
    const server = await app(base as typeof enabled);
    for (const [row, error] of [[{ kind: 'manual', name: '店' }, 'restaurant_bulk_import_disabled'], [{ kind: 'poi', ticket: 'x' }, 'poi_save_disabled']] as const) {
      const result = await server.inject({ method: 'POST', url: '/api/groups/g/restaurants/import', headers, payload: { requestId: 'r', rows: [{ rowId: 'a', ...row }] } });
      expect(result.statusCode).toBe(403);
      expect(result.json().error).toBe(error);
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
    await server.close();
  });
});
