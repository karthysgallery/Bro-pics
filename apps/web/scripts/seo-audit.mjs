#!/usr/bin/env node
/**
 * SEO audit — run it against a running copy of the site BEFORE a release.
 *
 *   node scripts/seo-audit.mjs --base http://localhost:3100            # local / emulator copy
 *   node scripts/seo-audit.mjs --base https://karthys-gallery-….run.app # the preview
 *   node scripts/seo-audit.mjs --base https://karthysgallery.in --expect-production
 *
 * Options
 *   --base <url>          where to fetch pages from (default http://localhost:3100)
 *   --canonical <origin>  the public address canonicals must use (default https://karthysgallery.in)
 *   --expect-production   the go-live gate: ANY noindex / "Disallow: /" is a failure (otherwise it is only a warning,
 *                         because the preview deliberately hides itself)
 *   --db                  also compare the sitemap with the catalogue in Firestore (uses the emulator when
 *                         FIRESTORE_EMULATOR_HOST is set, else the project's own credentials; read-only)
 *   --limit <n>           audit at most n pages per kind (default 200)
 *   --json                print the report as JSON
 *
 * Exit code 1 when anything FAILS.
 */
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1]?.startsWith('--') || args[i + 1] === undefined ? true : args[i + 1];
};
const BASE = String(opt('base', 'http://localhost:3100')).replace(/\/+$/, '');
const CANONICAL = String(opt('canonical', 'https://karthysgallery.in')).replace(/\/+$/, '');
const EXPECT_PRODUCTION = Boolean(opt('expect-production', false));
const CHECK_DB = Boolean(opt('db', false));
const LIMIT = Number(opt('limit', 200));
const AS_JSON = Boolean(opt('json', false));

const results = [];
const add = (status, area, message, url) => results.push({ status, area, message, ...(url && { url }) });
const pass = (area, message, url) => add('PASS', area, message, url);
const warn = (area, message, url) => add('WARN', area, message, url);
const fail = (area, message, url) => add('FAIL', area, message, url);

const FORBIDDEN_HOST = /(^|\.)(run\.app|web\.app|firebaseapp\.com|vercel\.app)$|^localhost|^127\.|^0\.0\.0\.0/i;
const toLocal = (canonicalUrl) => canonicalUrl.replace(CANONICAL, BASE);

async function get(url) {
  try {
    const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'karthys-seo-audit' } });
    return { status: res.status, headers: res.headers, text: await res.text(), location: res.headers.get('location') };
  } catch (error) {
    return { status: 0, headers: new Headers(), text: '', error: String(error) };
  }
}

const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function metaTag(html, nameOrProp) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${nameOrProp}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  return tag ? decode(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? '') : null;
}
const canonicalOf = (html) => html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0]?.match(/href=["']([^"']+)["']/i)?.[1] ?? null;
const titleOf = (html) => decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim();
const jsonLd = (html) =>
  [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => {
    try { return JSON.parse(m[1].replace(/\\u003c/g, '<')); } catch { return { __invalid: true }; }
  });

async function auditRobots() {
  const res = await get(`${BASE}/robots.txt`);
  if (res.status !== 200) return fail('robots.txt', `HTTP ${res.status}`);
  const text = res.text;
  if (/^\s*Disallow:\s*\/\s*$/im.test(text)) {
    (EXPECT_PRODUCTION ? fail : warn)('robots.txt', 'blocks the whole site ("Disallow: /") — correct for the preview, a launch blocker for production');
    return;
  }
  const sitemapLine = text.match(/^\s*Sitemap:\s*(\S+)/im)?.[1];
  sitemapLine === `${CANONICAL}/sitemap.xml` ? pass('robots.txt', `Sitemap line points at ${sitemapLine}`) : fail('robots.txt', `Sitemap line is "${sitemapLine ?? 'missing'}", expected ${CANONICAL}/sitemap.xml`);
  for (const path of ['/product/', '/category/', '/combo/', '/_next/']) {
    const blocked = [...text.matchAll(/^\s*Disallow:\s*(\S+)/gim)].some((m) => path.startsWith(m[1]) && m[1] !== '/combo/*/frame/');
    blocked ? fail('robots.txt', `${path} is disallowed`) : pass('robots.txt', `${path} is crawlable`);
  }
  for (const path of ['/admin', '/checkout', '/cart', '/account', '/search', '/api/']) {
    new RegExp(`^\\s*Disallow:\\s*${path.replace(/[/.]/g, '\\$&')}`, 'im').test(text) ? pass('robots.txt', `${path} is closed`) : fail('robots.txt', `${path} is not disallowed`);
  }
  /^\s*Allow:\s*\/api\/media\//im.test(text) ? pass('robots.txt', 'public images under /api/media/ stay crawlable') : fail('robots.txt', '/api/media/ images are not explicitly allowed (they are served from under /api/)');
}

async function readSitemaps() {
  const index = await get(`${BASE}/sitemap.xml`);
  if (index.status !== 200) {
    fail('sitemap', `/sitemap.xml returned HTTP ${index.status}`);
    return { pages: [], products: [], categories: [], combos: [], images: [] };
  }
  if (!/^<\?xml/.test(index.text.trim()) || !/<sitemapindex[\s>]/.test(index.text)) fail('sitemap', '/sitemap.xml is not a valid sitemap index');
  else pass('sitemap', '/sitemap.xml is a sitemap index');
  const children = locs(index.text);
  const out = { pages: [], products: [], categories: [], combos: [], images: [] };
  const seen = new Set();
  for (const child of children) {
    const host = new URL(child).host;
    if (FORBIDDEN_HOST.test(host)) fail('sitemap', `index lists a temporary address: ${child}`);
    const res = await get(toLocal(child));
    const kind = Object.keys(out).find((k) => child.includes(`sitemap-${k}.xml`));
    if (res.status !== 200) { fail('sitemap', `${child} returned HTTP ${res.status}`); continue; }
    if (!/^<\?xml/.test(res.text.trim()) || !/<\/urlset>\s*$/.test(res.text.trim())) { fail('sitemap', `${child} is not well-formed XML`); continue; }
    const urls = locs(res.text).filter((u) => !/image:loc/.test(u));
    const pageUrls = [...res.text.matchAll(/<url>\s*<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    pass('sitemap', `${child}: ${pageUrls.length} URLs`);
    for (const u of pageUrls) {
      const parsed = new URL(u);
      if (FORBIDDEN_HOST.test(parsed.host)) fail('sitemap', `temporary address in sitemap: ${u}`);
      else if (parsed.origin !== CANONICAL) fail('sitemap', `URL not on the canonical domain: ${u}`);
      if (/\/(admin|checkout|cart|account|orders|search|signin|signup|api)(\/|\?|$)/.test(parsed.pathname) || /\/frame\//.test(parsed.pathname) || parsed.search) fail('sitemap', `URL that should not be indexed is listed: ${u}`);
      if (kind !== 'images' && seen.has(u)) warn('sitemap', `listed twice across sitemaps: ${u}`);
      if (kind !== 'images') seen.add(u);
    }
    if (kind) out[kind].push(...pageUrls);
    void urls;
  }
  return out;
}

const titles = new Map();
const descriptions = new Map();

async function auditPage(canonicalUrl, kind) {
  const res = await get(toLocal(canonicalUrl));
  const area = `${kind} page`;
  if (res.status !== 200) return fail(area, `HTTP ${res.status}`, canonicalUrl);
  const html = res.text;

  const canonical = canonicalOf(html);
  if (!canonical) fail(area, 'no canonical link', canonicalUrl);
  else if (FORBIDDEN_HOST.test(new URL(canonical, CANONICAL).host)) fail(area, `canonical points at a temporary address: ${canonical}`, canonicalUrl);
  else if (new URL(canonical, CANONICAL).href.replace(/\/$/, '') !== canonicalUrl.replace(/\/$/, '')) fail(area, `canonical is ${canonical}, expected ${canonicalUrl}`, canonicalUrl);

  const noindex = /noindex/i.test(metaTag(html, 'robots') ?? '') || /noindex/i.test(res.headers.get('x-robots-tag') ?? '');
  if (noindex) (EXPECT_PRODUCTION ? fail : warn)(area, 'is noindex (expected on the preview; a launch blocker for production)', canonicalUrl);

  const title = titleOf(html);
  if (!title) fail(area, 'no <title>', canonicalUrl);
  else {
    if (titles.has(title)) fail(area, `duplicate title "${title}" (also ${titles.get(title)})`, canonicalUrl);
    titles.set(title, canonicalUrl);
    if (title.length > 70) warn(area, `title is ${title.length} characters (may be cut in results)`, canonicalUrl);
  }
  const description = metaTag(html, 'description');
  if (!description) fail(area, 'no meta description', canonicalUrl);
  else {
    if (descriptions.has(description)) fail(area, `duplicate meta description (also ${descriptions.get(description)})`, canonicalUrl);
    descriptions.set(description, canonicalUrl);
    if (description.length < 60 || description.length > 170) warn(area, `meta description is ${description.length} characters`, canonicalUrl);
  }
  for (const prop of ['og:title', 'og:description', 'og:url']) if (!metaTag(html, prop)) warn(area, `missing ${prop}`, canonicalUrl);
  if (!metaTag(html, 'og:image') && kind === 'product') warn(area, 'missing og:image', canonicalUrl);
  if (!metaTag(html, 'twitter:card')) warn(area, 'missing twitter:card', canonicalUrl);

  const h1s = (html.match(/<h1[\s>]/g) ?? []).length;
  if (kind !== 'home' && h1s !== 1) warn(area, `${h1s} <h1> elements (expected 1)`, canonicalUrl);
  if (kind === 'home' && h1s < 1) fail(area, 'no <h1>', canonicalUrl);

  const blocks = jsonLd(html);
  if (blocks.some((b) => b.__invalid)) fail(area, 'invalid JSON-LD', canonicalUrl);
  const types = blocks.flatMap((b) => (Array.isArray(b['@type']) ? b['@type'] : [b['@type']]));

  if (kind === 'product') {
    const product = blocks.find((b) => b['@type'] === 'Product' || b['@type'] === 'ProductGroup');
    if (!product) return fail(area, 'no Product/ProductGroup JSON-LD in the server-rendered HTML', canonicalUrl);
    pass(area, `${product['@type']} JSON-LD present in the HTML`, canonicalUrl);
    const offers = product['@type'] === 'ProductGroup' ? (product.hasVariant ?? []).map((v) => v.offers) : [product.offers];
    const prices = offers.flatMap((o) => (o?.['@type'] === 'AggregateOffer' ? [Number(o.lowPrice), Number(o.highPrice)] : [Number(o?.price)])).filter((n) => Number.isFinite(n));
    if (prices.length === 0) fail(area, 'structured data has no price', canonicalUrl);
    else {
      const visible = (n) => html.includes(`₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`) || html.includes(`₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
      // The page shows the price of the selected size (the first in-stock one); every price in the markup belongs to a
      // size the customer can pick, so at least one of them must be visible text on the page.
      const shown = [...new Set(prices)].find(visible);
      shown !== undefined ? pass(area, `price ₹${shown} in the markup matches the page`, canonicalUrl) : warn(area, `none of the prices in the markup (${[...new Set(prices)].join(', ')}) were found as visible text`, canonicalUrl);
    }
    const images = [].concat(product.image ?? []);
    if (images.length === 0) warn(area, 'no image in structured data', canonicalUrl);
    for (const img of images) if (!/^https?:\/\//.test(img)) fail(area, `image URL is not absolute: ${img}`, canonicalUrl);
    if (/aggregateRating/.test(JSON.stringify(product)) && !/review/i.test(html)) warn(area, 'aggregateRating present but no review text on the page', canonicalUrl);
  }
  if (kind === 'product' || kind === 'category') {
    const crumbs = blocks.find((b) => b['@type'] === 'BreadcrumbList');
    if (!crumbs) fail(area, 'no BreadcrumbList', canonicalUrl);
    else {
      const items = crumbs.itemListElement ?? [];
      const ok = items.length >= 2 && items.every((it, i) => it.position === i + 1 && /^https?:\/\//.test(it.item)) && items.every((it) => !FORBIDDEN_HOST.test(new URL(it.item).host));
      ok ? pass(area, 'BreadcrumbList valid', canonicalUrl) : fail(area, 'BreadcrumbList positions/URLs are wrong', canonicalUrl);
    }
  }
  if (kind === 'home') {
    types.includes('WebSite') ? pass(area, 'WebSite JSON-LD present', canonicalUrl) : warn(area, 'no WebSite JSON-LD', canonicalUrl);
  }
  // Organization lives in the root layout, so every page carries it.
  if (kind === 'home' && !types.includes('Organization')) warn(area, 'no Organization JSON-LD', canonicalUrl);
}

async function auditDatabase(sitemap) {
  let admin;
  try {
    const { initializeApp, getApps } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    if (getApps().length === 0) initializeApp({ projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'bropics-app' });
    admin = getFirestore();
  } catch (error) {
    return warn('database', `could not read the catalogue (${error.message}); skipped`);
  }
  const snap = await admin.collection('products').get();
  const live = new Map();
  const hidden = new Map();
  for (const d of snap.docs) {
    const p = d.data();
    (p.isActive && !p.seo?.noindex ? live : hidden).set(`${CANONICAL}/product/${p.slug}`, p);
  }
  const listed = new Set(sitemap.products);
  for (const url of live.keys()) listed.has(url) ? null : fail('database', `published product missing from the sitemap: ${url}`);
  for (const url of hidden.keys()) listed.has(url) ? fail('database', `archived/noindex product is in the sitemap: ${url}`) : null;
  pass('database', `${live.size} published products, all ${[...live.keys()].every((u) => listed.has(u)) ? 'in' : 'NOT all in'} the sitemap; ${hidden.size} unpublished/noindex kept out`);
  const missingImage = [...live.values()].filter((p) => !p.primaryImageUrl);
  missingImage.length ? warn('database', `${missingImage.length} published product(s) have no main image: ${missingImage.map((p) => p.slug).join(', ')}`) : pass('database', 'every published product has a main image');
}

async function main() {
  await auditRobots();
  const sitemap = await readSitemaps();
  const kinds = [['home', [`${CANONICAL}/`]], ['category', sitemap.categories], ['product', sitemap.products], ['combo', sitemap.combos], ['content', sitemap.pages.filter((u) => u !== `${CANONICAL}/`)]];
  for (const [kind, urls] of kinds) for (const url of urls.slice(0, LIMIT)) await auditPage(url, kind);

  const notFound = await get(`${BASE}/product/this-product-does-not-exist-seo-audit`);
  notFound.status === 404 ? pass('404 handling', 'an unknown product returns a real 404') : fail('404 handling', `an unknown product returned HTTP ${notFound.status}`);
  for (const path of ['/cart', '/checkout', '/search', '/signin']) {
    const res = await get(`${BASE}${path}`);
    const header = /noindex/i.test(res.headers.get('x-robots-tag') ?? '') || /noindex/i.test(metaTag(res.text, 'robots') ?? '');
    header ? pass('noindex', `${path} is noindex`) : fail('noindex', `${path} is indexable`);
  }
  if (CHECK_DB) await auditDatabase(sitemap);

  const counts = { PASS: 0, WARN: 0, FAIL: 0 };
  for (const r of results) counts[r.status]++;
  if (AS_JSON) console.log(JSON.stringify({ base: BASE, canonical: CANONICAL, counts, results }, null, 2));
  else {
    for (const r of results.filter((r) => r.status !== 'PASS')) console.log(`${r.status}  [${r.area}] ${r.message}${r.url ? `  (${r.url})` : ''}`);
    console.log(`\nSEO audit of ${BASE} (canonical ${CANONICAL}${EXPECT_PRODUCTION ? ', production gate' : ''})`);
    console.log(`  PASS ${counts.PASS}   WARN ${counts.WARN}   FAIL ${counts.FAIL}`);
  }
  process.exit(counts.FAIL > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('SEO audit crashed:', error);
  process.exit(2);
});
