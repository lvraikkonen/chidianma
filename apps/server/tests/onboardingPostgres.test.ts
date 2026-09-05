import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../src/env';
import { signGroupSessionToken } from '../src/services/auth/tokens';
import { importRestaurants } from '../src/services/onboarding/import';
import { signPoiTicket } from '../src/services/onboarding/tickets';
import { getGroupSettings, patchGroupSettings } from '../src/services/groups/operations';
const url = process.env.ONBOARDING_TEST_DATABASE_URL;
// Explicit isolated configuration only. Never fall back to DATABASE_URL or any production environment.
if (url) {
  const parsed = new URL(url);
  if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || !/^\/lunch_onboarding_backend_test(?:_[a-z0-9]+)?$/.test(parsed.pathname) || process.env.NODE_ENV === 'production') {
    throw new Error('Refusing non-disposable onboarding test database');
  }
}
const suite = url ? describe : describe.skip;
suite('real PostgreSQL onboarding transactions and additive migration', () => {
  const prisma = new PrismaClient({ datasourceUrl: url ?? 'postgresql://invalid.invalid/unused' });
  const prefix = `onboarding-${randomUUID()}`;
  const identityId = `${prefix}-i`, groupId = `${prefix}-g`, membershipId = `${prefix}-m`, oldId = `${prefix}-old`;
  const secret = 'onboarding-independent-secret-123456789';
  const env = loadEnv({ DATABASE_URL: url ?? 'postgresql://invalid.invalid/unused', SESSION_SECRET: 'test-session-secret', NODE_ENV: 'test', RESTAURANT_BULK_IMPORT_ENABLED: 'true', RESTAURANT_BULK_IMPORT_GROUP_IDS: groupId, POI_SEARCH_ENABLED: 'true', POI_SEARCH_GROUP_IDS: groupId, POI_SAVE_ENABLED: 'true', POI_SAVE_GROUP_IDS: groupId, POI_TICKET_SECRET: secret });
  const authorization = `Bearer ${signGroupSessionToken({ identityId, groupId, membershipId, role: 'admin', authVersion: 0, exp: Date.now() + 3600_000 }, env.SESSION_SECRET)}`;
  const subject = { identityId, groupId, membershipId, authVersion: 0 };
  const row = (rowId: string, name: string, address = '') => ({ rowId, kind: 'manual', name, address });
  const run = (requestId: string, rows: unknown[], overrides: object = {}) => importRestaurants({ prisma, env, groupId, authorization, body: { requestId, rows }, ...overrides });
  beforeAll(async () => {
    // Insert only columns from the pre-onboarding schema, before applying the additive migration.
    await prisma.$executeRaw`INSERT INTO identities (id, display_name, created_at) VALUES (${identityId}, 'Migration member', NOW())`;
    await prisma.$executeRaw`INSERT INTO lunch_groups (id, name, invite_code_hash, created_by_identity_id, office_timezone, office_city, office_latitude, office_longitude, updated_at) VALUES (${groupId}, 'Migration group', 'not-an-invite', ${identityId}, 'Asia/Shanghai', 'Shanghai', 1, 2, NOW())`;
    await prisma.$executeRaw`INSERT INTO group_memberships (id, group_id, identity_id, role) VALUES (${membershipId}, ${groupId}, ${identityId}, 'admin')`;
    await prisma.$executeRaw`INSERT INTO restaurants (id, group_id, name, address, tags, status, created_by_membership_id, updated_at) VALUES (${oldId}, ${groupId}, '旧店', '老地址', ARRAY['旧标签'], 'paused', ${membershipId}, NOW())`;
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url! }, stdio: 'pipe' });
  }, 30_000);
  afterAll(async () => {
    await prisma.restaurantImportReceipt.deleteMany({ where: { groupId } });
    await prisma.restaurant.deleteMany({ where: { groupId } });
    await prisma.groupSettings.deleteMany({ where: { groupId } });
    await prisma.groupMembership.deleteMany({ where: { groupId } });
    await prisma.lunchGroup.deleteMany({ where: { id: groupId } });
    await prisma.identity.deleteMany({ where: { id: identityId } });
    await prisma.$disconnect();
  });
  it('preserves old rows, nullable provenance and independent search-center settings', async () => {
    const old = await prisma.restaurant.findUniqueOrThrow({ where: { id: oldId } });
    expect(old).toMatchObject({ name: '旧店', address: '老地址', status: 'paused', tags: ['旧标签'], sourceProvider: null, sourcePlaceId: null, sourceImportedAt: null });
    expect((await getGroupSettings({ prisma, groupId })).searchCenter).toBe(null);
    const searchCenter = { label: '园区', latitude: 31.2, longitude: 121.4, coordinateSystem: 'GCJ02' as const };
    expect((await patchGroupSettings({ prisma, groupId, patch: { searchCenter } })).searchCenter).toEqual(searchCenter);
    expect(await prisma.lunchGroup.findUnique({ where: { id: groupId } })).toMatchObject({ officeLatitude: 1, officeLongitude: 2 });
  });
  it('imports valid rows, rejects invalid/ambiguous rows, skips existing without overwriting/reactivating', async () => {
    const result = await run('mixed', [row('a', ' 新店 ', ' A 座 '), row('b', '旧店', '老地址'), row('c', ''), row('d', '新店'), row('e', '新店', 'B座'), { ...row('f', '新店'), confirmSeparateBranch: true }, row('h', '新店')]);
    expect(result.results.map((r: any) => [r.rowId, r.status, r.code])).toEqual([
      ['a', 'created', 'created'], ['b', 'existing', 'duplicate'], ['c', 'rejected', 'invalid_row'], ['d', 'rejected', 'ambiguous_branch'], ['e', 'created', 'created'], ['f', 'created', 'created'], ['h', 'existing', 'duplicate']
    ]);
    expect(result.results[1].restaurantId).toBe(oldId);
    expect(await prisma.restaurant.findUnique({ where: { id: oldId } })).toMatchObject({ status: 'paused', tags: ['旧标签'] });
    expect(await prisma.recommendation.count({ where: { groupId } })).toBe(0);
    expect(await prisma.dailyRecommendationBatch.count({ where: { groupId } })).toBe(0);
  });
  it('serializes concurrent imports and persistent request receipts across clients', async () => {
    const results = await Promise.all([run('race1', [row('r', '并发店', 'A')]), run('race2', [row('r', '并发店', 'A')])]);
    expect(results.map(r => r.results[0].status).sort()).toEqual(['created', 'existing']);
    expect(await prisma.restaurant.count({ where: { groupId, name: '并发店' } })).toBe(1);
    const response = await run('retry', [row('r', '重试店')]);
    const other = new PrismaClient({ datasourceUrl: url! });
    try { expect(await run('retry', [{ address: '', name: '重试店', kind: 'manual', rowId: 'r' }], { prisma: other })).toEqual(response); }
    finally { await other.$disconnect(); }
    await expect(run('retry', [row('r', '变更店')])).rejects.toMatchObject({ code: 'import_request_conflict' });
  });
  it('deduplicates simultaneous retries of the same request and isolates another group source IDs', async () => {
    const responses = await Promise.all([run('same-request', [row('a', '同一请求店')]), run('same-request', [row('a', '同一请求店')])]);
    expect(responses[0]).toEqual(responses[1]);
    expect(await prisma.restaurantImportReceipt.count({ where: { groupId, requestId: 'same-request' } })).toBe(1);
    const otherGroupId = `${prefix}-other`;
    await prisma.lunchGroup.create({ data: { id: otherGroupId, name: 'other', inviteCodeHash: 'none', createdByIdentityId: identityId, officeTimezone: 'Asia/Shanghai', officeCity: 'Shanghai', officeLatitude: 1, officeLongitude: 2 } });
    try {
      const foreign = await prisma.restaurant.create({ data: { groupId: otherGroupId, name: '隔离店', address: 'A', tags: [], sourceProvider: 'amap', sourcePlaceId: 'ISOLATED' } });
      const result = await run('isolated', [row('a', '隔离店', 'A')]);
      expect(result.results[0]).toMatchObject({ status: 'created' });
      expect(result.results[0].restaurantId).not.toBe(foreign.id);
    } finally {
      await prisma.restaurant.deleteMany({ where: { groupId: otherGroupId } });
      await prisma.lunchGroup.delete({ where: { id: otherGroupId } });
    }
  });
  it('uses locale-independent canonical key ordering for persisted receipts', async () => {
    const response = await run('canonical', [{ rowId: 'r', kind: 'manual', name: '店', Zeta: 1, alpha: 2 }]);
    expect(response.results[0].code).toBe('invalid_row');
    const receipt = await prisma.restaurantImportReceipt.findUniqueOrThrow({ where: { groupId_membershipId_requestId: { groupId, membershipId, requestId: 'canonical' } } });
    const expectedJson = '{"requestId":"canonical","rows":[{"Zeta":1,"alpha":2,"kind":"manual","name":"店","rowId":"r"}]}';
    expect(receipt.requestHash).toBe(createHash('sha256').update(expectedJson).digest('hex'));
  });
  it('saves signed provenance only, source ID wins, and original receipt replays after ticket expiry', async () => {
    const candidate = { provider: 'amap' as const, placeId: 'B001', name: '来源店', address: '来源地址', category: '餐饮', latitude: 31.2, longitude: 121.4, coordinateSystem: 'GCJ02' as const, distanceMeters: 500 };
    const ticket = signPoiTicket(candidate, subject, secret, 1000);
    const response = await run('poi', [{ rowId: 'p', kind: 'poi', ticket }], { now: new Date(1001) });
    const saved = await prisma.restaurant.findUniqueOrThrow({ where: { id: response.results[0].restaurantId } });
    expect(saved).toMatchObject({ sourceProvider: 'amap', sourcePlaceId: 'B001', sourceCategory: '餐饮', sourceLatitude: 31.2, sourceLongitude: 121.4, sourceCoordinateSystem: 'GCJ02', distanceMinutes: null, averagePriceCents: null });
    await expect(prisma.restaurant.create({ data: { groupId, name: 'duplicate source', tags: [], sourceProvider: 'amap', sourcePlaceId: 'B001' } })).rejects.toMatchObject({ code: 'P2002' });
    expect(await run('poi', [{ rowId: 'p', kind: 'poi', ticket }], { now: new Date(1_900_000) })).toEqual(response);
    expect((await run('expired', [{ rowId: 'p', kind: 'poi', ticket }], { now: new Date(1_900_000) })).results[0]).toMatchObject({ status: 'rejected', code: 'poi_ticket_expired' });
    const changedName = signPoiTicket({ ...candidate, name: '供应商新名字' }, subject, secret, 1000);
    expect((await run('source-duplicate', [{ rowId: 'p', kind: 'poi', ticket: changedName }], { now: new Date(1001) })).results[0]).toMatchObject({ status: 'existing', restaurantId: saved.id });
    expect((await run('source-tamper', [{ rowId: 'p', kind: 'poi', ticket, sourcePlaceId: 'FAKE' }], { now: new Date(1001) })).results[0]).toMatchObject({ status: 'rejected', code: 'invalid_row' });
  });
  it('requires applicable gates independently, including current gates on receipts', async () => {
    await expect(run('retry', [row('r', '重试店')], { env: { ...env, RESTAURANT_BULK_IMPORT_ENABLED: false } })).rejects.toMatchObject({ code: 'restaurant_bulk_import_disabled' });
    await expect(run('gatedpoi', [{ rowId: 'p', kind: 'poi', ticket: 'bad' }], { env: { ...env, POI_SAVE_ENABLED: false } })).rejects.toMatchObject({ code: 'poi_save_disabled' });
    await expect(run('gatedmixed', [row('a', '店'), { rowId: 'p', kind: 'poi', ticket: 'bad' }], { env: { ...env, RESTAURANT_BULK_IMPORT_ENABLED: false } })).rejects.toMatchObject({ code: 'restaurant_bulk_import_disabled' });
    expect((await run('save-independent', [{ rowId: 'p', kind: 'poi', ticket: 'bad' }], { env: { ...env, POI_SEARCH_ENABLED: false, RESTAURANT_BULK_IMPORT_ENABLED: false } })).results[0].code).toBe('invalid_poi_ticket');
  });
  it('validates request IDs, unique row IDs, cap and envelope before writing', async () => {
    for (const [id, rows] of [['', [row('r', '店')]], ['empty', []], ['cap', Array.from({ length: 61 }, (_, i) => row(String(i), '店'))], ['ids', [row('r', '店'), row('r', '店')]]] as const) {
      await expect(run(id, [...rows])).rejects.toMatchObject({ code: 'invalid_import_request' });
    }
  });
  it('rolls back created rows and receipt together on a real PostgreSQL failure', async () => {
    await prisma.$executeRawUnsafe(`CREATE FUNCTION pg_temp.onboarding_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.name = '故障店' THEN RAISE EXCEPTION 'test failure'; END IF; RETURN NEW; END $$`);
    // A permanent trigger referencing this session temp function persists for this test only.
    await prisma.$executeRawUnsafe(`CREATE TRIGGER onboarding_test_failure BEFORE INSERT ON restaurants FOR EACH ROW EXECUTE FUNCTION pg_temp.onboarding_fail()`);
    try {
      await expect(run('rollback', [row('a', '回滚前店'), row('b', '故障店')])).rejects.toBeDefined();
      expect(await prisma.restaurant.count({ where: { groupId, name: '回滚前店' } })).toBe(0);
      expect(await prisma.restaurantImportReceipt.count({ where: { groupId, requestId: 'rollback' } })).toBe(0);
    } finally { await prisma.$executeRawUnsafe('DROP TRIGGER onboarding_test_failure ON restaurants'); }
    expect((await run('rollback', [row('a', '回滚前店'), row('b', '故障店')])).results.map((r: any) => r.status)).toEqual(['created', 'created']);
  });
  it('revalidates current authorization before replay and rejects old tickets after identity reset', async () => {
    await prisma.identity.update({ where: { id: identityId }, data: { authVersion: 1 } });
    await expect(run('retry', [row('r', '重试店')])).rejects.toMatchObject({ error: 'invalid_token' });
    const fresh = `Bearer ${signGroupSessionToken({ ...subject, role: 'admin', authVersion: 1, exp: Date.now() + 60_000 }, env.SESSION_SECRET)}`;
    const candidate = { provider: 'amap' as const, placeId: 'OLD', name: '旧票', address: '', category: null, latitude: null, longitude: null, coordinateSystem: 'GCJ02' as const, distanceMeters: null };
    const ticket = signPoiTicket(candidate, subject, secret);
    expect((await run('reset-ticket', [{ rowId: 'p', kind: 'poi', ticket }], { authorization: fresh })).results[0]).toMatchObject({ status: 'rejected', code: 'invalid_poi_ticket' });
    await prisma.groupMembership.update({ where: { id: membershipId }, data: { status: 'removed' } });
    await expect(run('retry', [row('r', '重试店')], { authorization: fresh })).rejects.toMatchObject({ error: 'active_membership_required' });
  });
});
