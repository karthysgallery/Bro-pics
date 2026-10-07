import { describe, it, expect } from 'vitest';
import { BLANK_COMBO, bodyFromForm, newItemId, paiseToRupees, rupeesToPaise, slugify } from './combo-form';

describe('combo form helpers', () => {
  it('converts rupees and paise both ways, and rejects what is not an amount', () => {
    expect(rupeesToPaise('1,299.50')).toBe(129950);
    expect(rupeesToPaise('₹ 999')).toBe(99900);
    expect(rupeesToPaise('')).toBeNull();
    expect(rupeesToPaise('0')).toBeNull();
    expect(paiseToRupees(99900)).toBe('999');
    expect(paiseToRupees(129950)).toBe('1299.50');
  });

  it('makes web addresses and unique, readable item ids', () => {
    expect(slugify('Triple 9 Combo – 10 Frames!')).toBe('triple-9-combo-10-frames');
    expect(newItemId('A4 (8.3 x 11.7 in)', [])).toBe('a4_8_3_x_11_7_in');
    expect(newItemId('A4', ['a4'])).toBe('a4_2');
    expect(newItemId('!!!', [])).toBe('frame');
  });

  it('turns a good form into an API body and names the first problem in a bad one', () => {
    const good = { ...BLANK_COMBO, name: ' Triple 9 ', slug: 'triple-9', price: '999', mrp: '1999', items: [{ id: 'a4', productId: 'p', variantId: 'v', quantity: 2, label: ' A4 ' }] };
    const result = bodyFromForm(good);
    expect(result).toMatchObject({ ok: true, body: { name: 'Triple 9', price: 99900, mrp: 199900, items: [{ id: 'a4', quantity: 2, label: 'A4' }] } });

    expect(bodyFromForm({ ...good, name: '' })).toEqual({ ok: false, error: 'Give the combo a name.' });
    expect(bodyFromForm({ ...good, mrp: '500' })).toEqual({ ok: false, error: 'The MRP cannot be lower than the combo price.' });
    expect(bodyFromForm({ ...good, items: [] })).toMatchObject({ ok: false });
    expect(bodyFromForm({ ...good, items: [{ id: 'a', productId: '', variantId: '', quantity: 1 }] })).toMatchObject({ ok: false });
  });
});
