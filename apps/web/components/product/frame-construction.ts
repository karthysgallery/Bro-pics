/**
 * "How your frame is made": an exploded view of the five layers of a KarthysGallery frame — frame, laminate,
 * premium print (the product's own picture), 8 mm MDF, and the back with its hook and bushes — drawn on a canvas and
 * returned as a JPEG data URL for the product gallery (where it can be zoomed like any photo).
 */

const SIZE = 1600;
/** One layer lying in the stack: its width runs right and down, its height left and down. */
const U = { x: 380, y: 130 };
const V = { x: -220, y: 200 };
const BG = '#f7f1e8';
const INK = '#2b211a';
const GOLD = '#b08a54';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Draw in a layer's own flat coordinates (0..w, 0..h), shown as a tilted plane lying in the stack. */
function onPlane(ctx: CanvasRenderingContext2D, w: number, h: number, ox: number, oy: number, draw: () => void, shadow = true) {
  ctx.save();
  ctx.setTransform(U.x / w, U.y / w, V.x / h, V.y / h, ox, oy);
  if (shadow) {
    // A soft shadow under the layer, so each one reads as a separate sheet.
    ctx.save();
    ctx.shadowColor = 'rgba(60,40,20,0.28)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 30;
    ctx.fillStyle = 'rgba(0,0,0,0.01)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  // Nothing a layer draws may spill past its own edge.
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  draw();
  ctx.restore();
}

export async function frameConstructionImage(printUrl: string | null, portrait = true): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const print = printUrl ? await loadImage(printUrl) : null;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = INK;
  ctx.textAlign = 'left';
  ctx.font = '600 66px Georgia, "Times New Roman", serif';
  ctx.fillText('How your frame is made', 80, 110);
  ctx.font = '34px Arial, sans-serif';
  ctx.fillStyle = 'rgba(43,33,26,0.6)';
  ctx.fillText('Five layers, built by hand in our workshop', 80, 165);

  const w = portrait ? 1000 : 1500;
  const h = portrait ? 1500 : 1000;
  const ox = 330;
  const step = 235;
  const top = 230;
  const m = w * 0.075; // moulding width

  // Back (bottom of the stack): MDF back with the hook and two bushes.
  const backY = top + step * 4;
  onPlane(ctx, w, h, ox, backY, () => {
    ctx.fillStyle = '#9a7646';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, w, h);
    // hook: a metal triangle hanger near the top
    ctx.fillStyle = '#d9d9d9';
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 130, h * 0.6);
    ctx.lineTo(w / 2, h * 0.5);
    ctx.lineTo(w / 2 + 130, h * 0.6);
    ctx.closePath();
    ctx.stroke();
    // bushes: small rubber pads at the bottom corners
    ctx.fillStyle = '#222';
    for (const x of [w * 0.12, w * 0.88]) {
      ctx.beginPath();
      ctx.arc(x, h * 0.9, 34, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // 8 mm MDF board, with its edge showing.
  const mdfY = top + step * 3;
  onPlane(ctx, w, h, ox, mdfY + 16, () => {
    ctx.fillStyle = '#8a6a3e';
    ctx.fillRect(0, 0, w, h);
  });
  onPlane(ctx, w, h, ox, mdfY, () => {
    ctx.fillStyle = '#c9a46c';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(120,86,40,0.35)';
    ctx.lineWidth = 5;
    for (let y = 60; y < h; y += 70) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y + 20, w * 0.6, y - 20, w, y + 8);
      ctx.stroke();
    }
  });

  // Premium print: the product's own picture.
  const printY = top + step * 2;
  onPlane(ctx, w, h, ox, printY, () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    if (print) {
      const k = Math.max(w / print.naturalWidth, h / print.naturalHeight);
      const dw = print.naturalWidth * k;
      const dh = print.naturalHeight * k;
      ctx.drawImage(print, (w - dw) / 2, (h - dh) / 2, dw, dh);
    } else {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#e7c9a5');
      g.addColorStop(1, '#9fb7c9');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  });

  // Laminate: a clear protective sheet with a shine.
  const lamY = top + step;
  onPlane(ctx, w, h, ox, lamY, () => {
    ctx.fillStyle = 'rgba(214,232,244,0.75)';
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0.25, 'rgba(255,255,255,0)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.55, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(120,150,170,0.9)';
    ctx.lineWidth = 10;
    ctx.strokeRect(0, 0, w, h);
  });

  // Frame: the plain black moulding.
  onPlane(ctx, w, h, ox, top, () => {
    ctx.fillStyle = '#1b1c20';
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.rect(m, m, w - 2 * m, h - 2 * m);
    ctx.fill('evenodd');
  });

  // Labels with leader lines, on the right.
  const labels: Array<[number, string, string]> = [
    [top, 'Frame', 'Plain black moulding, finished by hand'],
    [lamY, 'Laminate', 'Protects the print from dust and moisture'],
    [printY, 'Premium print', 'Sharp detail, true colours'],
    [mdfY, '8 mm MDF', 'Strong backing that keeps it flat'],
    [backY, 'Hook & bush', 'Ready to hang, sits straight on the wall'],
  ];
  const lx = ox + U.x + 120;
  for (const [y, title, note] of labels) {
    const anchorX = ox + U.x - 6;
    const anchorY = y + U.y;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(anchorX, anchorY);
    ctx.lineTo(lx - 20, anchorY);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(anchorX, anchorY, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.font = '600 52px Georgia, "Times New Roman", serif';
    ctx.fillText(title, lx, anchorY + 8);
    ctx.font = '32px Arial, sans-serif';
    ctx.fillStyle = 'rgba(43,33,26,0.72)';
    wrap(ctx, note, lx, anchorY + 54, SIZE - lx - 40, 38);
  }

  return canvas.toDataURL('image/jpeg', 0.9);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineH;
    } else line = next;
  }
  if (line) ctx.fillText(line, x, y);
}
