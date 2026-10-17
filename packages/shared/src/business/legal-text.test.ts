import { describe, it, expect } from 'vitest';
import { textFingerprint, fillLegalTokens, isLegalSlug, legalValuesFrom, publicationBlockers, renderLegalHtml, unresolvedTokens } from './legal-text';
import { parseBusinessProfile } from './business-profile';

const LONG = '<p>This is a policy page with enough words in it to count as a real page for the check.</p>';

describe('legal text safety', () => {
  const profile = parseBusinessProfile({ name: 'KarthysGallery', supportEmail: 'help@example.com', grievanceName: 'Manikandan' });
  const values = legalValuesFrom(profile);

  it('fills tokens from the saved profile and escapes them', () => {
    expect(fillLegalTokens('{{ businessName }} / {{supportEmail}}', values)).toBe('KarthysGallery / help@example.com');
    const evil = legalValuesFrom(parseBusinessProfile({ name: '<b>x</b>' }));
    expect(fillLegalTokens('{{businessName}}', evil)).toBe('&lt;b&gt;x&lt;/b&gt;');
  });

  it('leaves a token with no value in place so it is detected, never silently blanked or invented', () => {
    const out = fillLegalTokens('Write to {{grievanceEmail}}', values);
    expect(out).toBe('Write to {{grievanceEmail}}');
    expect(unresolvedTokens(out)).toEqual(['grievanceEmail']);
  });

  it('blocks publication on unresolved tokens, workflow notes and near-empty pages', () => {
    expect(publicationBlockers(`${LONG}{{supportEmail}}`).join(' ')).toMatch(/Missing business details: supportEmail/);
    for (const note of ['NEEDS OWNER CONFIRMATION', '[NEEDS OWNER INPUT: address]', 'NEEDS LEGAL REVIEW', 'NEEDS OWNER / TAX PROFESSIONAL CONFIRMATION', 'TODO', 'lorem ipsum']) {
      expect(publicationBlockers(`${LONG}<p>${note}</p>`).length, note).toBeGreaterThan(0);
    }
    expect(publicationBlockers('<p>Hi</p>').join(' ')).toMatch(/almost no text/);
    expect(publicationBlockers(LONG)).toEqual([]);
  });

  it('renders null (not the draft) when anything is unresolved', () => {
    expect(renderLegalHtml(`${LONG}<p>Mail {{supportEmail}}</p>`, values)).toContain('help@example.com');
    expect(renderLegalHtml(`${LONG}<p>Mail {{grievanceEmail}}</p>`, values)).toBeNull();
    expect(renderLegalHtml(`${LONG}<p>NEEDS OWNER CONFIRMATION</p>`, values)).toBeNull();
  });

  it('knows which slugs are legal pages that need approval', () => {
    for (const s of ['privacy', 'terms', 'shipping-policy', 'return-refund-policy', 'cancellation-policy', 'contact', 'grievance', 'about']) expect(isLegalSlug(s)).toBe(true);
    expect(isLegalSlug('faq')).toBe(false);
  });
});

describe('textFingerprint is SHA-256', () => {
  it('matches the standard test vectors and node:crypto, including non-ASCII text', async () => {
    const { createHash } = await import('node:crypto');
    expect(textFingerprint('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(textFingerprint('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    for (const t of ['x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), '₹ உங்கள் 😀 policy', 'a'.repeat(5000)]) {
      expect(textFingerprint(t)).toBe(createHash('sha256').update(t, 'utf8').digest('hex'));
    }
  });
});
