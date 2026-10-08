import { describe, it, expect } from 'vitest';
import { AppearanceSchema, DEFAULT_APPEARANCE, FONT_CHOICES, appearanceCss, resolveAppearance } from './appearance';

describe('appearance defaults', () => {
  it('are valid and produce no CSS at all: the shop looks exactly as it did before this was editable', () => {
    expect(AppearanceSchema.safeParse(DEFAULT_APPEARANCE).success).toBe(true);
    expect(appearanceCss(DEFAULT_APPEARANCE)).toBe('');
    expect(Object.values(DEFAULT_APPEARANCE.productPage).every(Boolean)).toBe(true);
  });

  it('every font choice names a unique CSS variable', () => {
    expect(new Set(FONT_CHOICES.map((f) => f.cssVar)).size).toBe(FONT_CHOICES.length);
  });
});

describe('resolveAppearance', () => {
  it('fills anything missing from the defaults and ignores bad values', () => {
    expect(resolveAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(resolveAppearance({ corners: 'round' }).corners).toBe('round');
    expect(resolveAppearance({ corners: 'round' }).displayFont).toBe('outfit');
    expect(resolveAppearance({ corners: 'triangle' })).toEqual(DEFAULT_APPEARANCE);
    expect(resolveAppearance({ productPage: { showReviews: false } }).productPage).toMatchObject({ showReviews: false, showRelated: true });
  });

  it('rejects unknown fonts and unexpected keys when an admin saves', () => {
    expect(AppearanceSchema.safeParse({ ...DEFAULT_APPEARANCE, displayFont: 'comic-sans' }).success).toBe(false);
    expect(AppearanceSchema.safeParse({ ...DEFAULT_APPEARANCE, evil: '</style>' }).success).toBe(false);
  });
});

describe('appearanceCss', () => {
  it('re-points only the font variables that changed, scoped away from the admin area', () => {
    const css = appearanceCss({ ...DEFAULT_APPEARANCE, displayFont: 'playfair' });
    expect(css).toBe('html:root:not(:has([data-admin-root])){--font-display:var(--font-playfair)}');
    expect(appearanceCss({ ...DEFAULT_APPEARANCE, bodyFont: 'inter' })).toContain('--font-sans:var(--font-inter)');
  });

  it('sets the corner radii for a chosen style', () => {
    expect(appearanceCss({ ...DEFAULT_APPEARANCE, corners: 'sharp' })).toContain('--radius-3xl:0.25rem');
    expect(appearanceCss({ ...DEFAULT_APPEARANCE, corners: 'round' })).toContain('--radius-card:20px');
  });

  it('changes main call-to-action buttons only', () => {
    const css = appearanceCss({ ...DEFAULT_APPEARANCE, buttons: 'square' });
    expect(css).toContain('border-radius:2px');
    expect(css).toContain('[class~="bg-gold"]');
    expect(css).not.toContain('--radius');
  });
});
