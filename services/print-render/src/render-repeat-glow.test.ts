import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { createEmptyState, setSlotPhoto, repeatPhotosIntoEmpty } from '@bro-pics/shared';
import { renderTemplate, type AssetLoader } from './render-template';
import { buildTextZoneSvg } from './render-text';
import { sixPhotoTemplate } from '@bro-pics/shared/src/personalization/test-fixtures';

const solid = (r: number, g: number, b: number) => sharp({ create: { width: 200, height: 200, channels: 3, background: { r, g, b } } }).png().toBuffer();
const colors: Record<string, [number, number, number]> = { a: [220, 30, 30], b: [30, 30, 220] };
const assets: AssetLoader = {
  async load(id) {
    const c = colors[id] ?? [250, 250, 250];
    return solid(c[0], c[1], c[2]);
  },
};
async function px(buffer: Buffer, x: number, y: number): Promise<number[]> {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

describe('mosaic that fills by repeating (template.repeatToFill)', () => {
  const template = { ...sixPhotoTemplate, repeatToFill: true, photoSlots: sixPhotoTemplate.photoSlots.map((s) => ({ ...s, required: false })) };
  let state = createEmptyState(template.id, template.version);
  state = setSlotPhoto(state, template.photoSlots[0].id, { assetId: 'a', width: 200, height: 200 });
  state = setSlotPhoto(state, template.photoSlots[1].id, { assetId: 'b', width: 200, height: 200 });

  it('prints every empty space with one of the customer photos, the same ones the preview chooses', async () => {
    const out = await renderTemplate({ template, state, assets, scale: 0.1 });
    const W = Math.round(template.canvas.width * 0.1);
    const H = Math.round(template.canvas.height * 0.1);
    const expected = repeatPhotosIntoEmpty(template, state).state.slots;
    for (const slot of template.photoSlots) {
      const c = await px(out, Math.round((slot.x + slot.width / 2) * W), Math.round((slot.y + slot.height / 2) * H));
      const want = colors[expected[slot.id]!.assetId];
      expect(c.every((v, i) => Math.abs(v - want[i]) < 8)).toBe(true);
    }
  });

  it('without the flag, empty spaces stay empty', async () => {
    const out = await renderTemplate({ template: { ...template, repeatToFill: undefined }, state, assets, scale: 0.1 });
    const slot = template.photoSlots[5];
    const W = Math.round(template.canvas.width * 0.1);
    const H = Math.round(template.canvas.height * 0.1);
    const c = await px(out, Math.round((slot.x + slot.width / 2) * W), Math.round((slot.y + slot.height / 2) * H));
    expect(Object.values(colors).some((want) => c.every((v, i) => Math.abs(v - want[i]) < 8))).toBe(false);
  });
});

describe('glowing text', () => {
  const field = { zoneRect: { x: 0.1, y: 0.4, width: 0.8, height: 0.2 }, align: 'center' as const, value: 'Happy Wedding', fontKeyOrCssVar: 'sacramento', color: '#ffffff' };
  it('draws a blurred copy in the glow colour under the letters (blur at half the canvas shadowBlur, as in the browser)', () => {
    const svg = buildTextZoneSvg({ ...field, glow: { color: '#fff3d6', blurPx: 30 } }, 1200, 1800).toString();
    expect(svg).toContain('stdDeviation="15.00"');
    expect(svg).toContain('flood-color="#fff3d6"');
    expect(svg.indexOf('filter="url(#glow)"')).toBeLessThan(svg.lastIndexOf('<text'));
  });
  it('no glow, no filter', () => {
    expect(buildTextZoneSvg(field, 1200, 1800).toString()).not.toContain('filter');
  });
});
