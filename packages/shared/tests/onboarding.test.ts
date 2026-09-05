import { describe, expect, it } from 'vitest';
import * as shared from '../src/index';
describe('restaurant paste preview', () => {
  it('normalizes names and addresses while preserving stable line IDs and row errors', () => {
    expect(shared.parseRestaurantPaste('  面馆  \t A座 \r\n\n饭店\n\t只有地址\n多\t列\t错')).toEqual({
      rows: [
        { rowId: 'line-1', name: '面馆', address: 'A座' },
        { rowId: 'line-3', name: '饭店', address: '' },
        { rowId: 'line-4', name: '', address: '只有地址', error: 'name_required' },
        { rowId: 'line-5', name: '多', address: '列', error: 'too_many_columns' }
      ], error: null
    });
  });
  it('reports overflow without silently importing a truncated list', () => {
    expect(shared.parseRestaurantPaste(Array(61).fill('店').join('\n')).error).toBe('too_many_rows');
  });
  it('uses compatible Unicode and whitespace normalization for duplicates', () => {
    expect(shared.normalizeRestaurantText(' Ａ  店 ')).toBe('a 店');
  });
});
