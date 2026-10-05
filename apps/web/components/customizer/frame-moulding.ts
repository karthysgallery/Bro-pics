'use client';

/**
 * Puts the printed design into a simple moulding for the room preview, so it
 * reads as a framed picture on the wall rather than a loose poster. The colour
 * follows the frame finish the customer picked.
 */

/** Typical moulding face width of the frames sold, in inches. */
export const MOULDING_IN = 0.9;

const FINISHES: Array<[RegExp, string]> = [
  [/black|ebony|charcoal/i, '#1f1c19'],
  [/white|ivory|cream/i, '#efebe3'],
  [/walnut|brown|teak|mahogany|dark|espresso/i, '#5b3a24'],
  [/oak|natural|wood|pine|maple|beech|honey/i, '#b98a57'],
  [/gold|brass/i, '#b8963e'],
  [/silver|grey|gray|steel|chrome/i, '#9a9ca1'],
  [/red|maroon|burgundy/i, '#6e2420'],
];

export function mouldingColour(finish: string | undefined): string {
  if (finish) for (const [pattern, colour] of FINISHES) if (pattern.test(finish)) return colour;
  return '#2b2420';
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const v = (n >> shift) & 255;
    const t = amount >= 0 ? v + (255 - v) * amount : v * (1 + amount);
    return Math.round(Math.min(255, Math.max(0, t)));
  };
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
}

/**
 * Draws `designUrl` inside a bevelled moulding. `printWidthIn` (the design's
 * real width) sets how thick the moulding looks; without it a typical ratio is used.
 */
export async function frameDesign(designUrl: string, finish: string | undefined, printWidthIn?: number): Promise<string | null> {
  try {
    const img = await loadImage(designUrl);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const border = Math.round(printWidthIn && printWidthIn > 0 ? (w * MOULDING_IN) / printWidthIn : Math.max(w, h) * 0.06);
    const canvas = document.createElement('canvas');
    canvas.width = w + border * 2;
    canvas.height = h + border * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const base = mouldingColour(finish);
    const W = canvas.width;
    const H = canvas.height;
    const side = (points: Array<[number, number]>, colour: string) => {
      ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.fillStyle = colour;
      ctx.fill();
    };
    // Light from the upper left: the top face catches it, the bottom face is in shade.
    side([[0, 0], [W, 0], [W - border, border], [border, border]], shade(base, 0.14));
    side([[W, 0], [W, H], [W - border, H - border], [W - border, border]], shade(base, -0.12));
    side([[W, H], [0, H], [border, H - border], [W - border, H - border]], shade(base, -0.24));
    side([[0, H], [0, 0], [border, border], [border, H - border]], shade(base, 0.04));
    // A fine highlight on the outer edge and a dark lip where the moulding meets the print.
    ctx.strokeStyle = shade(base, 0.3);
    ctx.lineWidth = Math.max(1, border * 0.04);
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth);
    ctx.drawImage(img, border, border, w, h);
    const lip = Math.max(2, border * 0.12);
    const grad = (x0: number, y0: number, x1: number, y1: number) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(20,12,4,0.38)');
      g.addColorStop(1, 'rgba(20,12,4,0)');
      return g;
    };
    ctx.fillStyle = grad(0, border, 0, border + lip);
    ctx.fillRect(border, border, w, lip);
    ctx.fillStyle = grad(border, 0, border + lip, 0);
    ctx.fillRect(border, border, lip, h);
    return canvas.toDataURL('image/jpeg', 0.9);
  } catch {
    return null;
  }
}
