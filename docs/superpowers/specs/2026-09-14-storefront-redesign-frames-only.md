# Storefront Redesign (Shopcart-style UI) + Frames-Only Scope — Design Spec

**Project:** BroPics — Personalized Photo Frame E-Commerce Platform
**Phase:** Frontend-only restyle + scope narrowing, executed on the `San's(FE)` branch. Admin pages (`/admin/roles`, `/staff/*`) are explicitly out of scope for this phase — next phase, once this is signed off.
**Reference:** [Musemind "Shopcart" ecommerce shot](https://dribbble.com/shots/19614098-Shopcart-Ecommerce-Web-Design-for-Electronics-Stores) — white background, deep-green header/nav and accent blocks, pill-shaped filters/buttons, product cards with a wishlist heart + star rating + strikethrough compare-price + pill CTA, a product detail page with a large image + thumbnail strip + circular swatches + quantity stepper + delivery-info rows, and "Similar Items"/"Recently Viewed" card rails.

---

## 1. Two decisions landing together

1. **Visual redesign** — restyle the storefront to the reference's design language, on top of the existing cream/charcoal/terracotta boutique identity rather than replacing it outright.
2. **Catalog scope narrowing** — the business will sell only photo frames going forward. No canvas prints, mugs, gift items, or multi-photo collage sets. The purchase flow simplifies to three axes: **Size**, **Frame Design**, **Orientation**.

Both are frontend-only (`apps/web`) — no backend/schema/Firestore/seed data touched this phase. See the companion doc, [2026-09-14-frames-only-backend-changes.md](2026-09-14-frames-only-backend-changes.md), for what backend work this implies.

---

## 2. Scope-narrowing decisions (clarified before implementation)

| Question | Decision | Why |
|---|---|---|
| What is "Frame Design"? | Reuses the existing `Variant.frameColour` field, redisplayed as circular swatches instead of text pills. Not a new backend field. | The data already exists and matches what customers actually choose (finish/colour); inventing a separate "moulding pattern" axis would need new schema with no current data behind it. |
| What is "Orientation"? | A frontend-only derived attribute — `lib/orientation.ts` computes `portrait \| landscape \| square` from each variant's existing `widthIn`/`heightIn`. Not a new purchasable SKU dimension. | No backend field/index exists for it yet; deriving it client-side ships immediately and is usable for both display and filtering with zero backend work. |
| What replaces "Shop by Category" tiles? | Repurposed as "Shop by Size" tiles, driven by product data (`Product.availableSizes`) instead of the categories collection. | A single-category catalog makes category tiles pointless; size is a real, useful browse dimension that needs no new data source. |

---

## 3. New design tokens & primitives

`apps/web/tailwind.config.ts` gains a deep-green primary: `pine` (`#1B3A2B`), `pine-dark` (`#13291E`), `pine-light` (`#EAF1EC`) — used for the header/nav, primary buttons, active tab/chip states, and swatch/step accents. `cream`/`charcoal`/`surface` stay as the neutral base; `terracotta`/`sage` stay as secondary accents (badges, offer strip, in-stock text) but are no longer the primary CTA color.

New shared primitives in `apps/web/components/ui/` (none existed before — every component previously hand-wrote Tailwind classes, and `FilterPanel`'s `Chip` and `VariantSelector` independently duplicated the same pill-button pattern):

- `Button.tsx` — filled (pine) / outline pill button.
- `Chip.tsx` — the extracted pill-toggle pattern.
- `Swatch.tsx` — circular colour/finish selector, with a small best-effort name→hex map (`black`, `white`, `walnut`, `oak`, etc.) so a "Frame Design" swatch actually looks like the finish it names.
- `RatingStars.tsx` — real SVG star icons, replacing the previous plain `★ N` text.
- `QuantityStepper.tsx` — +/- stepper, replacing the plain `<input type=number>`.

`apps/web/lib/orientation.ts` — `orientationFromDimensions(widthIn, heightIn)` and `orientationFromSizeLabel(sizeLabel)` (regex-parses "WxH" out of a label string for contexts that only have the denormalized label, like the category listing page).

---

## 4. Components touched

**Layout shell:** `Header.tsx` (pine nav bar, inline SVG icons replacing emoji, simplified nav — see §2's category-tiles note, same reasoning applies to primary nav), `Footer.tsx`/`AnnouncementBar.tsx` (restyle), `CartDrawer.tsx` (`QuantityStepper`, pill checkout button), `WhatsAppButton.tsx` (restyle).

**Homepage:** `HeroSlider.tsx`, `CategoryTiles.tsx` (repurposed — see §2), `ProductRail.tsx` (via the new `ProductCard`), `HowItWorks`/`OfferStrip`/`WhyUs`/`ReviewsTestimonials`/`ProductsInMotion` (restyle only, content unchanged — none of these were product-type-specific).

**Product card & filters:** `ProductCard.tsx` (wishlist heart via a new prop-free `WishlistButton.tsx` client island — kept separate so the card itself stays a Server Component and Firestore Timestamp-shaped fields on `Product` never have to cross an RSC client boundary, `RatingStars`, compare-at-price strikethrough, pill "Personalize" CTA), `FilterPanel.tsx`/`use-product-filters.ts` (Material chip dropped — frames-only, single implied material; Colour chip replaced by Frame Design swatches; new Orientation chip, applied as a plain-JS post-filter over the current page's already-fetched products since there's no backend field/index for it — see the backend-changes doc).

**Product detail page:** `Gallery.tsx` (accent colour only — structure was already close to the reference). `BuyBox.tsx`/`VariantSelector.tsx`/`ProductDetailClient.tsx` — Size stays a pill selector; Frame Design uses the new swatch display mode; a new Orientation pill selector extends the existing size/colour mutual-scoping logic to three axes (selecting an orientation re-scopes size+colour to the first real matching variant, same pattern as the existing size↔colour resolution). `QuantityStepper` replaces the plain input. **The CTA stays a single button** ("Personalize & Add to Cart") rather than adding a fabricated second "Buy Now" — every frame requires the personalization step, so an instant-buy bypass doesn't match the real flow; this is a deliberate deviation from the reference. `DeliveryTimeline.tsx` restyled (pine step circles). `ProductTabs.tsx` restyled only. `ReviewsSection.tsx`/`ReviewsTestimonials.tsx` get `RatingStars`. `RelatedProducts.tsx` restyled; a new `RecentlyViewedRail.tsx` (localStorage-driven, client-side Firestore reads by id) closes an already-tracked gap — `recently_viewed` was seeded and active but nothing rendered it (see `PROJECT_STATUS.md` §5, now closed) — mounted on both the product page and the homepage.

---

## 5. Known deviations / limitations

- Orientation filtering on the category listing page is a **post-filter over the current page's results**, not a Firestore query constraint — `totalCount` shown to the user reflects the pre-orientation-filter count. Acceptable for a frontend-only bolt-on; becomes exact once/if orientation gets a real backend field (see backend-changes doc).
- "Shop by Size" tiles link into `/category/frames-wall-decor` — the slug is currently hardcoded (matches the one real category being kept). Becomes fragile if that slug ever changes; worth revisiting once the backend-changes doc's category cleanup lands.
- The reference's two-button PDP CTA ("Buy Now" + "Add to Cart") was deliberately not replicated — see §4.
