import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AmapPoiProvider, MockPoiProvider } from '../src/services/onboarding/provider';
import { signPoiTicket, verifyPoiTicket } from '../src/services/onboarding/tickets';
const center = { label: '园区', latitude: 31.2, longitude: 121.4, coordinateSystem: 'GCJ02' as const };
const subject = { groupId: 'g', membershipId: 'm', identityId: 'i', authVersion: 3 };
const candidate = { provider: 'amap' as const, placeId: 'B001', name: '面馆', address: '', category: null, latitude: 31.2, longitude: 121.4, coordinateSystem: 'GCJ02' as const, distanceMeters: 500 };
const secret = 'independent-secret'.repeat(3);
describe('POI provider normalization', () => {
  it('uses v3 fixed nearby limits and normalizes missing arrays without inferring walking time', async () => {
    let url = '';
    const provider = new AmapPoiProvider('private-key', async (input) => {
      url = String(input);
      return new Response(JSON.stringify({ status: '1', count: '21', pois: [{ id: 'B001', name: ' 面馆 ', address: [], type: [], location: '121.4,31.2', distance: '500' }, { id: [], name: {}, location: 'broken' }] }));
    });
    const result = await provider.search({ center, page: 1, radius: 3000, keyword: '面' });
    expect(result).toEqual({ candidates: [candidate], hasMore: true });
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/v3/place/around');
    expect(Object.fromEntries(parsed.searchParams)).toMatchObject({ types: '050000', offset: '20', extensions: 'base', sortrule: 'distance', location: '121.4,31.2', page: '1', radius: '3000' });
    expect(result.candidates[0]).not.toHaveProperty('distanceMinutes');
  });
  it('allows explicit next-page navigation when provider omits a usable total', async () => {
    const provider = new AmapPoiProvider('private-key', async () => new Response(JSON.stringify({ status: '1', count: [], pois: Array.from({ length: 20 }, (_, i) => ({ id: `B${i}`, name: '店', address: [], type: [], location: [] })) })));
    expect((await provider.search({ center, page: 1 })).hasMore).toBe(true);
    expect((await provider.search({ center, page: 3 })).hasMore).toBe(false);
  });
  it('normalizes geocode results and ignores malformed locations', async () => {
    const provider = new AmapPoiProvider('private-key', async () => new Response(JSON.stringify({ status: '1', geocodes: [{ formatted_address: '园区', location: '121.4,31.2' }, { formatted_address: [], location: 'NaN,31.2' }] })));
    expect(await provider.geocode({ address: '园区' })).toEqual([center]);
  });
  it.each([{ status: '0', info: 'private-key raw provider failure' }, { status: '1', pois: {} }])('normalizes errors without raw provider data', async (body) => {
    const provider = new AmapPoiProvider('private-key', async () => new Response(JSON.stringify(body)));
    await expect(provider.search({ center, radius: 3000, page: 1 })).rejects.toMatchObject({ code: 'poi_provider_unavailable', message: '附近搜索暂时不可用，请稍后重试' });
  });
  it('aborts provider fetch on cancellation and timeout even if fetch ignores abort', async () => {
    const controller = new AbortController();
    const provider = new AmapPoiProvider('private-key', async () => new Promise(() => {}), 10);
    const pending = provider.search({ center, radius: 3000, page: 1 }, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'poi_request_cancelled' });
    await expect(provider.search({ center, radius: 3000, page: 1 })).rejects.toMatchObject({ code: 'poi_provider_unavailable' });
  });
  it('provides deterministic mock pages capped at the third page', async () => {
    const provider = new MockPoiProvider();
    const first = await provider.search({ center, radius: 3000, page: 1 });
    expect(first.candidates).toHaveLength(20);
    expect(await provider.search({ center, radius: 3000, page: 1 })).toEqual(first);
    const last = await provider.search({ center, radius: 3000, page: 3 });
    expect(last.hasMore).toBe(false);
    expect(last.candidates[0]?.placeId).not.toBe(first.candidates[0]?.placeId);
  });
});
describe('signed candidate tickets', () => {
  it('round trips normalized candidates and expires at exactly 30 minutes', () => {
    const ticket = signPoiTicket(candidate, subject, secret, 1000);
    expect(verifyPoiTicket(ticket, subject, secret, 1001)).toEqual(candidate);
    expect(() => verifyPoiTicket(ticket, subject, secret, 1_801_000)).toThrow('搜索结果已过期');
  });
  it('rejects signed payloads with the wrong ticket type or malformed provider fields', () => {
    for (const claims of [
      { type: 'group-session', ...subject, exp: 5000, candidate },
      { type: 'restaurant-poi-import/v1', ...subject, exp: 5000, candidate: { ...candidate, latitude: 100 } },
      { type: 'restaurant-poi-import/v1', ...subject, exp: 5000, candidate: { ...candidate, rawResponse: 'unexpected' } }
    ]) {
      const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
      const signature = createHmac('sha256', secret).update(`restaurant-poi-import/v1.${body}`).digest('base64url');
      expect(() => verifyPoiTicket(`${body}.${signature}`, subject, secret, 1001)).toThrow();
    }
  });
  it('rejects tampering, another group/member, reset authorization and session-key signatures', () => {
    const ticket = signPoiTicket(candidate, subject, secret, 1000);
    for (const modified of [{ ...subject, groupId: 'other' }, { ...subject, membershipId: 'other' }, { ...subject, authVersion: 4 }]) {
      expect(() => verifyPoiTicket(ticket, modified, secret, 1001)).toThrow();
    }
    expect(() => verifyPoiTicket(ticket.slice(0, -4) + 'AAAA', subject, secret, 1001)).toThrow();
    expect(() => verifyPoiTicket(ticket, subject, 'session-secret', 1001)).toThrow();
  });
});
