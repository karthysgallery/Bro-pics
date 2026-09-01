// scripts/seed/src/generate-mockups.ts
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedProducts } from './data';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', '..', '..', 'apps', 'web', 'public', 'placeholders', 'mockups');

/**
 * Generates one flat placeholder mockup PNG per product: a plain frame
 * outline (terracotta border on cream background) with a rectangular
 * cutout, sized 800x800. Not photoreal — just enough to prove the
 * upload/position/DPI/preview pipeline composites correctly. Real
 * photography-team mockups replace these files later without any code
 * change (only the seed data's mockupUrl values need updating).
 */
async function generateMockups(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const product of seedProducts) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
        <rect width="800" height="800" fill="#FAF6F0"/>
        <rect x="20" y="20" width="760" height="760" fill="none" stroke="#C1592A" stroke-width="16"/>
        <rect x="100" y="100" width="600" height="600" fill="#2A2622" fill-opacity="0.06"/>
      </svg>
    `;
    const outputPath = join(OUTPUT_DIR, `${product.slug}.png`);
    await sharp(Buffer.from(svg)).png().toFile(outputPath);
    console.log(`Generated ${outputPath}`);
  }
}

generateMockups().catch((error) => {
  console.error(error);
  process.exit(1);
});
