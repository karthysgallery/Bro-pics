import { describe, it, expect } from 'vitest';
import { STARTER_DRAFTS } from './starter-drafts';
import { LEGAL_PAGE_SLUGS, LEGAL_TOKENS, legalValuesFrom, parsePolicyFacts, publicationBlockers, renderLegalHtml, unresolvedTokens, isApproved, isVisibleToPublic, pageStatus, textFingerprint } from '../business/legal-text';
import { parseBusinessProfile } from '../business/business-profile';
import { parseReturnsSettings } from '../returns/eligibility';

const FULL_PROFILE = parseBusinessProfile({
  name: 'Test Gallery',
  legalName: 'Test Gallery Co',
  addressLine1: '1 Test Street',
  city: 'Testville',
  state: 'Tamil Nadu',
  pincode: '600001',
  supportEmail: 'help@test.example',
  supportWhatsapp: '+911234567890',
  grievanceName: 'Test Person',
  grievanceDesignation: 'Test Role',
  grievanceEmail: 'grievance@test.example',
  grievancePhone: '+911234567891',
});
const FACTS = parsePolicyFacts({
  dispatchTime: 'D', deliveryEstimate: 'E', cancellationRule: 'C', refundTiming: 'R', photoRetention: 'P', responseTime: 'T', supportHours: 'H', jurisdiction: 'J',
});
const RETURNS = parseReturnsSettings({ claimWindowDays: 5, claimWindowApproved: true, readyMadeChangeOfMindDays: 4, readyMadeChangeOfMindApproved: true, claimInstructions: 'Message us.' });
const FULL = legalValuesFrom(FULL_PROFILE, { returns: RETURNS, facts: FACTS, homeState: 'Tamil Nadu', shippingSummary: 'Free in Tamil Nadu.' });

describe('starter drafts', () => {
  it('cover every legal page', () => {
    expect(Object.keys(STARTER_DRAFTS).sort()).toEqual([...LEGAL_PAGE_SLUGS].sort());
  });

  it('only use tokens the site knows, and declare every token they use', () => {
    for (const d of Object.values(STARTER_DRAFTS)) {
      const used = unresolvedTokens(d.bodyHtml);
      for (const t of used) expect(LEGAL_TOKENS as readonly string[], `${d.slug} uses unknown {{${t}}}`).toContain(t);
      expect([...d.tokens].sort(), d.slug).toEqual([...used].sort());
    }
  });

  it('cannot be published while any business fact is missing', () => {
    for (const d of Object.values(STARTER_DRAFTS)) {
      expect(publicationBlockers(d.bodyHtml).length, d.slug).toBeGreaterThan(0);
      expect(renderLegalHtml(d.bodyHtml, legalValuesFrom(null)), d.slug).toBeNull();
    }
  });

  it('render completely once every fact is supplied, with no token or internal note left', () => {
    for (const d of Object.values(STARTER_DRAFTS)) {
      const html = renderLegalHtml(d.bodyHtml, FULL);
      expect(html, d.slug).not.toBeNull();
      expect(html).not.toMatch(/\{\{|NEEDS|OWNER|TODO/);
    }
  });

  it('hold back a deadline or period the owner has not approved', () => {
    const unapproved = parseReturnsSettings({ claimWindowDays: 5, claimWindowApproved: false, readyMadeChangeOfMindDays: 4 });
    const values = legalValuesFrom(FULL_PROFILE, { returns: unapproved, facts: FACTS, homeState: 'Tamil Nadu', shippingSummary: 'x' });
    expect(values.claimWindowDays).toBeUndefined();
    expect(values.readyMadeReturnDays).toBeUndefined();
    expect(renderLegalHtml(STARTER_DRAFTS['return-refund-policy'].bodyHtml, values)).toBeNull();
  });

  it('contain no hard-coded address, phone, email, GSTIN, price, deadline or guarantee', () => {
    for (const d of Object.values(STARTER_DRAFTS)) {
      const text = d.bodyHtml.replace(/\{\{[^}]+\}\}/g, '');
      expect(text, d.slug).not.toMatch(/@\w|\+?\d{10}|\b\d{6}\b|GSTIN|₹|\b\d+\s*(?:hours?|days?|working days?)\b/i);
      expect(text, d.slug).not.toMatch(/guarantee|certified|ISO|lifetime/i);
    }
  });

  it('never accuse the customer or waive consumer rights', () => {
    const all = Object.values(STARTER_DRAFTS).map((d) => d.bodyHtml).join(' ');
    expect(all).not.toMatch(/fraud|cheat|liar|dishonest/i);
    expect(STARTER_DRAFTS['return-refund-policy'].bodyHtml).toMatch(/consumer-protection law/);
    expect(STARTER_DRAFTS.terms.bodyHtml).toMatch(/cannot lawfully be excluded/);
    // a missing video must not be a reason to refuse
    expect(STARTER_DRAFTS['return-refund-policy'].bodyHtml).toMatch(/not a condition/);
  });
});

describe('page approval', () => {
  const body = '<p>A reasonably long policy page body so that it is not treated as empty text.</p>';
  it('an approval is only valid for the exact text approved', () => {
    const hash = textFingerprint(body);
    expect(isApproved({ bodyHtml: body, approvedHash: hash })).toBe(true);
    expect(isApproved({ bodyHtml: `${body}x`, approvedHash: hash })).toBe(false);
    expect(isApproved({ bodyHtml: body, approvedHash: null })).toBe(false);
  });
  it('a legal page is visible only when published AND approved; other pages only when published', () => {
    const hash = textFingerprint(body);
    expect(isVisibleToPublic({ slug: 'privacy', bodyHtml: body, isPublished: true, approvedHash: hash })).toBe(true);
    expect(isVisibleToPublic({ slug: 'privacy', bodyHtml: body, isPublished: true, approvedHash: undefined })).toBe(false);
    expect(isVisibleToPublic({ slug: 'privacy', bodyHtml: body, isPublished: false, approvedHash: hash })).toBe(false);
    expect(isVisibleToPublic({ slug: 'faq', bodyHtml: body, isPublished: true })).toBe(true);
  });
  it('reports draft, approved and published clearly', () => {
    const hash = textFingerprint(body);
    expect(pageStatus({ slug: 'terms', bodyHtml: body, isPublished: false })).toBe('draft');
    expect(pageStatus({ slug: 'terms', bodyHtml: body, isPublished: false, approvedHash: hash })).toBe('approved');
    expect(pageStatus({ slug: 'terms', bodyHtml: body, isPublished: true, approvedHash: hash })).toBe('published');
    // published flag without a valid approval is NOT live
    expect(pageStatus({ slug: 'terms', bodyHtml: body, isPublished: true })).toBe('draft');
    expect(pageStatus({ slug: 'terms', bodyHtml: `${body}!`, isPublished: true, approvedHash: hash })).toBe('draft');
  });
});

describe('statutory consumer rights are never excluded', () => {
  const text = (slug: keyof typeof STARTER_DRAFTS) => STARTER_DRAFTS[slug].bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  it('the terms, returns and cancellation drafts each say nothing in them limits consumer-protection rights', () => {
    for (const slug of ['terms', 'return-refund-policy', 'cancellation-policy'] as const) expect(text(slug)).toMatch(/consumer-protection law/i);
  });

  it('no draft uses wording that tries to take away a right', () => {
    for (const draft of Object.values(STARTER_DRAFTS)) {
      const t = draft.bodyHtml.replace(/<[^>]+>/g, ' ');
      expect(t).not.toMatch(/non-?refundable|no refunds? (?:under|in) any|under no circumstances|you waive|waive any right|sole remedy|all sales (?:are )?final/i);
    }
  });

  it('the liability clause keeps what cannot lawfully be excluded', () => {
    expect(text('terms')).toMatch(/cannot lawfully be excluded/i);
  });
});
