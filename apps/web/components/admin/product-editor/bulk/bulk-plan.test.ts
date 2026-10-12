import { describe, it, expect } from 'vitest';
import { checkSizes, codeFromName, dedupeNames, looksLikeCameraName, nameFromFilename, orientationFor, uniqueCode, uniqueWith } from './bulk-plan';

describe('bulk plan', () => {
  it('makes a readable name from a file name', () => {
    expect(nameFromFilename('lord_murugan-2.JPG')).toBe('Lord Murugan 2');
    expect(nameFromFilename('Rajinikanth (1).jpeg')).toBe('Rajinikanth');
    expect(nameFromFilename('tanjore.art.copy.png')).toBe('Tanjore Art');
  });
  it('recognises camera and phone file names so the owner is asked for a real name', () => {
    expect(looksLikeCameraName('IMG_20241010_1234.jpg')).toBe(true);
    expect(looksLikeCameraName('DSC0042.JPG')).toBe(true);
    expect(looksLikeCameraName('WhatsApp Image 2024-10-10.jpeg')).toBe(true);
    expect(looksLikeCameraName('murugan.jpg')).toBe(false);
  });
  it('numbers repeated names, ignoring case, and avoids titles already on the shop', () => {
    expect(dedupeNames(['Murugan', 'murugan', 'Ganesha', 'Murugan'])).toEqual(['Murugan', 'murugan 2', 'Ganesha', 'Murugan 3']);
    expect(dedupeNames(['Murugan'], new Set(['murugan']))).toEqual(['Murugan 2']);
  });
  it('makes slugs and 12-character product codes unique', () => {
    expect(uniqueWith('lord-murugan', new Set(['lord-murugan', 'lord-murugan-2']))).toBe('lord-murugan-3');
    expect(codeFromName('Lord Murugan Photo Frame')).toBe('LORDMURUGANP');
    expect(uniqueCode('LORDMURUGANP', new Set(['LORDMURUGANP']))).toBe('LORDMURUGAN2');
    expect(uniqueCode('abc', new Set())).toBe('ABC');
  });
  it('picks the orientation from the picture, honours the owner, and flags a square one', () => {
    expect(orientationFor({ width: 4000, height: 6000 }, 'auto')).toEqual({ orientation: 'portrait', square: false });
    expect(orientationFor({ width: 4000, height: 6000 }, 'landscape')).toEqual({ orientation: 'landscape', square: false });
    expect(orientationFor({ width: 3000, height: 3000 }, 'auto')).toEqual({ orientation: 'landscape', square: true });
  });
  it('measures sharpness at the biggest size and leaves out sizes that would print soft', () => {
    const rows = [
      { widthIn: 12, heightIn: 8, isActive: true },
      { widthIn: 24, heightIn: 16, isActive: true },
    ];
    const image = { width: 2400, height: 1600 }; // 200 ppi at 12x8, 100 ppi at 24x16
    const dropped = checkSizes(image, rows, { dropSoft: true });
    expect(dropped.rows).toEqual([rows[0]]);
    expect(dropped.tooSoft).toEqual(['24x16']);
    expect(dropped.worstDpi).toBe(100);
    const kept = checkSizes(image, rows, { dropSoft: false });
    expect(kept.rows).toHaveLength(2);
    expect(kept.tooSoft).toEqual([]);
  });
  it('reports how much of the picture a shape crops away', () => {
    const r = checkSizes({ width: 3000, height: 3000 }, [{ widthIn: 12, heightIn: 8, isActive: true }], { dropSoft: false });
    expect(r.keptAtWorst).toBeCloseTo(0.667, 2);
  });
});
