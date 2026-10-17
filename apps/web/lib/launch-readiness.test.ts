import { describe, it, expect } from 'vitest';
import { DEFAULT_RETURNS_SETTINGS, DEFAULT_STATE_SHIPPING, parseBusinessProfile, textFingerprint } from '@bro-pics/shared';
import { computeReadiness } from './launch-readiness';

const body = '<p>A reasonably long policy page body so that it is not treated as empty text.</p>';
const base = {
  profile: null,
  shipping: DEFAULT_STATE_SHIPPING,
  returns: DEFAULT_RETURNS_SETTINGS,
  pages: [],
  productsWithoutReturnPolicy: 3,
  totalActiveProducts: 6,
};

describe('computeReadiness', () => {
  it('flags everything as to-do on a brand-new shop, with counts and plain labels only', () => {
    const r = computeReadiness(base);
    expect(r.every((i) => i.status === 'todo')).toBe(true);
    expect(r.find((i) => i.id === 'shipping')!.details[0]).toMatch(/35 of the states/);
    expect(r.find((i) => i.id === 'productPolicies')!.details[0]).toMatch(/3 of 6/);
    expect(r.find((i) => i.id === 'legalPages')!.details).toHaveLength(8);
  });

  it('marks shipping ok once a fallback charge exists, and a legal page published only when approved and live', () => {
    const r = computeReadiness({
      ...base,
      shipping: { ...DEFAULT_STATE_SHIPPING, otherStatesDefaultCharge: 9000 },
      pages: [
        { slug: 'terms', bodyHtml: body, isPublished: true, approvedHash: textFingerprint(body) },
        { slug: 'privacy', bodyHtml: body, isPublished: true }, // published flag but never approved
      ],
    });
    expect(r.find((i) => i.id === 'shipping')!.status).toBe('ok');
    const legal = r.find((i) => i.id === 'legalPages')!.details;
    expect(legal.some((d) => d.startsWith('terms'))).toBe(false);
    expect(legal).toContain('privacy: draft, not approved');
  });

  it('asks for the GST registration status to be confirmed, never assuming one', () => {
    const profile = parseBusinessProfile({ name: 'KarthysGallery' });
    const details = computeReadiness({ ...base, profile }).find((i) => i.id === 'business')!.details;
    expect(details.join(' ')).toMatch(/GST registration status/);
  });
});
