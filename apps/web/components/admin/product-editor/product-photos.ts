'use client';

import { DEFAULT_PREVIEW_SCENES, layoutFrameInScene, type PreviewScene } from '../../../lib/preview-scenes';
import { DISPLAY_FRAME, frameDesign, STOCK_FRAME, type FrameLook } from '../../customizer/frame-moulding';

/**
 * The shop photos every product gets automatically, drawn in the browser
 * from the product's own picture and frame (the same frame drawing the shop's
 * live preview uses), so they always match what the customer will receive:
 *
 *   1. Framed      — the picture in the default frame on a clean background (the product's main photo:
 *                    the room previews cut the frame out of it, and Google Shopping wants a plain background)
 *   2. Styled      — the frame posed in a real setting (standing on a table, or hung on a wall): the shop card photo
 *   3. Styled      — the same frame in the other setting: shown when the card is hovered
 *   4. Sizes       — the frame with its measurements, and every size side by side to scale
 *   5. Frame       — a close-up of the moulding with its name, material, width and colour
 *   6. The picture — the print itself, unframed, to show its detail
 *   7. Glitter (only when the product offers it) — the same frame split down the middle: matte | glitter
 *
 * No text is printed over the pictures: product pages say they are example photos, and Google Shopping rejects
 * images with overlays.
 *
 * All are square (shop cards and Google Shopping are square).
 */

export const PHOTO_SIZE = 1600;

export interface PhotoFrameInfo {
  name: string;
  material: string;
  colour: string;
  colourHex: string;
  mouldingWidthIn: number;
  look: FrameLook | null;
}

export interface ProductPhotoInput {
  title: string;
  /** The picture: ready-made artwork, a sample photo, or a rendered collage. */
  pictureUrl: string;
  /** True when the picture is only an example (photo and collage frames). */
  isSample: boolean;
  /** The default frame first, then the other frames offered. */
  frames: PhotoFrameInfo[];
  /** Sizes sold, smallest first; the first is drawn in the framed photos. */
  sizes: Array<{ widthIn: number; heightIn: number }>;
  scene?: PreviewScene;
  /** Set when the product offers the glitter finish: adds the "Matte vs Glitter" photo. */
  glitter?: { extraPrice: number } | null;
}

export interface ProductPhoto {
  key: 'framed' | 'pose-1' | 'pose-2' | 'sizes' | 'frame' | 'picture' | 'glitter';
  label: string;
  alt: string;
  dataUrl: string;
  /** The shop card's picture (`listing`) and the one shown when the card is hovered (`listing-hover`). */
  role?: 'listing' | 'listing-hover';
}

const C = {
  paper: '#f7f3ec',
  paperDeep: '#ece4d6',
  ink: '#1a1712',
  muted: 'rgba(26,23,18,0.58)',
  line: 'rgba(26,23,18,0.16)',
  gold: '#c9861a',
};

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${src.slice(0, 80)}`));
    img.src = src;
  });
}

/** Cuts a picture to a print shape from the centre (what the print will show). */
export async function cropToShape(src: string, widthIn: number, heightIn: number, maxSide = 1400): Promise<string | null> {
  const img = await loadImage(src).catch(() => null);
  if (!img) return null;
  const target = widthIn / heightIn;
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (w / h > target) w = Math.round(h * target);
  else h = Math.round(w / target);
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d')?.drawImage(img, (img.naturalWidth - w) / 2, (img.naturalHeight - h) / 2, w, h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.92);
}

function fonts() {
  const body = typeof document !== 'undefined' ? getComputedStyle(document.body).fontFamily : 'sans-serif';
  const h1 = typeof document !== 'undefined' ? document.querySelector('h1') : null;
  const display = h1 ? getComputedStyle(h1).fontFamily : body;
  return { body: body || 'sans-serif', display: display || body || 'sans-serif' };
}

function square(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

/** Soft studio backdrop: warm paper with a gentle light from above. */
function backdrop(ctx: CanvasRenderingContext2D) {
  const g = ctx.createRadialGradient(PHOTO_SIZE / 2, PHOTO_SIZE * 0.38, PHOTO_SIZE * 0.1, PHOTO_SIZE / 2, PHOTO_SIZE / 2, PHOTO_SIZE * 0.78);
  g.addColorStop(0, '#fbf8f2');
  g.addColorStop(1, C.paperDeep);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
}

/** Draws an image fitted into a box (centred), with a soft drop shadow like a frame on a wall. */
function placeWithShadow(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, box: { x: number; y: number; w: number; h: number }, shadow = 1) {
  const k = Math.min(box.w / img.width, box.h / img.height);
  const w = img.width * k;
  const h = img.height * k;
  const x = box.x + (box.w - w) / 2;
  const y = box.y + (box.h - h) / 2;
  ctx.save();
  ctx.shadowColor = `rgba(30,20,8,${0.32 * shadow})`;
  ctx.shadowBlur = Math.max(w, h) * 0.05;
  ctx.shadowOffsetY = Math.max(w, h) * 0.025;
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
  return { x, y, w, h };
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, opts: { size: number; weight?: number; color?: string; align?: CanvasTextAlign; family?: string; maxWidth?: number }) {
  ctx.save();
  ctx.font = `${opts.weight ?? 500} ${opts.size}px ${opts.family ?? fonts().body}`;
  ctx.fillStyle = opts.color ?? C.ink;
  ctx.textAlign = opts.align ?? 'left';
  ctx.textBaseline = 'alphabetic';
  let v = value;
  if (opts.maxWidth) while (v.length > 3 && ctx.measureText(v).width > opts.maxWidth) v = `${v.slice(0, -2)}…`;
  ctx.fillText(v, x, y);
  ctx.restore();
}

const fmtIn = (n: number) => `${Math.round(n * 100) / 100}`;

async function framedOf(pictureUrl: string, size: { widthIn: number; heightIn: number }, look: FrameLook | null, glitter = false): Promise<HTMLImageElement> {
  const cropped = await cropToShape(pictureUrl, size.widthIn, size.heightIn);
  if (!cropped) throw new Error('The picture could not be loaded.');
  const framed = await frameDesign(cropped, size.widthIn, look ?? STOCK_FRAME, { glitter });
  return loadImage(framed ?? cropped);
}

const toJpeg = (canvas: HTMLCanvasElement) => canvas.toDataURL('image/jpeg', 0.9);

// 1 ─ the framed picture -------------------------------------------------------------------------
async function photoFramed(input: ProductPhotoInput, framed: HTMLImageElement): Promise<string> {
  const { canvas, ctx } = square();
  backdrop(ctx);
  placeWithShadow(ctx, framed, { x: 170, y: 150, w: PHOTO_SIZE - 340, h: PHOTO_SIZE - 300 });
  return toJpeg(canvas);
}

// 2 ─ sizes ---------------------------------------------------------------------------------------
async function photoSizes(input: ProductPhotoInput, framed: HTMLImageElement): Promise<string> {
  const { canvas, ctx } = square();
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
  const f = fonts();
  const size = input.sizes[0]!;
  const moulding = input.frames[0]?.mouldingWidthIn ?? STOCK_FRAME.mouldingWidthIn;
  text(ctx, 'Sizes', 96, 150, { size: 72, weight: 700, family: f.display });
  text(ctx, 'Picture size in inches · the frame adds its moulding all round', 96, 206, { size: 30, color: C.muted });

  // The framed picture with its own measurements.
  const box = { x: 230, y: 300, w: 640, h: 760 };
  const r = placeWithShadow(ctx, framed, box, 0.8);
  ctx.save();
  ctx.strokeStyle = C.ink;
  ctx.fillStyle = C.ink;
  ctx.lineWidth = 3;
  const arrow = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    for (const [x, y, dx, dy] of [
      [x1, y1, x2 - x1, y2 - y1],
      [x2, y2, x1 - x2, y1 - y2],
    ] as const) {
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + ux * 22 - uy * 11, y + uy * 22 + ux * 11);
      ctx.lineTo(x + ux * 22 + uy * 11, y + uy * 22 - ux * 11);
      ctx.closePath();
      ctx.fill();
    }
  };
  arrow(r.x, r.y - 44, r.x + r.w, r.y - 44);
  arrow(r.x - 44, r.y, r.x - 44, r.y + r.h);
  ctx.restore();
  const outerW = size.widthIn + moulding * 2;
  const outerH = size.heightIn + moulding * 2;
  text(ctx, `${fmtIn(outerW)} in`, r.x + r.w / 2, r.y - 62, { size: 34, weight: 700, align: 'center' });
  ctx.save();
  ctx.translate(r.x - 62, r.y + r.h / 2);
  ctx.rotate(-Math.PI / 2);
  text(ctx, `${fmtIn(outerH)} in`, 0, 0, { size: 34, weight: 700, align: 'center' });
  ctx.restore();
  text(ctx, `Picture ${fmtIn(size.widthIn)} × ${fmtIn(size.heightIn)} in`, r.x + r.w / 2, r.y + r.h + 64, { size: 32, weight: 600, align: 'center' });
  text(ctx, `With frame ${fmtIn(outerW)} × ${fmtIn(outerH)} in`, r.x + r.w / 2, r.y + r.h + 108, { size: 28, color: C.muted, align: 'center' });

  // Every size side by side, drawn to the same scale, as large as the column allows.
  const sizes = input.sizes.slice(0, 6);
  const colX = 1000;
  const colW = PHOTO_SIZE - colX - 80;
  const gap = 36;
  text(ctx, 'Available sizes', colX, 330, { size: 36, weight: 700 });
  const rows = sizes.length > 3 ? [sizes.slice(0, Math.ceil(sizes.length / 2)), sizes.slice(Math.ceil(sizes.length / 2))] : [sizes];
  const areaH = PHOTO_SIZE - 380 - 160 - (rows.length - 1) * 80;
  const scale = Math.min(
    ...rows.map((row) => (colW - gap * (row.length - 1)) / row.reduce((n, z) => n + z.widthIn, 0)),
    areaH / rows.length / Math.max(...sizes.map((z) => z.heightIn))
  );
  let y = 390;
  for (const row of rows) {
    const rowH = Math.max(...row.map((z) => z.heightIn)) * scale;
    let x = colX;
    for (const z of row) {
      const w = z.widthIn * scale;
      const h = z.heightIn * scale;
      const top = y + rowH - h; // standing on one line, like frames on a shelf
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 3;
      ctx.fillRect(x, top, w, h);
      ctx.strokeRect(x, top, w, h);
      ctx.restore();
      text(ctx, `${fmtIn(z.widthIn)}×${fmtIn(z.heightIn)}`, x + w / 2, y + rowH + 46, { size: 30, weight: 600, align: 'center' });
      x += w + gap;
    }
    y += rowH + 110;
  }

  // The measurements of every size, picture and with the frame.
  let ty = Math.max(y + 10, 1040);
  text(ctx, 'PICTURE', colX, ty, { size: 22, weight: 700, color: C.muted });
  text(ctx, 'WITH FRAME', colX + colW, ty, { size: 22, weight: 700, color: C.muted, align: 'right' });
  ty += 18;
  for (const z of input.sizes.slice(0, 8)) {
    ctx.fillStyle = C.line;
    ctx.fillRect(colX, ty, colW, 2);
    ty += 50;
    text(ctx, `${fmtIn(z.widthIn)} × ${fmtIn(z.heightIn)} in`, colX, ty, { size: 30, weight: 600 });
    text(ctx, `${fmtIn(z.widthIn + moulding * 2)} × ${fmtIn(z.heightIn + moulding * 2)} in`, colX + colW, ty, { size: 30, color: C.muted, align: 'right' });
    ty += 22;
  }
  text(ctx, 'Outlines drawn to scale', 96, PHOTO_SIZE - 96, { size: 26, color: C.muted });
  return toJpeg(canvas);
}

// 3 ─ the frame -----------------------------------------------------------------------------------
async function photoFrame(input: ProductPhotoInput, framed: HTMLImageElement): Promise<string> {
  const { canvas, ctx } = square();
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
  const f = fonts();
  const main = input.frames[0];

  // Close-up of the top-left corner: a tall slice of the framed picture fills the left half.
  const panelW = 820;
  const sw = framed.width * 0.45;
  const sh = Math.min(framed.height, sw * (PHOTO_SIZE / panelW));
  const drawH = (sh / sw) * panelW;
  ctx.drawImage(framed, 0, 0, sw, sh, 0, (PHOTO_SIZE - drawH) / 2, panelW, drawH);
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(818, 0, 4, PHOTO_SIZE);

  const x = 900;
  text(ctx, 'The frame', x, 170, { size: 30, weight: 700, color: C.gold });
  text(ctx, main?.name ?? 'Hand-finished frame', x, 250, { size: 64, weight: 700, family: f.display, maxWidth: PHOTO_SIZE - x - 80 });
  const rows: Array<[string, string]> = main
    ? [
        ['Material', main.material.replace(/\s*\(.*\)/, '')],
        ['Moulding width', `${fmtIn(main.mouldingWidthIn)} inch`],
        ['Colour', main.colour],
        ['Finish', 'Cut and joined by hand'],
      ]
    : [['Finish', 'Cut and joined by hand']];
  let y = 360;
  for (const [k, v] of rows) {
    text(ctx, k.toUpperCase(), x, y, { size: 24, weight: 700, color: C.muted });
    text(ctx, v, x, y + 46, { size: 40, weight: 600, maxWidth: PHOTO_SIZE - x - 80 });
    if (k === 'Colour' && main) {
      ctx.fillStyle = main.colourHex;
      ctx.beginPath();
      ctx.arc(PHOTO_SIZE - 120, y + 30, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = C.line;
    ctx.fillRect(x, y + 82, PHOTO_SIZE - x - 80, 2);
    y += 140;
  }
  // The other frames the customer can choose.
  const others = input.frames.slice(1, 5);
  if (others.length) {
    y += 20;
    text(ctx, 'ALSO AVAILABLE IN', x, y, { size: 24, weight: 700, color: C.muted });
    y += 30;
    let ox = x;
    for (const o of others) {
      const tile = 130;
      if (o.look) {
        const img = await loadImage(o.look.src).catch(() => null);
        if (img) {
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(ox, y, tile, tile, 16);
          ctx.clip();
          const crop = Math.max(o.look.borderPx * 2.2, 40);
          ctx.drawImage(img, 0, 0, crop, crop, ox, y, tile, tile);
          ctx.restore();
        }
      } else {
        ctx.fillStyle = o.colourHex;
        ctx.beginPath();
        ctx.roundRect(ox, y, tile, tile, 16);
        ctx.fill();
      }
      text(ctx, o.name, ox + tile / 2, y + tile + 40, { size: 24, weight: 600, align: 'center', maxWidth: tile + 20 });
      ox += tile + 30;
    }
  }
  return toJpeg(canvas);
}

// 2/3 ─ styled: the frame posed in a real setting ------------------------------------------------
/**
 * The settings a frame is shown in, as the shop's cards show them: standing on a dresser, or hung on a wall. Each
 * places the frame itself (centre or standing point, as fractions of the room photo, and its longer side as a share
 * of the photo's height) and how much of the square the frame fills once cropped around it.
 */
export const POSES = [
  { id: 'table', sceneId: 'table', label: 'On a table', x: 0.49, y: 0.633, standing: true, longest: 0.42, fill: 0.9 },
  { id: 'bedroom', sceneId: 'bedroom', label: 'On the bedroom wall', x: 0.57, y: 0.26, standing: false, longest: 0.36, fill: 0.9 },
  { id: 'living-room', sceneId: 'living-room', label: 'On the living room wall', x: 0.33, y: 0.3, standing: false, longest: 0.36, fill: 0.9 },
] as const;
export type Pose = (typeof POSES)[number];

/** Two different settings for a product, chosen from its name so a grid of products shows a varied mix. */
export function posesFor(title: string): [Pose, Pose] {
  let h = 0;
  for (const ch of title) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const i = h % POSES.length;
  return [POSES[i]!, POSES[(i + 1) % POSES.length]!];
}

async function photoPose(pose: Pose, framed: HTMLImageElement): Promise<string> {
  const scene = DEFAULT_PREVIEW_SCENES.find((s) => s.id === pose.sceneId);
  if (!scene || scene.backdrop.type !== 'photo') throw new Error('The room photo is missing.');
  const room = await loadImage(scene.backdrop.src);
  const W = room.naturalWidth;
  const H = room.naturalHeight;
  // The frame, in room-photo pixels.
  const aspect = framed.width / framed.height;
  const longest = pose.longest * H;
  const fw = aspect >= 1 ? longest : longest * aspect;
  const fh = aspect >= 1 ? longest / aspect : longest;
  const fx = pose.x * W - fw / 2;
  const fy = pose.standing ? pose.y * H - fh : pose.y * H - fh / 2;
  // A square crop around it, the frame filling most of it (as shop cards show frames), a little lower for a standing
  // frame so the tabletop shows; kept inside the photo.
  const side = Math.min(W, H, Math.max(fw, fh) / pose.fill);
  const cx = fx + fw / 2;
  const x0 = Math.max(0, Math.min(W - side, cx - side / 2));
  // A standing frame sits low in the square so a strip of tabletop shows under it; a hung one is centred.
  const wantY = pose.standing ? fy + fh - side * 0.95 : fy + fh / 2 - side / 2;
  const y0 = Math.max(0, Math.min(H - side, wantY));
  const k = PHOTO_SIZE / side;

  const { canvas, ctx } = square();
  // The room, very slightly softened so the frame reads as the subject (as a camera would).
  ctx.save();
  ctx.filter = 'blur(1.5px)';
  ctx.drawImage(room, x0, y0, side, side, -4, -4, PHOTO_SIZE + 8, PHOTO_SIZE + 8);
  ctx.restore();
  const dx = (fx - x0) * k;
  const dy = (fy - y0) * k;
  const dw = fw * k;
  const dh = fh * k;
  if (pose.standing) {
    // Contact shadow where the frame meets the table.
    const g = ctx.createRadialGradient(dx + dw / 2, dy + dh, 2, dx + dw / 2, dy + dh, dw * 0.62);
    g.addColorStop(0, 'rgba(25,15,5,0.42)');
    g.addColorStop(1, 'rgba(25,15,5,0)');
    ctx.save();
    ctx.translate(dx + dw / 2, dy + dh);
    ctx.scale(1, 0.08);
    ctx.translate(-(dx + dw / 2), -(dy + dh));
    ctx.fillStyle = g;
    ctx.fillRect(dx - dw * 0.2, dy + dh - dw * 0.7, dw * 1.4, dw * 1.4);
    ctx.restore();
  }
  const light = scene.light ?? { angleDeg: 90, strength: 0.5 };
  const rad = (light.angleDeg * Math.PI) / 180;
  ctx.save();
  ctx.shadowColor = `rgba(35,22,10,${0.3 + 0.2 * light.strength})`;
  ctx.shadowBlur = Math.max(dw, dh) * 0.07;
  ctx.shadowOffsetX = Math.cos(rad) * Math.max(dw, dh) * 0.02;
  ctx.shadowOffsetY = Math.sin(rad) * Math.max(dw, dh) * 0.025;
  if (scene.tone) {
    const t = scene.tone;
    ctx.filter = `brightness(${t.brightness ?? 1}) contrast(${t.contrast ?? 1}) saturate(${t.saturate ?? 1})`;
  }
  ctx.drawImage(framed, dx, dy, dw, dh);
  ctx.restore();
  return toJpeg(canvas);
}

// 5 ─ the picture itself --------------------------------------------------------------------------
async function photoPicture(input: ProductPhotoInput): Promise<string> {
  const size = input.sizes[0]!;
  const cropped = await cropToShape(input.pictureUrl, size.widthIn, size.heightIn, 1500);
  const img = await loadImage(cropped ?? input.pictureUrl);
  const { canvas, ctx } = square();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
  placeWithShadow(ctx, img, { x: 110, y: 110, w: PHOTO_SIZE - 220, h: PHOTO_SIZE - 220 }, 0.35);
  return toJpeg(canvas);
}

// 6 ─ matte vs glitter -----------------------------------------------------------------------------
async function photoGlitter(input: ProductPhotoInput, matte: HTMLImageElement): Promise<string> {
  const size = input.sizes[0]!;
  const sparkle = await framedOf(input.pictureUrl, size, { ...DISPLAY_FRAME, mouldingWidthIn: input.frames[0]?.mouldingWidthIn ?? DISPLAY_FRAME.mouldingWidthIn }, true);
  const { canvas, ctx } = square();
  backdrop(ctx);
  const f = fonts();
  text(ctx, 'Choose your finish', PHOTO_SIZE / 2, 150, { size: 64, weight: 700, align: 'center', family: f.display });
  const box = { x: 220, y: 215, w: PHOTO_SIZE - 440, h: PHOTO_SIZE - 480 };
  const k = Math.min(box.w / matte.width, box.h / matte.height);
  const w = matte.width * k;
  const h = matte.height * k;
  const x = box.x + (box.w - w) / 2;
  const y = box.y + (box.h - h) / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(30,20,8,0.32)';
  ctx.shadowBlur = Math.max(w, h) * 0.05;
  ctx.shadowOffsetY = Math.max(w, h) * 0.025;
  ctx.drawImage(matte, x, y, w, h);
  ctx.restore();
  // The right half is the glitter print.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + w / 2, y, w / 2, h);
  ctx.clip();
  ctx.drawImage(sparkle, x, y, w, h);
  ctx.restore();
  // Divider.
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 10;
  ctx.fillRect(x + w / 2 - 3, y, 6, h);
  ctx.restore();
  // Labels under each half.
  const price = input.glitter ? `+₹${(input.glitter.extraPrice / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '';
  text(ctx, 'MATTE', x + w / 4, y + h + 64, { size: 34, weight: 700, align: 'center' });
  text(ctx, 'Standard print', x + w / 4, y + h + 104, { size: 26, color: C.muted, align: 'center' });
  text(ctx, 'GLITTER', x + (w * 3) / 4, y + h + 64, { size: 34, weight: 700, align: 'center', color: C.gold });
  text(ctx, price ? `Sparkle finish · ${price}` : 'Sparkle finish', x + (w * 3) / 4, y + h + 104, { size: 26, color: C.muted, align: 'center' });
  text(ctx, 'Illustration: a real glitter print sparkles as it catches the light.', PHOTO_SIZE / 2, PHOTO_SIZE - 56, { size: 24, color: C.muted, align: 'center' });
  return toJpeg(canvas);
}

/** Draws all six photos (seven when the product offers glitter). Throws a readable error if the picture or a frame photo cannot be loaded. */
export async function makeProductPhotos(input: ProductPhotoInput): Promise<ProductPhoto[]> {
  if (!input.sizes.length) throw new Error('Add at least one size first.');
  await document.fonts?.ready;
  // Every product is photographed in the shop's premium black display frame, so the catalogue looks consistent.
  const display: FrameLook = { ...DISPLAY_FRAME, mouldingWidthIn: input.frames[0]?.mouldingWidthIn ?? DISPLAY_FRAME.mouldingWidthIn };
  const framed = await framedOf(input.pictureUrl, input.sizes[0]!, display);
  const name = input.title || 'Photo frame';
  const frameName = input.frames[0]?.name ?? 'frame';
  const [first, second] = posesFor(name);
  const poseAlt = (pose: Pose) => `${name} ${pose.standing ? 'standing on a table' : `hung ${pose.label.toLowerCase().replace(/^on /, 'on ')}`}`;
  return [
    { key: 'framed', label: 'Framed', alt: `${name} in a ${frameName} frame`, dataUrl: await photoFramed(input, framed) },
    { key: 'pose-1', label: first.label, alt: poseAlt(first), dataUrl: await photoPose(first, framed), role: 'listing' },
    { key: 'pose-2', label: second.label, alt: poseAlt(second), dataUrl: await photoPose(second, framed), role: 'listing-hover' },
    { key: 'sizes', label: 'Sizes', alt: `${name} sizes: ${input.sizes.map((s) => `${fmtIn(s.widthIn)}x${fmtIn(s.heightIn)}`).join(', ')} inches`, dataUrl: await photoSizes(input, framed) },
    { key: 'frame', label: 'Frame', alt: `${frameName} frame close-up for ${name}`, dataUrl: await photoFrame(input, framed) },
    { key: 'picture', label: 'The picture', alt: `${name} print`, dataUrl: await photoPicture(input) },
    ...(input.glitter ? [{ key: 'glitter' as const, label: 'Matte vs Glitter', alt: `${name} in a matte finish and in a glitter finish, side by side`, dataUrl: await photoGlitter(input, framed) }] : []),
  ];
}
