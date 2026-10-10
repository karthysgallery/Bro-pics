// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { describeSetupIssue, ProductSetupBodySchema } from './product-setup';

describe('describeSetupIssue', () => {
  it('names the size and frame of a price problem', () => {
    const raw = { rows: [{ widthIn: 8, heightIn: 12, frameModelId: 'royal-gold', mrp: 0, price: 0, cost: 0, isActive: true }] };
    const issue = ProductSetupBodySchema.safeParse(raw).error!.issues.find((i) => i.path[0] === 'rows');
    expect(describeSetupIssue(issue, raw)).toBe('8x12 in · Royal Gold: Enter the MRP.');
  });
  it('never shows the raw "Number must be greater than 0"', () => {
    const msg = describeSetupIssue({ code: 'too_small', minimum: 0, inclusive: false, type: 'number', path: ['rows', 0, 'mrp'], message: 'Number must be greater than 0' } as never, { rows: [{ widthIn: 12, heightIn: 18, frameModelId: 'teak' }] });
    expect(msg).toBe('12x18 in · Teak: MRP — Enter an amount above ₹0.');
  });
  it('names the field for other problems', () => {
    expect(describeSetupIssue({ code: 'custom', path: ['categoryId'], message: 'Choose a category.' } as never, {})).toBe('Category: Choose a category.');
  });
});
