import sharp, { type OverlayOptions } from 'sharp';
import {
  cropRectInOriginalPx,
  slotAspectRatio,
  slotRectPx,
  FONT_MAP,
  type PersonalizationState,
  type PersonalizationTemplate,
  type PhotoSlot,
} from '@bro-pics/shared';
import { renderSlotPhoto } from './render-slot';
import { buildTextZoneSvg } from './render-text';

/** Resolves an asset id (customer photo, template artwork, mask) to bytes. Injected so rendering is testable and storage-agnostic. */
export interface AssetLoader {
  load(assetId: string): Promise<Buffer>;
}

export class MissingAssetError extends Error {
  constructor(public readonly assetId: string, cause?: unknown) {
    super(`Asset "${assetId}" could not be loaded${cause instanceof Error ? `: ${cause.message}` : ''}`);
    this.name = 'MissingAssetError';
  }
}

export interface RenderTemplateInput {
  template: PersonalizationTemplate;
  state: PersonalizationState;
  assets: AssetLoader;
  /**
   * 1 = full print resolution (template.canvas px). Smaller values render the SAME
   * design smaller (previews, thumbnails, tests) — never a different layout.
   */
  scale?: number;
  /**
   * Include fixed layers marked `printed: false` (a physical wooden frame shown in
   * previews). False for the production print file, which must contain only what is
   * actually printed on the paper.
   */
  includeUnprinted?: boolean;
}

async function loadAsset(assets: AssetLoader, assetId: string): Promise<Buffer> {
  try {
    return await assets.load(assetId);
  } catch (err) {
    throw new MissingAssetError(assetId, err);
  }
}

/** White-on-transparent alpha mask for a slot's shape, at the slot's pixel size. null = no masking needed (plain rectangle). */
function shapeMaskSvg(slot: PhotoSlot, width: number, height: number): Buffer | null {
  const open = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  switch (slot.shape) {
    case 'rect':
    case 'mask':
      return null; // 'mask' is loaded from its asset by the caller
    case 'rounded': {
      const r = (slot.cornerRadius ?? 0.1) * Math.min(width, height);
      return Buffer.from(`${open}<rect width="${width}" height="${height}" rx="${r}" ry="${r}" fill="#fff"/></svg>`);
    }
    case 'ellipse':
      return Buffer.from(`${open}<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" fill="#fff"/></svg>`);
    case 'polygon': {
      const points = (slot.polygon ?? []).map((p) => `${p.x * width},${p.y * height}`).join(' ');
      return Buffer.from(`${open}<polygon points="${points}" fill="#fff"/></svg>`);
    }
  }
}

/**
 * Renders a personalization at print resolution from the SAME template + state the
 * browser preview and mockups use. Draws the layer stack bottom -> top:
 *   background colour -> fixed artwork -> photo slots (cropped, shaped, rotated)
 *   -> text, in exactly the order `template.layers` says.
 * Empty photo slots draw nothing (the completeness check, not the renderer,
 * decides whether an order may exist without them).
 */
export async function renderTemplate(input: RenderTemplateInput): Promise<Buffer> {
  const { template, state, assets } = input;
  const scale = input.scale ?? 1;
  const width = Math.max(1, Math.round(template.canvas.width * scale));
  const height = Math.max(1, Math.round(template.canvas.height * scale));

  if (state.templateId !== template.id || state.templateVersion !== template.version) {
    throw new Error(`State is for ${state.templateId}@v${state.templateVersion}, not ${template.id}@v${template.version}`);
  }

  const slotsById = new Map(template.photoSlots.map((s) => [s.id, s]));
  const textsById = new Map(template.textSlots.map((s) => [s.id, s]));
  const composites: OverlayOptions[] = [];

  for (const layer of template.layers) {
    if (layer.kind === 'fixed') {
      if (!layer.printed && !input.includeUnprinted) continue;
      const rect = slotRectPx(layer, width, height);
      const art = await sharp(await loadAsset(assets, layer.asset.assetId), { limitInputPixels: false })
        .resize(rect.width, rect.height, { fit: 'fill' })
        .png()
        .toBuffer();
      composites.push({ input: art, left: rect.x, top: rect.y });
      continue;
    }

    if (layer.kind === 'photoSlot') {
      const slot = slotsById.get(layer.slotId);
      const photo = state.slots[layer.slotId];
      if (!slot || !photo) continue;

      const rect = slotRectPx(slot, width, height);
      const aspect = slotAspectRatio(slot, template.canvas);
      const crop = cropRectInOriginalPx(photo.width, photo.height, photo.rotation, aspect, photo.transform);
      const maskBuffer =
        slot.shape === 'mask' && slot.mask ? await loadAsset(assets, slot.mask.assetId) : shapeMaskSvg(slot, rect.width, rect.height);

      let rendered = await renderSlotPhoto({
        photoBuffer: await loadAsset(assets, photo.assetId),
        cropRect: crop,
        rotationDeg: photo.rotation,
        targetWidthPx: rect.width,
        targetHeightPx: rect.height,
        maskBuffer,
      });

      let left = rect.x;
      let top = rect.y;
      if (slot.rotationDeg) {
        // A tilted slot: rotate the finished slot image about its centre onto a larger transparent canvas.
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        rendered = await sharp(rendered).rotate(slot.rotationDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
        const meta = await sharp(rendered).metadata();
        left = Math.round(cx - (meta.width ?? rect.width) / 2);
        top = Math.round(cy - (meta.height ?? rect.height) / 2);
      }
      composites.push({ input: rendered, left, top });
      continue;
    }

    // text
    const slot = textsById.get(layer.slotId);
    if (!slot) continue;
    const value = state.texts[layer.slotId]?.value ?? slot.defaultValue;
    if (!value.trim()) continue;
    const chosen = state.texts[layer.slotId];
    const svg = buildTextZoneSvg(
      {
        zoneRect: { x: slot.x, y: slot.y, width: slot.width, height: slot.height },
        align: slot.align,
        value,
        fontKeyOrCssVar: chosen?.fontFamily ?? slot.defaultFontFamily ?? FONT_MAP[0].key,
        color: chosen?.color ?? slot.defaultColor ?? '#000000',
        minFontSizePx: slot.minFontSizePx,
        maxFontSizePx: slot.maxFontSizePx,
      },
      width,
      height
    );
    composites.push({ input: svg, left: 0, top: 0 });
  }

  const bg = template.background?.color ?? '#ffffff';
  return sharp({ create: { width, height, channels: 4, background: bg } })
    .composite(composites)
    .png()
    .toBuffer();
}
