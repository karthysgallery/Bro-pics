/**
 * "Size Guide" picture for the product gallery, drawn from the product's OWN sizes (never assumed A-sizes):
 * the product in its frame with the chosen size's outer measurements, every available size drawn to scale, and a
 * picture-size / with-frame table. Returned as a JPEG data URL so it zooms like any photo.
 */

const SIZE = 1600;
const BG_TOP = '#f8f1e7';
const BG_BOTTOM = '#f1e6d6';
const INK = '#2b211a';
const BRONZE = '#9a6a33';
const LINE = 'rgba(154,106,51,0.35)';

export interface GuideSize {
  widthIn: number;
  heightIn: number;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const dims = (s: GuideSize) => `${fmt(s.widthIn)} × ${fmt(s.heightIn)} in`;

function pill(ctx: CanvasRenderingContext2D, cx: number, cy: number, text: string, font: string, padX = 26, h = 62) {
  ctx.font = font;
  const w = ctx.measureText(text).width + padX * 2;
  ctx.fillStyle = BRONZE;
  ctx.beginPath();
  ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = '#fff8ee';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 2);
  return w;
}

function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const head = (x: number, y: number, ang: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 18 * Math.cos(ang - 0.4), y - 18 * Math.sin(ang - 0.4));
    ctx.lineTo(x - 18 * Math.cos(ang + 0.4), y - 18 * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fill();
  };
  const a = Math.atan2(y2 - y1, x2 - x1);
  head(x2, y2, a);
  head(x1, y1, a + Math.PI);
}

/** A framed rectangle: black moulding (proportional), picture or plain paper inside. */
function framed(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, moulding: number, picture: HTMLImageElement | null) {
  ctx.save();
  ctx.shadowColor = 'rgba(40,25,10,0.28)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 14;
  ctx.fillStyle = '#16171a';
  ctx.fillRect(x, y, w, h);
  ctx.restore();
  const ix = x + moulding;
  const iy = y + moulding;
  const iw = w - 2 * moulding;
  const ih = h - 2 * moulding;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(ix, iy, iw, ih);
  if (picture) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(ix, iy, iw, ih);
    ctx.clip();
    const k = Math.max(iw / picture.naturalWidth, ih / picture.naturalHeight);
    ctx.drawImage(picture, ix + (iw - picture.naturalWidth * k) / 2, iy + (ih - picture.naturalHeight * k) / 2, picture.naturalWidth * k, picture.naturalHeight * k);
    ctx.restore();
  }
  // A thin bevel highlight on the moulding.
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
}

/** Small line icons for the bottom strip. */
function icon(ctx: CanvasRenderingContext2D, kind: 'resize' | 'sofa' | 'gift' | 'hang', cx: number, cy: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = BRONZE;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (kind === 'resize') {
    ctx.roundRect(-34, -34, 68, 68, 8);
    ctx.moveTo(-14, 14);
    ctx.lineTo(16, -16);
    ctx.moveTo(2, -16);
    ctx.lineTo(16, -16);
    ctx.lineTo(16, -2);
    ctx.moveTo(-14, 0);
    ctx.lineTo(-14, 14);
    ctx.lineTo(0, 14);
  } else if (kind === 'sofa') {
    ctx.roundRect(-30, -24, 60, 30, 8);
    ctx.roundRect(-42, -4, 14, 28, 6);
    ctx.roundRect(28, -4, 14, 28, 6);
    ctx.moveTo(-30, 18);
    ctx.lineTo(30, 18);
    ctx.moveTo(-34, 24);
    ctx.lineTo(-34, 32);
    ctx.moveTo(34, 24);
    ctx.lineTo(34, 32);
  } else if (kind === 'gift') {
    ctx.rect(-32, -10, 64, 42);
    ctx.rect(-36, -24, 72, 14);
    ctx.moveTo(0, -24);
    ctx.lineTo(0, 32);
    ctx.moveTo(0, -24);
    ctx.bezierCurveTo(-24, -48, -34, -26, 0, -24);
    ctx.moveTo(0, -24);
    ctx.bezierCurveTo(24, -48, 34, -26, 0, -24);
  } else {
    ctx.moveTo(0, -36);
    ctx.lineTo(-30, -8);
    ctx.moveTo(0, -36);
    ctx.lineTo(30, -8);
    ctx.roundRect(-40, -8, 80, 40, 6);
  }
  ctx.stroke();
  ctx.restore();
}

export async function sizeGuideImage(opts: {
  /** The product's picture (shown inside the big frame). */
  printUrl: string | null;
  /** Every size offered in the chosen orientation, any order. */
  sizes: GuideSize[];
  /** The size shown big on the left (the customer's selection). */
  selected: GuideSize;
  /** Moulding width on each side, inches (the frame model's). */
  mouldingIn: number;
}): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const picture = opts.printUrl ? await loadImage(opts.printUrl) : null;
  const m = Math.max(0, opts.mouldingIn);
  const outer = (s: GuideSize): GuideSize => ({ widthIn: s.widthIn + 2 * m, heightIn: s.heightIn + 2 * m });
  const sizes = [...new Map(opts.sizes.map((s) => [`${s.widthIn}x${s.heightIn}`, s])).values()].sort((a, b) => a.widthIn * a.heightIn - b.widthIn * b.heightIn).slice(0, 4);

  // Background.
  const bg = ctx.createLinearGradient(0, 0, 0, SIZE);
  bg.addColorStop(0, BG_TOP);
  bg.addColorStop(1, BG_BOTTOM);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Heading.
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '700 110px Georgia, "Times New Roman", serif';
  ctx.fillText('Size Guide', SIZE / 2, 170);
  ctx.strokeStyle = BRONZE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(300, 132);
  ctx.lineTo(470, 132);
  ctx.moveTo(1130, 132);
  ctx.lineTo(1300, 132);
  ctx.stroke();
  ctx.font = '44px Georgia, "Times New Roman", serif';
  ctx.fillStyle = 'rgba(43,33,26,0.8)';
  ctx.fillText('Choose the perfect size for your space', SIZE / 2, 240);

  // Left: the selected size, framed, with its outer measurements.
  const sel = opts.selected;
  const selOuter = outer(sel);
  const boxW = 560;
  const boxH = 780;
  const k = Math.min(boxW / selOuter.widthIn, boxH / selOuter.heightIn);
  const fw = selOuter.widthIn * k;
  const fh = selOuter.heightIn * k;
  const fx = 110 + (boxW - fw) / 2 + 60;
  const fy = 330 + (boxH - fh) / 2 + 40;
  framed(ctx, fx, fy, fw, fh, Math.max(10, m * k), picture);
  arrow(ctx, fx, fy - 46, fx + fw, fy - 46);
  pill(ctx, fx + fw / 2, fy - 46, `${fmt(selOuter.widthIn)} in`, '600 38px Arial, sans-serif');
  arrow(ctx, fx - 46, fy, fx - 46, fy + fh);
  ctx.save();
  ctx.translate(fx - 46, fy + fh / 2);
  ctx.rotate(-Math.PI / 2);
  pill(ctx, 0, 0, `${fmt(selOuter.heightIn)} in`, '600 38px Arial, sans-serif');
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const capY = Math.min(fy + fh + 80, 1240);
  ctx.font = '600 40px Arial, sans-serif';
  ctx.fillStyle = INK;
  ctx.fillText(`Picture size: ${dims(sel)}`, fx + fw / 2, capY);
  ctx.font = '36px Arial, sans-serif';
  ctx.fillStyle = 'rgba(43,33,26,0.75)';
  ctx.fillText(`With frame: ${dims(selOuter)}`, fx + fw / 2, capY + 50);

  // Right: available sizes, drawn to the same scale.
  const panelX = 860;
  const panelW = 640;
  ctx.fillStyle = 'rgba(255,252,246,0.85)';
  ctx.beginPath();
  ctx.roundRect(panelX, 340, panelW, 420, 28);
  ctx.fill();
  pill(ctx, panelX + panelW / 2, 340, 'Available Sizes', '600 42px Arial, sans-serif', 40, 72);
  const biggest = Math.max(...sizes.map((s) => Math.max(outer(s).widthIn, outer(s).heightIn)));
  const scale = 250 / biggest;
  const gap = 36;
  const totalW = sizes.reduce((n, s) => n + outer(s).widthIn * scale, 0) + gap * (sizes.length - 1);
  let sx = panelX + (panelW - totalW) / 2;
  const base = 660;
  for (const s of sizes) {
    const o = outer(s);
    const w = o.widthIn * scale;
    const h = o.heightIn * scale;
    framed(ctx, sx, base - h, w, h, Math.max(4, m * scale), null);
    ctx.fillStyle = INK;
    ctx.font = `${s === sel || (s.widthIn === sel.widthIn && s.heightIn === sel.heightIn) ? '700' : '500'} 32px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(dims(s), sx + w / 2, base + 50);
    sx += w + gap;
  }

  // Table: picture size → with frame.
  const tx = panelX;
  const ty = 800;
  const rowH = 74;
  ctx.fillStyle = BRONZE;
  ctx.beginPath();
  ctx.roundRect(tx, ty, panelW, rowH, [18, 18, 0, 0]);
  ctx.fill();
  ctx.fillStyle = '#fff8ee';
  ctx.font = '600 30px Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('Picture Size', tx + panelW / 4, ty + rowH / 2);
  ctx.fillText('With Frame (approx.)', tx + (3 * panelW) / 4, ty + rowH / 2);
  sizes.forEach((s, i) => {
    const y = ty + rowH * (i + 1);
    ctx.fillStyle = i % 2 ? 'rgba(255,252,246,0.7)' : 'rgba(255,252,246,0.95)';
    ctx.fillRect(tx, y, panelW, rowH);
    ctx.fillStyle = INK;
    ctx.font = '700 36px Arial, sans-serif';
    ctx.fillText(dims(s), tx + panelW / 4, y + rowH / 2);
    ctx.font = '36px Arial, sans-serif';
    ctx.fillText(dims(outer(s)), tx + (3 * panelW) / 4, y + rowH / 2);
  });
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.strokeRect(tx, ty, panelW, rowH * (sizes.length + 1));
  ctx.beginPath();
  ctx.moveTo(tx + panelW / 2, ty);
  ctx.lineTo(tx + panelW / 2, ty + rowH * (sizes.length + 1));
  ctx.stroke();

  // Bottom strip.
  const items: Array<['resize' | 'sofa' | 'gift' | 'hang', string, string]> = [
    ['resize', 'Multiple', 'size options'],
    ['sofa', 'Perfect for', 'home & office'],
    ['gift', 'A great', 'gifting choice'],
    ['hang', 'Ready to', 'wall mount'],
  ];
  const stripY = 1370;
  items.forEach(([kind, a, b], i) => {
    const cx = 200 + i * 400;
    icon(ctx, kind, cx, stripY);
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '36px Arial, sans-serif';
    ctx.fillText(a, cx, stripY + 90);
    ctx.fillText(b, cx, stripY + 134);
    if (i > 0) {
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 200, stripY - 40);
      ctx.lineTo(cx - 200, stripY + 130);
      ctx.stroke();
    }
  });

  return canvas.toDataURL('image/jpeg', 0.9);
}
