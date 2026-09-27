import { describe, it, expect, vi } from 'vitest';
import { saveDraft, loadDraft, clearDraft, type PersonalizationDraft } from './personalization-draft';

// Distinct product/variant ids per test rather than localStorage.clear()
// in beforeEach — this environment's jsdom/Node localStorage interop is
// unreliable across test files sharing global state (same reasoning
// ProductDetailClient.personalization.test.tsx already documents).

const baseDraft: Omit<PersonalizationDraft, 'savedAt'> = {
  activeSlotIndex: 0,
  selectedClipartId: null,
  slots: [{ slotIndex: 0, uploadId: 'up_1', scale: 1.2, offsetX: 0, offsetY: 0, rotationDeg: 0, confirmedLowDpi: false }],
  textFields: [],
};

describe('personalization draft (FE-11 localStorage fallback)', () => {
  it('round-trips a saved draft', () => {
    saveDraft('prod_a', 'var_a', baseDraft);
    const loaded = loadDraft('prod_a', 'var_a');
    expect(loaded?.slots).toEqual(baseDraft.slots);
    expect(loaded?.savedAt).toBeTruthy();
  });

  it('returns null when nothing was ever saved for this product/variant', () => {
    expect(loadDraft('prod_b_never_saved', 'var_b')).toBeNull();
  });

  it('is scoped per product+variant — a draft for one variant is not returned for another', () => {
    saveDraft('prod_c', 'var_c1', baseDraft);
    expect(loadDraft('prod_c', 'var_c2')).toBeNull();
  });

  it('clearDraft removes it', () => {
    saveDraft('prod_d', 'var_d', baseDraft);
    clearDraft('prod_d', 'var_d');
    expect(loadDraft('prod_d', 'var_d')).toBeNull();
  });

  it('treats a draft older than 7 days as expired', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    saveDraft('prod_e', 'var_e', baseDraft);

    vi.setSystemTime(new Date('2026-01-09T00:00:01.000Z')); // 8 days later
    expect(loadDraft('prod_e', 'var_e')).toBeNull();
    vi.useRealTimers();
  });

  it('treats malformed JSON in the storage slot as no draft, not a thrown error', () => {
    localStorage.setItem('bropics_personalization_draft:prod_f:var_f', '{not valid json');
    expect(() => loadDraft('prod_f', 'var_f')).not.toThrow();
    expect(loadDraft('prod_f', 'var_f')).toBeNull();
  });

  it('treats an empty slots array as no draft — nothing worth restoring', () => {
    saveDraft('prod_g', 'var_g', { ...baseDraft, slots: [] });
    expect(loadDraft('prod_g', 'var_g')).toBeNull();
  });
});
