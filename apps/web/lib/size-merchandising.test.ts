import { describe, it, expect } from 'vitest';
import { mostLovedSize, defaultVariant } from './size-merchandising';

const s = (w: number, h: number) => ({ sizeLabel: `${w}x${h} in`, widthIn: w, heightIn: h });
const v = (id: string, w: number, h: number, extra: Partial<{ stockStatus: string; frameColour: string }> = {}) =>
  ({ id, widthIn: w, heightIn: h, stockStatus: 'in_stock', frameColour: 'Black', ...extra }) as never;

describe('mostLovedSize', () => {
  it('prefers A3 (12x18, either way round)', () => {
    expect(mostLovedSize([s(8, 12), s(12, 18), s(16, 24)])).toBe('12x18 in');
    expect(mostLovedSize([s(12, 8), s(18, 12)])).toBe('18x12 in');
  });
  it('falls back to the largest size when there is no A3', () => {
    expect(mostLovedSize([s(8, 12), s(16, 24), s(10, 10)])).toBe('16x24 in');
  });
  it('gives no badge for a single size or missing dimensions', () => {
    expect(mostLovedSize([s(8, 12)])).toBeNull();
    expect(mostLovedSize([s(8, 12), s(8, 12)])).toBeNull();
    expect(mostLovedSize([{ sizeLabel: 'Std', widthIn: 0, heightIn: 0 }, { sizeLabel: 'Big', widthIn: 0, heightIn: 0 }])).toBeNull();
  });
});

describe('defaultVariant', () => {
  it('opens on 12x18 in the same frame as the first in-stock variant', () => {
    const vs = [v('a', 8, 12), v('b', 12, 18, { frameColour: 'Brown' }), v('c', 12, 18), v('d', 16, 24)];
    expect((defaultVariant(vs) as unknown as { id: string }).id).toBe('c');
  });
  it('keeps a requested variant, and skips an out-of-stock 12x18', () => {
    const vs = [v('a', 8, 12), v('c', 12, 18, { stockStatus: 'out_of_stock' })];
    expect((defaultVariant(vs, 'c') as unknown as { id: string }).id).toBe('c');
    expect((defaultVariant(vs) as unknown as { id: string }).id).toBe('a');
  });
});
