import fs from 'fs';
import path from 'path';

const brainDir = 'C:\\Users\\dell\\.gemini\\antigravity-ide\\brain\\5c62365b-464b-4890-962f-5e8d5014f80a';
const destDir = 'd:\\Projects\\Bro-pics\\apps\\web\\public\\placeholders\\categories';

const mappings = [
  { src: 'cat_frames_decor_1791025557406.jpg', dests: ['frames.jpg', 'frames.svg'] },
  { src: 'cat_canvas_prints_1791025616493.jpg', dests: ['canvas.jpg', 'canvas.svg'] },
  { src: 'cat_collage_sets_1791025683864.jpg', dests: ['collage.jpg', 'collage.svg'] },
  { src: 'cat_personalized_gifts_1791025742253.jpg', dests: ['gifts.jpg', 'gifts.svg'] }
];

for (const item of mappings) {
  const srcPath = path.join(brainDir, item.src);
  if (fs.existsSync(srcPath)) {
    for (const destName of item.dests) {
      const destPath = path.join(destDir, destName);
      if (destName.endsWith('.svg')) {
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
