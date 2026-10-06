// scripts/seed/src/generate-mockups.ts
import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedProducts, seedVariants, computePrintableRects } from './data';
import type { FrameTemplate } from '@bro-pics/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', '..', '..', 'apps', 'web', 'public', 'placeholders', 'mockups');
const MOCKUP_SIZE = 800;
const FRAME_PATH = join(__dirname, '..', '..', '..', 'apps', 'web', 'public', 'frames', 'mock-frame.png');
/** Moulding width in the frame artwork (pixels, even on all four sides). */
const FRAME_MOULDING_SRC_PX = 100;
/** Moulding width on the 800 px mockup, and the cream mat between it and the photo openings (fractions of the mockup). */
const MOULDING = 0.07;
const MAT = 0.005;

/**
 * Draws the shop's one frame (public/frames/mock-frame.png) around a box:
 * the four corners keep their mitres, the four sides are stretched to fit, so
 * the same frame suits any product shape without distortion at the corners.
 */
async function frameAround(box: { x: number; y: number; width: number; height: number }): Promise<sharp.OverlayOptions[]> {
  const art = sharp(readFileSync(FRAME_PATH));
  const { width: sw, height: sh } = await art.metadata().then((m) => ({ width: m.width!, height: m.height! }));
  const c = FRAME_MOULDING_SRC_PX;
  const m = Math.round(MOULDING * MOCKUP_SIZE);
  const ox = Math.round(box.x * MOCKUP_SIZE);
  const oy = Math.round(box.y * MOCKUP_SIZE);
  const ow = Math.round(box.width * MOCKUP_SIZE);
  const oh = Math.round(box.height * MOCKUP_SIZE);
  const piece = async (left: number, top: number, w: number, h: number, tw: number, th: number, x: number, y: number) => ({
    input: await sharp(readFileSync(FRAME_PATH)).extract({ left, top, width: w, height: h }).resize(tw, th, { fit: 'fill' }).png().toBuffer(),
    left: x,
    top: y,
  });
  return Promise.all([
    piece(0, 0, c, c, m, m, ox, oy),
    piece(sw - c, 0, c, c, m, m, ox + ow - m, oy),
    piece(0, sh - c, c, c, m, m, ox, oy + oh - m),
    piece(sw - c, sh - c, c, c, m, m, ox + ow - m, oy + oh - m),
    piece(c, 0, sw - 2 * c, c, ow - 2 * m, m, ox + m, oy),
    piece(c, sh - c, sw - 2 * c, c, ow - 2 * m, m, ox + m, oy + oh - m),
    piece(0, c, c, sh - 2 * c, m, oh - 2 * m, ox, oy + m),
    piece(sw - c, c, c, sh - 2 * c, m, oh - 2 * m, ox + ow - m, oy + m),
  ]);
}

/**
 * Generates one mockup PNG per product: the shop's frame around the product's
 * printable area(s), with a cream mat behind it and the printable area(s)
 * punched out as REAL alpha transparency, sized 800x800. Every product uses
 * the same frame art, so the editor, the room previews and the print file
 * all show one consistent frame.
 *
 * Critically, the punched-out area(s) come from `computePrintableRects` —
 * the exact same function `seedFrameTemplates` uses to compute
 * `FrameTemplate.printableRects` — so the mockup art's transparent hole
 * and the rect geometry the editor uses to place a customer's photo can
 * never drift out of sync with each other.
 */
async function generateMockups(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const product of seedProducts) {
    const variants = seedVariants.filter((v) => v.productId === product.id && v.isActive);
    if (variants.length === 0) {
      throw new Error(`Product ${product.slug} has no active variants — cannot generate a mockup for it.`);
    }

    const rectsPerVariant = variants.map((v) => computePrintableRects(product.photoSlots, v.aspectRatio, product.id));
    const rects: FrameTemplate['printableRects'] = rectsPerVariant[0];

    // One mockup PNG is shared across every variant of a product
    // (mockupUrl is per-product, not per-variant). That's only valid if
    // every variant's computed rects agree — today they happen to, since
    // every product's variants share an aspect ratio, but that's not an
    // enforced invariant anywhere else. Fail loudly rather than silently
    // rasterizing a hole that only matches some of the product's variants.
    for (let i = 1; i < rectsPerVariant.length; i++) {
      if (JSON.stringify(rectsPerVariant[i]) !== JSON.stringify(rects)) {
        throw new Error(
          `Product ${product.slug}: variant "${variants[i].id}" (aspectRatio ${variants[i].aspectRatio}) ` +
            `computes different printableRects than variant "${variants[0].id}" (aspectRatio ${variants[0].aspectRatio}). ` +
            `A single per-product mockup PNG cannot have a transparent hole that matches both — give this product ` +
            `per-variant mockups instead, or make its variants share an aspect ratio.`
        );
      }
    }

    const holeRects = rects
      .map((r) => {
        const x = r.x * MOCKUP_SIZE;
        const y = r.y * MOCKUP_SIZE;
        const w = r.width * MOCKUP_SIZE;
        const h = r.height * MOCKUP_SIZE;
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="black"/>`;
      })
      .join('\n            ');

    // The mat covers the whole frame opening except where the photos show through.
    const left = Math.min(...rects.map((r) => r.x));
    const top = Math.min(...rects.map((r) => r.y));
    const right = Math.max(...rects.map((r) => r.x + r.width));
    const bottom = Math.max(...rects.map((r) => r.y + r.height));
    const outer = { x: left - MAT - MOULDING, y: top - MAT - MOULDING, width: right - left + 2 * (MAT + MOULDING), height: bottom - top + 2 * (MAT + MOULDING) };
    const inner = { x: outer.x + MOULDING, y: outer.y + MOULDING, width: outer.width - 2 * MOULDING, height: outer.height - 2 * MOULDING };
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${MOCKUP_SIZE}" height="${MOCKUP_SIZE}">
        <defs>
          <mask id="printable-cutout">
            <rect width="${MOCKUP_SIZE}" height="${MOCKUP_SIZE}" fill="white"/>
            ${holeRects}
          </mask>
        </defs>
        <rect x="${inner.x * MOCKUP_SIZE}" y="${inner.y * MOCKUP_SIZE}" width="${inner.width * MOCKUP_SIZE}" height="${inner.height * MOCKUP_SIZE}" fill="#FAF6F0" mask="url(#printable-cutout)"/>
      </svg>
    `;
    const mat = await sharp(Buffer.from(svg)).png().toBuffer();
    const frame = await frameAround(outer);
    const outputPath = join(OUTPUT_DIR, `${product.slug}.png`);
    await sharp(mat).composite(frame).png().toFile(outputPath);
    console.log(`Generated ${outputPath} (${rects.length} printable rect${rects.length === 1 ? '' : 's'})`);
  }
}

generateMockups().catch((error) => {
  console.error(error);
  process.exit(1);
});
