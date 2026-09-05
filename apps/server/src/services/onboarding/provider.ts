import type { PoiCandidate, PoiGeocodeRequest, PoiSearchCenter, PoiSearchRequest } from '@lunch/shared';
import { CandidateSchema, GeocodeRequestSchema, SearchRequestSchema } from './schemas.js';
import { providerUnavailable, requestCancelled } from './errors.js';
export type ProviderCandidate = Omit<PoiCandidate, 'ticket'>;
export interface PoiProvider {
  geocode(input: PoiGeocodeRequest, signal?: AbortSignal): Promise<PoiSearchCenter[]>;
  search(input: PoiSearchRequest, signal?: AbortSignal): Promise<{ candidates: ProviderCandidate[]; hasMore: boolean }>;
}
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function field(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function location(value: unknown): { latitude: number; longitude: number } | null {
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(value)) return null;
  const [longitude, latitude] = value.split(',').map(Number);
  if (latitude === undefined || longitude === undefined || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}
export class AmapPoiProvider implements PoiProvider {
  constructor(private readonly key: string, private readonly fetcher: typeof fetch = fetch, private readonly timeoutMs = 8000) {}
  private async request(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<Record<string, unknown>> {
    if (signal?.aborted) throw requestCancelled();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancel: (() => void) | undefined;
    try {
      const stopped = new Promise<never>((_, reject) => {
        cancel = () => { controller.abort(); reject(requestCancelled()); };
        signal?.addEventListener('abort', cancel, { once: true });
        timer = setTimeout(() => { controller.abort(); reject(providerUnavailable()); }, this.timeoutMs);
      });
      const url = new URL(`https://restapi.amap.com/v3/${path}`);
      url.search = new URLSearchParams({ ...params, key: this.key, output: 'JSON' }).toString();
      const result = await Promise.race([
        (async () => {
          const response = await this.fetcher(url, { signal: controller.signal });
          if (!response.ok) throw providerUnavailable();
          // Restrict decoded body size; a provider failure never becomes an app log body.
          const text = await response.text();
          if (text.length > 1_000_000) throw providerUnavailable();
          return record(JSON.parse(text));
        })(), stopped
      ]);
      if (!result || result.status !== '1') throw providerUnavailable();
      return result;
    } catch {
      if (signal?.aborted) throw requestCancelled();
      throw providerUnavailable();
    } finally {
      clearTimeout(timer);
      if (cancel) signal?.removeEventListener('abort', cancel);
    }
  }
  async geocode(input: PoiGeocodeRequest, signal?: AbortSignal): Promise<PoiSearchCenter[]> {
    const parsed = GeocodeRequestSchema.parse(input);
    const data = await this.request('geocode/geo', { address: parsed.address, ...(parsed.city ? { city: parsed.city } : {}) }, signal);
    if (!Array.isArray(data.geocodes)) throw providerUnavailable();
    return data.geocodes.slice(0, 20).flatMap((value): PoiSearchCenter[] => {
      const item = record(value);
      const coordinates = location(item?.location);
      const label = field(item?.formatted_address);
      return coordinates && label && label.length <= 500 ? [{ label, ...coordinates, coordinateSystem: 'GCJ02' }] : [];
    });
  }
  async search(input: PoiSearchRequest, signal?: AbortSignal): Promise<{ candidates: ProviderCandidate[]; hasMore: boolean }> {
    const parsed = SearchRequestSchema.parse(input);
    const data = await this.request('place/around', {
      location: `${Number(parsed.center.longitude.toFixed(6))},${Number(parsed.center.latitude.toFixed(6))}`,
      radius: String(parsed.radius), page: String(parsed.page), types: '050000', extensions: 'base', sortrule: 'distance', offset: '20',
      ...(parsed.keyword ? { keywords: parsed.keyword } : {})
    }, signal);
    if (!Array.isArray(data.pois)) throw providerUnavailable();
    const candidates = data.pois.slice(0, 20).flatMap((value): ProviderCandidate[] => {
      const item = record(value);
      const coordinates = location(item?.location);
      const meters = field(item?.distance);
      const normalized = CandidateSchema.safeParse({ provider: 'amap', placeId: field(item?.id), name: field(item?.name), address: field(item?.address),
        category: field(item?.type) || null, latitude: coordinates?.latitude ?? null, longitude: coordinates?.longitude ?? null,
        coordinateSystem: 'GCJ02', distanceMeters: meters && Number.isFinite(Number(meters)) && Number(meters) >= 0 ? Number(meters) : null });
      return normalized.success ? [normalized.data] : [];
    });
    const countText = field(data.count);
    const count = /^\d+$/.test(countText) ? Number(countText) : Number.NaN;
    return { candidates, hasMore: parsed.page < 3 && (Number.isFinite(count) ? count > parsed.page * 20 : data.pois.length === 20) };
  }
}
export class MockPoiProvider implements PoiProvider {
  async geocode(input: PoiGeocodeRequest, signal?: AbortSignal): Promise<PoiSearchCenter[]> {
    if (signal?.aborted) throw requestCancelled();
    const parsed = GeocodeRequestSchema.parse(input);
    return [{ label: `模拟地址：${parsed.address}`.slice(0, 500), latitude: 31.2304, longitude: 121.4737, coordinateSystem: 'GCJ02' }];
  }
  async search(input: PoiSearchRequest, signal?: AbortSignal): Promise<{ candidates: ProviderCandidate[]; hasMore: boolean }> {
    if (signal?.aborted) throw requestCancelled();
    const parsed = SearchRequestSchema.parse(input);
    return { candidates: Array.from({ length: 20 }, (_, index) => {
      const number = (parsed.page - 1) * 20 + index + 1;
      const suffix = `附近${number}号`;
      const address = `${parsed.center.label.slice(0, 500 - suffix.length)}${suffix}`;
      return { provider: 'mock', placeId: `mock-${parsed.center.longitude}-${parsed.center.latitude}-${number}`, name: `模拟餐馆${number}`, address, category: '模拟餐饮', latitude: parsed.center.latitude, longitude: parsed.center.longitude, coordinateSystem: 'GCJ02', distanceMeters: number * 40 };
    }), hasMore: parsed.page < 3 };
  }
}
