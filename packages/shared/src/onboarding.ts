import type { PoiProviderId } from './types.js';

export interface PoiSearchCenter {
  label: string;
  latitude: number;
  longitude: number;
  coordinateSystem: 'GCJ02';
}
export interface PoiGeocodeRequest { address: string; city?: string | undefined }
export interface PoiGeocodeResponse { provider: PoiProviderId; attribution: string; centers: PoiSearchCenter[] }
export interface PoiSearchRequest { center: PoiSearchCenter; keyword?: string | undefined; radius?: number | undefined; page?: number | undefined }
export interface PoiCandidate {
  provider: PoiProviderId;
  placeId: string;
  name: string;
  address: string;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  coordinateSystem: 'GCJ02';
  distanceMeters: number | null;
  ticket: string;
}
export interface PoiSearchResponse {
  provider: PoiProviderId;
  attribution: string;
  page: number;
  radius: number;
  hasMore: boolean;
  candidates: PoiCandidate[];
}
export type RestaurantImportRow =
  | { rowId: string; kind: 'manual'; name: string; address?: string; confirmSeparateBranch?: boolean }
  | { rowId: string; kind: 'poi'; ticket: string; confirmSeparateBranch?: boolean };
export interface RestaurantImportRequest { requestId: string; rows: RestaurantImportRow[] }
export interface RestaurantImportRowResult {
  rowId: string;
  status: 'created' | 'existing' | 'rejected';
  code: string;
  message: string;
  restaurantId?: string;
}
export interface RestaurantImportResponse { requestId: string; results: RestaurantImportRowResult[] }
export interface RestaurantPasteRow { rowId: string; name: string; address: string; error?: string }

export function normalizeRestaurantText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}
export function parseRestaurantPaste(text: string): { rows: RestaurantPasteRow[]; error: 'too_many_rows' | null } {
  const rows = text.split(/\r?\n/u).flatMap((line, index): RestaurantPasteRow[] => {
    if (!line.trim()) return [];
    const columns = line.split('\t');
    const name = columns[0]!.trim();
    const address = columns[1]?.trim() ?? '';
    const error = columns.length > 2 ? 'too_many_columns' : !name ? 'name_required'
      : name.length > 200 || address.length > 500 ? 'field_too_long' : undefined;
    return [{ rowId: `line-${index + 1}`, name, address, ...(error ? { error } : {}) }];
  });
  return { rows, error: rows.length > 60 ? 'too_many_rows' : null };
}
