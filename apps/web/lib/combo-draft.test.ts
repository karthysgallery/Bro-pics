import { describe, it, expect, beforeEach } from 'vitest';
import { buildComboCartLine, clearComboDraft, draftProgress, loadComboDraft, newComboDraft, saveComboDraft, withSavedFrame } from './combo-draft';

const combo = {
  id: 'triple-9', slug: 'triple-9', name: 'Triple 9', version: 3, price: 99900,
  items: [
    { id: 'small', productId: 'p1', variantId: 'v1', quantity: 2 },
    { id: 'large', productId: 'p2', variantId: 'v2', quantity: 1 },
  ],
};
const frame = (id: string) => ({ personalizationId: id, title: `Frame ${id}`, previewPath: `previews/${id}.jpg` });

describe('combo draft', () => {
  beforeEach(() => window.localStorage.clear());

  it('reports which frames are done, and the next one to do', () => {
    let draft = newComboDraft(combo);
    expect(draftProgress(combo, draft)).toMatchObject({ doneCount: 0, total: 3, ready: false, nextKey: 'small-1' });
    draft = withSavedFrame(draft, 'small-1', frame('a'));
    draft = withSavedFrame(draft, 'large-1', frame('c'));
    expect(draftProgress(combo, draft)).toMatchObject({ doneCount: 2, ready: false, nextKey: 'small-2' });
  });

  it('builds no cart line until every frame is done, then one parent line holding every frame', () => {
    let draft = newComboDraft(combo);
    draft = withSavedFrame(draft, 'small-1', frame('a'));
    expect(buildComboCartLine(combo, draft)).toBeNull();
    draft = withSavedFrame(withSavedFrame(draft, 'small-2', frame('b')), 'large-1', { ...frame('c'), personalization: { templateId: 't', templateVersion: 1, state: { slots: {} } } });

    const line = buildComboCartLine(combo, draft)!;
    expect(line).toMatchObject({ variantId: 'combo:triple-9', personalizationId: draft.instanceId, qty: 1, unitPriceSnapshot: 99900, previewPath: 'previews/a.jpg' });
    expect(line.combo!.frames.map((f) => [f.key, f.productId, f.variantId, f.personalizationId])).toEqual([
      ['small-1', 'p1', 'v1', 'a'],
      ['small-2', 'p1', 'v1', 'b'],
      ['large-1', 'p2', 'v2', 'c'],
    ]);
    expect(line.combo!.frames[2]!.personalization).toMatchObject({ templateId: 't' });
    expect(JSON.stringify(line)).not.toContain('undefined');
  });

  it('survives a reload, but not a changed combo or a frame the combo no longer has', () => {
    const draft = withSavedFrame(withSavedFrame(newComboDraft(combo), 'small-1', frame('a')), 'gone-1', frame('z'));
    saveComboDraft(draft);
    const loaded = loadComboDraft(combo)!;
    expect(loaded.instanceId).toBe(draft.instanceId);
    expect(Object.keys(loaded.frames)).toEqual(['small-1']);
    expect(loadComboDraft({ ...combo, version: 4 })).toBeNull();
    clearComboDraft(combo.id);
    expect(loadComboDraft(combo)).toBeNull();
  });
});
