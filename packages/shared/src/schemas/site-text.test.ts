import { describe, it, expect } from 'vitest';
import { DEFAULT_SITE_TEXT, SiteTextSettingsSchema, resolveSiteText } from './site-text';

describe('site text', () => {
  it('fills anything not set (or blank) with the original wording', () => {
    const text = resolveSiteText({ trust1: 'Museum-grade prints', trust2: '   ', nonsense: 'x' });
    expect(text.trust1).toBe('Museum-grade prints');
    expect(text.trust2).toBe(DEFAULT_SITE_TEXT.trust2);
    expect(resolveSiteText(null)).toEqual(DEFAULT_SITE_TEXT);
  });

  it('accepts only known fields within their length', () => {
    expect(SiteTextSettingsSchema.safeParse({ trust1: 'ok' }).success).toBe(true);
    expect(SiteTextSettingsSchema.safeParse({ unknown: 'x' }).success).toBe(false);
    expect(SiteTextSettingsSchema.safeParse({ trust1: 'x'.repeat(81) }).success).toBe(false);
    expect(SiteTextSettingsSchema.safeParse({ careText: 'x'.repeat(400) }).success).toBe(true);
  });
});
