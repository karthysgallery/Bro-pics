# Flat 50% offer, product gallery and Meta ads — reports

Branch `feat/flat50-meta`. Nothing here is pushed or live yet. Tested on the local copy of the shop (emulators).

---

## Report A — what was built

Status words: **Done** = built and checked in the local shop · **Built, not verified** = needs your Meta account to prove · **Blocked** = waiting on you.

### 0. Audit (what already existed)
- Banners collection + admin API existed, but nothing showed banners on the shop and there was no admin screen → reused and finished.
- No Meta Pixel, no Conversions API, no UTM capture. A cookie banner existed, but its wording did not mention ads.
- Tamil Nadu delivery is **already free on every order** (state shipping rules) → nothing changed.
- Google product feed existed (`/feeds/google-merchant.xml`) → reused for Meta.
- The "single photo" product type already builds a print design for every size → the offer product uses it (no new product system).

### 1. Homepage offer banner — Done
- Shows right after the main slider. Three separate pictures: desktop 1920×720 (8:3), tablet 1200×900 (4:3), phone 1080×1350 (4:5).
- The browser downloads **only** the picture for its screen (checked: desktop loaded the desktop file, phone loaded the phone file). Space is reserved, so the page doesn't jump while it loads. Nothing scrolls sideways on a phone.
- Missing picture → the nearest other one is used; no pictures at all → a text banner in the shop colours. Never a broken image.
- Admin → **Marketing → Offers & ads**: upload/replace each picture (with preview), title, button text, link, show from/until, priority, on/off.
- Starting pictures made from your poster: `scratch/flat50/banner-desktop.jpg`, `banner-tablet.jpg`, `banner-mobile.jpg`. Replace them any time.

### 2. Offer page `/offers/flat-50` — Done
- Order: hero → the three sizes with prices → six quality layers → size guide table → real reviews (only if there are any) → questions → final button.
- **Prices are never typed into the offer page.** They come from the product's own sizes, the same numbers checkout charges, so the page, cart and payment can't disagree.
- Each size card opens the product with that size already chosen (checked: 18×12 opened at ₹499).
- Offer switched off or product still a draft → a clean "not running right now" page (and it is hidden from Google).
- No countdowns, no expiry dates, no stock claims.

### 3. Offer product "Your Photo Frame" — Done (local), Blocked for live (needs your script run)
- Sizes 18×12 ₹499 (was ₹1,000), 20×16 ₹999 (was ₹2,000), 24×16 ₹1,499 (was ₹3,000), each portrait or landscape. **20×16 is new.**
- One photo + an optional text line (white, black or gold). "Send photos on WhatsApp" works here too.
- **Discount codes don't apply to it** (new switch on every product: "Discount codes don't apply"), so ₹499 can never drop further by accident. A coupon made for this exact product still works.
- ⚠️ **Margin warning:** at ₹499 the 18×12 leaves under 20% margin at the cost I used (₹400). The 20×16 cost (₹450) is my estimate — please check both in Admin → product → sizes.

### 4. Standard five-picture gallery — Done
Every frame now shows the same order: **1 the frame · 2 on your table photo · 3 on your hall/sofa photo · 4 size guide · 5 how it is made** · then the video.
- Pictures 2–3 use your two room photos; personalised frames show the **customer's own photo** in them live.
- Size guide is drawn from **each product's own sizes** (no A4/A3 labels), with the outer size from the frame's moulding.
- "Premium Quality. Crafted Layer by Layer." shows the six real parts: outer frame, lamination, print, 8 mm MDF, back fixing, wall hook.
- In Admin → product → photos, any of your own photos can be set **"Use as picture 2 / 3 / 4 / 5"**. For personalised frames, pictures 2–3 stay live (they carry the customer's photo); your own table/hall photos replace them on ready-made frames.
- Products still missing a video: they show five pictures, no placeholder.

### 5. Product page from an Instagram link — Done
- Every product keeps a stable link `/product/<name>`; `?variantId=` pre-selects a size.

### 6. Meta Pixel — Built, not verified with Meta
- **Off until you add your Pixel ID** in Admin. Runs only for visitors who accept cookies. Checked locally with a dummy ID: declined → nothing loads at all; accepted → events reach Facebook.
- Events checked in the local shop: PageView, ViewContent (product and offer page), AddToCart, InitiateCheckout, AddPaymentInfo, Search, CustomizeProduct (first photo added), and **Purchase only after the payment was confirmed** (event id `purchase_<orderId>`, value ₹499).
- Cookie banner wording now mentions Facebook & Instagram ads. **Your privacy policy page should say the same; please approve that wording.**

### 7. Conversions API (server events) — Built, not verified with Meta
- One Purchase per paid order, sent by the server when the payment is verified (whichever path confirms it), with the **same event id** as the browser, so Meta counts it once.
- Sent only if the customer accepted cookies. Email, phone, name, city, state and PIN are SHA-256 hashed before sending. Nothing about the payment itself (card/UPI/bank) is ever sent.
- Never sends twice (one record per order in `metaEvents`); failures are retried every 30 minutes, up to 5 times, within Meta's 7-day limit.
- The access token lives in Google Secret Manager (`META_CAPI_TOKEN`), never in the website.
- Checked with tests and on a real local order; not yet against Meta (needs your token).

### 8. Ad-link tracking (UTM) — Done
- `utm_source/medium/campaign/content/term` are kept for 30 days and saved on the order (checked: a test order saved instagram / paid_social / flat50 / reel1). Meta click id (`fbclid`) is only kept with cookie consent.

### 9. Meta catalogue — Built (needs Commerce Manager set-up)
- `/feeds/meta-catalog.xml`: one item per size, `item_group_id` = product id (the same id the Pixel and server send), with the original price and the offer price (`sale_price`).

### 10. SEO / sharing — Done
- Offer page: own title, description, canonical, share picture (your poster), FAQ data for Google. Products keep their own share pictures.

### 11. Testing
- Type checks: all three packages clean. Tests: shared 805 passed, functions 91 passed, web all passed (2,266+).
- Local shop walk-through: banner → offer page → 18×12 → product → add to cart (WhatsApp photos) → checkout → test payment → order paid, ad source saved, browser Purchase fired once, server Purchase built with the same id and refused to send twice.
- **Not done:** Admin "Offers & ads" screen was not clicked through (the local admin needs an authenticator app); the real Razorpay and the real Meta account were not used.

### Remaining / blocked
| Item | Waiting on |
|---|---|
| Push and deploy the website | Your OK |
| Create the offer product, offer page, banner on the live site | You run `zsh scratch/flat50/run-setup-offer.sh` after the deploy |
| Shop photos for "Your Photo Frame" | Admin → product → Make framed shop photos |
| Meta Pixel ID, Conversions API token | You (Report B) |
| Functions deploy (server events) | Token saved first, then your OK |
| Privacy policy wording about ads | Your approval |
| 18×12 margin, 20×16 cost | Your check |

---

## Report B — your Meta ads checklist

**Already handled by the website:** events, Purchase only after payment, no double counting, hashing, consent, UTM saving, the catalogue feed, the offer page and banner.

**You do these (in order):**

1. **Open Meta Business Suite** (business.facebook.com) with the account that owns the KarthysGallery Facebook page.
2. Go to **Events Manager** (☰ All tools → Events Manager).
3. **Data sources → Connect data → Web → Meta Pixel.** Name it "KarthysGallery". If one exists already, use that.
4. **Copy the Pixel ID** (the long number under the name).
5. Paste it in **Admin → Marketing → Offers & ads → Pixel ID** and tick **Tracking on** → Save. (You don't need to send it to anyone.)
6. **Conversions API token:** in Events Manager → your Pixel → **Settings → Conversions API → Generate access token**. Then, on your Mac, in the project folder run:
   ```
   firebase functions:secrets:set META_CAPI_TOKEN --project bropics-app
   ```
   and paste the token when asked. Don't put the token in WhatsApp, email, or Admin. Tell me when it's done, and I'll deploy the server part with your OK.
7. **Verify the domain:** Business settings → Brand safety → **Domains → Add** `karthysgallery.in` → choose **DNS TXT record** and add it at your domain provider (or send me the TXT value).
8. **Event set-up:** Events Manager → Pixel → **Settings → Aggregated event measurement / Configure web events**: put **Purchase** first, then Initiate checkout, Add to cart, View content.
9. **Test:** Events Manager → **Test events** → copy the test code → paste it in Admin as **Test event code** → open the site and do: offer page → product → add to cart → checkout. You should see the events appear. Then **clear the test code** in Admin.
10. **Catalogue (optional, for catalogue ads):** Commerce Manager → **Add catalogue → E-commerce → Upload product info → Data feed → Scheduled feed** → URL `https://karthysgallery.in/feeds/meta-catalog.xml`, daily. Meta reviews it; approval isn't instant.
11. **Connect Instagram:** Business settings → Accounts → **Instagram accounts → Add** the KarthysGallery Instagram.
12. **Create the campaign:** Ads Manager → **Create → Sales** objective.
13. Conversion location **Website**, Pixel **KarthysGallery**, event **Purchase**.
14. Website URL: `https://karthysgallery.in/offers/flat-50`
15. URL parameters: `utm_source=instagram&utm_medium=paid_social&utm_campaign=flat50&utm_content=reel1` (change `reel1` for each reel).
16. **Publish** only after: the offer page is switched on in Admin, "Your Photo Frame" is published with photos, and step 9 showed events arriving.
