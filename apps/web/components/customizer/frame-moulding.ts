'use client';

import { mouldingWidthOf } from './frame-edge';
import { glitterCanvas } from './glitter-effect';

/**
 * Puts the printed design into a frame for the preview: the product's chosen
 * frame model (a straight-on photo of the moulding, from the Frame models
 * library) or, without one, the shop's stock frame (public/frames/mock-frame.png).
 * Preview only — the print file never includes the frame.
 */

export const FRAME_SRC = '/frames/mock-frame.png';
/** Moulding width in the frame artwork (even on all four sides), in its own pixels. */
export const FRAME_MOULDING_SRC_PX = 100;
/** Moulding face width of the frames sold, in inches. */
export const MOULDING_IN = 0.9;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
}

/**
 * Draws `designUrl` inside the frame. The frame's four corners keep their
 * mitres and its sides are stretched to fit, so any print shape works.
 * `printWidthIn` (the design's real width) sets how thick the moulding looks.
 */
export interface FrameLook {
  /** Straight-on photo of the whole frame. */
  src: string;
  /** Moulding width in that photo, in its pixels. */
  borderPx: number;
  /** Real moulding face width, in inches. */
  mouldingWidthIn: number;
}

export const STOCK_FRAME: FrameLook = { src: FRAME_SRC, borderPx: FRAME_MOULDING_SRC_PX, mouldingWidthIn: MOULDING_IN };

export async function frameDesign(designUrl: string, printWidthIn?: number, look: FrameLook = STOCK_FRAME, options: { glitter?: boolean } = {}): Promise<string | null> {
  try {
    const [design, frame] = await Promise.all([loadImage(designUrl), loadImage(look.src)]);
    const w = design.naturalWidth;
    const h = design.naturalHeight;
    const m = Math.round(printWidthIn && printWidthIn > 0 ? (w * look.mouldingWidthIn) / printWidthIn : Math.max(w, h) * 0.06);
    const canvas = document.createElement('canvas');
    canvas.width = w + m * 2;
    canvas.height = h + m * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    // A frame photo with see-through edges must not turn black in the JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Never wider than where the moulding really ends in the photo: a frame marked a little too wide
    // would otherwise wrap a strip of its own white inner edge around the picture.
    const detected = await mouldingWidthOf(frame, look.src);
    const c = Math.max(1, Math.min(look.borderPx, detected ?? Infinity, Math.floor(Math.min(frame.naturalWidth, frame.naturalHeight) / 2) - 1));
    const sw = frame.naturalWidth;
    const sh = frame.naturalHeight;
    const W = canvas.width;
    const H = canvas.height;
    // The glitter finish is on the PRINT only, never on the frame around it.
    ctx.drawImage(options.glitter ? glitterCanvas(design) : design, m, m, w, h);
    // Sides first, corners on top.
    ctx.drawImage(frame, c, 0, sw - 2 * c, c, m, 0, W - 2 * m, m);
    ctx.drawImage(frame, c, sh - c, sw - 2 * c, c, m, H - m, W - 2 * m, m);
    ctx.drawImage(frame, 0, c, c, sh - 2 * c, 0, m, m, H - 2 * m);
    ctx.drawImage(frame, sw - c, c, c, sh - 2 * c, W - m, m, m, H - 2 * m);
    ctx.drawImage(frame, 0, 0, c, c, 0, 0, m, m);
    ctx.drawImage(frame, sw - c, 0, c, c, W - m, 0, m, m);
    ctx.drawImage(frame, 0, sh - c, c, c, 0, H - m, m, m);
    ctx.drawImage(frame, sw - c, sh - c, c, c, W - m, H - m, m, m);
    // The frame casts a soft lip onto the print.
    const lip = Math.max(2, m * 0.12);
    const shade = (x0: number, y0: number, x1: number, y1: number) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(20,12,4,0.38)');
      g.addColorStop(1, 'rgba(20,12,4,0)');
      return g;
    };
    ctx.fillStyle = shade(0, m, 0, m + lip);
    ctx.fillRect(m, m, w, lip);
    ctx.fillStyle = shade(m, 0, m + lip, 0);
    ctx.fillRect(m, m, lip, h);
    return canvas.toDataURL('image/jpeg', 0.9);
  } catch {
    return null;
  }
}
