// scripts/seed/src/generate-mockups.ts
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedProducts, seedVariants, computePrintableRects } from './data';
import type { FrameTemplate } from '@bro-pics/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', '..', '..', 'apps', 'web', 'public', 'placeholders', 'mockups');
const MOCKUP_SIZE = 800;

/**
 * Generates one flat placeholder mockup PNG per product: a plain frame
 * outline (terracotta border on cream background) with the printable
 * area(s) punched out as REAL alpha transparency, sized 800x800. Not
 * photoreal — just enough to prove the upload/position/DPI/preview
 * pipeline composites correctly. Real photography-team mockups replace
 * these files later without any code change (only the seed data's
 * mockupUrl values need updating).
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

    const rectsPerVariant = variants.map((v) => computePrintableRects(product.photoSlots, v.aspectRatio));
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

    const slotOutlines = rects
      .map((r) => {
        const x = r.x * MOCKUP_SIZE;
        const y = r.y * MOCKUP_SIZE;
        const w = r.width * MOCKUP_SIZE;
        const h = r.height * MOCKUP_SIZE;
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#2A2622" stroke-opacity="0.15" stroke-width="2"/>`;
      })
      .join('\n            ');

    // The background rect is masked (white = opaque, black = the punched
    // hole) so every printable-rect area ends up with real alpha 0 —
    // the customer's uploaded photo, composited underneath in the editor,
    // shows through. The border rect is drawn separately, unmasked, so the
    // frame's outer edge stays fully opaque regardless of hole placement.
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${MOCKUP_SIZE}" height="${MOCKUP_SIZE}">
        <defs>
          <mask id="printable-cutout">
            <rect width="${MOCKUP_SIZE}" height="${MOCKUP_SIZE}" fill="white"/>
            ${holeRects}
          </mask>
        </defs>
        <rect width="${MOCKUP_SIZE}" height="${MOCKUP_SIZE}" fill="#FAF6F0" mask="url(#printable-cutout)"/>
        <rect x="20" y="20" width="${MOCKUP_SIZE - 40}" height="${MOCKUP_SIZE - 40}" fill="none" stroke="#C1592A" stroke-width="16"/>
        ${slotOutlines}
      </svg>
    `;
    const outputPath = join(OUTPUT_DIR, `${product.slug}.png`);
    await sharp(Buffer.from(svg)).png().toFile(outputPath);
    console.log(`Generated ${outputPath} (${rects.length} printable rect${rects.length === 1 ? '' : 's'})`);
  }
}

generateMockups().catch((error) => {
  console.error(error);
  process.exit(1);
});
