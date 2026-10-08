# SEO launch guide — what YOU do outside the code

For the owner of KarthysGallery. Written 2026-10-08. The technical SEO is built (see `SEO_IMPLEMENTATION.md`); this guide is everything that has to
happen in Google's tools and in the real world. Nothing here guarantees rankings — Google decides what to index and where to rank it.
Screens change; where a button name differs slightly, look for the closest one.

Legend: **BUILT BY CLAUDE** (already in the code) · **MY ACTION REQUIRED** · **GOOGLE ACTION REQUIRED** (Google does it, you wait) ·
**WAITING FOR INDEXING** · **LONG-TERM SEO WORK**

---

## 0. The order things must happen in

```
Code released to master (you approve)
        ↓
Website in production mode  (preview flag off → pages become indexable)
        ↓
karthysgallery.in transfer finished → DNS records added
        ↓
HTTPS certificate active on https://karthysgallery.in
        ↓
Run the SEO audit gate (must show 0 FAIL)
        ↓
Search Console: add property → verify with DNS TXT
        ↓
Submit https://karthysgallery.in/sitemap.xml
        ↓
Google discovers URLs  →  crawls  →  indexes   (days to weeks)
        ↓
Search performance data appears (impressions → clicks)
        ↓
Merchant Center + GA4 + Business Profile (parallel, after the site is live)
```

Do **not** do the Google steps before the live domain works: Search Console cannot verify a site it cannot reach, and the preview address must never be submitted.

---

## A. GOOGLE SEARCH CONSOLE (required, free) — MY ACTION REQUIRED

**Why:** it is the only place Google tells you whether your pages are indexed, why not, and what people searched to find you. **When:** after DNS + HTTPS work (during/after deployment).

### A1. Create the property (Domain property — recommended)
STEP 1
→ Go to https://search.google.com/search-console
→ Sign in with the Google account that should OWN the site (use the business account, not a personal one; later add others as users).
→ Click the property dropdown (top left) → **Add property**.
→ Choose **Domain** (left box). Type `karthysgallery.in` (no https://, no www). Click **Continue**.
→ Google shows a **TXT record** like `google-site-verification=…`. Copy it.

> Domain vs URL-prefix: a **Domain** property covers http/https, www and non-www and every subdomain in one place — best. URL-prefix only covers the exact prefix you type. Use Domain unless Google says you cannot verify DNS.

STEP 2 (put the TXT record in DNS)
→ Open the DNS panel of the registrar that controls the domain (GoDaddy after your transfer completes).
→ Add (or confirm it already exists) a **TXT** record: Name/Host `@`, Value = the whole `google-site-verification=…` text, TTL default.
→ **Do not delete** the existing TXT records. (Your domain already has one `google-site-verification=sjcXB-BUerD9…` record; if that is the same Google account you can reuse it. If Search Console shows a different value, add the new one **in addition**.)
→ Save.

STEP 3
→ Back in Search Console click **Verify**. If it says "couldn't verify yet", wait 10–60 minutes and click Verify again (DNS needs time).
→ Expect: "Ownership verified" and an empty report that says data will appear in a day or two.
**Common mistakes:** pasting the record at the wrong name (must be `@`/root, not `www`); removing the Firebase Hosting `hosting-site=bropics-app` TXT while "cleaning up"; verifying the Cloud Run address instead of karthysgallery.in.

### A2. Submit the sitemap
STEP 4
→ Left menu **Indexing → Sitemaps**.
→ In "Add a new sitemap" type `sitemap.xml` → **Submit**.
→ Expect status **Success** with "Discovered pages" a few minutes to hours later. It is a sitemap **index**, so Google also lists the five child sitemaps (pages, categories, products, combos, images).
→ If it says "Couldn't fetch": open https://karthysgallery.in/sitemap.xml in a browser. It must show XML. If it shows an error, tell me; do not resubmit repeatedly.
**Do not** submit the Cloud Run, Firebase or `www` address. **Do not** submit each child sitemap separately (the index does it).

### A3. Check the basics immediately after launch (day 0)
1. **Settings → Crawl stats** / **Indexing → Pages**: nothing yet is normal for the first days.
2. **URL Inspection** (search bar at the top): paste `https://karthysgallery.in/` → press Enter.
   - Expect "URL is not on Google" on day 0 — normal.
   - Click **Test live URL**: expect "URL is available to Google" and under *Page indexing* → "Indexing allowed? Yes". If it says **"No: 'noindex' detected"**, production mode is not on — stop and tell me.
3. Click **Request indexing** for these only (about 5–10 URLs total): the homepage, `/category`, your 2–3 best-selling product pages, one category, `/combos`. Reason: it is a nudge, not a requirement.
4. **Why not request hundreds?** There is a daily quota, it does not speed anything up, and the sitemap already tells Google about every URL. Let discovery work.

### A4. What each report means (weekly)
- **Indexing → Pages**: "Indexed" vs "Not indexed". Expected "not indexed" reasons that are **fine**: *Excluded by 'noindex' tag* (cart, sign-in, search), *Blocked by robots.txt* (admin, checkout, account), *Alternate page with proper canonical tag* (filtered/duplicate URLs), *Page with redirect* (old product addresses). Reasons to **act**: *Soft 404*, *Server error (5xx)*, *Not found (404)* on a URL in your sitemap, *Crawled – currently not indexed* for many product pages (usually thin content/very new site: improve descriptions, wait), *Discovered – currently not indexed* (give it weeks).
- **Experience → Core Web Vitals** (appears only after enough real visitor data, often weeks): LCP/INP/CLS "Good/Needs improvement/Poor". Act on "Poor" groups.
- **Experience → HTTPS**: should show all pages HTTPS. (The old "Mobile Usability" report was retired by Google in late 2023; check mobile with real phones and the PageSpeed tool.)
- **Enhancements → Products / Merchant listings / Breadcrumbs** (appear once Google finds the markup): shows valid items, warnings and errors. A few warnings (e.g. missing return policy, missing GTIN) are expected and not blocking.
- **Performance → Search results**: **Impressions** (times you appeared), **Clicks**, **CTR** (clicks ÷ impressions), **Average position**; filters for Queries, Pages, Countries, Devices; **Search type → Image** shows Google Images performance.

### A5. After the first week
→ **Links** report (who links to you), **Settings → Users and permissions** (add a second owner so you never lose access).

### Testing structured data (do on day 0–1)
→ https://search.google.com/test/rich-results → enter a live product URL → **Test URL**.
→ Expect: detected **Product snippets** and **Merchant listings**, **Breadcrumbs**. Warnings about "return policy" or "GTIN" are OK; errors in red are not — send me the screenshot.
**Do not claim a page is indexed until Search Console says "Indexed".**

---

## B. GOOGLE MERCHANT CENTER (recommended, free) — MY ACTION REQUIRED
**Should you use it? Yes.** It makes your products eligible for **free listings** in Google Shopping/Search/Images and "Buy" panels, with no ad spend. **When:** after the site is live.

What you need before starting (cannot be taken from the code — **you must provide**): legal business name and registered address, a business phone/email, GST/PAN as the form asks, your **return/refund policy** (window, who pays shipping — also visible on the site at `/return-refund-policy`), **shipping speed and cost**, and your bank/tax details only if Google asks.

STEP 1 → https://merchants.google.com → **Sign in** → **Get started** → enter business name, country **India**, time zone.
STEP 2 → **Business info**: legal name, address, phone (these must match what the site and Business Profile show).
STEP 3 → **Website**: enter `https://karthysgallery.in` → **Verify and claim**. Easiest method: because Search Console is verified with the same Google account, choose "Use your Google Search Console" (or the DNS TXT method). Then **Claim**.
STEP 4 → **Shipping and returns**: add a shipping service for India (use your real flat rate and free-shipping threshold — the site uses the values in Admin → Settings → Shipping) and the processing/delivery time (the site says dispatch 3–5 days + courier days: use your real numbers). Add the **return policy** (URL `https://karthysgallery.in/return-refund-policy`, window, cost). Be accurate: Google compares with the website.
STEP 5 → **Products → Add products → From the website's feed / "Add multiple products" → scheduled fetch**:
→ Feed name e.g. "KarthysGallery catalogue"; **File URL** = `https://karthysgallery.in/feeds/google-merchant.xml`; schedule **daily**; country India, language English.
→ **Save**. Click **Fetch now**. Expect: 1 item per size/finish (e.g. 12 items for the 8-product catalogue) with status "Processing" → "Approved" (can take hours to days).
**What the feed already contains (BUILT BY CLAUDE):** id (SKU), item_group_id (the product), title with size and finish, description, link to the exact size, image, availability, price in INR, condition new, brand KarthysGallery, size, colour, material, product type (category).
**What you must decide/enter:** the **Google product category** (in Merchant Center rules or per product: e.g. Home & Garden → Decor → Picture Frames — choose from Google's list; it is not guessed). **Identifiers:** custom/handmade products have no barcodes, so the feed says "no identifier" — correct.
STEP 6 → **Free listings**: Growth → Manage programs → turn on **Free listings** (there may be a short list of requirements: business info, website claimed, shipping and returns set).
**Automatic feeds vs feed file:** a scheduled fetch of our feed (above) is reliable and complete. "Automatic" crawling of structured data also works but is less controllable — keep the feed as the main source.
**Verify:** Products → Diagnostics shows issues. Common ones: missing shipping (fix in settings), image too small (use ≥ 800 px product photos), price mismatch (price on the page must equal the feed — it is generated from the same data), "Missing Google product category" (set it).
**Common mistakes:** entering a shipping/return policy that differs from the website; submitting the feed before the site is live; leaving placeholder (svg) product images.

---

## C. GOOGLE ANALYTICS 4 (recommended) — NOT BUILT yet; MY ACTION REQUIRED first
**Why:** shows which pages/products people view, where buyers drop off, and which sources sell. **When:** after launch (can be right at deployment).
STEP 1 → https://analytics.google.com → **Start measuring** → account name "KarthysGallery" → **Property** name "karthysgallery.in", time zone India, currency INR → business details → **Create**.
STEP 2 → **Admin → Data streams → Add stream → Web** → URL `https://karthysgallery.in`, name "Website" → **Create stream**. Copy the **Measurement ID** (`G-XXXXXXXXXX`).
STEP 3 → send me the Measurement ID. **What I will do** (not done yet, to avoid adding scripts before you decide): add it with Next.js's official `@next/third-parties` `GoogleAnalytics` component, **loaded only after the visitor accepts analytics cookies** (the shop already has a consent banner), so there is no page-weight hit for people who decline and no duplicate page views (the component tracks route changes by itself; we will **not** also send manual `page_view`).
Events to track (all via the standard ecommerce names so GA4's reports light up): `view_item` (product_view), `search`, `add_to_cart`, `begin_checkout`, `purchase`, custom `personalization_started`, `personalization_completed`, `view_item_list` for combos (`combo_view`), `combo_add_to_cart`, `coupon_applied`.
**How to verify:** GA4 → **Admin → DebugView** (needs the "Google Analytics Debugger" Chrome extension or `?debug_mode=1`) → open the site, click around → the events appear within seconds. Real-time report also shows you as a user.
**Mistakes to avoid:** pasting the old Universal Analytics `UA-` ID (retired); loading GA before consent; adding both a script tag and the component.

---

## D. GOOGLE BUSINESS PROFILE — depends; MY DECISION
**Should you?** Only if people can **visit you** (a studio/shop with an address) or you serve customers in a defined **service area** — Google requires a real, verifiable business presence. A purely online store with no public address generally does **not** qualify, and Google suspends profiles with invented addresses. **If yes:**
STEP 1 → https://www.google.com/business → **Manage now** → business name **exactly as on the website and invoices** → category (choose the closest real one, e.g. a photo-frame/gift shop category Google offers) → address or service area → phone → website `https://karthysgallery.in`.
STEP 2 → verify (postcard/phone/video as offered). STEP 3 → add hours, description (plain, no keyword lists), photos of real products and your workshop, products/services, and reply to every review.
**Keep identical** on website, Google Business Profile, Merchant Center and invoices: business name, address, phone, hours. **Never** invent a location, buy reviews, or create profiles for places you do not operate from.

---

## E. GOOGLE IMAGES — mostly BUILT BY CLAUDE
BUILT: crawlable public image URLs (robots allows `/api/media/`), **image sitemap** (`/sitemap-images.xml`), descriptive alt text (owner's text or "<product> — personalized photo frame"), width/height reserved, lazy loading except the main product image (priority), `ProductGroup` with image URLs, Open Graph images.
MY ACTION: upload **real product photos** (at least 1200 px on the long side, clean background, the finished frame; several angles) and write **alt text** per image in the product's SEO tab (one clear sentence: what it is, colour, border — not keyword lists). Use meaningful file names when uploading (e.g. `black-3-photo-collage-frame.jpg`, not `IMG_4421.jpg`).
Format/CDN: images are served through Next.js image optimisation (WebP/AVIF automatically where the browser supports it); Firebase Hosting's CDN caches them. **Verify:** Search Console → Performance → Search type **Image** (weeks after launch); URL Inspection → *View crawled page → Screenshot/More info* for a product; or search `site:karthysgallery.in` in Google Images later.

---

## F. ORGANIC vs IMAGES vs FREE LISTINGS vs PAID SHOPPING
- **Organic Google Search**: your pages in blue-link results. Free, slow, depends on content and trust.
- **Google Images**: your photos in image results; good for frames (people shop visually). Free; needs good photos + alt text.
- **Free Merchant listings**: product cards (price, availability) in Shopping/Search/Images. Free; needs Merchant Center + feed (section B).
- **Paid Shopping ads (Performance Max / Shopping campaigns)**: paid placement using the same feed; instant but costs money.
**Order to implement:** 1) Search Console + sitemap, 2) good product content/photos, 3) Merchant Center free listings, 4) GA4, 5) consider paid ads only after you know your conversion rate and margins.

---

## G. INDEXING STRATEGY
- **Index immediately (all in the sitemap):** homepage, `/category`, each active category with products, every published product, `/combos` and published combos, information pages (about, how it works, picture-quality guide, FAQ, contact, shipping/return policies).
- **Never index:** admin, account, orders, cart, checkout, sign-in/up, search results, the combo frame editor, filtered duplicates, the preview address.
- **Prioritise manually (≈10 URLs):** home, shop-all, 2–3 hero products, 1–2 categories, combos list. Use URL Inspection → Request indexing once each.
- **Everything else:** let the sitemap work. Re-submitting hundreds of URLs by hand is quota-limited and unnecessary; Google crawls from the sitemap and internal links.

---

## H. CONTENT SEO — LONG-TERM SEO WORK (write real, helpful pages; no mass AI articles)
Build **7 pages first**, only after the shop is live and you have real photos/examples. Each should be 600–1,200 words of genuinely useful content with real product links.

| # | Search intent | Title (≤60) | H1 | URL slug | Main topics | Link to | CTA |
|---|---|---|---|---|---|---|---|
| 1 | "how to choose a photo frame size" | Photo Frame Size Guide: Which Size to Choose | Choosing the right photo frame size | `/guides/photo-frame-size-guide` | Common sizes (A4, 8x12, 12x18…), wall vs desk, photo resolution, orientation | size categories, picture-quality guide | Personalize a frame |
| 2 | "photo collage ideas" | Photo Collage Ideas for Your Wall | Photo collage ideas that look great | `/guides/photo-collage-ideas` | layouts, how many photos, colour themes, family vs travel | collage products, combos | Start a collage |
| 3 | "anniversary gift ideas photo" | Anniversary Photo Gift Ideas | Anniversary gifts made from your photos | `/guides/anniversary-photo-gift-ideas` | first year → milestone, couple frames | couple frame, collage | Make a gift |
| 4 | "wedding photo frame ideas" | Wedding Photo Frame Ideas | Wedding photo frame ideas | `/guides/wedding-photo-frame-ideas` | album wall, couple portraits, gifting | frames, combos | See wedding-ready frames |
| 5 | "birthday gift photo frame" | Birthday Photo Frame Gift Ideas | Birthday gifts with a personal touch | `/guides/birthday-photo-gift-ideas` | by relation, with a message | desk frames, mugs | Personalize now |
| 6 | "how to print photos from phone / photo resolution" | Photo Resolution for Printing: Phone Photos | Will my phone photo print sharply? | `/guides/photo-resolution-for-printing` | pixels vs inches, DPI, tips (extends the existing quality guide) | picture-quality guide, products | Upload a photo |
| 7 | "family photo frame ideas" | Family Photo Frame Ideas | Family photo frame ideas | `/guides/family-photo-frame-ideas` | multi-photo layouts, gifting parents | collage, combos | Build a family wall |
Rules: one search intent per page (so pages do not compete for the same query), real examples/photos of your products, internal links to the matching category/product/combo, no keyword stuffing, update yearly.
**Keyword → page map (avoid cannibalisation):** "photo frame" → shop-all/frames category; "personalized photo frame" → homepage + frames category; "photo collage frame" → collage category + collage products; "A4 photo frame" → a size filter/landing only if you stock A4; "wedding/anniversary/birthday photo frame" → the guides above (informational) with links to products; "photo frame combo" → combos pages; a single product page targets its own specific name. Do not put every keyword on every page.

---

## I. BACKLINKS / AUTHORITY — LONG-TERM SEO WORK
Ethical ways: list the business in genuine directories (Google Business Profile if eligible, JustDial/Sulekha/IndiaMART where your category exists, your city's chamber of commerce); partner with **wedding photographers, event planners, gifting blogs/marketplaces** (offer a real discount for their clients and ask for a link on their "partners" page); give products to genuine creators for honest reviews; share real customer stories (with permission); get local news/blog mentions for real events; keep social profiles linking to the site.
**Never:** buy backlinks, use link farms or automated link tools, PBNs, keyword-stuffed guest posts, fake reviews, or fake business listings. Google can penalise or ignore these and it damages the brand.

## J. SOCIAL SEO
**Instagram + Pinterest first** (frames are visual: reels of personalising, finished-frame photos; Pinterest pins link to product pages), **YouTube** for short how-it-works videos (put the product URL in the first line of the description), **Facebook** page for local trust and reviews. Link every profile **to the canonical product/category URL** (no tracking junk, no `?variantId=`): `https://karthysgallery.in/product/<slug>`. Social links do not directly rank pages but bring visitors and mentions.

## K. LOCAL SEO
India-wide e-commerce: local SEO matters only if you have a real location/service area (section D). If you do: consistent name/address/phone everywhere, local citations, customer reviews on Google, and a "serving [city]" page **only for places you truly serve**. Do not create fake location pages.

---

## L. WEEKLY / MONTHLY MONITORING

**Every Monday (15 min)** — Search Console: Indexing → Pages (new errors?), Sitemaps (status Success?), Crawl stats (spikes in 5xx?), Merchant Center diagnostics.
**Weekly** — Performance: top queries and pages, any page that lost impressions, CTR by page, new indexed pages; Core Web Vitals report; GA4: which products get views but no add-to-cart.
**Monthly** — product SEO quality (short descriptions, missing alt text; the admin SEO tab score), broken links and redirects, structured-data issues (Enhancements), Merchant Center errors, backlinks/authority (Links report), content ideas from real queries, run the audit script before every release.
**Numbers that matter:** indexed product pages vs published products, impressions trend, clicks on product pages, CTR of your top pages, Core Web Vitals "Good" share, purchases/conversion per source.
**Do not obsess over:** daily ranking position swings, "average position" for a single query, number of backlinks, total keyword count, the "SEO score" number itself, small day-to-day impression changes.

---

## M. CHRONOLOGICAL LAUNCH CHECKLIST

**PHASE 1 — BEFORE PRODUCTION** (BUILT BY CLAUDE unless marked)
- [x] Technical SEO, metadata, product schema (ProductGroup), sitemap index, robots, canonicals, image SEO, internal links, structured-data shape, 404/redirects — built and tested on a production build
- [ ] Performance measured on the live domain — after launch
- [ ] MY ACTION: write 70–160 character descriptions + alt text for every product; upload real product photos; enter real GSTIN/address/phone in Admin → Settings; fill Admin → Settings → SEO (site title, description, OG image)
**PHASE 2 — PRODUCTION DEPLOYMENT** (needs your approval)
- [ ] Push to master (approval) → auto-deploy; production mode on; DNS live; HTTPS active
- [ ] `seo:audit --base https://karthysgallery.in --db --expect-production` → 0 FAIL (proves no accidental noindex / preview URLs)
**PHASE 3 — GOOGLE SETUP (day 0)**
- [ ] Search Console domain verified · sitemap submitted · ~10 URLs inspected/requested · Rich Results Test on 2 products
- [ ] Merchant Center account, site claimed, shipping/returns, feed fetched
- [ ] GA4 property + Measurement ID sent to me · Business Profile if eligible
**PHASE 4 — FIRST 7 DAYS**
- [ ] Sitemap shows Success · "Pages" report moves from 0 to some indexed · no unexpected "Not found/Soft 404/5xx" · Merchant items approved · GA4 events in DebugView · check errors daily
**PHASE 5 — FIRST 30 DAYS** (WAITING FOR INDEXING, then LONG-TERM)
- [ ] First query/CTR review · rewrite titles/descriptions of low-CTR pages · improve thin product pages · publish the first 2–3 guides · internal links from guides · begin ethical outreach

---

## N. CURRENT STATUS TABLE

| SEO item | Code status | External setup | My action | Priority |
|---|---|---|---|---|
| robots.txt | BUILT, TESTED | none | none (re-check after production mode) | Critical |
| Sitemap index + product/category/page/combo/image | BUILT, TESTED | Search Console submit | submit `sitemap.xml` | Critical |
| Canonical origin + canonicals | BUILT, TESTED | none | none | Critical |
| Product schema (ProductGroup, Offer, shipping) | BUILT, TESTED (shape) | Rich Results Test | test 2 URLs after launch | Critical |
| Real 404s + old-slug redirects | BUILT, TESTED | none | none | High |
| Cached product pages | BUILT, TESTED | none | none | High |
| Indexability / noindex policy | BUILT, TESTED | production mode on | approve go-live | Critical |
| Search Console | n/a | Required | steps A1–A5 | Critical |
| Merchant Center + feed | BUILT, TESTED (format) | Recommended | steps B1–B6; choose Google category | High |
| GA4 + events | NOT BUILT | Required | create property, send Measurement ID | High |
| Business Profile | n/a | Depends | decide (section D) | Medium |
| Image SEO | BUILT; needs real photos/alt | none | upload real photos, write alt | High |
| Product descriptions | generator BUILT; seed ones are short | none | write 70–160 chars each | High |
| Return-policy structured data | NOT BUILT (no data) | Merchant Center returns | provide policy details | Medium |
| Performance (Core Web Vitals) | rendering improved; editor still eager | PageSpeed after launch | review after launch | High |
| Content guides | strategy only | none | approve topics, supply real content | Medium |
| Backlinks / authority | n/a | Manual | ethical outreach | Long-term |

## O. WHO DOES WHAT
**BUILT BY CLAUDE:** everything in `SEO_IMPLEMENTATION.md` §2 (sitemaps, robots, canonicals, metadata, structured data, feed, redirects/404, admin status, audit script).
**MY ACTION REQUIRED:** owner content (descriptions, alt text, photos, business data), approvals (master push, production mode, DNS), Google account steps A–D, the Measurement ID, return-policy details, Google product category choice.
**GOOGLE ACTION REQUIRED:** crawling, indexing, Merchant approval, rich-result eligibility.
**WAITING FOR INDEXING:** any claim about "appearing in Google"; typical first results take days to weeks.
**LONG-TERM SEO WORK:** content guides, authority/backlinks, reviews, ongoing product and page improvements.

No ranking is guaranteed. The goal is a technically excellent, fully discoverable, correctly structured site that Google can understand — results follow from content, trust and time.
