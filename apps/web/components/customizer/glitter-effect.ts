'use client';

/**
 * An illustration of the glitter finish: fine sparkling dust, a few bright
 * star glints and a diagonal sheen laid over a picture. It is a simulation (a
 * real glitter print catches the light differently from every angle), so the
 * shop photos that use it say "illustration". Drawn on a canvas so the same
 * code makes the customer's preview and the "Matte vs Glitter" shop photo.
 *
 * Deterministic: the same picture size always gets the same sparkles, so a
 * preview does not shimmer into a different picture each time it redraws.
 */

/** A small seeded random generator (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Sparkle {
  x: number;
  y: number;
  r: number;
  alpha: number;
  warm: boolean;
}

/** Where the sparkles go, for a picture of this size. Pure, so it can be tested. */
export function sparklePlan(width: number, height: number): { dust: Sparkle[]; glints: Sparkle[] } {
  const rnd = seededRandom(width * 7919 + height * 104729);
  const unit = Math.max(width, height) / 1000;
  const area = (width * height) / 1_000_000;
  const dust: Sparkle[] = Array.from({ length: Math.round(2600 * Math.max(area, 0.2)) }, () => ({
    x: rnd() * width,
    y: rnd() * height,
    r: (0.5 + rnd() * 1.6) * unit,
    alpha: 0.25 + rnd() * 0.65,
    warm: rnd() < 0.45,
  }));
  const glints: Sparkle[] = Array.from({ length: Math.round(34 + 70 * Math.max(area, 0.2)) }, () => ({
    x: rnd() * width,
    y: rnd() * height,
    r: (5 + rnd() * 13) * unit,
    alpha: 0.55 + rnd() * 0.45,
    warm: rnd() < 0.4,
  }));
  return { dust, glints };
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 0.9);
  g.addColorStop(0, `rgba(${color},${alpha})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
  ctx.fill();
  // The four-point glint.
  ctx.fillStyle = `rgba(255,255,255,${Math.min(1, alpha + 0.1)})`;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.7);
  ctx.quadraticCurveTo(x + r * 0.12, y - r * 0.12, x + r * 1.7, y);
  ctx.quadraticCurveTo(x + r * 0.12, y + r * 0.12, x, y + r * 1.7);
  ctx.quadraticCurveTo(x - r * 0.12, y + r * 0.12, x - r * 1.7, y);
  ctx.quadraticCurveTo(x - r * 0.12, y - r * 0.12, x, y - r * 1.7);
  ctx.closePath();
  ctx.fill();
}

/** A copy of the picture with the glitter finish drawn on it. */
export function glitterCanvas(src: CanvasImageSource & { width: number; height: number }): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(src, 0, 0, w, h);
  const { dust, glints } = sparklePlan(w, h);

  // A slightly richer, brighter print under the sparkle, as light catches it.
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  const sheen = ctx.createLinearGradient(0, 0, w, h);
  sheen.addColorStop(0, 'rgba(255,255,255,0.0)');
  sheen.addColorStop(0.35, 'rgba(255,248,225,0.55)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0.75)');
  sheen.addColorStop(0.65, 'rgba(255,240,205,0.45)');
  sheen.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // Fine glitter dust.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const d of dust) {
    ctx.fillStyle = d.warm ? `rgba(255,226,150,${d.alpha})` : `rgba(240,248,255,${d.alpha})`;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // A few bright glints.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const g of glints) star(ctx, g.x, g.y, g.r, g.warm ? '255,224,140' : '230,242,255', g.alpha);
  ctx.restore();
  return canvas;
}
