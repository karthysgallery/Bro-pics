import { describe, it, expect } from 'vitest';
import { DEFAULT_RETURNS_SETTINGS, decideReturnRequest, parseReturnsSettings, resolveProductKind, returnsSettingsGaps, type KindResolution } from './eligibility';

const personalized: KindResolution = { kind: 'personalized', source: 'product_data' };
const readyMade: KindResolution = { kind: 'ready_made', source: 'product_data' };
const delivered = new Date('2026-10-01T00:00:00Z');
const at = (days: number) => new Date(delivered.getTime() + days * 86400000);
const approved = (over = {}) => parseReturnsSettings({ claimWindowDays: 7, claimWindowApproved: true, readyMadeChangeOfMindDays: 7, readyMadeChangeOfMindApproved: true, ...over });

describe('which policy a product follows', () => {
  it('uses the product override first, audited admin choice', () => {
    expect(resolveProductKind({ returnPolicy: 'ready_made', productType: 'collage', photoSlots: 6 })).toEqual({ kind: 'ready_made', source: 'product_override' });
  });
  it('treats photo/text products as personalized and fixed designs as ready-made', () => {
    expect(resolveProductKind({ productType: 'single_photo' }).kind).toBe('personalized');
    expect(resolveProductKind({ photoSlots: 1 }).kind).toBe('personalized');
    expect(resolveProductKind({ allowsTextPersonalization: true }).kind).toBe('personalized');
    expect(resolveProductKind({ productType: 'ready_made', photoSlots: 0 })).toEqual({ kind: 'ready_made', source: 'product_data' });
  });
  it('falls back to the category default, then to a flagged safe assumption', () => {
    expect(resolveProductKind({}, { returnPolicy: 'ready_made' })).toEqual({ kind: 'ready_made', source: 'category_default' });
    expect(resolveProductKind({})).toEqual({ kind: 'personalized', source: 'assumed' });
  });
});

describe('personalized products', () => {
  it('refuse change-of-mind, but point to the fault reasons', () => {
    const d = decideReturnRequest({ reason: 'changed_mind', kinds: [personalized], deliveredAt: delivered, now: at(1), settings: approved() });
    expect(d.allowed).toBe(false);
    expect(d.message).toMatch(/damaged|printing fault|wrong item/);
  });
  it('still accept a printing fault or damage claim for review', () => {
    for (const reason of ['damaged', 'wrong_item', 'quality', 'other'] as const) {
      expect(decideReturnRequest({ reason, kinds: [personalized], deliveredAt: delivered, now: at(2), settings: approved() }).allowed).toBe(true);
    }
  });
});

describe('ready-made products', () => {
  it('allow change of mind only inside an owner-approved period', () => {
    expect(decideReturnRequest({ reason: 'changed_mind', kinds: [readyMade], deliveredAt: delivered, now: at(3), settings: approved() }).allowed).toBe(true);
    const late = decideReturnRequest({ reason: 'changed_mind', kinds: [readyMade], deliveredAt: delivered, now: at(8), settings: approved() });
    expect(late.allowed).toBe(false);
    expect(late.message).toMatch(/7-day/);
  });
  it('refuse change of mind when the owner has not approved a period (nothing is promised)', () => {
    const d = decideReturnRequest({ reason: 'changed_mind', kinds: [readyMade], deliveredAt: delivered, now: at(1), settings: DEFAULT_RETURNS_SETTINGS });
    expect(d.allowed).toBe(false);
    expect(d.flags.join(' ')).toMatch(/not approved/);
    // a value that is present but not approved is also ignored
    expect(decideReturnRequest({ reason: 'changed_mind', kinds: [readyMade], deliveredAt: delivered, now: at(1), settings: approved({ readyMadeChangeOfMindApproved: false }) }).allowed).toBe(false);
  });
  it('a mixed order follows the stricter rule for change of mind', () => {
    expect(decideReturnRequest({ reason: 'changed_mind', kinds: [readyMade, personalized], deliveredAt: delivered, now: at(1), settings: approved() }).allowed).toBe(false);
  });
});

describe('fault claims and the claim window', () => {
  it('apply no deadline at all until the owner approves one, and tell staff', () => {
    const d = decideReturnRequest({ reason: 'damaged', kinds: [personalized], deliveredAt: delivered, now: at(200), settings: DEFAULT_RETURNS_SETTINGS });
    expect(d.allowed).toBe(true);
    expect(d.flags.join(' ')).toMatch(/Claim window is not approved/);
  });
  it('apply the approved window, with a way to ask for an exception', () => {
    expect(decideReturnRequest({ reason: 'damaged', kinds: [personalized], deliveredAt: delivered, now: at(7), settings: approved() }).allowed).toBe(true);
    const late = decideReturnRequest({ reason: 'damaged', kinds: [personalized], deliveredAt: delivered, now: at(9), settings: approved() });
    expect(late.allowed).toBe(false);
    expect(late.message).toMatch(/WhatsApp/);
  });
  it('flag a product with no return policy so the admin sets one', () => {
    const d = decideReturnRequest({ reason: 'damaged', kinds: [{ kind: 'personalized', source: 'assumed' }], deliveredAt: delivered, now: at(1), settings: approved() });
    expect(d.flags.join(' ')).toMatch(/no return policy set/);
  });
});

describe('settings parsing', () => {
  it('rejects absurd values and unknown keys, and reports the gaps', () => {
    expect(parseReturnsSettings({ claimWindowDays: 9999 })).toEqual(DEFAULT_RETURNS_SETTINGS);
    expect(parseReturnsSettings({ surprise: 1 })).toEqual(DEFAULT_RETURNS_SETTINGS);
    expect(returnsSettingsGaps(DEFAULT_RETURNS_SETTINGS)).toHaveLength(3);
    expect(returnsSettingsGaps(approved({ claimInstructions: 'Message us with photos.' }))).toEqual([]);
  });
});
