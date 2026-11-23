// LOCAL EMULATOR ONLY: bulk photo picking on a collage product (fill, overflow kept, duplicates, non-photos, swap).
import { createRequire } from 'node:module';
const require = createRequire('/Users/allwin1906/Documents/GitHub/Bro-pics/apps/web/package.json');
const { chromium, devices } = require('/Users/allwin1906/Documents/GitHub/Bro-pics/node_modules/.pnpm/playwright@1.63.0/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:3100';
if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error('local only');
const DIR = process.argv[2];
const SLUG = process.argv[3] || 'baby-12-month-milestone-photo-collage-frame';
const SHOTS = process.env.SHOTS;
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
await page.goto(`${BASE}/product/${SLUG}`, { waitUntil: 'load', timeout: 120000 });
await page.getByRole('button', { name: /Decline/ }).click({ timeout: 2000 }).catch(() => {});
await page.waitForTimeout(2500);
const out = {};
const counter = async () => (await page.locator('text=/\\d+ of \\d+ added/').first().textContent().catch(() => null));
out.before = await counter();
const total = parseInt((out.before ?? '0 of 0').split(' of ')[1], 10);
out.total = total;
// 1) Big ADD PHOTOS NOW opens the multi picker; pick total+3 photos plus a text file.
const files = Array.from({ length: total + 3 }, (_, i) => `${DIR}/p${String(i + 1).padStart(2, '0')}.jpg`).concat(`${DIR}/notes.txt`);
let [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10000 }), page.getByRole('radio', { name: /Add photos now/i }).click()]);
out.multiple = chooser.isMultiple();
await chooser.setFiles(files);
await page.waitForTimeout(1500);
out.notice = (await page.locator('[role=status]').allTextContents()).join(' | ').slice(0, 400);
out.extrasShown = await page.locator('[data-testid=extra-photos] li').count();
await page.waitForFunction(() => !/Uploading \d+ photo/.test(document.body.innerText), null, { timeout: 120000 }).catch(() => {});
out.afterFill = await counter();
console.log('STEP1', JSON.stringify(out)); if (SHOTS) await page.screenshot({ path: `${SHOTS}/step1.png` });
// 2)
// Select space 1 (has a photo), use the first extra.
await page.getByRole('button', { name: /^Space 1|^Photo 1|: photo added/ }).first().click().catch(() => {});
await page.locator('[data-testid=extra-photos] li button').first().click();
await page.waitForTimeout(1500);
out.extrasAfterPlace = await page.locator('[data-testid=extra-photos] li').count();
// 3) Duplicates: pick photos 2..4 again via "Change image 2"? Use Add-more is hidden when full; use the single chooser path via
//    the bulk input directly.
await page.setInputFiles('[data-testid=customizer-bulk-input]', [`${DIR}/p02.jpg`, `${DIR}/p03.jpg`]);
await page.waitForTimeout(800);
out.duplicateNotice = (await page.locator('[role=status]').allTextContents()).join(' | ').slice(0, 300);
// 4) Move: the active space's "Move ... to" select swaps.
const mv = page.locator('select:has(option:text("Choose a space…"))').first();
out.moveControl = await mv.count();
if (out.moveControl) {
  const opt = await mv.locator('option').nth(1).getAttribute('value');
  await mv.selectOption(opt);
  await page.waitForTimeout(800);
}
out.final = await counter();
if (SHOTS) await page.screenshot({ path: `${SHOTS}/bulk-${SLUG}.png`, fullPage: false });
out.errors = [...new Set(errors)];
console.log(JSON.stringify(out, null, 1));
await browser.close();
