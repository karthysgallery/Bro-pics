import { describe, it, expect } from 'vitest';
import { assetStoragePath, detectImageType, isPublicAssetKind, sanitizeFileStem } from './assets';
import { buildOrderSnapshot, canTransitionStatus, latestPublished, nextDraftVersion, resolveTemplateVersion } from './versioning';
import { buildMockupRequest, renderAllScenes, sceneReadiness, type MockupRenderer, type MockupScene } from './mockup';
import { createEmptyState, setSlotPhoto, setSlotTransform, setText, stateFingerprint } from './state';
import { photoPlusTextTemplate, sixPhotoTemplate, singlePhotoTemplate } from './test-fixtures';
import type { PersonalizationTemplate } from './template-schema';

describe('asset strategy', () => {
  it('keeps the six asset kinds in separate prefixes, public only for catalogue assets', () => {
    expect(assetStoragePath({ kind: 'upload', scope: 'sess_1', assetId: 'a1', ext: 'jpg' })).toBe('upload/sess_1/a1.jpg');
    expect(assetStoragePath({ kind: 'template', scope: 'trio', assetId: 'bg', ext: 'png', version: 2 })).toBe('public/template/trio/v2/bg.png');
    expect(assetStoragePath({ kind: 'mask', scope: 'trio', assetId: 'm1', ext: 'png', version: 2 })).toBe('public/mask/trio/v2/m1.png');
    expect(assetStoragePath({ kind: 'render', scope: 'order_9', assetId: 'final', ext: 'png' })).toBe('render/order_9/final.png');
    expect(isPublicAssetKind('upload')).toBe(false);
    expect(isPublicAssetKind('render')).toBe(false);
    expect(isPublicAssetKind('mask')).toBe(true);
  });

  it.each(['../etc/passwd', 'a/b', 'a b', '', '-lead', 'x'.repeat(200), 'a\\b', '..'])('refuses path-escaping segment %j', (bad) => {
    expect(() => assetStoragePath({ kind: 'upload', scope: bad, assetId: 'ok', ext: 'jpg' })).toThrow();
    expect(() => assetStoragePath({ kind: 'upload', scope: 'ok', assetId: bad, ext: 'jpg' })).toThrow();
  });

  it('reduces a client filename to a harmless display stem and never trusts it for paths', () => {
    expect(sanitizeFileStem('../../My Photo (1).JPG')).toBe('My-Photo-1');
    expect(sanitizeFileStem('....')).toBe('file');
  });

  it('identifies images by their bytes, not their extension or claimed type', () => {
    expect(detectImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg');
    expect(detectImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe('image/png');
    expect(detectImageType(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe('image/webp');
    expect(detectImageType(new TextEncoder().encode('<?php echo 1; ?>'))).toBeNull(); // a script renamed .jpg
    expect(detectImageType(new TextEncoder().encode('<svg onload=alert(1)>'))).toBeNull(); // SVG is deliberately not accepted
    expect(detectImageType(Uint8Array.from([0xff, 0xd8]))).toBeNull(); // truncated/corrupt
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});

describe('versioning: old orders stay reproducible after a template changes', () => {
  const v1 = singlePhotoTemplate;
  const v2: PersonalizationTemplate = { ...nextDraftVersion([v1], v1), status: 'published', photoSlots: [{ ...v1.photoSlots[0], x: 0.2, width: 0.6 }] };

  it('snapshots the exact template + state at purchase', () => {
    const state = setSlotPhoto(createEmptyState(v1.id, v1.version), 'photo_01', { assetId: 'up_1', width: 4000, height: 3000 });
    const snap = buildOrderSnapshot(v1, state, new Date('2026-10-05T00:00:00Z'));
    expect(snap).toMatchObject({ templateId: v1.id, templateVersion: 1, capturedAt: '2026-10-05T00:00:00.000Z' });
    expect(snap.template.photoSlots[0].x).toBe(0.1);
  });

  it('a later template edit does not change the old snapshot or what the old order resolves to', () => {
    const state = setSlotPhoto(createEmptyState(v1.id, 1), 'photo_01', { assetId: 'up_1', width: 4000, height: 3000 });
    const snap = buildOrderSnapshot(v1, state);
    expect(v2.version).toBe(2);
    expect(v2.photoSlots[0].x).toBe(0.2);
    expect(snap.template.photoSlots[0].x).toBe(0.1); // frozen copy
    expect(resolveTemplateVersion([v1, v2], v1.id, 1)?.photoSlots[0].x).toBe(0.1);
    expect(resolveTemplateVersion([v1, v2], v1.id, 2)?.photoSlots[0].x).toBe(0.2);
    expect(resolveTemplateVersion([v1, v2], v1.id, 99)).toBeNull();
  });

  it('refuses to snapshot a personalization made against a different template version', () => {
    const state = setSlotPhoto(createEmptyState(v1.id, 1), 'photo_01', { assetId: 'up_1', width: 4000, height: 3000 });
    expect(() => buildOrderSnapshot(v2, state)).toThrow(/@v1.*@v2/);
  });

  it('customers starting NEW personalizations only get the latest PUBLISHED version; drafts and archived are invisible', () => {
    const draft3: PersonalizationTemplate = { ...nextDraftVersion([v1, v2], v2) };
    const archived4: PersonalizationTemplate = { ...v2, version: 4, status: 'archived' };
    expect(draft3.version).toBe(3);
    expect(draft3.status).toBe('draft');
    expect(latestPublished([v1, v2, draft3, archived4], v1.id)?.version).toBe(2);
    expect(latestPublished([draft3], v1.id)).toBeNull();
  });

  it('enforces the lifecycle: published templates can only be archived, never edited back', () => {
    expect(canTransitionStatus('draft', 'review')).toBe(true);
    expect(canTransitionStatus('review', 'published')).toBe(true);
    expect(canTransitionStatus('published', 'draft')).toBe(false);
    expect(canTransitionStatus('published', 'archived')).toBe(true);
    expect(canTransitionStatus('archived', 'published')).toBe(false);
  });
});

describe('mockups: one state drives every scene', () => {
  const template = photoPlusTextTemplate;
  const quad = [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.12 }, { x: 0.88, y: 0.9 }, { x: 0.12, y: 0.88 }] as MockupScene['artworkQuad'];
  const scene = (id: string, kind: MockupScene['kind'], prepared = true): MockupScene => ({
    id, templateId: template.id, kind, label: id, base: { assetId: `base-${id}` }, output: { width: 800, height: 800 }, ...(prepared && { artworkQuad: quad }),
  });
  const scenes = [scene('flat', 'flat'), scene('table', 'table'), scene('wall', 'wall')];

  // A fake renderer that records exactly what it was asked to draw.
  const recorder = () => {
    const seen: Array<{ sceneId: string; slots: Record<string, string>; text: string | undefined; fingerprint: string }> = [];
    const renderer: MockupRenderer = {
      name: 'recorder',
      supports: () => true,
      async render(req) {
        seen.push({ sceneId: req.scene.id, slots: Object.fromEntries(Object.entries(req.state.slots).map(([k, v]) => [k, v.assetId])), text: req.state.texts.name?.value, fingerprint: req.fingerprint });
        return { status: 'ok', sceneId: req.scene.id, fingerprint: req.fingerprint, imageUrl: `mock://${req.scene.id}/${req.fingerprint}`, renderer: 'recorder' };
      },
    };
    return { renderer, seen };
  };

  const base = () => setText(setSlotPhoto(createEmptyState(template.id, template.version), 'photo_01', { assetId: 'up_1', width: 4000, height: 3000 }), 'name', { value: 'Asha' });

  it('flat, table and wall all receive the SAME photos, crop and text', async () => {
    const { renderer, seen } = recorder();
    const results = await renderAllScenes([renderer], template, base(), scenes);
    expect(results.every((r) => r.status === 'ok')).toBe(true);
    expect(seen).toHaveLength(3);
    expect(new Set(seen.map((s) => JSON.stringify([s.slots, s.text, s.fingerprint]))).size).toBe(1);
  });

  it('changing the photo, the crop or the text updates EVERY scene (new fingerprint everywhere)', async () => {
    const original = base();
    const edits = [
      setSlotPhoto(original, 'photo_01', { assetId: 'up_2', width: 4000, height: 3000 }),
      setSlotTransform(original, 'photo_01', { scale: 2, offsetX: 0.05, offsetY: 0 }, 1.18),
      setText(original, 'name', { value: 'Ravi' }),
    ];
    const before = await renderAllScenes([recorder().renderer], template, original, scenes);
    for (const edited of edits) {
      const { renderer, seen } = recorder();
      const after = await renderAllScenes([renderer], template, edited, scenes);
      expect(seen).toHaveLength(3);
      for (let i = 0; i < scenes.length; i++) {
        expect(after[i].fingerprint).not.toBe(before[i].fingerprint);
        expect(after[i].sceneId).toBe(before[i].sceneId);
      }
      expect(new Set(after.map((r) => r.fingerprint)).size).toBe(1); // still one shared state
    }
  });

  it('does NOT fake an unprepared scene: it reports why and falls back, while prepared scenes still render', async () => {
    const { renderer, seen } = recorder();
    const results = await renderAllScenes([renderer], template, base(), [scene('flat', 'flat'), scene('table-jpeg', 'table', false)]);
    expect(results[0].status).toBe('ok');
    expect(results[1]).toMatchObject({ status: 'fallback', sceneId: 'table-jpeg' });
    expect((results[1] as { reason: string }).reason).toMatch(/needs to be prepared/);
    expect(seen.map((s) => s.sceneId)).toEqual(['flat']); // the renderer was never asked to paste onto the flat JPEG
    expect(sceneReadiness(scene('x', 'table', false)).ready).toBe(false);
    expect(sceneReadiness(scene('x', 'table')).ready).toBe(true);
  });

  it('degrades a renderer failure to a fallback for that scene only (artwork stays available)', async () => {
    const flaky: MockupRenderer = {
      name: 'flaky',
      supports: () => true,
      async render(req) {
        if (req.scene.id === 'wall') throw new Error('renderer timed out');
        return { status: 'ok', sceneId: req.scene.id, fingerprint: req.fingerprint, imageUrl: 'ok', renderer: 'flaky' };
      },
    };
    const results = await renderAllScenes([flaky], template, base(), scenes);
    expect(results.map((r) => r.status)).toEqual(['ok', 'ok', 'fallback']);
    expect(results[2]).toMatchObject({ reason: 'renderer timed out', renderer: 'flaky' });
  });

  it('picks the first renderer that supports a scene (PSD renderer for scenes with a PSD, local otherwise)', async () => {
    const psd: MockupRenderer = { name: 'psd', supports: (s) => Boolean(s.psd), async render(r) { return { status: 'ok', sceneId: r.scene.id, fingerprint: r.fingerprint, imageUrl: 'psd', renderer: 'psd' }; } };
    const local: MockupRenderer = { name: 'local', supports: () => true, async render(r) { return { status: 'ok', sceneId: r.scene.id, fingerprint: r.fingerprint, imageUrl: 'local', renderer: 'local' }; } };
    const withPsd = { ...scene('wall', 'wall'), psd: { assetId: 'wall.psd' } };
    const results = await renderAllScenes([psd, local], template, base(), [withPsd, scene('flat', 'flat')]);
    expect(results.map((r) => (r.status === 'ok' ? r.renderer : 'x'))).toEqual(['psd', 'local']);
  });

  it('refuses to render a state that belongs to a different template or a scene of another template', () => {
    const other = createEmptyState(sixPhotoTemplate.id, 1);
    expect(() => buildMockupRequest(template, other, scenes[0])).toThrow(/does not belong/);
    expect(() => buildMockupRequest(template, base(), { ...scenes[0], templateId: 'other' })).toThrow(/different template/);
    expect(stateFingerprint(base())).toBe(stateFingerprint(base()));
  });
});
