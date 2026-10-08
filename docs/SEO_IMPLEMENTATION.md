# SEO implementation — audit, architecture and status

Written 2026-10-08. Code at the commit that follows `80c357e`. Nothing is deployed, `master` is untouched, DNS is unchanged and the
site is still in preview mode (noindex) — see "Production safety" at the end.

Status labels used throughout:
**BUILT** (code exists) · **TESTED** (automated tests and/or run against a real production build on the emulators) ·
**NOT TESTED** · **BLOCKED** (waiting on something outside the code) · **REQUIRES GOOGLE SEARCH CONSOLE** · **REQUIRES GOOGLE MERCHANT CENTER**

No ranking is promised. Google must crawl and index the pages first, and ranking depends on content quality, competition, links and
real user behaviour. Nothing here claims a page is indexed.

---

## 1. Audit of what existed (before this work)

| Area | Finding |
|---|---|
| Per-product SEO fields | Already existed: `product.seo` (title, description, focus keyword, keywords, image alt, noindex) and an admin SEO tab with score and Google preview. **Kept and reused.** |
| robots.txt | Existed, but advertised the sitemap on `NEXT_PUBLIC_SITE_URL` (the Cloud Run address on the preview), had no `/cart`, `/search`, sign-in pages, and **disallowed all of `/api`, which blocks public images served under `/api/media/`**. |
| Sitemap | One flat `app/sitemap.ts`: no index, no image sitemap, no `lastmod` for categories, URLs built from `NEXT_PUBLIC_SITE_URL` (so a preview build would publish Cloud Run URLs). |
| Canonical origin | `NEXT_PUBLIC_SITE_URL` was used for canonicals, JSON-LD and the sitemap → wrong on any non-production deployment. |
| Product structured data | Single `Product` with `AggregateOffer`; no per-variant data; an invented `priceValidUntil` (now +1 year from "today", not a real fact); no shipping details; reviews labelled "Verified KarthysGallery customer" for every reviewer. |
| Product metadata | Title/description from owner fields or a fixed template; OG/Twitter present; **canonical self-referencing (good)**. |
| Category pages | Metadata + BreadcrumbList; **page 2+ was noindex with a canonical to page 1** (conflicting signals; later pages' products unreachable for crawlers except via sitemap). No ItemList/CollectionPage. |
| Content pages (about, FAQ, policies…) | **No canonical and no Open Graph URL.** |
| Shop-all `/category` | No canonical, no breadcrumb data. |
| Private pages | robots.txt only; `/cart`, `/signin`, `/signup`, `/search` had no noindex signal on cart/auth pages. |
| 404 handling | **Soft 404s**: an unknown product/category/combo returned HTTP **200** with a "not found" screen, because the global `app/loading.tsx` skeleton had already been sent. |
| Renamed products | Old address → 404 (no redirect, no slug history). |
| Product page rendering | Read `searchParams` on the server, so every request rendered fresh and was **uncacheable** (`Cache-Control: private, no-store`) — slow for crawlers and users. |
| Homepage | No page-level metadata/canonical, no `WebSite` data (Organization existed sitewide); H1 present in the hero. |
| Images | Product images use `next/image` with `fill`, `sizes`, `priority` on the main PDP image (good). Alt text from `seo.imageAlt` or product name; scene/decoration images have empty alt (correct). |
| Reviews | Real, moderated reviews with `isVerified`; marked up only when approved (good). |
| Structured data in HTML | Server-rendered (good). JSON-LD was written without escaping `<`. |
| Combo offers | Pages existed; no sitemap entry for the combos list; no links from products. |

Not found / not applicable: pagination `rel=prev/next` (Google ignores it), hreflang (single language), AMP.

---

## 2. What was built

### 2.1 Canonical origin — BUILT, TESTED
`apps/web/lib/seo/site.ts`: `CANONICAL_ORIGIN = https://karthysgallery.in` (override only with `SEO_CANONICAL_ORIGIN`).
Used for `metadataBase`, every canonical, sitemaps, JSON-LD and the feed. It deliberately ignores `NEXT_PUBLIC_SITE_URL`, so the
Cloud Run preview, Firebase and localhost can never leak into SEO URLs. `isForbiddenSeoHost()` is used by the audit script.

### 2.2 Sitemap architecture — BUILT, TESTED
Route handlers (not a hand-written file): every list is read live from Firestore and cached for one hour (ISR) **and** refreshed immediately
by `revalidateSitemaps()` whenever the admin publishes, edits, archives or renames a product/category/combo.

| URL | Contents |
|---|---|
| `/sitemap.xml` | Sitemap **index** (no `lastmod`: it would be a made-up "now") |
| `/sitemap-pages.xml` | Home + information pages |
| `/sitemap-categories.xml` | `/category` (shop all) + active categories **that have at least one published product** (empty = thin = excluded); `lastmod` = newest product update in it |
| `/sitemap-products.xml` | Every product with `isActive == true` and not `seo.noindex`; `lastmod` = product `updatedAt`; up to 20 images each |
| `/sitemap-combos.xml` | `/combos` + published combos (only when any exist) |
| `/sitemap-images.xml` | The same product pages with all their photos (dedicated feed for Google Images) |

Excluded by construction: draft/archived products (`isActive false`), noindex products, admin, checkout, cart, account, orders, sign-in,
search, the combo frame editor URLs, anything with query strings, filtered/sorted URLs. Limit protection: 50,000 URLs per file (not near).
Verified on a production build against the emulator catalogue: 7 products listed, the archived mug absent.

### 2.3 robots.txt — BUILT, TESTED
`app/robots.ts` (preview mode stays `Disallow: /` with no sitemap line).
Production rules: `Allow: /`, **`Allow: /api/media/`** (public images), `Disallow:` `/admin /staff /dashboard /checkout /cart /orders /account /signin /signup /forgot-password /search /combo/*/frame/ /api/`;
`Sitemap: https://karthysgallery.in/sitemap.xml`. CSS/JS under `/_next/` and `/placeholders/` stay crawlable.

### 2.4 Indexability policy — BUILT, TESTED (headers) / NOT TESTED (Google behaviour)
INDEX: home, shop-all, categories with products, published products, published combos + combos list, information pages.
NOINDEX (`X-Robots-Tag: noindex, nofollow` from `next.config.ts` **and** robots.txt): admin, staff, api (except `/api/media/`), checkout, cart,
account, orders, sign-in/up, forgot-password, search, `/policies` (duplicate tabbed copy), combo frame editor URLs.
Filtered category URLs with 2+ filters: `noindex,follow`; one filter or sorting: canonical to the bare category.
Product with `seo.noindex`: `noindex,follow` and out of sitemap/feed.
Note: a page blocked in robots.txt cannot show Google its noindex; both are used on purpose (robots.txt saves crawl, the header covers anything crawled anyway).

### 2.5 Product SEO generator — BUILT, TESTED
`lib/seo/product-seo.ts` (pure functions, 10 tests):
- **Title**: owner's `seo.title`, else `"<product name> | KarthysGallery"` (brand dropped when it would exceed 60 characters).
- **Description**: owner's, else assembled from the product's own short description + photo count/message option + starting price, trimmed to ≤160
  characters on a word boundary (price kept ahead of the photo sentence when space is tight). Never one shared sentence for all products.
- **Image alt**: owner's `seo.imageAlt`, else `"<name> — personalized photo frame"`.
- `productSeoReport()` → completeness score, canonical URL, indexable / in-sitemap flags (used by the admin panel).
Product page `generateMetadata` uses these plus Open Graph and Twitter cards; every product canonicalizes to **itself**.

### 2.6 Structured data — BUILT, TESTED (shape) / REQUIRES GOOGLE SEARCH CONSOLE (Rich Results Test)
`lib/structured-data.ts`, rendered in the server HTML:
- **ProductGroup + hasVariant** when sizes/finishes/materials differ (`variesBy` lists only what really differs); each variant is a `Product` with its own SKU, size, colour,
  `Offer` (price in INR, availability from its own stock state, `url?variantId=…`, brand, seller). `?variantId=` opens the page on that size.
- Single variant or identical prices: plain `Product` / `Offer` / `AggregateOffer`.
- **`shippingDetails`** per offer from real data: shipping charge from Admin shipping settings (₹0 at/above the free-shipping threshold, else the flat charge), India,
  handling time = the product's own dispatch days.
- `aggregateRating`/`review` only when approved reviews exist (author label "Verified buyer" only when the review is marked verified, else "KarthysGallery customer").
- `BreadcrumbList` (same trail as the visible breadcrumb), `Organization` (sitewide), `WebSite` (homepage), `CollectionPage` + `ItemList` (category pages).
- Removed: invented `priceValidUntil`. **Not output (no data)**: `hasMerchantReturnPolicy`, GTIN/MPN, review author names, logo, social profiles.
- `SearchAction`: deliberately **not** added (Google retired the sitelinks search box; the site's search page is noindex).
- JSON-LD is escaped (`<` → `<`).

### 2.7 Category SEO — BUILT, TESTED
Generated title/description (owner's `seo.*` or the category description or "name + product count"), **pagination**: page N canonical to itself and indexable, filters
canonicalize to the bare category, `CollectionPage`/`ItemList`, visible H1 + description (existing), "More collections" links (+ Combo offers when any).
The requested landing slugs (`/photo-frames`, `/wedding-photo-frames`, …) are **not** created: the catalogue has 4 categories and 8 products today, and thin pages hurt.
Add categories in the admin as real products appear; each automatically gets a page, metadata, structured data and a sitemap entry.

### 2.8 Internal linking — BUILT, TESTED (pages) 
Home → category tiles (existing) + **combo strip** after best sellers → category → product cards (existing); product → breadcrumb category, related products (existing), **"Also in a combo offer"**
links; combo page → its products (existing); category → sibling categories + combos; header gets **"Combo offers"** automatically while any combo is published.
Every published product is in the sitemap and reachable from its category listing (orphan check: the audit script's `--db` mode compares catalogue vs sitemap).

### 2.9 Redirects, 404s, renamed products — BUILT, TESTED
- Unknown product/category/combo → **real HTTP 404** (the global loading skeleton was moved to account/admin/checkout/cart/search; `notFound()` is raised while metadata resolves).
  Tested on a production build: 404 for both browsers and Googlebot user-agent.
- Archived/draft product → 404 and out of the sitemap/feed (tested).
- Renamed product: the admin PATCH stores the old address in `slugHistory`; the old URL answers **308 permanent redirect** to the new one (tested on a production build).
- 410 Gone is not used: Next.js cannot send 410 from a page; Google treats 404 and 410 alike over time.
- HTTP→HTTPS and www→apex are handled by Firebase Hosting once DNS is set (`www` redirects to the apex: the Hosting domain config already does this). NOT TESTED until DNS exists.
- Trailing-slash: Next.js redirects `/x/` → `/x`; canonical URLs are built without trailing slashes.

### 2.10 Performance — BUILT (rendering) / NOT TESTED (Core Web Vitals)
- Product pages are now **pre-rendered and cached** (`x-nextjs-cache: HIT`, `s-maxage=60, stale-while-revalidate`), instead of rendered per request with `no-store`. This is the largest crawl/LCP win here.
- Main product image `priority`, `sizes` set, container reserves space (`aspect-square`) → low CLS (existing).
- Production build sizes (First Load JS): home 290 kB, product 310 kB, category 149 kB. The personalization editor ships with the product page for everyone (see Remaining issues).
- Lighthouse / Core Web Vitals field data: **NOT TESTED** (needs real traffic or PageSpeed Insights on the live domain).

### 2.11 Merchant / Shopping feed — BUILT, TESTED (format) / REQUIRES GOOGLE MERCHANT CENTER
`/feeds/google-merchant.xml` (RSS 2.0 `g:` feed): one item per active size/finish of every published, indexable product — id (SKU), `item_group_id`, title, description (same generator as the meta description),
variant link, absolute image link, availability, `price` in INR, `condition new`, brand, `identifier_exists no` (custom products have no GTIN/MPN), product type = category name, size/colour/material.
Items without an image or price are skipped, never faked. The Google product category is **not** set (owner picks it in Merchant Center).
Return policy and shipping speed/cost for listings are configured in Merchant Center (they are not stored as structured data in the catalogue).

### 2.12 Admin — BUILT, TESTED
Product SEO tab (existing: score, Google preview, suggestions, keyword, alt, noindex) now also shows **Search status**: canonical URL, indexable or hidden (and why), sitemap inclusion,
structured-data and feed status. Defaults are automatic; nothing forces manual SEO per product.

### 2.13 Validation script — BUILT, TESTED
`pnpm --filter @bro-pics/web seo:audit -- --base <url> [--db] [--expect-production]` (`apps/web/scripts/seo-audit.mjs`). Checks robots.txt, sitemap index/children XML, canonical-domain
URLs, forbidden hosts, duplicates, every sitemap URL (HTTP 200, self canonical, unique title/description, one H1, OG/Twitter, JSON-LD parse, Product/ProductGroup + price visible, BreadcrumbList),
404 for unknown product, noindex on `/cart /checkout /search /signin`, and with `--db` the catalogue-vs-sitemap comparison (published in, archived out). Exit code 1 on any FAIL.
**`--expect-production` is the go-live gate**: any noindex or `Disallow: /` becomes a failure.

---

## 3. Verification actually performed

| Check | Result |
|---|---|
| Unit/integration tests (web) | 1,955 passing (incl. SEO generator, ProductGroup JSON-LD, sitemap XML, robots, merchant feed, revalidation, category/product metadata) |
| Typecheck | clean |
| Production build (`next build`) + `next start` against the Firestore emulator | built; product pages prerendered (HIT); unknown product/category/combo → 404; archived product → 404; old slug → 308; `?variantId=` selects that size |
| `seo-audit --db` on that production build | **PASS 52, WARN 10, FAIL 0** |
| The 10 warnings | Seed products' owner-written meta descriptions are 41–56 characters (short). Data quality, not code: write 70–160 character descriptions in the admin (the SEO tab flags it). |
| Sitemap vs catalogue | 7 published products listed; archived product excluded |
| Google Rich Results Test / URL Inspection / Search Console | **NOT TESTED — REQUIRES GOOGLE SEARCH CONSOLE** (needs the live domain) |
| Merchant Center feed acceptance | **NOT TESTED — REQUIRES GOOGLE MERCHANT CENTER** |
| Core Web Vitals / PageSpeed | **NOT TESTED** (needs the live domain) |
| Real production catalogue | The live project has the same 8 products; this audit ran on the seeded emulator copy (live data not written to) |

---

## 4. Remaining SEO issues (honest list)

1. **Owner meta descriptions are short** on the seeded products (see warnings). Needs content, not code.
2. **No GA4 / analytics** is installed (needs a Measurement ID and a consent decision) — **NOT BUILT**, see the launch guide.
3. **Return policy structured data** (`hasMerchantReturnPolicy`) not output: the return window is not stored as data. Needs the client's real policy.
4. **Review author names** are not stored (only a user id), so markup uses a generic label. Optional: store a display name when a review is submitted.
5. **Heavy editor on the product page**: the personalization editor JS loads for every visitor (310 kB First Load JS). Deferring it to "Customize" click would help Core Web Vitals but touches the personalization engine; **not changed** (instruction: don't break it). Recommended follow-up with the editor tests running.
6. **Category pages are rendered per request** (they read filters from the URL), not cached. Fast enough now; revisit if traffic grows.
7. **Content pages** (guides) are not written; only the strategy exists (launch guide §H). Real photos/mockups and a logo file are needed for Organization `logo`/`sameAs`.
8. **Landing categories** (wedding/birthday/A4/combos…) depend on real catalogue structure — create categories in the admin when products exist.
9. Dev-mode image URLs in the seed use `/placeholders/…` svgs; real product photos must be uploaded before launch (sitemaps/feed use them as they are).
10. The Cloud Run preview currently serves an **older build**; none of this is live until the release.

---

## 5. Production safety (unchanged)
Preview mode is still **on** (noindex everywhere, `Disallow: /`). Nothing here removes it. No push to `master`, no deploy, no DNS change. The preview's
`SITE_PREVIEW=1` still blocks indexing; the go-live gate is `seo:audit --expect-production` run **after** production mode is turned on.

## 6. Go-live SEO checklist (summary — full steps in `SEO_LAUNCH_GUIDE.md`)
1. Release code (owner approves `master` push) → Cloud Build deploys.
2. DNS live, HTTPS active on `https://karthysgallery.in` and `www` redirects to it.
3. Turn production mode on (`SITE_PREVIEW=0`, `NEXT_PUBLIC_SITE_URL=https://karthysgallery.in`).
4. Run `pnpm --filter @bro-pics/web seo:audit -- --base https://karthysgallery.in --db --expect-production` → must be 0 FAIL.
5. Search Console: verify domain (DNS TXT), submit `https://karthysgallery.in/sitemap.xml`, inspect 5–10 URLs.
6. Merchant Center: claim site, add the feed `https://karthysgallery.in/feeds/google-merchant.xml`.
7. GA4 (optional but recommended), Business Profile (if applicable).
8. Monitor weekly (launch guide §L).
