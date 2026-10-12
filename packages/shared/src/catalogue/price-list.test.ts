import { describe, it, expect } from 'vitest';
import { DEFAULT_FRAMING_COST_RATES } from './frame-model';
import { PriceListInputSchema, pictureOrientation, rowsFromPriceList } from './price-list';

const line = (over: Record<string, unknown> = {}) => ({ longIn: 12, shortIn: 8, frameModelId: 'teak', mrp: 99900, price: 79900, isActive: true, ...over });
const models = new Map([['teak', { costPerFoot: 3000, mouldingWidthIn: 1, isActive: true }], ['old', { costPerFoot: 3000, mouldingWidthIn: 1, isActive: false }]]);

describe('price list', () => {
  it('accepts a normal list and trims the name', () => {
    const r = PriceListInputSchema.parse({ name: '  Devotional  ', rows: [line(), line({ longIn: 18, shortIn: 12, mrp: 159900, price: 129900 })] });
    expect(r.name).toBe('Devotional');
  });
  it('refuses a size written short side first, a price above the MRP, a duplicate line and a list with nothing for sale', () => {
    expect(PriceListInputSchema.safeParse({ name: 'X1', rows: [line({ longIn: 8, shortIn: 12 })] }).success).toBe(false);
    expect(PriceListInputSchema.safeParse({ name: 'X1', rows: [line({ price: 120000 })] }).success).toBe(false);
    expect(PriceListInputSchema.safeParse({ name: 'X1', rows: [line(), line()] }).success).toBe(false);
    expect(PriceListInputSchema.safeParse({ name: 'X1', rows: [line({ isActive: false, mrp: 0, price: 0 })] }).success).toBe(false);
    expect(PriceListInputSchema.safeParse({ name: 'X1', rows: [line()], extra: 1 }).success).toBe(false);
  });
  it('a switched-off line may have no prices', () => {
    expect(PriceListInputSchema.safeParse({ name: 'X1', rows: [line(), line({ longIn: 24, shortIn: 16, mrp: 0, price: 0, isActive: false })] }).success).toBe(true);
  });
  it('orients every line to the picture and suggests the making cost', () => {
    const list = { rows: [line()] as never };
    const portrait = rowsFromPriceList(list, 'portrait', models, DEFAULT_FRAMING_COST_RATES);
    expect(portrait.rows[0]).toMatchObject({ widthIn: 8, heightIn: 12, frameModelId: 'teak', mrp: 99900, price: 79900, isActive: true });
    expect(portrait.rows[0]!.cost).toBeGreaterThan(0);
    expect(rowsFromPriceList(list, 'landscape', models, DEFAULT_FRAMING_COST_RATES).rows[0]).toMatchObject({ widthIn: 12, heightIn: 8 });
    expect(portrait.frameModelIds).toEqual(['teak']);
  });
  it('skips lines whose frame model is gone or switched off, and says which', () => {
    const out = rowsFromPriceList({ rows: [line(), line({ frameModelId: 'old' }), line({ frameModelId: 'missing' })] as never }, 'landscape', models, DEFAULT_FRAMING_COST_RATES);
    expect(out.rows).toHaveLength(1);
    expect(out.skipped).toEqual(['12x8 in (old)', '12x8 in (missing)']);
  });
  it('reads the orientation of a picture; a square one is left to the owner', () => {
    expect(pictureOrientation({ width: 4000, height: 6000 })).toBe('portrait');
    expect(pictureOrientation({ width: 6000, height: 4000 })).toBe('landscape');
    expect(pictureOrientation({ width: 3000, height: 3050 })).toBeNull();
    expect(pictureOrientation({ width: 0, height: 0 })).toBeNull();
  });
});

import { paperSizeName } from './product-pricing';
describe('paper size names', () => {
  it('names the usual frame sizes by their A-series paper, either orientation', () => {
    expect(paperSizeName({ widthIn: 8, heightIn: 12 })).toBe('A4');
    expect(paperSizeName({ widthIn: 12, heightIn: 8 })).toBe('A4');
    expect(paperSizeName({ widthIn: 12, heightIn: 18 })).toBe('A3');
    expect(paperSizeName({ widthIn: 16, heightIn: 24 })).toBe('A2');
    expect(paperSizeName({ widthIn: 6, heightIn: 8 })).toBe('A5');
    expect(paperSizeName({ widthIn: 10, heightIn: 10 })).toBeNull();
  });
});
