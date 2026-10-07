import { describe, it, expect } from 'vitest';
import { groupOrderItems } from './order-combo-groups';

const frame = (instanceId: string, frameKey: string, frameLabel: string) => ({ combo: { instanceId, comboId: 'triple-9', comboName: 'Triple 9', frameKey, frameLabel } });

describe('groupOrderItems', () => {
  it('leaves a combo-free order exactly as it was', () => {
    const items = [{ title: 'A' }, { title: 'B' }] as Array<{ title: string; combo?: undefined }>;
    expect(groupOrderItems(items, undefined).map((g) => g.kind)).toEqual(['item', 'item']);
  });

  it('gathers each combo\'s frames under one heading, in order, beside ordinary items', () => {
    const items = [
      { title: 'Mug' },
      { title: 'Small', ...frame('i1', 'small-1', 'Frame 1') },
      { title: 'Large', ...frame('i1', 'large-1', 'Frame 2') },
      { title: 'Other combo frame', ...frame('i2', 'small-1', 'Frame 1') },
    ] as Array<{ title: string; combo?: ReturnType<typeof frame>['combo'] }>;
    const combos = [{ instanceId: 'i1', comboId: 'triple-9', version: 1, name: 'Triple 9 Combo', slug: 'triple-9', price: 99900, mrp: 199900, frames: [] }];

    const groups = groupOrderItems(items, combos);

    expect(groups.map((g) => g.kind)).toEqual(['item', 'combo', 'combo']);
    const first = groups[1]!;
    expect(first.kind === 'combo' && { name: first.name, price: first.price, slug: first.slug, frames: first.frames.map((f) => [f.label, f.index]) }).toEqual({
      name: 'Triple 9 Combo', price: 99900, slug: 'triple-9', frames: [['Frame 1', 1], ['Frame 2', 2]],
    });
    // A combo the order record doesn't describe still shows, from the name on its items.
    const second = groups[2]!;
    expect(second.kind === 'combo' && { name: second.name, price: second.price }).toEqual({ name: 'Triple 9', price: null });
  });
});
