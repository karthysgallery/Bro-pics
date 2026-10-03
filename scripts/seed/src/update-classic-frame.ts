import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const userImagePath = 'C:/Users/dell/.gemini/antigravity-ide/brain/7ca37f0e-99c2-416d-9a12-354398a03170/.user_uploaded/media_1791039208922.png';
const mockupDestDir = 'd:/Projects/Bro-pics/apps/web/public/placeholders/mockups';
const productsDestDir = 'd:/Projects/Bro-pics/apps/web/public/placeholders/products';

async function updateClassicFrame() {
  const img = sharp(userImagePath);
  const metadata = await img.metadata();
  const width = metadata.width!;
  const height = metadata.height!;

  // 1. Create mockup PNG with transparent aperture hole:
  const raw = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data } = raw;

  const frameLeft = 48;
  const frameRight = 449;
  const frameTop = 16;
  const frameBottom = 483;

  const apertureX = 128;
  const apertureY = 96;
  const apertureW = 244;
  const apertureH = 310;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // Hole for photo
      if (x >= apertureX && x < apertureX + apertureW && y >= apertureY && y < apertureY + apertureH) {
        data[idx + 3] = 0;
      }
      // Transparent outside outer frame
      else if (x < frameLeft || x > frameRight || y < frameTop || y > frameBottom) {
        data[idx + 3] = 0;
      }
    }
  }

  const mockupPath = path.join(mockupDestDir, 'classic-wooden-frame.png');
  await sharp(data, {
    raw: { width, height, channels: 4 }
  })
  .png()
  .toFile(mockupPath);
  console.log(`Updated mockup: ${mockupPath}`);

  // 2. Generate clean product photos for catalog/gallery:
  const jpgBuffer = await sharp(userImagePath).jpeg({ quality: 95 }).toBuffer();
  const base64Jpg = jpgBuffer.toString('base64');
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="100%" height="100%"><image href="data:image/jpeg;base64,${base64Jpg}" width="500" height="500" preserveAspectRatio="xMidYMid slice"/></svg>`;

  const destJpgs = [
    'classic-wooden-frame-1.jpg',
    'classic-wooden-frame-2.jpg',
  ];
  const destSvgs = [
    'classic-wooden-frame-1.svg',
    'classic-wooden-frame-2.svg',
    'classic-wooden-photo-frame-1.svg',
    'classic-wooden-photo-frame-2.svg',
  ];

  for (const name of destJpgs) {
    const dest = path.join(productsDestDir, name);
    fs.writeFileSync(dest, jpgBuffer);
    console.log(`Updated product JPG: ${dest}`);
  }

  for (const name of destSvgs) {
    const dest = path.join(productsDestDir, name);
    fs.writeFileSync(dest, svgContent);
    console.log(`Updated product SVG: ${dest}`);
  }

  console.log('All classic wooden frame assets updated successfully!');
}

updateClassicFrame().catch(console.error);
