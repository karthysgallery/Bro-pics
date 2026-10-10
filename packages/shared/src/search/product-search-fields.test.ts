import { describe, it, expect } from 'vitest';
import { buildProductSearchFields } from './product-search-fields';

describe('buildProductSearchFields', () => {
  it('lowercases the title into titleLower', () => {
    expect(buildProductSearchFields('Classic Wooden Frame', '').titleLower).toBe('classic wooden frame');
  });

  it('tokenizes title and shortDesc together, lowercased, deduped, 2+ letter words without filler', () => {
    const { searchTokens } = buildProductSearchFields('Classic Wooden Frame', 'A wooden frame for your photos');
    expect(searchTokens).toEqual(expect.arrayContaining(['classic', 'wooden', 'frame', 'photos']));
    expect(searchTokens).not.toContain('a');
    expect(searchTokens).not.toContain('for');
    // "frame" appears in both title and shortDesc but only once in the set
    expect(searchTokens.filter((t) => t === 'frame')).toHaveLength(1);
  });
});

describe('search words', () => {
  it('ignores punctuation, keeps Tamil, and finds a product by what its picture shows', async () => {
    const { buildProductSearchFields, searchWordsOf } = await import('./product-search-fields');
    expect(searchWordsOf('Vijay, the CM of Tamilnadu. முருகன்!')).toEqual(['vijay', 'cm', 'tamilnadu', 'முருகன்']);
    const fields = buildProductSearchFields('Cm Of Tamilnadu Photo Frame', 'Printed sharp.', ['cm photo'], ['Vijay', 'VIJAY01']);
    expect(fields.searchTokens).toEqual(expect.arrayContaining(['vijay', 'tamilnadu', 'frame', 'vijay01', 'sharp']));
  });
});
