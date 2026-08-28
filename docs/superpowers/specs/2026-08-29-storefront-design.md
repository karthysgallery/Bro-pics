# Storefront Phase — Design Spec

**Project:** BroPics & Kavi Vazhi Photography — Personalized Photo Frame E-Commerce Platform
**Source of truth:** `Bro Pics.pdf` §5–§8 (global layout, homepage, category/listing/search, product detail page), adapted to the Firebase architecture locked in by the Foundation phase.
**Phase:** 2 of 6. Depends on Foundation (merged to `master`, commit `cccfa69`). Reference sites studied via `/browse` on 2026-08-29: picloopz.com, ritwikas.com, parulpackaging.com, yazhlicollection.com.

---

## 0. Scope

**In scope:** global header/footer/navigation, homepage (admin-manageable, data-driven sections), category/listing pages with full filtering and search, product detail page.

**Explicitly out of scope** (belongs to later phases; this phase builds up to the boundary and stubs across it):
- The personalization editor itself (Phase 3) — the PDP's "Personalize & add to cart" CTA opens a placeholder "coming soon" modal, positioned and styled exactly where the real editor will mount.
- Real cart/checkout persistence (Phase 4) — cart drawer and wishlist use local-only client-side mock state (not Firestore-backed, not persisted across sessions). Phase 4 swaps the mock state for real data behind the same components.
- Review submission and moderation (Phase 6) — reviews are seeded placeholder data, rendered read-only.
- Algolia (Foundation's long-term search choice) — search runs against Firestore directly this phase, behind a `searchProducts()` interface Algolia drops into later without UI changes.

**Reference-site findings applied in this design:**
- Ritwikas (PDF's own "closer match") — pill-button variant selectors, upload/preview trigger placed in the buy box, delivery-timeline widget, WhatsApp help box, tabbed info architecture, rating-breakdown reviews. This phase's PDP follows this structure closely.
- Picloopz — category-chip + price-slider + sort filtering pattern, paginated (not infinite-scroll) grids, wishlist heart on cards.
- Parul Packaging — product gallery mixes real vertical (9:16) video files into the same swipeable thumbnail rail as images, not a separate carousel.
- Yazhli Collection — visual inspiration only (circular category tiles, generous whitespace, badge treatments) — no copied assets, copy, or code.

---

## 1. Data model additions

New schemas added to `packages/shared/src/schemas/`, none of which exist yet:

```
CategorySchema
  name, slug, parentId, image, sortOrder, isActive, seo{title, description}
  # Two levels max (spec §4). Fixes the dangling categoryId reference
  # noted in the Foundation ledger's Task 9 minor.

ReviewSchema
  productId, userId, orderId?, rating, title, body, media[], isVerified,
  status (pending|approved|rejected)
  # Only status:'approved' reviews render publicly — matches the
  # Firestore rule already written in Foundation.

HomepageSectionSchema
  type (hero_slider|category_tiles|best_sellers|how_it_works|
        featured_collection|products_in_motion|reviews_testimonials|
        why_us|offer_strip|recently_viewed),
  title, subtitle, image, mobileImage, link, sortOrder, startsAt, endsAt,
  isActive, config (shape depends on `type`)
```

`ProductSchema` (Foundation) gains fields required by filtering, search, and card rendering:

```
# Filter architecture — denormalized from variants, per the chosen approach:
availableSizes: string[]
availableColours: string[]
availableMaterials: string[]
minPrice: number (paise, int)
maxPrice: number (paise, int)
occasionTags: string[]
inStock: boolean

# Rating — denormalized from the reviews subcollection:
ratingAverage: number
ratingCount: number (int, nonnegative)

# Interim Firestore search:
titleLower: string          # lowercased title, for prefix-range queries
searchTokens: string[]      # lowercased words from title/description/tags,
                             # for array-contains-any matching
```

**Denormalization is a server-side responsibility, not a client concern.** A Cloud Function trigger (`functions/src/products/denormalize.ts`, new this phase) runs on any write to a product's variants subcollection and recomputes `availableSizes`/`availableColours`/`availableMaterials`/`minPrice`/`maxPrice`/`inStock` on the parent product doc. The same pattern applies to `ratingAverage`/`ratingCount` on review approval, though the *write path* for that (admin approving a review) is Phase 6's job — this phase only defines the fields and seeds them with plausible values.

**Search interface** (`packages/shared/src/search/`):

```ts
export interface SearchFilters {
  categoryId?: string;
  sizes?: string[];
  colours?: string[];
  materials?: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  inStockOnly?: boolean;
  occasionTags?: string[];
  sort?: 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'best_selling' | 'top_rated';
}

export interface SearchResult {
  products: Product[];
  totalCount: number;
}

export function searchProducts(query: string, filters: SearchFilters, page: number): Promise<SearchResult>;
```

This phase implements `searchProducts` against Firestore (compound queries on the denormalized fields, `titleLower` range queries for text search). A later phase can replace the implementation with an Algolia call without touching any call site.

---

## 2. Rendering strategy

Per route, resolving the Foundation design's ISR caveat concretely:

| Route | Strategy |
|---|---|
| `/` (homepage) | Static + `revalidate: 60` |
| `/category/[slug]` (no filters) | Static + `revalidate: 60` |
| `/category/[slug]?size=...` (filtered) | Dynamic (too many combinations to pre-generate) |
| `/search?q=...` | Dynamic |
| `/product/[slug]` | Static + `revalidate: 60` |

Filtered/search URLs that return few results get `noindex` per PDF §17 ("noindex on thin combinations"). Homepage sections render via the data-driven registry described in Section 3.

---

## 3. Page-by-page structure

### Global layout (`apps/web/components/layout/`)

- **Header**: announcement bar (reads `settings.announcementBar` — text, optional link, dismissible, scheduled window) above a sticky nav: logo, category dropdown (desktop) / drawer (mobile), search entry, wishlist icon, account icon, cart icon with live badge (from mock cart context). Sticky-on-scroll-up / collapses-on-scroll-down on mobile.
- **Cart drawer**: slides in on add-to-cart. Line items with thumbnail, qty stepper, running subtotal. Backed by mock client-side state this phase.
- **Floating WhatsApp button**: fixed bottom-right, `wa.me` deep link, prefilled with product name + URL on a PDP, generic message elsewhere.
- **Footer**: category links, static policy pages (About/Contact/FAQ/How-it-works/Picture-quality guide/Terms/Privacy/Shipping/Return — placeholder copy this phase; real copy is a client-supplied open item), social links, newsletter signup (UI only), payment-methods row, GST number (`settings.gstin`, blank until configured).

### Homepage (`apps/web/app/(shop)/page.tsx`)

Data-driven: reads ordered, active `homepageSections` docs and renders each through a `type` → component registry (`components/home/registry.ts`). Section components, in the seeded default order: hero slider → category tiles (circular) → best sellers rail → how-it-works (4 illustrated steps) → featured collection rails → products-in-motion video rail (muted autoplay-in-view, tap to expand) → reviews & testimonials carousel with rating summary → why-us/trust block → offer strip → recently viewed (client-side, localStorage, last 8).

### Category / listing / search

Routes: `apps/web/app/(shop)/category/[slug]/page.tsx`, `apps/web/app/(shop)/search/page.tsx`.

- Server-rendered grid, 2 columns mobile / 4 desktop. Product card: image (hover swaps to second image), title, price + strike-through compare-at, discount badge, rating stars, "Customizable" tag.
- Filters read/write URL search params against the denormalized fields: size, colour, material, price range, rating, availability, occasion. Desktop: sidebar. Mobile: bottom sheet with Apply button. Sort: relevance/newest/price asc/price desc/best-selling/top-rated. Live result count; chip-based clear-all and individual removal.
- Search bar: debounced type-ahead with thumbnails against `titleLower`/`searchTokens`, recent searches in localStorage, empty state suggests best sellers + categories.
- Pagination (not infinite scroll) — stable per-page URLs for SEO.

### Product detail page (`apps/web/app/(shop)/product/[slug]/page.tsx`)

- **Gallery**: thumbnail rail mixing images and videos. Main viewer zoomable on images, inline-playable on videos, swipe on mobile.
- **Buy box**: title, rating summary (anchors to reviews section), price/compare-at/save%, variant selectors as pill buttons (size grid, colour swatches — unavailable combinations visibly disabled; price and gallery update on change), photo-requirement notice, primary CTA "Personalize & add to cart" (opens the Phase-3 placeholder modal), secondary wishlist + "notify me," dispatch-estimate strip (computed from the product's dispatch window), WhatsApp help box.
- **Tabs**: Description (rich text + highlights + how-it-works + Ritwikas-style material/print-technique comparison blocks), Picture Quality (DPI guidance + size→pixels table, same content across all products), Delivery Information, Return & Refund (states the non-negotiable "not returnable for preference, only damage/wrong-item" policy plainly), Additional Information (size/colour matrix, material, construction).
- **Below tabs**: product-specific video rail, reviews (rating-breakdown bar, photo reviews, sort/paginate), frequently-bought-together + related products, recently viewed, FAQ accordion.

---

## 4. Visual system

Design tokens committed to `tailwind.config.ts`, binding for every component built in this phase (subagent implementers do not choose their own values):

| Token | Value | Use |
|---|---|---|
| `cream` | `#FAF6F0` | Base background |
| `charcoal` | `#2A2622` | Primary text |
| `terracotta` | `#C1592A` | Primary accent — CTAs, price/sale badges |
| `sage` | `#7C8B6F` | Secondary accent — badges, in-stock indicators |
| `font-display` | serif (e.g. Playfair Display via `next/font`) | Headings |
| `font-sans` | sans (e.g. Inter via `next/font`) | Body/UI |
| Radius | `rounded-lg` (0.5rem) standard; `rounded-full` for pills/circular tiles | Cards, buttons, category tiles |
| Breakpoints | Tailwind defaults (`sm/md/lg/xl`) | Mobile-first: every component designed at 375px first |

This palette/type direction is a starting proposal the client can revise; it is deliberately distinct from all four reference sites (not Ritwikas' teal, not Yazhli's black-and-gold).

---

## 5. Content policy

- Placeholder product photos/videos: committed files under `apps/web/public/placeholders/` — not Storage uploads, since Storage rules are full-deny/signed-URL-only and placeholders aren't customer data. Real media moves to Storage via Phase 5's media library.
- Per the PDF's cloning boundary (§2): all placeholder product copy, descriptions, and review text are written fresh for this phase — never lifted from Ritwikas or Picloopz's actual wording, even as filler.
- Seed data expands from Foundation's single placeholder product to roughly 3–4 categories and 8–10 products with variants, images, and a handful of seeded reviews — enough for every homepage section, the listing/filter grid, and PDP tabs to render meaningfully.

---

## 6. Build order

This phase's surface is substantially larger than Foundation's ten tasks. Planned split (formalized in `writing-plans`):

1. **Data & denormalization** — new schemas (`Category`, `Review`, `HomepageSection`), `ProductSchema` extensions, the variant-change denormalization Cloud Function, expanded seed data.
2. **Shell + homepage + listing/search** — global layout, section registry and homepage sections, category/listing/filters/search.
3. **Product detail page** — gallery, buy box, tabs, reviews, related rails (the single densest piece, roughly matching Ritwikas' ~12-block PDP).

Steps 1–2 are cohesive enough for one implementation plan; step 3 is dense enough to be its own plan, executed immediately after.

---

## 7. Testing approach

Following Foundation's pattern: unit tests for pure logic (search filter query-building, denormalization calculation, DPI/price display formatting reused from `packages/shared`), component tests for interactive UI (filter state, variant selection, cart drawer mock state) via Vitest + Testing Library, and a manual verification pass in the browser (per this project's UI-testing requirement) before each plan's tasks are considered done.

---

## Decisions made in this document (summary)

| Decision | Choice |
|---|---|
| Filter data | Denormalized onto `ProductSchema`, synced by a Cloud Function on variant writes |
| Search | Firestore-only interim (`titleLower`/`searchTokens`), behind a swappable `searchProducts()` interface |
| Homepage composition | Data-driven section registry, not hardcoded |
| Personalize CTA | Visually complete, opens a "coming soon" placeholder modal |
| Cart/wishlist | Local-only mock state this phase; Phase 4 replaces with real persistence behind the same components |
| Video | Fully built with placeholder clips (not stubbed) |
| Rendering | Static+ISR(60s) for homepage/category/PDP; dynamic for filtered/search URLs |
| Rating | Denormalized `ratingAverage`/`ratingCount` on product doc |
| Placeholder media | Committed under `apps/web/public/placeholders/`, not Storage |
| Visual system | Cream/charcoal/terracotta/sage palette, serif display + sans body, original to BroPics |
