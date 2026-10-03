import { describe, it, expect } from 'vitest';
import { FONT_MAP, FALLBACK_FONTS, fontEntryForKey, fontKeyFromCssVar } from './font-map';

describe('FONT_MAP', () => {
  it('has at least 8 entries matching the storefront picker', () => {
    expect(FONT_MAP.length).toBeGreaterThanOrEqual(8);
  });

  it('every entry has a non-empty key, label, cssVariable, and ttfFilename', () => {
    for (const entry of FONT_MAP) {
      expect(entry.key).toBeTruthy();
      expect(entry.label).toBeTruthy();
      expect(entry.cssVariable).toMatch(/^--font-/);
      expect(entry.ttfFilename).toMatch(/\.ttf$/);
    }
  });

  it('keys are unique', () => {
    const keys = FONT_MAP.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('cssVariables are unique', () => {
    const vars = FONT_MAP.map((f) => f.cssVariable);
    expect(new Set(vars).size).toBe(vars.length);
  });
});

describe('FALLBACK_FONTS', () => {
  it('includes Tamil and Devanagari fallbacks', () => {
    const labels = FALLBACK_FONTS.map((f) => f.label);
    expect(labels).toContain('Noto Sans Tamil');
    expect(labels).toContain('Noto Sans Devanagari');
  });
});

describe('fontEntryForKey', () => {
  it('returns the entry for a known key', () => {
    const entry = fontEntryForKey('dancing-script');
    expect(entry).toBeDefined();
    expect(entry!.label).toBe('Dancing Script');
  });

  it('returns undefined for an unknown key', () => {
    expect(fontEntryForKey('nonexistent')).toBeUndefined();
  });
});

describe('fontKeyFromCssVar', () => {
  it('recovers the key from a var() wrapper', () => {
    expect(fontKeyFromCssVar('var(--font-great-vibes)')).toBe('great-vibes');
  });

  it('returns undefined for an unrecognized var()', () => {
    expect(fontKeyFromCssVar('var(--font-unknown)')).toBeUndefined();
  });
});
