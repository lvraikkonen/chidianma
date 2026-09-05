import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/env';
import { buildGroupCapabilities } from '../src/services/features/groupCapabilities';
import { parseGroupSettingsPatch, buildGroupSettingsResponse } from '../src/services/groups/operations';
const base = { DATABASE_URL: 'postgresql://example', SESSION_SECRET: 'session-secret', NODE_ENV: 'test' };
describe('onboarding configuration', () => {
  it('defaults to no bulk import, search or save and requires exact independent allowlists', () => {
    expect(buildGroupCapabilities(loadEnv(base), 'g').features.restaurantBulkImport).toBe(false);
    const env = loadEnv({ ...base, RESTAURANT_BULK_IMPORT_ENABLED: 'true', RESTAURANT_BULK_IMPORT_GROUP_IDS: 'g', POI_SEARCH_ENABLED: 'true', POI_SEARCH_GROUP_IDS: 'g-other,*', POI_SAVE_ENABLED: 'true', POI_SAVE_GROUP_IDS: 'g', POI_TICKET_SECRET: 'x'.repeat(32) });
    expect(buildGroupCapabilities(env, 'g').features).toMatchObject({ restaurantBulkImport: true, poiReferenceSearch: false, poiReferenceDraft: true, poiProvider: null });
    expect(buildGroupCapabilities({ ...env, POI_SEARCH_GROUP_IDS: ['g'] }, 'g').features).toMatchObject({ poiReferenceSearch: true, poiOfficePreset: true, poiProvider: 'mock' });
  });
  it('requires an independent signing secret and a live key only when Amap search is enabled', () => {
    expect(() => loadEnv({ ...base, POI_SEARCH_ENABLED: 'true' })).toThrow();
    expect(() => loadEnv({ ...base, POI_SEARCH_ENABLED: 'true', POI_TICKET_SECRET: 'session-secret' })).toThrow();
    expect(() => loadEnv({ ...base, POI_SEARCH_ENABLED: 'true', POI_TICKET_SECRET: 'x'.repeat(32), POI_PROVIDER: 'amap' })).toThrow();
  });
  it('accepts an independent GCJ02 center, clearing it, and rejects fabricated systems and unexpected fields', () => {
    const center = { label: '园区', latitude: 31.2, longitude: 121.4, coordinateSystem: 'GCJ02' };
    expect(parseGroupSettingsPatch({ searchCenter: center })).toEqual({ searchCenter: center });
    expect(parseGroupSettingsPatch({ searchCenter: null })).toEqual({ searchCenter: null });
    for (const value of [{ ...center, coordinateSystem: 'WGS84' }, { ...center, latitude: 100 }, { ...center, label: '' }, { ...center, key: 'secret' }]) {
      expect(() => parseGroupSettingsPatch({ searchCenter: value })).toThrow();
    }
  });
});
