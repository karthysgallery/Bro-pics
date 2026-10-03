import fs from 'fs';
import path from 'path';

const brainDir = 'C:\\Users\\dell\\.gemini\\antigravity-ide\\brain\\5c62365b-464b-4890-962f-5e8d5014f80a';
const destDir = 'd:\\Projects\\Bro-pics\\apps\\web\\public\\placeholders\\products';

const mappings = [
  { src: 'classic_wooden_frame_1791023666069.jpg', dests: ['classic-wooden-frame-1.jpg', 'classic-wooden-frame-2.jpg', 'classic-wooden-photo-frame-1.svg', 'classic-wooden-photo-frame-2.svg', 'classic-wooden-frame-1.svg', 'classic-wooden-frame-2.svg'] },
  { src: 'everyday_oak_frame_1791023702374.jpg', dests: ['vintage-collage-frame-1.jpg', 'vintage-collage-frame-2.jpg', 'vintage-collage-frame-1.svg', 'vintage-collage-frame-2.svg'] },
  { src: 'story_collage_frame_1791023734208.jpg', dests: ['photo-collage-set-1.jpg', 'photo-collage-set-2.jpg', 'photo-collage-set-1.svg', 'photo-collage-set-2.svg'] },
  { src: 'gallery_wall_set_1791023949455.jpg', dests: ['photo-canvas-print-1.jpg', 'photo-canvas-print-2.jpg', 'photo-canvas-print-1.svg', 'photo-canvas-print-2.svg'] },
  { src: 'couples_frame_mockup_1791024016049.jpg', dests: ['couples-eye-frame-1.jpg', 'couples-eye-frame-2.jpg', 'couples-eye-frame-1.svg', 'couples-eye-frame-2.svg'] },
  { src: 'acrylic_frame_mockup_1791024055567.jpg', dests: ['modern-acrylic-frame-1.jpg', 'modern-acrylic-frame-2.jpg', 'modern-acrylic-frame-1.svg', 'modern-acrylic-frame-2.svg'] },
  { src: 'desk_frame_mockup_1791024094615.jpg', dests: ['desk-photo-frame-1.jpg', 'desk-photo-frame-2.jpg', 'desk-photo-frame-1.svg', 'desk-photo-frame-2.svg', 'personalized-photo-mug-1.jpg', 'personalized-photo-mug-2.jpg', 'personalized-photo-mug-1.svg', 'personalized-photo-mug-2.svg'] }
];

for (const item of mappings) {
  const srcPath = path.join(brainDir, item.src);
  if (fs.existsSync(srcPath)) {
    for (const destName of item.dests) {
      const destPath = path.join(destDir, destName);
      if (destName.endsWith('.svg')) {
        // Convert image to valid SVG data URI wrapper so any component loading .svg gets the high res image immediately
        const base64 = fs.readFileSync(srcPath).toString('base64');
        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="100%" height="100%"><image href="data:image/jpeg;base64,${base64}" width="1000" height="1000" preserveAspectRatio="xMidYMid slice"/></svg>`;
        fs.writeFileSync(destPath, svgContent);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
      console.log(`Copied ${item.src} -> ${destName}`);
    }
  } else {
    console.error(`Missing source: ${srcPath}`);
  }
}
