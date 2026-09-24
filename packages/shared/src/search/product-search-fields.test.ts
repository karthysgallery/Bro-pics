import { describe, it, expect } from 'vitest';
import { buildProductSearchFields } from './product-search-fields';

describe('buildProductSearchFields', () => {
  it('lowercases the title into titleLower', () => {
    expect(buildProductSearchFields('Classic Wooden Frame', '').titleLower).toBe('classic wooden frame');
  });

  it('tokenizes title and shortDesc together, lowercased, deduped, words over 2 chars only', () => {
    const { searchTokens } = buildProductSearchFields('Classic Wooden Frame', 'A wooden frame for your photos');
    expect(searchTokens).toEqual(
      expect.arrayContaining(['classic', 'wooden', 'frame', 'for', 'your', 'photos'])
    );
    expect(searchTokens).not.toContain('a');
    // "frame" appears in both title and shortDesc but only once in the set
    expect(searchTokens.filter((t) => t === 'frame')).toHaveLength(1);
  });
});
