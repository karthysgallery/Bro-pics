# Storefront Phase — Plan B: Product Detail Page — Design

**Date:** 2026-08-31
**Status:** Approved by user, ready for implementation planning
**Depends on:** [2026-08-29-storefront-design.md](2026-08-29-storefront-design.md) (Plan A — shell/catalog, merged to master)

## 1. Purpose and scope

This is the second and final plan of the Storefront phase (Phase 2). Plan A built the shell, homepage, category listing, and search. This plan builds the Product Detail Page (PDP) — the densest single page in the whole site, matching the depth of ritwikas.com (the PDF's own closest reference): gallery with mixed image/video, variant selectors, buy box, tabbed info, reviews, related products.

Out of scope, deliberately deferred:
- Live personalization/upload editor (Phase 3) — the "Personalize & Add to Cart" CTA opens a "coming soon" placeholder modal, same pattern as Plan A's homepage CTAs.
- Frequently-bought-together (needs real order history, not available until Phase 4). Cross-sell for this plan is same-category related products only, reusing Plan A's `ProductRail`.
- Real cart/checkout persistence (Phase 4) — "Add to Cart" continues to use Plan A's local-only mock cart context.
- Sitewide SEO audit (Phase 6) — this plan wires up per-product `generateMetadata`/JSON-LD using data the schema already carries; Phase 6 is a broader audit pass on top.

## 2. Data model additions

### 2.1 New `ProductMediaSchema`

Foundation's original design specified a `product_media` collection that was never implemented — Plan A's `ProductCard` worked around this by guessing image paths from `product.slug`. This plan builds the real schema:

```ts
// packages/shared/src/schemas/product-media.ts
{
  id: string,
  productId: string,
  variantId: string | null,   // null = variant-agnostic
  type: 'image' | 'video',
  url: string,
  alt: string,
  sortOrder: number,
}
```

Firestore path: `products/{productId}/media/{mediaId}`. `firestore.rules` already has this exact path as public-read/server-write from the Foundation phase — no rules change needed.

### 2.2 Denormalized card images on `ProductSchema`

`ProductCard` renders on every homepage rail and the category grid — it must never issue a per-card subcollection read (the same trap `ratingAverage` denormalization was built to avoid in Plan A). Add two fields to `ProductSchema`:

- `primaryImageUrl: string`
- `hoverImageUrl: string | null`

Both sourced from variant-agnostic media (`variantId == null`), lowest `sortOrder` first for primary, second-lowest for hover. A new Cloud Function trigger, `onMediaWritten` (same pattern as Plan A's `onVariantWritten`), recomputes these two fields whenever a product's media subcollection changes.

`ProductCard.tsx` is updated to read `primaryImageUrl`/`hoverImageUrl` directly instead of deriving `/placeholders/products/{slug}-1.svg` from the slug. The 16 already-committed placeholder SVGs stay as files; only the URL source changes, from slug-math to media docs.

### 2.3 Variant-specific gallery fallback rule

The PDP gallery must update when the customer changes variant (size/colour/material), but not every variant will have dedicated photography. Rule, stated explicitly so it's testable:

> Show media where `variantId` matches the selected variant. If none exists for that variant, fall back to variant-agnostic media (`variantId == null`).

Seed data must include at least one product with variant-specific images for *some but not all* of its variants, so the fallback path is exercised by seed data, not left untested.

### 2.4 `ReviewSchema` gains `createdAt`

Gap found during design review: `ReviewSchema` (id, productId, userId, orderId?, rating, title, body, media[], isVerified, status) has no `createdAt` field, but the existing `reviews` composite index in `firestore.indexes.json` is `(productId, status, createdAt)` and the spec requires sorting reviews by recency. Add `createdAt: Date` to `ReviewSchema`; update seed reviews with values. Firestore Admin SDK returns `Timestamp`, not `Date` — reads must `.toDate()` convert, per the lesson already documented in `PROJECT_STATUS.md` from Plan A.

### 2.5 `ProductSchema` gains `faq`

```ts
faq: z.array(z.object({ question: z.string(), answer: z.string() })).default([])
```

Consistent with the existing `highlights[]`/`howItWorks[]` array-field pattern — not a subcollection, since FAQ entries are simple and admin-managed the same way as those fields.

## 3. Rendering, routing, SEO

**Route:** `/product/[slug]`. This is currently a dead link — `ProductCard` and `SearchTypeahead` both link here today and 404. Building this route is an explicit deliverable, not incidental cleanup.

**Static + time-based ISR**, matching the rest of the storefront: `generateStaticParams()` over active product slugs, `revalidate: 60` on the page component. Firebase App Hosting doesn't support on-demand ISR (`revalidatePath`/`revalidateTag`) — established in Plan A.

**Variant selection is client-side state, not a URL param.** Putting size/colour in the URL (`?variant=...`) would force dynamic rendering per query string, defeating static generation — the same trap Plan A's category page hit and fixed. Selecting a variant updates price, gallery, and stock status client-side without a navigation. Trade-off accepted: no shareable "direct link to this exact colour" — nothing in the spec requires it.

**SEO wiring, built now (not deferred to Phase 6):**
- `generateMetadata()` reads `product.seo.title`/`seo.description`, sets canonical URL, uses `primaryImageUrl` as OG image.
- JSON-LD embedded in the page: `Product`, `Offer` (price/availability from the default/first-active variant), `AggregateRating` (from `ratingAverage`/`ratingCount`).

Phase 6 remains the sitewide SEO *audit* pass; this plan only wires up data the schema already carries.

## 4. Page structure

Top to bottom (Ritwikas-depth per the reference-site study already recorded in `PROJECT_STATUS.md`):

1. **Breadcrumb** — Home / Category / Product.
2. **Gallery** — mixed image+video thumbnail rail (reusing Plan A's video pattern), main image with click-to-zoom/lightbox (images only — canvas-based zoom is Phase 3's editor, out of scope). Swaps per the §2.3 fallback rule on variant change.
3. **Buy box** (sticky on desktop) — title; price with `compareAtPrice` strikethrough when present, updates on variant change; rating summary linking to the reviews section; variant selectors as pill buttons (size/colour/material, grouped from `VariantSchema`); stock status; dispatch estimate (`dispatchDaysMin/Max`); quantity stepper; "Personalize & Add to Cart" CTA opening a new placeholder "coming soon" modal component; wishlist toggle (reuses Plan A's mock-state pattern); WhatsApp help box (reuses `WhatsAppButton`'s existing number source).
4. **Tabbed info** — Description, Highlights, How It Works, Picture Quality Guide (static component, shared content across all products per the PDF's "managed once" note — not per-product data), Care Instructions, FAQ (from §2.5's `faq[]`).
5. **Video rail** — horizontal rail below the tabs when the product has video media (Parul Packaging pattern, reused from Plan A).
6. **Reviews** — rating breakdown histogram from `ratingAverage`/`ratingCount`, list sorted by `createdAt` desc (§2.4), review media thumbnails.
7. **Related products** — same-category `ProductRail` reuse (Plan A component); FBT explicitly deferred.

All new components use only the existing 5-token palette (`cream`/`charcoal`/`terracotta`/`sage`/`surface`) — no new colors introduced.

## 5. Content policy

Carried from the Storefront design spec: all copy (descriptions, highlights, care text, FAQ, review text) in seed data is written fresh. Nothing is copied from picloopz.com, ritwikas.com, parulpackaging.com, or yazhlicollection.com — those sites inform structure/UX only.

## 6. Build order

For clean task-boundary cuts in the implementation plan:

1. **Data layer** — `ProductMediaSchema`, `ProductSchema` additions (`faq`, `primaryImageUrl`, `hoverImageUrl`), `ReviewSchema.createdAt`, `onMediaWritten` Cloud Function trigger, seed data updates (including the §2.3 fallback-path product), new `firestore.indexes.json` entries for the reviews sort.
2. **Route + data fetching** — `/product/[slug]`, `getProductBySlug()` plus its variants/media/approved-reviews, `generateStaticParams`, `generateMetadata`/JSON-LD.
3. **Above-the-fold** — gallery, buy box, variant selectors, placeholder modal.
4. **Below-the-fold** — tabs (incl. static Picture Quality Guide), video rail, reviews with breakdown, related products rail.
5. **`ProductCard` migration** — switch from slug-guessed image paths to `primaryImageUrl`/`hoverImageUrl`.

## 7. Testing expectations

Following Plan A's pattern: unit tests for new schema validation (`ProductMediaSchema`, `ReviewSchema.createdAt`, `ProductSchema.faq`), the `onMediaWritten` denormalization logic (pure function + trigger, same split as `onVariantWritten`), `getProductBySlug()`'s data assembly, and the variant-media fallback rule (§2.3) specifically — since it's easy to leave untested if seed data doesn't exercise the empty-media-for-variant case. Firestore query shapes introduced here (reviews sort) must be checked by hand against `firestore.indexes.json` per the orderBy/inequality lesson from Plan A — this class of bug is invisible to unit tests in this environment.
