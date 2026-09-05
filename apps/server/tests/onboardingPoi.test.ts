import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AmapPoiProvider, MockPoiProvider } from '../src/services/onboarding/provider';
import { signPoiTicket, verifyPoiTicket } from '../src/services/onboarding/tickets';
const center = { label: '园区', latitude: 31.2, longitude: 121.4, coordinateSystem: 'GCJ02' as const };
const subject = { groupId: 'g', membershipId: 'm', identityId: 'i', authVersion: 3 };
const candidate = { provider: 'amap' as const, placeId: 'B001', name: '面馆', address: '', category: null, latitude: 31.2, longitude: 121.4, coordinateSystem: 'GCJ02' as const, distanceMeters: 500 };
const secret = 'independent-secret'.repeat(3);
const successResponse = () => new Response(JSON.stringify({
  status: '1',
  count: '1',
  pois: [{ id: 'B001', name: '面馆', address: [], type: [], location: '121.4,31.2', distance: '500' }]
}));

function transientFetchError(code = 'ETIMEDOUT'): TypeError {
  const aggregate = new AggregateError([
    Object.assign(new Error('connect failed'), { code }),
    Object.assign(new Error('network unreachable'), { code: 'ENETUNREACH' })
  ]);
  Object.assign(aggregate, { code });
  return new TypeError('fetch failed', { cause: aggregate });
}

afterEach(() => {
  vi.useRealTimers();
});

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
  it('keeps a maximum-length mock geocode result usable as a search center', async () => {
    const provider = new MockPoiProvider();
    const centers = await provider.geocode({ address: '园'.repeat(500) });
    expect(centers[0]?.label).toMatch(/^模拟地址：/);
    await expect(provider.search({ center: centers[0]!, page: 1 })).resolves.toMatchObject({ hasMore: true });
  });
  it('keeps maximum-length mock center addresses valid for import ticket signing', async () => {
    const provider = new MockPoiProvider();
    const result = await provider.search({ center: { ...center, label: '园'.repeat(500) }, page: 3 });
    const last = result.candidates[19]!;
    expect(last.address).toMatch(/附近60号$/);
    expect(() => signPoiTicket(last, subject, secret, 1000)).not.toThrow();
    expect(verifyPoiTicket(signPoiTicket(last, subject, secret, 1000), subject, secret, 1001)).toEqual(last);
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

describe('Amap POI transport recovery', () => {
  it.each([1, 2])('recovers after %i transient fetch failure(s) inside bounded backoff', async failures => {
    vi.useFakeTimers();
    let attempts = 0;
    const provider = new AmapPoiProvider('private-key', async () => {
      attempts += 1;
      if (attempts <= failures) throw transientFetchError();
      return successResponse();
    });

    const pending = provider.search({ center, page: 1 });
    const assertion = expect(pending).resolves.toEqual({ candidates: [candidate], hasMore: false });
    await vi.advanceTimersByTimeAsync(failures === 1 ? 250 : 750);

    await assertion;
    expect(attempts).toBe(failures + 1);
  });

  it('retries a coded transient response-body failure', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const provider = new AmapPoiProvider('private-key', async () => {
      attempts += 1;
      if (attempts === 1) {
        const response = successResponse();
        response.text = async () => { throw transientFetchError('ECONNRESET'); };
        return response;
      }
      return successResponse();
    });

    const pending = provider.search({ center, page: 1 });
    const assertion = expect(pending).resolves.toEqual({ candidates: [candidate], hasMore: false });
    await vi.advanceTimersByTimeAsync(250);

    await assertion;
    expect(attempts).toBe(2);
  });

  it('caps transient transport attempts at three', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const provider = new AmapPoiProvider('private-key', async () => {
      attempts += 1;
      throw transientFetchError();
    });

    const pending = provider.search({ center, page: 1 });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'poi_provider_unavailable' });
    await vi.advanceTimersByTimeAsync(750);

    await assertion;
    expect(attempts).toBe(3);
  });

  it('uses one total deadline across fetch time and retry backoff', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const provider = new AmapPoiProvider('private-key', async () => {
      attempts += 1;
      if (attempts === 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
        throw transientFetchError();
      }
      return new Promise(() => {});
    }, 500);

    const pending = provider.search({ center, page: 1 });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'poi_provider_unavailable' });
    await vi.advanceTimersByTimeAsync(499);
    expect(attempts).toBe(2);
    await vi.advanceTimersByTimeAsync(1);

    await assertion;
    expect(attempts).toBe(2);
  });

  it('cancels during retry backoff without starting another fetch', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let attempts = 0;
    const provider = new AmapPoiProvider('private-key', async () => {
      attempts += 1;
      throw transientFetchError();
    });

    const pending = provider.search({ center, page: 1 }, controller.signal);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'poi_request_cancelled' });
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();

    await assertion;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(attempts).toBe(1);
  });

  it('does not retry when an in-flight fetch fails after cancellation', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let rejectFetch!: (reason: unknown) => void;
    let attempts = 0;
    const provider = new AmapPoiProvider('private-key', async () => {
      attempts += 1;
      return new Promise<Response>((_, reject) => { rejectFetch = reject; });
    });

    const pending = provider.search({ center, page: 1 }, controller.signal);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'poi_request_cancelled' });
    controller.abort();
    await assertion;
    rejectFetch(transientFetchError());
    await vi.advanceTimersByTimeAsync(1_000);

    expect(attempts).toBe(1);
  });

  it.each([
    ['HTTP 429', async () => new Response('', { status: 429 })],
    ['provider rejection', async () => new Response(JSON.stringify({ status: '0', infocode: '10001' }))],
    ['invalid JSON', async () => new Response('{')],
    ['schema-invalid provider data', async () => new Response(JSON.stringify({ status: '1', pois: {} }))],
    ['uncoded TypeError', async () => { throw new TypeError('fetch failed: socket timeout'); }]
  ])('does not retry %s', async (_name, fetcher) => {
    let attempts = 0;
    const provider = new AmapPoiProvider('private-key', async input => {
      attempts += 1;
      return fetcher(input);
    });

    await expect(provider.search({ center, page: 1 })).rejects.toMatchObject({ code: 'poi_provider_unavailable' });
    expect(attempts).toBe(1);
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
