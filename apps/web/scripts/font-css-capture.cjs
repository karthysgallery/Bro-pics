/**
 * Records the Google Fonts stylesheets that `next build` asks for, into google-fonts-css.json.
 *
 *   NEXT_FONT_GOOGLE_MOCKED_RESPONSES=$PWD/scripts/font-css-capture.cjs NEXT_DIST_DIR=.next-fontcapture npx next build
 *
 * (stop it once "Compiled successfully" shows). The Docker build then reads the saved file instead of asking Google
 * for the stylesheets (Cloud Build sometimes gets an answer Next.js cannot read and the whole deploy fails).
 * Run this again whenever a font is added to app/layout.tsx or lib/text-personalization-options.ts.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36';
const target = path.join(__dirname, '..', 'google-fonts-css.json');
const recorded = {};

module.exports = new Proxy(recorded, {
  get(obj, url) {
    if (typeof url !== 'string' || !url.startsWith('https://fonts.googleapis.com/')) return undefined;
    if (!(url in obj)) {
      const css = execFileSync('curl', ['-sf', '-A', UA, url]).toString('utf8');
      if (!/\.woff2\)/.test(css)) throw new Error(`Unexpected stylesheet for ${url}`);
      obj[url] = css;
      fs.writeFileSync(target, JSON.stringify(obj, null, 1) + '\n');
    }
    return obj[url];
  },
});
