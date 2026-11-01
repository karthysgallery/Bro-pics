import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const FONTS_DIR = 'd:/Projects/Bro-pics/services/print-render/fonts';
if (!existsSync(FONTS_DIR)) {
  mkdirSync(FONTS_DIR, { recursive: true });
}

// Map of local target filename -> possible Google Fonts raw URLs
const FONTS = [
  {
    filename: 'DancingScript-Regular.ttf',
    urls: [
      'https://raw.githubusercontent.com/google/fonts/main/ofl/dancingscript/DancingScript%5Bwght%5D.ttf',
      'https://github.com/google/fonts/raw/main/ofl/dancingscript/DancingScript%5Bwght%5D.ttf',
    ],
  },
  {
    filename: 'GreatVibes-Regular.ttf',
    urls: [
      'https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/GreatVibes-Regular.ttf',
    ],
  },
  {
    filename: 'Pacifico-Regular.ttf',
    urls: [
      'https://raw.githubusercontent.com/google/fonts/main/ofl/pacifico/Pacifico-Regular.ttf',
    ],
  },
  {
    filename: 'Sacramento-Regular.ttf',
    urls: [
      'https://raw.githubusercontent.com/google/fonts/main/ofl/sacramento/Sacramento-Regular.ttf',
    ],
  },
  {
    filename: 'Cormorant-Regular.ttf',
    urls: [
      'https://raw.githubusercontent.com/google/fonts/main/ofl/cormorant/Cormorant%5Bwght%5D.ttf',
      'https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/CormorantGaramond-Regular.ttf',
    ],
  },
  {
    filename: 'Cinzel-Regular.ttf',
    urls: [
      'https://raw.githubusercontent.com/google/fonts/main/ofl/cinzel/Cinzel%5Bwght%5D.ttf',
    ],
  },
  {
    filename: 'Caveat-Regular.ttf',
    urls: [
      'https://raw.githubusercontent.com/google/fonts/main/ofl/caveat/Caveat%5Bwght%5D.ttf',
    ],
  },
  {
    filename: 'JosefinSans-Regular.ttf',
    urls: [
      'https://raw.githubusercontent.com/google/fonts/main/ofl/josefinsans/JosefinSans%5Bwght%5D.ttf',
    ],
  },
  {
    filename: 'Allura-Regular.ttf',
    urls: ['https://raw.githubusercontent.com/google/fonts/main/ofl/allura/Allura-Regular.ttf'],
  },
  {
    filename: 'AlexBrush-Regular.ttf',
    urls: ['https://raw.githubusercontent.com/google/fonts/main/ofl/alexbrush/AlexBrush-Regular.ttf'],
  },
  {
    filename: 'Parisienne-Regular.ttf',
    urls: ['https://raw.githubusercontent.com/google/fonts/main/ofl/parisienne/Parisienne-Regular.ttf'],
  },
  {
    filename: 'PinyonScript-Regular.ttf',
    urls: ['https://raw.githubusercontent.com/google/fonts/main/ofl/pinyonscript/PinyonScript-Regular.ttf'],
  },
  {
    filename: 'Satisfy-Regular.ttf',
    urls: ['https://raw.githubusercontent.com/google/fonts/main/apache/satisfy/Satisfy-Regular.ttf'],
  },
  {
    filename: 'KaushanScript-Regular.ttf',
    urls: ['https://raw.githubusercontent.com/google/fonts/main/ofl/kaushanscript/KaushanScript-Regular.ttf'],
  },
  {
    filename: 'Lobster-Regular.ttf',
    urls: ['https://raw.githubusercontent.com/google/fonts/main/ofl/lobster/Lobster-Regular.ttf'],
  },
  {
    filename: 'PlayfairDisplay-Regular.ttf',
    urls: ['https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf'],
  },
  {
    filename: 'Montserrat-Regular.ttf',
    urls: ['https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf'],
  },
  {
    filename: 'NotoSansTamil-Regular.ttf',
    urls: [
      'https://raw.githubusercontent.com/google/fonts/main/ofl/notosanstamil/NotoSansTamil%5Bwdth%2Cwght%5D.ttf',
    ],
  },
  {
    filename: 'NotoSansDevanagari-Regular.ttf',
    urls: [
      'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansdevanagari/NotoSansDevanagari%5Bwdth%2Cwght%5D.ttf',
    ],
  },
];

async function downloadFonts() {
  console.log('Downloading fonts...');
  for (const font of FONTS) {
    const dest = join(FONTS_DIR, font.filename);
    let downloaded = false;
    for (const url of font.urls) {
      try {
        console.log(`Trying ${url} -> ${font.filename}`);
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          writeFileSync(dest, buf);
          console.log(`✓ Saved ${font.filename} (${buf.length} bytes)`);
          downloaded = true;
          break;
        } else {
          console.log(`Failed ${url}: status ${res.status}`);
        }
      } catch (err) {
        console.log(`Error ${url}:`, err.message);
      }
    }
    if (!downloaded) {
      console.error(`✗ Failed to download ${font.filename}`);
    }
  }
}

downloadFonts();
