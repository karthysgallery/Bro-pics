import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import {
  createEmptyState, setSlotPhoto, setSlotTransform, renderAllScenes, stateFingerprint, buildMockupRequest,
  type MockupScene, type PersonalizationTemplate,
} from '@bro-pics/shared';
import { singlePhotoTemplate, threePhotoTemplate } from '@bro-pics/shared/src/personalization/test-fixtures';
import { LocalMockupRenderer } from './local-mockup-renderer';
import type { AssetLoader } from './render-template';

const solid = (r: number, g: number, b: number, w = 200, h = 200, alpha = 1) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r, g, b, alpha } } }).png().toBuffer();
const px = async (buf: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
};
const near = (a: number[], b: number[], tol = 14) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);

function harness(colors: Record<string, [number, number, number]>, fg?: Buffer) {
  const saved = new Map<string, Buffer>();
  const assets: AssetLoader = {
    async load(id) {
      if (id === 'scene-fg' && fg) return fg;
      const c = colors[id];
      if (!c) throw new Error('not found');
      return solid(c[0], c[1], c[2]);
    },
  };
  const renderer = new LocalMockupRenderer({ assets, saveImage: async (buf, key) => { saved.set(key, buf); return `mock://${key}`; }, artworkMaxPx: 300 });
  return { renderer, saved };
}

const quad = [{ x: 0.25, y: 0.2 }, { x: 0.75, y: 0.25 }, { x: 0.72, y: 0.8 }, { x: 0.28, y: 0.78 }] as MockupScene['artworkQuad'];
const scene = (over: Partial<MockupScene> = {}): MockupScene => ({
  id: 'wall', templateId: singlePhotoTemplate.id, kind: 'wall', label: 'Wall', base: { assetId: 'scene-base' }, artworkQuad: quad, output: { width: 400, height: 400 }, ...over,
});
const stateWith = (t: PersonalizationTemplate, asset = 'photo-red') => setSlotPhoto(createEmptyState(t.id, t.version), 'photo_01', { assetId: asset, width: 300, height: 300 });
const colors = { 'scene-base': [30, 60, 200] as [number, number, number], 'photo-red': [220, 20, 20] as [number, number, number], 'photo-green': [20, 200, 20] as [number, number, number], 'bg-single-8x12': [250, 250, 250] as [number, number, number] };

describe('LocalMockupRenderer', () => {
  it('composites base → warped artwork: artwork inside the quad, scene base outside it', async () => {
    const { renderer, saved } = harness(colors);
    const req = buildMockupRequest(singlePhotoTemplate, stateWith(singlePhotoTemplate), scene());
    const result = await renderer.render(req);
    expect(result.status).toBe('ok');
    const image = [...saved.values()][0];
    expect(near(await px(image, 200, 210), [220, 20, 20])).toBe(true); // centre of the quad: customer's photo (slot is inset in the artwork, so allow for the template's own background)
    expect(near(await px(image, 10, 10), [30, 60, 200])).toBe(true); // outside: the scene base
    const meta = await sharp(image).metadata();
    expect([meta.width, meta.height]).toEqual([400, 400]);
  });

  it('puts the scene FOREGROUND (frame/glass/shadow) on top of the artwork', async () => {
    const fg = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await solid(255, 255, 0, 200, 20), left: 0, top: 90 }]) // a yellow bar across the middle
      .png().toBuffer();
    const { renderer, saved } = harness(colors, fg);
    await renderer.render(buildMockupRequest(singlePhotoTemplate, stateWith(singlePhotoTemplate), scene({ foreground: { assetId: 'scene-fg' } })));
    const image = [...saved.values()][0];
    expect(near(await px(image, 200, 200), [255, 255, 0])).toBe(true); // bar over the artwork
    expect(near(await px(image, 200, 130), [220, 20, 20]) || near(await px(image, 200, 130), [250, 250, 250])).toBe(true); // artwork still visible above it
  });

  it('shows a different customer photo when the state changes (same scene, new picture)', async () => {
    const { renderer, saved } = harness(colors);
    await renderer.render(buildMockupRequest(singlePhotoTemplate, stateWith(singlePhotoTemplate, 'photo-red'), scene()));
    await renderer.render(buildMockupRequest(singlePhotoTemplate, stateWith(singlePhotoTemplate, 'photo-green'), scene()));
    expect(saved.size).toBe(2);
    const [a, b] = [...saved.values()];
    expect(near(await px(a, 200, 210), [220, 20, 20])).toBe(true);
    expect(near(await px(b, 200, 210), [20, 200, 20])).toBe(true);
  });

  it('keys its output by scene + state fingerprint (so identical states are cache hits)', async () => {
    const { renderer, saved } = harness(colors);
    const state = stateWith(singlePhotoTemplate);
    await renderer.render(buildMockupRequest(singlePhotoTemplate, state, scene()));
    expect([...saved.keys()][0]).toBe(`single-8x12/wall/${stateFingerprint(state)}.png`);
  });

  it('returns a cached image without rendering when findCached has it', async () => {
    const load = vi.fn();
    const renderer = new LocalMockupRenderer({ assets: { load }, saveImage: vi.fn(), findCached: async () => 'mock://cached.png' });
    const result = await renderer.render(buildMockupRequest(singlePhotoTemplate, stateWith(singlePhotoTemplate), scene()));
    expect(result).toMatchObject({ status: 'ok', imageUrl: 'mock://cached.png' });
    expect(load).not.toHaveBeenCalled();
  });

  it('plugs into renderAllScenes: prepared scenes render, an unprepared JPEG scene is reported — not faked', async () => {
    const { renderer, saved } = harness(colors);
    const scenes = [scene({ id: 'flat', kind: 'flat' }), scene({ id: 'table-jpeg', kind: 'table', artworkQuad: undefined })];
    const results = await renderAllScenes([renderer], singlePhotoTemplate, stateWith(singlePhotoTemplate), scenes);
    expect(results[0].status).toBe('ok');
    expect(results[1]).toMatchObject({ status: 'fallback' });
    expect(saved.size).toBe(1);
    expect(renderer.supports(scenes[1])).toBe(false);
  });

  it('every scene of a design shows the same customer photo after an edit (flat/table/wall in sync)', async () => {
    const { renderer, saved } = harness(colors);
    const scenes = [scene({ id: 'flat', kind: 'flat' }), scene({ id: 'table', kind: 'table' }), scene({ id: 'wall' })];
    const edited = setSlotTransform(stateWith(singlePhotoTemplate, 'photo-green'), 'photo_01', { scale: 2, offsetX: 0, offsetY: 0 }, 1);
    const results = await renderAllScenes([renderer], singlePhotoTemplate, edited, scenes);
    expect(results.every((r) => r.status === 'ok')).toBe(true);
    for (const image of saved.values()) expect(near(await px(image, 200, 210), [20, 200, 20])).toBe(true);
    expect(new Set(results.map((r) => r.fingerprint)).size).toBe(1);
  });

  it('a missing scene asset degrades to a per-scene fallback via renderAllScenes (the artwork is not lost)', async () => {
    const noBase = new LocalMockupRenderer({ assets: { async load(id) { if (id === 'scene-base') throw new Error('gone'); return solid(250, 250, 250); } }, saveImage: async () => 'x', artworkMaxPx: 200 });
    const results = await renderAllScenes([noBase], threePhotoTemplate, createEmptyState(threePhotoTemplate.id, 1), [scene({ templateId: threePhotoTemplate.id })]);
    expect(results[0]).toMatchObject({ status: 'fallback', reason: 'gone' });
  });
});
