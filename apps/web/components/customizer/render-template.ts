import {
  FONT_MAP,
  estimateTextWidth,
  fitTextToZone,
  fontKeyFromCssVar,
  slotAspectRatio,
  slotBoxPx,
  visibleRegion,
  type AssetRef,
  type PersonalizationState,
  type PersonalizationTemplate,
  type PhotoSlot,
  type SlotPhoto,
  type TextSlot,
} from '@bro-pics/shared';

/**
 * Draws a v2 template + the customer's state onto a 2D canvas, following the
 * same rules as the print renderer (services/print-render/src/render-template.ts):
 * the layer stack bottom→top, each photo cropped to `visibleRegion`, rotated
 * in 90° steps, shaped by the slot (rounded/ellipse/polygon/mask) and then
 * tilted with the slot; text sized and wrapped with the print renderer's own
 * width estimate at the same 400px-based font sizes. What the customer sees is
 * what gets printed.
 */

export interface RenderInput {
  template: PersonalizationTemplate;
  state: PersonalizationState;
  /** Target canvas size in pixels (same aspect ratio as the template canvas). */
  width: number;
  height: number;
  getImage: (src: string) => CanvasImageSource | undefined;
  assetSrc: (ref: AssetRef) => string | null;
  /** Where a slot's photo is drawn from (a blob: URL), or null while it is not available yet. */
  photoSrc: (slotId: string, photo: SlotPhoto) => string | null;
  /** Canvas font-family for a stored font key. */
  fontFamily: (fontKey: string) => string;
  /** 'editor' draws empty-slot placeholders, text hints and the selection outline; 'export' draws only the design. */
  mode: 'editor' | 'export';
  /** Show preview-only layers (a physical frame that is not printed). */
  includeUnprinted: boolean;
  activeSlotId?: string | null;
  /** Reused offscreen slot images between frames, so a drag only redraws the slot being moved. */
  slotCache?: Map<string, { key: string; canvas: HTMLCanvasElement }>;
  createCanvas?: (width: number, height: number) => HTMLCanvasElement;
}

export interface RenderResult {
  /** Images the design needs that were not loaded, so they could not be drawn. */
  missing: string[];
}

export type Matrix2D = [a: number, b: number, c: number, d: number, e: number, f: number];

const PLACEHOLDER_FILL = '#ece6dd';
const PLACEHOLDER_INK = 'rgba(43,36,32,0.55)';
const SELECTION = '#c9861a';

function defaultCreateCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

/**
 * Affine matrix (canvas `setTransform` order) that maps ORIGINAL photo pixels
 * to the slot's own pixels (0,0)-(slotWidthPx, slotWidthPx / aspect): rotate
 * clockwise by `photo.rotation` (the same mapping as `rectToRotatedSpace`),
 * then show exactly `visibleRegion` across the slot.
 */
export function photoToSlotMatrix(
  photo: Pick<SlotPhoto, 'width' | 'height' | 'rotation' | 'transform'>,
  slotAspect: number,
  slotWidthPx: number
): Matrix2D {
  const W = photo.width;
  const H = photo.height;
  // original (x, y) -> rotated (a x + c y + e, b x + d y + f)
  let r: Matrix2D;
  switch (photo.rotation) {
    case 90:
      r = [0, 1, -1, 0, H, 0];
      break;
    case 180:
      r = [-1, 0, 0, -1, W, H];
      break;
    case 270:
      r = [0, -1, 1, 0, 0, W];
      break;
    default:
      r = [1, 0, 0, 1, 0, 0];
  }
  const region = visibleRegion(W, H, photo.rotation, slotAspect, photo.transform);
  const k = slotWidthPx / region.width;
  return [k * r[0], k * r[1], k * r[2], k * r[3], k * (r[4] - region.x), k * (r[5] - region.y)];
}

/** Traces the slot's shape as a path in the box (ox,oy)-(ox+w,oy+h). */
export function traceSlotShape(
  ctx: CanvasRenderingContext2D,
  slot: Pick<PhotoSlot, 'shape' | 'cornerRadius' | 'polygon'>,
  w: number,
  h: number,
  ox = 0,
  oy = 0
): void {
  ctx.beginPath();
  switch (slot.shape) {
    case 'ellipse':
      ctx.ellipse(ox + w / 2, oy + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
      break;
    case 'rounded': {
      const r = Math.min((slot.cornerRadius ?? 0.1) * Math.min(w, h), w / 2, h / 2);
      ctx.moveTo(ox + r, oy);
      ctx.lineTo(ox + w - r, oy);
      ctx.arcTo(ox + w, oy, ox + w, oy + r, r);
      ctx.lineTo(ox + w, oy + h - r);
      ctx.arcTo(ox + w, oy + h, ox + w - r, oy + h, r);
      ctx.lineTo(ox + r, oy + h);
      ctx.arcTo(ox, oy + h, ox, oy + h - r, r);
      ctx.lineTo(ox, oy + r);
      ctx.arcTo(ox, oy, ox + r, oy, r);
      ctx.closePath();
      break;
    }
    case 'polygon':
      if (slot.polygon && slot.polygon.length >= 3) {
        slot.polygon.forEach((p, i) => (i === 0 ? ctx.moveTo(ox + p.x * w, oy + p.y * h) : ctx.lineTo(ox + p.x * w, oy + p.y * h)));
        ctx.closePath();
        break;
      }
      ctx.rect(ox, oy, w, h);
      break;
    default:
      ctx.rect(ox, oy, w, h);
  }
}

function applyShapeMask(ctx: CanvasRenderingContext2D, slot: PhotoSlot, w: number, h: number, maskImg: CanvasImageSource | undefined): void {
  if (slot.shape === 'rect' || (slot.shape === 'mask' && !maskImg)) return;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  if (slot.shape === 'mask' && maskImg) {
    ctx.drawImage(maskImg, 0, 0, w, h);
  } else {
    traceSlotShape(ctx, slot, w, h);
    ctx.fillStyle = '#000';
    ctx.fill();
  }
  ctx.restore();
}

function drawPlaceholder(ctx: CanvasRenderingContext2D, slot: PhotoSlot, w: number, h: number, loading: boolean): void {
  ctx.save();
  traceSlotShape(ctx, slot, w, h);
  ctx.fillStyle = PLACEHOLDER_FILL;
  ctx.fill();
  ctx.clip();
  const s = Math.min(w, h);
  const cx = w / 2;
  const showLabel = s > 90;
  const labelSize = Math.max(10, Math.min(18, s * 0.075));
  ctx.fillStyle = PLACEHOLDER_INK;
  ctx.strokeStyle = PLACEHOLDER_INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (loading) {
    ctx.font = `600 ${labelSize}px system-ui, -apple-system, sans-serif`;
    ctx.fillText('Loading photo…', cx, h / 2, w * 0.9);
    ctx.restore();
    return;
  }
  // A plus mark and the slot's name, sized to the slot.
  const icon = Math.max(10, s * 0.16);
  const cy = h / 2 - (showLabel ? icon * 0.35 : 0);
  ctx.lineWidth = Math.max(1.5, icon * 0.09);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - icon / 2, cy);
  ctx.lineTo(cx + icon / 2, cy);
  ctx.moveTo(cx, cy - icon / 2);
  ctx.lineTo(cx, cy + icon / 2);
  ctx.stroke();
  if (showLabel) {
    ctx.font = `600 ${labelSize}px system-ui, -apple-system, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(slot.label, cx, cy + icon * 0.75, w * 0.9);
  }
  ctx.restore();
}

function slotContent(input: RenderInput, slot: PhotoSlot, w: number, h: number, missing: string[]): HTMLCanvasElement | null {
  const photo = input.state.slots[slot.id];
  const create = input.createCanvas ?? defaultCreateCanvas;
  const cw = Math.max(1, Math.ceil(w));
  const ch = Math.max(1, Math.ceil(h));
  const src = photo ? input.photoSrc(slot.id, photo) : null;
  const img = src ? input.getImage(src) : undefined;
  const maskSrc = slot.shape === 'mask' && slot.mask ? input.assetSrc(slot.mask) : null;
  const maskImg = maskSrc ? input.getImage(maskSrc) : undefined;
  if (photo && !img) missing.push(src ?? `photo:${slot.id}`);
  if (maskSrc && !maskImg) missing.push(maskSrc);

  if (!photo || !img) {
    if (input.mode !== 'editor') return null;
    const key = ['empty', cw, ch, slot.label, slot.shape, slot.cornerRadius ?? '', JSON.stringify(slot.polygon ?? ''), photo ? 'loading' : ''].join('|');
    const cached = input.slotCache?.get(slot.id);
    if (cached && cached.key === key) return cached.canvas;
    const canvas = create(cw, ch);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    drawPlaceholder(ctx, slot, cw, ch, Boolean(photo));
    input.slotCache?.set(slot.id, { key, canvas });
    return canvas;
  }

  const t = photo.transform;
  const key = [cw, ch, src, photo.width, photo.height, photo.rotation, t.scale, t.offsetX, t.offsetY, slot.shape, slot.cornerRadius ?? '', JSON.stringify(slot.polygon ?? ''), maskImg ? maskSrc : ''].join('|');
  const cached = input.slotCache?.get(slot.id);
  if (cached && cached.key === key) return cached.canvas;
  const canvas = cached && cached.canvas.width === cw && cached.canvas.height === ch ? cached.canvas : create(cw, ch);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cw, ch);
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(...photoToSlotMatrix(photo, slotAspectRatio(slot, input.template.canvas), cw));
  // The source may be a downscaled copy; drawing it at the ORIGINAL size keeps the geometry exact.
  ctx.drawImage(img, 0, 0, photo.width, photo.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  applyShapeMask(ctx, slot, cw, ch, maskImg);
  input.slotCache?.set(slot.id, { key, canvas });
  return canvas;
}

export function fontKeyOf(value: string | undefined, fallback?: string): string {
  const raw = value ?? fallback ?? FONT_MAP[0].key;
  return fontKeyFromCssVar(raw) ?? raw;
}

function alignedX(slot: TextSlot, zone: { x: number; width: number }): number {
  if (slot.align === 'left') return zone.x;
  if (slot.align === 'right') return zone.x + zone.width;
  return zone.x + zone.width / 2;
}

function drawTextSlot(ctx: CanvasRenderingContext2D, input: RenderInput, slot: TextSlot): void {
  const chosen = input.state.texts[slot.id];
  const value = chosen?.value ?? slot.defaultValue;
  const W = input.width;
  const H = input.height;
  const zone = { x: slot.x * W, y: slot.y * H, width: slot.width * W, height: slot.height * H };
  const family = input.fontFamily(fontKeyOf(chosen?.fontFamily, slot.defaultFontFamily));
  ctx.save();
  ctx.textAlign = slot.align === 'left' ? 'left' : slot.align === 'right' ? 'right' : 'center';

  if (!value.trim()) {
    if (input.mode === 'editor') {
      ctx.fillStyle = 'rgba(43,36,32,0.32)';
      const size = Math.max(10, Math.min(zone.height * 0.55, 28 * (W / 400)));
      ctx.font = `italic ${size}px ${family}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(slot.label, alignedX(slot, zone), zone.y + zone.height / 2, zone.width);
    }
    ctx.restore();
    return;
  }

  // Same numbers as services/print-render/src/render-text.ts: sizes authored
  // against a 400px-wide editor, the shared width estimate, 1.2 line height and
  // an alphabetic baseline one font-size below the centred block's top.
  const scale = W / 400;
  const minFont = Math.max(1, (slot.minFontSizePx ?? 8) * scale);
  const maxFont = Math.max(minFont, (slot.maxFontSizePx ?? 32) * scale);
  const fit = fitTextToZone({
    text: value,
    zoneWidthPx: zone.width,
    zoneHeightPx: zone.height,
    minFontSizePx: minFont,
    maxFontSizePx: maxFont,
    measureTextWidth: estimateTextWidth,
  });
  if (fit.lines.length > 0) {
    ctx.fillStyle = chosen?.color ?? slot.defaultColor ?? '#000000';
    ctx.font = `${fit.fontSizePx}px ${family}`;
    ctx.textBaseline = 'alphabetic';
    const lineHeight = fit.fontSizePx * 1.2;
    const startY = zone.y + (zone.height - fit.lines.length * lineHeight) / 2 + fit.fontSizePx;
    const x = alignedX(slot, zone);
    fit.lines.forEach((line, i) => ctx.fillText(line, x, startY + i * lineHeight));
  }
  ctx.restore();
}

/** Every image a render of this design needs: fixed artwork, masks and photos. */
export function requiredImageSources(
  input: Pick<RenderInput, 'template' | 'state' | 'assetSrc' | 'photoSrc' | 'includeUnprinted'>
): { srcs: string[]; unresolvedPhotos: string[] } {
  const srcs: string[] = [];
  const unresolvedPhotos: string[] = [];
  for (const layer of input.template.layers) {
    if (layer.kind === 'fixed' && (layer.printed || input.includeUnprinted)) {
      const src = input.assetSrc(layer.asset);
      if (src) srcs.push(src);
    }
  }
  for (const slot of input.template.photoSlots) {
    if (slot.shape === 'mask' && slot.mask) {
      const src = input.assetSrc(slot.mask);
      if (src) srcs.push(src);
    }
    const photo = input.state.slots[slot.id];
    if (!photo) continue;
    const src = input.photoSrc(slot.id, photo);
    if (src) srcs.push(src);
    else unresolvedPhotos.push(slot.id);
  }
  return { srcs: [...new Set(srcs)], unresolvedPhotos };
}

export function renderTemplate(ctx: CanvasRenderingContext2D, input: RenderInput): RenderResult {
  const { template, width: W, height: H } = input;
  const slotsById = new Map(template.photoSlots.map((s) => [s.id, s]));
  const textsById = new Map(template.textSlots.map((s) => [s.id, s]));
  const missing: string[] = [];

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = template.background?.color ?? '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high';

  for (const layer of template.layers) {
    if (layer.kind === 'fixed') {
      if (!layer.printed && !input.includeUnprinted) continue;
      const src = input.assetSrc(layer.asset);
      const img = src ? input.getImage(src) : undefined;
      if (img) ctx.drawImage(img, layer.x * W, layer.y * H, layer.width * W, layer.height * H);
      else missing.push(src ?? `asset:${layer.asset.assetId}`);
      continue;
    }
    if (layer.kind === 'photoSlot') {
      const slot = slotsById.get(layer.slotId);
      if (!slot) continue;
      const box = slotBoxPx(slot, W, H);
      const content = slotContent(input, slot, box.width, box.height, missing);
      if (!content) continue;
      ctx.save();
      ctx.translate(box.cx, box.cy);
      if (box.rotationDeg) ctx.rotate((box.rotationDeg * Math.PI) / 180);
      ctx.drawImage(content, -box.width / 2, -box.height / 2, box.width, box.height);
      ctx.restore();
      continue;
    }
    const textSlot = textsById.get(layer.slotId);
    if (textSlot) drawTextSlot(ctx, input, textSlot);
  }

  if (input.mode === 'editor' && input.activeSlotId) {
    const slot = slotsById.get(input.activeSlotId);
    if (slot) {
      const box = slotBoxPx(slot, W, H);
      ctx.save();
      ctx.translate(box.cx, box.cy);
      if (box.rotationDeg) ctx.rotate((box.rotationDeg * Math.PI) / 180);
      const lw = Math.max(2, W / 320);
      traceSlotShape(ctx, slot, box.width, box.height, -box.width / 2, -box.height / 2);
      ctx.lineWidth = lw * 2.2;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.stroke();
      ctx.setLineDash([lw * 4, lw * 3]);
      ctx.lineWidth = lw;
      ctx.strokeStyle = SELECTION;
      ctx.stroke();
      ctx.restore();
    }
  }
  ctx.restore();
  return { missing };
}

/** Template size scaled so its longer side is `maxSide`. */
export function fitTemplateSize(template: Pick<PersonalizationTemplate, 'canvas'>, maxSide: number): { width: number; height: number } {
  const { width, height } = template.canvas;
  const k = maxSide / Math.max(width, height);
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/**
 * Renders the finished design (no editor marks) to a data URL, e.g. for the
 * room preview and the cart thumbnail. Returns null rather than an incomplete
 * picture when any image it needs is not loaded, or the canvas can't be exported.
 */
export function renderToDataUrl(
  input: Omit<RenderInput, 'width' | 'height' | 'mode' | 'activeSlotId' | 'slotCache'>,
  maxSide: number,
  type: 'image/jpeg' | 'image/png' = 'image/jpeg',
  quality = 0.9
): string | null {
  const { width, height } = fitTemplateSize(input.template, maxSide);
  const canvas = (input.createCanvas ?? defaultCreateCanvas)(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const { missing } = renderTemplate(ctx, { ...input, width, height, mode: 'export' });
  if (missing.length > 0) return null;
  try {
    return canvas.toDataURL(type, quality);
  } catch {
    // A tainted canvas (an image served without CORS) can't be exported.
    return null;
  }
}
