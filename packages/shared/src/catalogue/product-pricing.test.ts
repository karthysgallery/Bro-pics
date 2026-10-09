import { describe, it, expect } from 'vitest';
import { checkPriceRows, discountPercent, sizeLabelOf, skuFor, variantFromRow, variantIdFor, PriceRowSchema } from './product-pricing';
import { marginPercent, publicFrameModel, suggestMakingCost, DEFAULT_FRAMING_COST_RATES, type FrameModel } from './frame-model';
import { VariantSchema } from '../schemas/variant';

const teak: FrameModel = {
  id: 'teak-classic', name: 'Teak Classic', code: 'TK-101', colour: 'Brown', colourHex: '#6B4226', material: 'Wood', mouldingWidthIn: 1,
  image: { mediaId: 'm1', url: 'https://x/teak.png', widthPx: 1000, heightPx: 1000, borderPx: 120 },
  costPerFoot: 4000, priceDelta: 0, isActive: true, sortOrder: 1, createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z',
};
const row = { widthIn: 12, heightIn: 18, frameModelId: 'teak-classic', mrp: 199900, price: 149900, cost: 60000, isActive: true };

describe('size × frame model pricing', () => {
  it('turns a row into an ordinary variant: MRP → compareAtPrice, model name → finish, 300 DPI print size', () => {
    const v = variantFromRow('murugan', 'MURUGAN', row, teak, 'murugan-p1_50');
    expect(VariantSchema.parse(v)).toMatchObject({
      id: 'murugan_12x18_teak-classic', sku: 'MURUGAN-12X18-TK101', sizeLabel: '12x18 in', frameColour: 'Teak Classic', material: 'Wood', frameModelId: 'teak-classic',
      price: 149900, compareAtPrice: 199900, printWidthPx: 3600, printHeightPx: 5400, personalizationTemplateId: 'murugan-p1_50',
    });
    expect(v).not.toHaveProperty('cost'); // making cost never goes on the public variant
  });

  it('keeps ids stable for re-saves and handles fractional inches', () => {
    expect(variantIdFor('p', { widthIn: 8.5, heightIn: 11, frameModelId: 'Royal Gold' })).toBe('p_8p5x11_royal-gold');
    expect(sizeLabelOf(8.5, 11)).toBe('8.5x11 in');
    expect(skuFor('lord murugan', { widthIn: 8, heightIn: 12 }, { code: 'tk 101' })).toBe('LORDMURUGAN-8X12-TK101');
  });

  it('refuses a selling price above MRP and flags loss-making or thin-margin rows', () => {
    expect(PriceRowSchema.safeParse({ ...row, price: 250000 }).success).toBe(false);
    const problems = checkPriceRows([row, { ...row, frameModelId: 'gold', price: 50000 }, { ...row, frameModelId: 'black', price: 70000 }, { ...row }]);
    expect(problems).toEqual([
      { index: 1, severity: 'warning', message: 'Selling below making cost — this loses money.' },
      { index: 2, severity: 'warning', message: 'Margin is under 20%.' },
      { index: 3, severity: 'error', message: 'This size and frame model is listed twice.' },
    ]);
    expect(checkPriceRows([{ ...row, isActive: false }]).map((p) => p.message)).toContain('Turn on at least one size to sell.');
  });

  it('suggests a making cost from moulding length, area and per-frame cost; margin and discount', () => {
    // 12x18, 1in moulding: (60 + 8) / 12 × 1.1 = 6.23 ft × ₹40 = ₹249.33; 1.5 sq ft × ₹120 = ₹180; + ₹50 → ₹479
    expect(suggestMakingCost({ widthIn: 12, heightIn: 18 }, teak, DEFAULT_FRAMING_COST_RATES)).toBe(47900);
    expect(marginPercent(149900, 60000)).toBe(60);
    expect(marginPercent(0, 1)).toBeNull();
    expect(discountPercent(199900, 149900)).toBe(25);
  });

  it('shows customers the frame model without its cost', () => {
    const pub = publicFrameModel(teak);
    expect(pub).not.toHaveProperty('costPerFoot');
    expect(pub).not.toHaveProperty('priceDelta');
    expect(pub.image).toEqual({ url: 'https://x/teak.png', widthPx: 1000, heightPx: 1000, borderPx: 120 });
  });
});
