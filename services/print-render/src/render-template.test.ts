import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  createEmptyState, setSlotPhoto, setSlotTransform, setSlotRotation, setText, cropRectInOriginalPx, slotAspectRatio,
  PersonalizationTemplateSchema, type PersonalizationTemplate, type PersonalizationState,
} from '@bro-pics/shared';
import { renderTemplate, MissingAssetError, type AssetLoader } from './render-template';
// Synthetic templates live in shared's test fixtures (not part of its public API).
import {
  singlePhotoTemplate, threePhotoTemplate, sixPhotoTemplate, complexCollageTemplate, photoPlusTextTemplate,
} from '@bro-pics/shared/src/personalization/test-fixtures';

const solid = (r: number, g: number, b: number, w = 200, h = 200) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r, g, b } } }).png().toBuffer();

/** An asset store where each asset id maps to a solid colour — template art and customer photos alike. */
function loaderFor(colors: Record<string, [number, number, number]>): AssetLoader {
  return {
    async load(id) {
      const c = colors[id];
      if (!c) throw new Error('not found');
      return solid(c[0], c[1], c[2]);
    },
  };
}

async function px(buffer: Buffer, x: number, y: number): Promise<[number, number, number, number]> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}
const near = (a: number[], b: number[], tol = 6) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);

const SCALE = 0.1;
function fillAll(template: PersonalizationTemplate, palette: (i: number) => [number, number, number]) {
  let state = createEmptyState(template.id, template.version);
  const colors: Record<string, [number, number, number]> = {};
  template.layers.forEach((l) => {
    if (l.kind === 'fixed') colors[l.asset.assetId] = [250, 250, 250];
  });
  template.photoSlots.forEach((s, i) => {
    colors[`up_${i}`] = palette(i);
    state = setSlotPhoto(state, s.id, { assetId: `up_${i}`, width: 200, height: 200 });
  });
  return { state, colors };
}

describe('renderTemplate: every representative template renders its photos in the right slots', () => {
  it.each([
    ['single photo', singlePhotoTemplate],
    ['3-photo', threePhotoTemplate],
    ['6-photo', sixPhotoTemplate],
    ['29-slot hero collage', complexCollageTemplate],
  ])('%s: output has the template size and each slot centre shows ITS photo', async (_name, template) => {
    // Distinct, well-separated colours per slot so a swap/misplacement can't pass.
    const { state, colors } = fillAll(template, (i) => [(i * 53) % 256, (i * 97 + 40) % 256, (i * 29 + 120) % 256]);
    const out = await renderTemplate({ template, state, assets: loaderFor(colors), scale: SCALE });
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([Math.round(template.canvas.width * SCALE), Math.round(template.canvas.height * SCALE)]);

    const W = meta.width!, H = meta.height!;
    for (const [i, slot] of template.photoSlots.entries()) {
      const cx = Math.round((slot.x + slot.width / 2) * W);
      const cy = Math.round((slot.y + slot.height / 2) * H);
      expect(near(await px(out, cx, cy), colors[`up_${i}`])).toBe(true);
    }
  });

  it('leaves an empty slot showing the background, and still renders the filled ones', async () => {
    const { state, colors } = fillAll(threePhotoTemplate, () => [200, 20, 20]);
    delete state.slots.photo_02;
    const out = await renderTemplate({ template: threePhotoTemplate, state, assets: loaderFor(colors), scale: SCALE });
    const W = Math.round(threePhotoTemplate.canvas.width * SCALE), H = Math.round(threePhotoTemplate.canvas.height * SCALE);
    const mid = threePhotoTemplate.photoSlots[1];
    expect(near(await px(out, Math.round((mid.x + mid.width / 2) * W), Math.round((mid.y + mid.height / 2) * H)), [250, 250, 250])).toBe(true);
    const first = threePhotoTemplate.photoSlots[0];
    expect(near(await px(out, Math.round((first.x + first.width / 2) * W), Math.round((first.y + first.height / 2) * H)), [200, 20, 20])).toBe(true);
  });
});

describe('renderTemplate: layers', () => {
  const withLayers = (frameId: string, printed: boolean): PersonalizationTemplate =>
    PersonalizationTemplateSchema.parse({
      ...singlePhotoTemplate,
      layers: [
        { kind: 'fixed', id: 'bg', role: 'background', asset: { assetId: 'bg' }, printed: true },
        { kind: 'photoSlot', slotId: 'photo_01' },
        { kind: 'fixed', id: 'frame', role: 'frame', asset: { assetId: frameId }, x: 0, y: 0, width: 1, height: 1, printed },
      ],
    });

  it('a PRINTED layer above the photos covers them (paint order follows template.layers)', async () => {
    const t = withLayers('frame', true);
    const { state } = fillAll(t, () => [10, 200, 10]);
    const out = await renderTemplate({ template: t, state, assets: loaderFor({ bg: [250, 250, 250], frame: [0, 0, 255], up_0: [10, 200, 10] }), scale: SCALE });
    expect(near(await px(out, 120, 180), [0, 0, 255])).toBe(true);
  });

  it('an UNPRINTED (preview-only) layer is left out of the print file by default, and included for previews', async () => {
    const t = withLayers('frame', false);
    const { state } = fillAll(t, () => [10, 200, 10]);
    const assets = loaderFor({ bg: [250, 250, 250], frame: [0, 0, 255], up_0: [10, 200, 10] });
    const print = await renderTemplate({ template: t, state, assets, scale: SCALE });
    const preview = await renderTemplate({ template: t, state, assets, scale: SCALE, includeUnprinted: true });
    expect(near(await px(print, 120, 180), [10, 200, 10])).toBe(true);
    expect(near(await px(preview, 120, 180), [0, 0, 255])).toBe(true);
  });

  it('paints a solid background colour when there is no background artwork', async () => {
    const t = PersonalizationTemplateSchema.parse({ ...singlePhotoTemplate, background: { type: 'color', color: '#ff00ff' }, layers: [{ kind: 'photoSlot', slotId: 'photo_01' }] });
    const out = await renderTemplate({ template: t, state: createEmptyState(t.id, t.version), assets: loaderFor({}), scale: SCALE });
    expect(near(await px(out, 2, 2), [255, 0, 255])).toBe(true);
  });
});

describe('renderTemplate: slot shapes', () => {
  const shaped = (slot: Record<string, unknown>): PersonalizationTemplate =>
    PersonalizationTemplateSchema.parse({
      ...singlePhotoTemplate,
      photoSlots: [{ ...singlePhotoTemplate.photoSlots[0], x: 0.1, y: 0.1, width: 0.8, height: 0.8, ...slot }],
      layers: [{ kind: 'photoSlot', slotId: 'photo_01' }],
      background: { type: 'color', color: '#ffffff' },
    });
  const render = async (t: PersonalizationTemplate) => {
    const state = setSlotPhoto(createEmptyState(t.id, t.version), 'photo_01', { assetId: 'up', width: 200, height: 200 });
    return renderTemplate({ template: t, state, assets: loaderFor({ up: [220, 30, 30] }), scale: 0.1 });
  };
  const slotCorner = (W: number, H: number) => [Math.round(0.1 * W) + 2, Math.round(0.1 * H) + 2] as const;

  it('ellipse: centre shows the photo, bounding-box corner shows the background', async () => {
    const out = await render(shaped({ shape: 'ellipse' }));
    expect(near(await px(out, 120, 180), [220, 30, 30])).toBe(true);
    const [x, y] = slotCorner(240, 360);
    expect(near(await px(out, x, y), [255, 255, 255])).toBe(true);
  });

  it('rounded rectangle: corner is cut away, edge midpoint is kept', async () => {
    const out = await render(shaped({ shape: 'rounded', cornerRadius: 0.4 }));
    const [x, y] = slotCorner(240, 360);
    expect(near(await px(out, x, y), [255, 255, 255])).toBe(true);
    expect(near(await px(out, 120, Math.round(0.1 * 360) + 2), [220, 30, 30])).toBe(true);
  });

  it('polygon (a diamond): centre kept, corners cut', async () => {
    const out = await render(shaped({ shape: 'polygon', polygon: [{ x: 0.5, y: 0 }, { x: 1, y: 0.5 }, { x: 0.5, y: 1 }, { x: 0, y: 0.5 }] }));
    expect(near(await px(out, 120, 180), [220, 30, 30])).toBe(true);
    const [x, y] = slotCorner(240, 360);
    expect(near(await px(out, x, y), [255, 255, 255])).toBe(true);
  });

  it('custom alpha mask asset: only the masked area shows the photo', async () => {
    const maskPng = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp({ create: { width: 50, height: 100, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer(), left: 0, top: 0 }])
      .png().toBuffer();
    const t = shaped({ shape: 'mask', mask: { assetId: 'mask1' } });
    const state = setSlotPhoto(createEmptyState(t.id, t.version), 'photo_01', { assetId: 'up', width: 200, height: 200 });
    const assets: AssetLoader = { async load(id) { if (id === 'mask1') return maskPng; if (id === 'up') return solid(220, 30, 30); throw new Error('nope'); } };
    const out = await renderTemplate({ template: t, state, assets, scale: 0.1 });
    expect(near(await px(out, 60, 180), [220, 30, 30])).toBe(true);
    expect(near(await px(out, 190, 180), [255, 255, 255])).toBe(true);
  });

  it('a tilted slot keeps its centre and rotates its corners out of the old bounding box', async () => {
    const out = await render(shaped({ rotationDeg: 45, x: 0.3, y: 0.3, width: 0.4, height: 0.3 }));
    expect(near(await px(out, 120, 180), [220, 30, 30])).toBe(true);
    expect(near(await px(out, Math.round(0.3 * 240) + 1, Math.round(0.3 * 360) + 1), [255, 255, 255])).toBe(true);
  });
});

describe('renderTemplate: crop and rotation reach the printed pixels', () => {
  const coordinatePhoto = async (w: number, h: number) => {
    const raw = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 3; raw[i] = Math.round((x / (w - 1)) * 255); raw[i + 1] = Math.round((y / (h - 1)) * 255); }
    return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
  };

  it.each([0, 90, 180, 270] as const)('a zoomed, panned photo at %i° prints the region the engine says is visible', async (rotation) => {
    const t = singlePhotoTemplate;
    const slot = t.photoSlots[0];
    const aspect = slotAspectRatio(slot, t.canvas);
    let state = setSlotPhoto(createEmptyState(t.id, t.version), slot.id, { assetId: 'up', width: 600, height: 400 });
    state = setSlotRotation(state, slot.id, rotation);
    state = setSlotTransform(state, slot.id, { scale: 2, offsetX: 0.1, offsetY: -0.05 }, aspect);
    const photo = await coordinatePhoto(600, 400);
    const assets: AssetLoader = { async load(id) { if (id === 'up') return photo; return solid(250, 250, 250); } };
    const out = await renderTemplate({ template: t, state, assets, scale: 0.1 });

    const p = state.slots[slot.id];
    const crop = cropRectInOriginalPx(p.width, p.height, p.rotation, aspect, p.transform);
    const [r, g] = await px(out, 120, 180);
    expect(Math.abs((r / 255) * 599 - (crop.x + crop.width / 2))).toBeLessThan(600 * 0.02);
    expect(Math.abs((g / 255) * 399 - (crop.y + crop.height / 2))).toBeLessThan(400 * 0.02);
  });
});

describe('renderTemplate: text and errors', () => {
  it('draws a text slot (text pixels appear inside the zone, nothing outside it)', async () => {
    const t = photoPlusTextTemplate;
    let state = setSlotPhoto(createEmptyState(t.id, t.version), 'photo_01', { assetId: 'up', width: 200, height: 200 });
    state = setText(state, 'name', { value: 'Asha & Ravi', color: '#000000' });
    const colors = { 'bg-names-8x10': [255, 255, 255] as [number, number, number], up: [255, 255, 255] as [number, number, number] };
    const out = await renderTemplate({ template: t, state, assets: loaderFor(colors), scale: 0.2 });
    const { data, info } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const zone = t.textSlots[0];
    let darkInside = 0, darkOutside = 0;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      if (data[i] < 100 && data[i + 1] < 100 && data[i + 2] < 100) {
        const fx = x / info.width, fy = y / info.height;
        if (fx >= zone.x && fx <= zone.x + zone.width && fy >= zone.y && fy <= zone.y + zone.height) darkInside++; else darkOutside++;
      }
    }
    expect(darkInside).toBeGreaterThan(20);
    expect(darkOutside).toBe(0);
  });

  it('fails with a clear MissingAssetError naming the asset when a photo cannot be loaded', async () => {
    const t = singlePhotoTemplate;
    const state = setSlotPhoto(createEmptyState(t.id, t.version), 'photo_01', { assetId: 'up_gone', width: 200, height: 200 });
    const assets = loaderFor({ 'bg-single-8x12': [255, 255, 255] });
    await expect(renderTemplate({ template: t, state, assets, scale: 0.1 })).rejects.toThrow(MissingAssetError);
    await expect(renderTemplate({ template: t, state, assets, scale: 0.1 })).rejects.toThrow(/up_gone/);
  });

  it('refuses a state made for a different template or version (an old order is never rendered with the wrong template)', async () => {
    const state: PersonalizationState = createEmptyState(singlePhotoTemplate.id, 2);
    await expect(renderTemplate({ template: singlePhotoTemplate, state, assets: loaderFor({}), scale: 0.1 })).rejects.toThrow(/not single-8x12@v1/);
  });
});
