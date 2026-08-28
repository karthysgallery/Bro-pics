# Storefront Shell & Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data layer (new schemas, denormalized filtering, interim Firestore search, expanded seed catalogue), the global layout shell (header/footer/cart/WhatsApp), the data-driven homepage, and the category/listing/search pages for the BroPics storefront — everything up to, but not including, the product detail page (a separate plan).

**Architecture:** New `Category`, `Review`, and `HomepageSection` zod schemas join the existing `Product`/`Variant` schemas in `packages/shared`. `ProductSchema` gains denormalized filter/rating/search fields, kept in sync by a Cloud Function trigger on variant writes. Category/listing/search pages query Firestore server-side (Admin SDK) through a shared `searchProducts()` interface that is Firestore-backed today and Algolia-backed later without changing call sites. The homepage renders from an ordered `homepageSections` collection through a `type` → component registry, not a hardcoded sequence. Cart and wishlist use local React Context state this phase (no persistence) — Phase 4 replaces the context internals, not its call sites.

**Tech Stack:** Next.js App Router (Server Components for data fetching, Client Components for interactivity), Firebase Admin SDK (server-side Firestore reads), Firebase Cloud Functions v2, Tailwind CSS, zod, Vitest + Testing Library.

## Global Constraints

- All monetary values are integer paise. Never floats. (Foundation ground rule, still binding.)
- Every schema/API boundary validates input with zod.
- TypeScript strict mode everywhere; no `any` in `packages/shared` exports.
- Package manager is pnpm.
- Mobile-first: every component is designed at 375px width first, then expanded to `md`/`lg` breakpoints (project ground rule, PDF §2).
- Design tokens (from the Storefront design spec §4) are the only colors/fonts/radii used in new components — no ad hoc hex values or inline font choices:
  - Colors: `cream` `#FAF6F0` (base background), `charcoal` `#2A2622` (primary text), `terracotta` `#C1592A` (primary accent — CTAs, price/sale badges), `sage` `#7C8B6F` (secondary accent — badges, in-stock indicators)
  - Fonts: `font-display` (serif, headings) via `next/font/google` Playfair Display; `font-sans` (body/UI) via `next/font/google` Inter
  - Radius: `rounded-lg` standard for cards/buttons, `rounded-full` for pills/circular tiles
- Placeholder product photos/videos live under `apps/web/public/placeholders/` as committed files — never Storage uploads (Storage rules are full-deny/signed-URL-only).
- All placeholder product copy, descriptions, and review text are written fresh — never copied from Ritwikas, Picloopz, Parul Packaging, or Yazhli Collection, even as filler (PDF §2 cloning boundary).
- Firestore reads in Server Components use the Admin SDK (`getAdminApp()` from `apps/web/lib/firebase-admin.ts`) — the existing pattern from Foundation, appropriate here since these are all public-catalog reads already allowed by `firestore.rules`.
- No lint/typecheck script exists yet in this repo (a known Foundation-phase gap) — this plan does not add one; each task's TypeScript still compiles cleanly under `tsc --noEmit`/`next build` as part of its own verification.

---

## File Structure

```
packages/shared/src/
├── schemas/
│   ├── category.ts                 [Task 1 - new]
│   ├── review.ts                   [Task 1 - new]
│   ├── homepage-section.ts         [Task 1 - new]
│   └── product.ts                  [Task 2 - modified: filter/rating/search fields]
├── search/
│   ├── types.ts                    [Task 3 - new]
│   ├── build-query-plan.ts         [Task 3 - new]
│   └── search-products.ts          [Task 3 - new]
└── index.ts                        [Tasks 1, 3 - modified: new exports appended]

functions/src/products/
├── denormalize.ts                  [Task 4 - new]
└── denormalize.test.ts             [Task 4 - new]
functions/src/index.ts              [Task 4 - modified: export the trigger]

scripts/seed/src/
├── data.ts                         [Task 5 - modified: categories, expanded products/variants, reviews, homepage sections]
└── data.test.ts                    [Task 5 - modified: new assertions]
apps/web/public/placeholders/       [Task 5 - new: committed placeholder images/videos]

apps/web/lib/
├── firestore-categories.ts         [Task 6 - new]
├── firestore-homepage.ts           [Task 8 - new]
└── cart-context.tsx                [Task 6 - new]

apps/web/components/layout/
├── AnnouncementBar.tsx             [Task 6 - new]
├── Header.tsx                      [Task 6 - new]
├── Footer.tsx                      [Task 6 - new]
├── CartDrawer.tsx                  [Task 7 - new]
└── WhatsAppButton.tsx              [Task 7 - new]
apps/web/app/layout.tsx             [Task 7 - modified: wraps children in CartProvider + layout chrome]

apps/web/components/product/
└── ProductCard.tsx                 [Task 8 - new]
apps/web/components/home/
├── registry.tsx                    [Task 8 - new]
├── HeroSlider.tsx                  [Task 8 - new]
├── CategoryTiles.tsx               [Task 8 - new]
├── HowItWorks.tsx                  [Task 8 - new]
├── WhyUs.tsx                       [Task 8 - new]
├── OfferStrip.tsx                  [Task 8 - new]
├── ProductRail.tsx                 [Task 8 - new]
├── ProductsInMotion.tsx            [Task 8 - new]
└── ReviewsTestimonials.tsx         [Task 8 - new]
apps/web/app/(shop)/page.tsx        [Task 8 - modified: renders the section registry]

apps/web/lib/firestore-products.ts  [Task 9 - new]
apps/web/components/filters/
├── FilterPanel.tsx                 [Task 9 - new]
└── use-product-filters.ts          [Task 9 - new]
apps/web/app/(shop)/category/[slug]/page.tsx  [Task 9 - new]

apps/web/components/search/
└── SearchTypeahead.tsx             [Task 10 - new]
apps/web/app/(shop)/search/page.tsx [Task 10 - new]
```

---

### Task 1: Category, Review, and HomepageSection schemas

**Files:**
- Create: `packages/shared/src/schemas/category.ts`
- Test: `packages/shared/src/schemas/category.test.ts`
- Create: `packages/shared/src/schemas/review.ts`
- Test: `packages/shared/src/schemas/review.test.ts`
- Create: `packages/shared/src/schemas/homepage-section.ts`
- Test: `packages/shared/src/schemas/homepage-section.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: nothing beyond `zod`
- Produces: `CategorySchema`, `Category`; `ReviewSchema`, `Review`, `ReviewStatus`; `HomepageSectionSchema`, `HomepageSection`, `HomepageSectionType` — all exported from `@bro-pics/shared`. Tasks 5, 8, 9 import these.

- [ ] **Step 1: Write the failing test for CategorySchema**

```ts
// packages/shared/src/schemas/category.test.ts
import { describe, it, expect } from 'vitest';
import { CategorySchema } from './category';

const validCategory = {
  id: 'cat_frames',
  name: 'Frames & Wall Décor',
  slug: 'frames-wall-decor',
  parentId: null,
  image: '/placeholders/categories/frames.jpg',
  sortOrder: 1,
  isActive: true,
  seo: { title: 'Frames & Wall Décor | BroPics', description: 'Shop personalized frames.' },
};

describe('CategorySchema', () => {
  it('accepts a valid top-level category', () => {
    expect(CategorySchema.parse(validCategory)).toEqual(validCategory);
  });

  it('accepts a valid child category with a parentId', () => {
    const child = { ...validCategory, id: 'cat_wall_frames', parentId: 'cat_frames' };
    expect(CategorySchema.parse(child)).toEqual(child);
  });

  it('rejects a negative sortOrder', () => {
    const invalid = { ...validCategory, sortOrder: -1 };
    expect(() => CategorySchema.parse(invalid)).toThrow();
  });

  it('rejects an empty name', () => {
    const invalid = { ...validCategory, name: '' };
    expect(() => CategorySchema.parse(invalid)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/shared test category`
Expected: FAIL — `./category` module not found

- [ ] **Step 3: Create `packages/shared/src/schemas/category.ts`**

```ts
import { z } from 'zod';

export const CategorySchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  slug: z.string().min(1),
  parentId: z.string().nullable(),
  image: z.string(),
  sortOrder: z.number().int().nonnegative(),
  isActive: z.boolean(),
  seo: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
  }),
});

export type Category = z.infer<typeof CategorySchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/shared test category`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing test for ReviewSchema**

```ts
// packages/shared/src/schemas/review.test.ts
import { describe, it, expect } from 'vitest';
import { ReviewSchema } from './review';

const validReview = {
  id: 'rev_1',
  productId: 'prod_classic_wooden_frame',
  userId: 'user_1',
  orderId: 'order_1',
  rating: 5,
  title: 'Beautiful frame',
  body: 'The print quality exceeded expectations and it arrived well packed.',
  media: [],
  isVerified: true,
  status: 'approved',
};

describe('ReviewSchema', () => {
  it('accepts a valid approved review', () => {
    expect(ReviewSchema.parse(validReview)).toEqual(validReview);
  });

  it('accepts a review with no linked order (unverified)', () => {
    const guest = { ...validReview, orderId: undefined, isVerified: false };
    expect(ReviewSchema.parse(guest)).toMatchObject({ isVerified: false });
  });

  it('rejects a rating above 5', () => {
    const invalid = { ...validReview, rating: 6 };
    expect(() => ReviewSchema.parse(invalid)).toThrow();
  });

  it('rejects a rating below 1', () => {
    const invalid = { ...validReview, rating: 0 };
    expect(() => ReviewSchema.parse(invalid)).toThrow();
  });

  it('rejects an invalid status', () => {
    const invalid = { ...validReview, status: 'published' };
    expect(() => ReviewSchema.parse(invalid)).toThrow();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/shared test review`
Expected: FAIL — `./review` module not found

- [ ] **Step 7: Create `packages/shared/src/schemas/review.ts`**

```ts
import { z } from 'zod';

export const ReviewStatusSchema = z.enum(['pending', 'approved', 'rejected']);

export const ReviewSchema = z.object({
  id: z.string(),
  productId: z.string(),
  userId: z.string(),
  orderId: z.string().optional(),
  rating: z.number().int().min(1).max(5),
  title: z.string().min(1),
  body: z.string().min(1),
  media: z.array(z.string()),
  isVerified: z.boolean(),
  status: ReviewStatusSchema,
});

export type Review = z.infer<typeof ReviewSchema>;
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/shared test review`
Expected: PASS (5 tests)

- [ ] **Step 9: Write the failing test for HomepageSectionSchema**

```ts
// packages/shared/src/schemas/homepage-section.test.ts
import { describe, it, expect } from 'vitest';
import { HomepageSectionSchema } from './homepage-section';

const validSection = {
  id: 'sec_hero',
  type: 'hero_slider' as const,
  title: 'Handcrafted with Love',
  subtitle: 'Personalized photo frames made just for you',
  image: '/placeholders/home/hero-1.jpg',
  mobileImage: '/placeholders/home/hero-1-mobile.jpg',
  link: '/category/all',
  sortOrder: 1,
  startsAt: null,
  endsAt: null,
  isActive: true,
  config: {},
};

describe('HomepageSectionSchema', () => {
  it('accepts a valid section with no schedule window', () => {
    expect(HomepageSectionSchema.parse(validSection)).toEqual(validSection);
  });

  it('accepts a section with a schedule window', () => {
    const scheduled = {
      ...validSection,
      startsAt: new Date('2026-09-01'),
      endsAt: new Date('2026-09-30'),
    };
    expect(HomepageSectionSchema.parse(scheduled)).toMatchObject({
      startsAt: new Date('2026-09-01'),
    });
  });

  it('rejects an unknown section type', () => {
    const invalid = { ...validSection, type: 'random_banner' };
    expect(() => HomepageSectionSchema.parse(invalid)).toThrow();
  });

  it('accepts every documented section type', () => {
    const types = [
      'hero_slider',
      'category_tiles',
      'best_sellers',
      'how_it_works',
      'featured_collection',
      'products_in_motion',
      'reviews_testimonials',
      'why_us',
      'offer_strip',
      'recently_viewed',
    ];
    for (const type of types) {
      expect(() => HomepageSectionSchema.parse({ ...validSection, type })).not.toThrow();
    }
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/shared test homepage-section`
Expected: FAIL — `./homepage-section` module not found

- [ ] **Step 11: Create `packages/shared/src/schemas/homepage-section.ts`**

```ts
import { z } from 'zod';

export const HomepageSectionTypeSchema = z.enum([
  'hero_slider',
  'category_tiles',
  'best_sellers',
  'how_it_works',
  'featured_collection',
  'products_in_motion',
  'reviews_testimonials',
  'why_us',
  'offer_strip',
  'recently_viewed',
]);

export const HomepageSectionSchema = z.object({
  id: z.string(),
  type: HomepageSectionTypeSchema,
  title: z.string(),
  subtitle: z.string(),
  image: z.string(),
  mobileImage: z.string(),
  link: z.string(),
  sortOrder: z.number().int().nonnegative(),
  startsAt: z.date().nullable(),
  endsAt: z.date().nullable(),
  isActive: z.boolean(),
  config: z.record(z.string(), z.unknown()),
});

export type HomepageSection = z.infer<typeof HomepageSectionSchema>;
export type HomepageSectionType = z.infer<typeof HomepageSectionTypeSchema>;
```

- [ ] **Step 12: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/shared test homepage-section`
Expected: PASS (4 tests)

- [ ] **Step 13: Add the new exports to `packages/shared/src/index.ts`**

Append these three lines after the existing `export * from './schemas/settings';` line (before the `pricing`/`dpi` exports already there):

```ts
export * from './schemas/category';
export * from './schemas/review';
export * from './schemas/homepage-section';
```

- [ ] **Step 14: Run the full shared package suite**

Run: `pnpm --filter @bro-pics/shared test`
Expected: PASS (all prior tests + 13 new tests, all green)

- [ ] **Step 15: Commit**

```bash
git add packages/shared/src/schemas/category.ts packages/shared/src/schemas/category.test.ts packages/shared/src/schemas/review.ts packages/shared/src/schemas/review.test.ts packages/shared/src/schemas/homepage-section.ts packages/shared/src/schemas/homepage-section.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add Category, Review, and HomepageSection schemas"
```

---

### Task 2: ProductSchema filter, rating, and search fields

**Files:**
- Modify: `packages/shared/src/schemas/product.ts`
- Modify: `packages/shared/src/schemas/product.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `Product` type gains `availableSizes`, `availableColours`, `availableMaterials`, `minPrice`, `maxPrice`, `occasionTags`, `inStock`, `ratingAverage`, `ratingCount`, `titleLower`, `searchTokens`. Task 3 (search), Task 4 (denormalization), Task 5 (seed data), Task 8 (ProductCard) all depend on these exact field names.

- [ ] **Step 1: Update the failing test fixture first**

Modify `packages/shared/src/schemas/product.test.ts` — replace the `validProduct` object with one that includes the new fields, and add two new assertions. Replace the entire file with:

```ts
// packages/shared/src/schemas/product.test.ts
import { describe, it, expect } from 'vitest';
import { ProductSchema } from './product';

const validProduct = {
  id: 'prod_1',
  title: 'Classic Wooden Frame',
  slug: 'classic-wooden-frame',
  categoryId: 'cat_frames',
  shortDesc: 'A classic wooden photo frame',
  descriptionHtml: '<p>Details</p>',
  highlights: ['Solid wood', 'Handcrafted'],
  howItWorks: ['Upload', 'Adjust', 'Order'],
  careText: 'Wipe with a dry cloth',
  basePrice: 99900,
  isActive: true,
  isFeatured: false,
  badges: ['best-seller'],
  dispatchDaysMin: 3,
  dispatchDaysMax: 5,
  photoSlots: 1,
  allowsTextPersonalization: false,
  seo: { title: 'Classic Wooden Frame', description: 'Buy now' },
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  availableSizes: ['8x12 in', '12x18 in'],
  availableColours: ['Black', 'White'],
  availableMaterials: ['Wood'],
  minPrice: 79900,
  maxPrice: 129900,
  occasionTags: ['birthday', 'anniversary'],
  inStock: true,
  ratingAverage: 4.5,
  ratingCount: 12,
  titleLower: 'classic wooden frame',
  searchTokens: ['classic', 'wooden', 'frame'],
};

describe('ProductSchema', () => {
  it('accepts a valid product', () => {
    expect(ProductSchema.parse(validProduct)).toEqual(validProduct);
  });

  it('rejects a non-integer basePrice', () => {
    const invalid = { ...validProduct, basePrice: 999.5 };
    expect(() => ProductSchema.parse(invalid)).toThrow();
  });

  it('rejects a negative photoSlots', () => {
    const invalid = { ...validProduct, photoSlots: 0 };
    expect(() => ProductSchema.parse(invalid)).toThrow();
  });

  it('rejects a ratingAverage above 5', () => {
    const invalid = { ...validProduct, ratingAverage: 5.1 };
    expect(() => ProductSchema.parse(invalid)).toThrow();
  });

  it('rejects a non-integer minPrice', () => {
    const invalid = { ...validProduct, minPrice: 799.5 };
    expect(() => ProductSchema.parse(invalid)).toThrow();
  });

  it('defaults occasionTags to an empty array when omitted', () => {
    const { occasionTags, ...withoutOccasionTags } = validProduct;
    const parsed = ProductSchema.parse(withoutOccasionTags);
    expect(parsed.occasionTags).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/shared test product`
Expected: FAIL — extra keys not recognized as valid fields fail `.toEqual`, and the new assertions (ratingAverage, minPrice, occasionTags default) fail because the fields don't exist on the schema yet

- [ ] **Step 3: Modify `packages/shared/src/schemas/product.ts`**

Replace the full file:

```ts
import { z } from 'zod';

export const ProductSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  slug: z.string().min(1),
  categoryId: z.string(),
  shortDesc: z.string(),
  descriptionHtml: z.string(),
  highlights: z.array(z.string()),
  howItWorks: z.array(z.string()),
  careText: z.string(),
  basePrice: z.number().int().nonnegative(),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  badges: z.array(z.string()),
  dispatchDaysMin: z.number().int().nonnegative(),
  dispatchDaysMax: z.number().int().nonnegative(),
  photoSlots: z.number().int().positive(),
  allowsTextPersonalization: z.boolean(),
  seo: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
  }),
  createdAt: z.date(),
  updatedAt: z.date(),

  // Denormalized filter fields — kept in sync by a Cloud Function trigger
  // on variant writes (see functions/src/products/denormalize.ts).
  availableSizes: z.array(z.string()),
  availableColours: z.array(z.string()),
  availableMaterials: z.array(z.string()),
  minPrice: z.number().int().nonnegative(),
  maxPrice: z.number().int().nonnegative(),
  occasionTags: z.array(z.string()).default([]),
  inStock: z.boolean(),

  // Denormalized rating — kept in sync when a review is approved.
  ratingAverage: z.number().min(0).max(5),
  ratingCount: z.number().int().nonnegative(),

  // Interim Firestore-only search fields (see packages/shared/src/search).
  titleLower: z.string(),
  searchTokens: z.array(z.string()),
});

export type Product = z.infer<typeof ProductSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/shared test product`
Expected: PASS (6 tests)

- [ ] **Step 5: Run the full shared package suite**

Run: `pnpm --filter @bro-pics/shared test`
Expected: FAIL at this point — `scripts/seed/src/data.ts`'s `seedProducts` no longer satisfies `ProductSchema` (missing the new required fields). This is expected; Task 5 fixes it. Confirm the failure is specifically in `@bro-pics/seed`, not `@bro-pics/shared` itself: run `pnpm --filter @bro-pics/shared test` alone (scoped to the shared package) and confirm THAT passes cleanly — the seed package's failure is out of scope for this task.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/schemas/product.ts packages/shared/src/schemas/product.test.ts
git commit -m "feat(shared): add filter, rating, and search fields to ProductSchema"
```

---

### Task 3: Search interface and Firestore-backed implementation

**Files:**
- Create: `packages/shared/src/search/types.ts`
- Create: `packages/shared/src/search/build-query-plan.ts`
- Test: `packages/shared/src/search/build-query-plan.test.ts`
- Create: `packages/shared/src/search/search-products.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/package.json` (add `firebase-admin` dependency)

**Interfaces:**
- Consumes: `Product` type from Task 2
- Produces: `SearchFilters`, `SearchResult`, `searchProducts(db, query, filters, page): Promise<SearchResult>` exported from `@bro-pics/shared`. Task 9 (category listing) and Task 10 (search page) call this directly.

**Design note carried into the code comments:** Firestore supports only one `array-contains-any` clause per query. This implementation applies `categoryId` (equality), `isActive`/`inStock` (equality), and `minPrice`/`maxPrice` (range, overlap check) natively in Firestore, plus **one** array-contains-any for whichever of size/colour/material/occasion the caller weights as primary (sizes, by convention, since it's the most commonly used PDP filter). Any *additional* array-type filters selected simultaneously (e.g. colour AND material together) are applied as an in-memory post-filter over the fetched page. This is documented as the "interim Firestore search" tradeoff from the design spec — correct at the current catalogue scale, revisited when Algolia is wired in.

- [ ] **Step 1: Add `firebase-admin` to `packages/shared/package.json`**

Modify the `dependencies` block to add it (keep `zod` as-is):

```json
  "dependencies": {
    "zod": "^3.23.0",
    "firebase-admin": "^12.6.0"
  },
```

Run `pnpm install` at the repo root after this change.

- [ ] **Step 2: Create `packages/shared/src/search/types.ts`**

```ts
import type { Product } from '../schemas/product';

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
```

- [ ] **Step 3: Write the failing test for the pure query-plan builder**

```ts
// packages/shared/src/search/build-query-plan.test.ts
import { describe, it, expect } from 'vitest';
import { buildProductQueryPlan } from './build-query-plan';

describe('buildProductQueryPlan', () => {
  it('always includes an isActive equality constraint', () => {
    const plan = buildProductQueryPlan('', {}, 1);
    expect(plan.constraints).toContainEqual({ field: 'isActive', op: '==', value: true });
  });

  it('includes a categoryId equality constraint when provided', () => {
    const plan = buildProductQueryPlan('', { categoryId: 'cat_frames' }, 1);
    expect(plan.constraints).toContainEqual({ field: 'categoryId', op: '==', value: 'cat_frames' });
  });

  it('includes inStock equality only when inStockOnly is true', () => {
    const withFilter = buildProductQueryPlan('', { inStockOnly: true }, 1);
    expect(withFilter.constraints).toContainEqual({ field: 'inStock', op: '==', value: true });

    const without = buildProductQueryPlan('', {}, 1);
    expect(without.constraints).not.toContainEqual({ field: 'inStock', op: '==', value: true });
  });

  it('includes minPrice/maxPrice range constraints as an overlap check', () => {
    const plan = buildProductQueryPlan('', { minPrice: 50000, maxPrice: 100000 }, 1);
    expect(plan.constraints).toContainEqual({ field: 'maxPrice', op: '>=', value: 50000 });
    expect(plan.constraints).toContainEqual({ field: 'minPrice', op: '<=', value: 100000 });
  });

  it('applies sizes as the single native array-contains-any constraint', () => {
    const plan = buildProductQueryPlan('', { sizes: ['8x12 in', '12x18 in'] }, 1);
    expect(plan.constraints).toContainEqual({
      field: 'availableSizes',
      op: 'array-contains-any',
      value: ['8x12 in', '12x18 in'],
    });
  });

  it('moves colour and material filters to postFilters when sizes is also set', () => {
    const plan = buildProductQueryPlan(
      '',
      { sizes: ['8x12 in'], colours: ['Black'], materials: ['Wood'] },
      1
    );
    expect(plan.constraints.some((c) => c.field === 'availableColours')).toBe(false);
    expect(plan.constraints.some((c) => c.field === 'availableMaterials')).toBe(false);
    expect(plan.postFilters).toContainEqual({ field: 'availableColours', anyOf: ['Black'] });
    expect(plan.postFilters).toContainEqual({ field: 'availableMaterials', anyOf: ['Wood'] });
  });

  it('uses colours as the native constraint when sizes is not set', () => {
    const plan = buildProductQueryPlan('', { colours: ['Black'] }, 1);
    expect(plan.constraints).toContainEqual({
      field: 'availableColours',
      op: 'array-contains-any',
      value: ['Black'],
    });
  });

  it('applies minRating as a postFilter, not a native constraint', () => {
    const plan = buildProductQueryPlan('', { minRating: 4 }, 1);
    expect(plan.constraints.some((c) => c.field === 'ratingAverage')).toBe(false);
    expect(plan.postFilters).toContainEqual({ field: 'ratingAverage', gte: 4 });
  });

  it('maps sort values to orderByField/orderByDirection', () => {
    expect(buildProductQueryPlan('', { sort: 'price_asc' }, 1)).toMatchObject({
      orderByField: 'minPrice',
      orderByDirection: 'asc',
    });
    expect(buildProductQueryPlan('', { sort: 'price_desc' }, 1)).toMatchObject({
      orderByField: 'minPrice',
      orderByDirection: 'desc',
    });
    expect(buildProductQueryPlan('', { sort: 'newest' }, 1)).toMatchObject({
      orderByField: 'createdAt',
      orderByDirection: 'desc',
    });
    expect(buildProductQueryPlan('', { sort: 'top_rated' }, 1)).toMatchObject({
      orderByField: 'ratingAverage',
      orderByDirection: 'desc',
    });
    expect(buildProductQueryPlan('', {}, 1)).toMatchObject({
      orderByField: 'createdAt',
      orderByDirection: 'desc',
    });
  });

  it('computes limit and offset from the page number at a fixed page size of 20', () => {
    expect(buildProductQueryPlan('', {}, 1)).toMatchObject({ limit: 20, offset: 0 });
    expect(buildProductQueryPlan('', {}, 2)).toMatchObject({ limit: 20, offset: 20 });
    expect(buildProductQueryPlan('', {}, 3)).toMatchObject({ limit: 20, offset: 40 });
  });

  it('adds a titleLower prefix range when a text query is given', () => {
    const plan = buildProductQueryPlan('Classic', {}, 1);
    expect(plan.constraints).toContainEqual({ field: 'titleLower', op: '>=', value: 'classic' });
    expect(plan.constraints).toContainEqual({ field: 'titleLower', op: '<=', value: 'classic' });
  });

  it('omits the titleLower range when the query is empty', () => {
    const plan = buildProductQueryPlan('', {}, 1);
    expect(plan.constraints.some((c) => c.field === 'titleLower')).toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/shared test build-query-plan`
Expected: FAIL — `./build-query-plan` module not found

- [ ] **Step 5: Create `packages/shared/src/search/build-query-plan.ts`**

```ts
import type { SearchFilters } from './types';

export interface ProductQueryConstraint {
  field: string;
  op: '==' | '>=' | '<=' | 'array-contains-any';
  value: unknown;
}

export interface ProductQueryPostFilter {
  field: string;
  anyOf?: string[];
  gte?: number;
}

export interface ProductQueryPlan {
  constraints: ProductQueryConstraint[];
  postFilters: ProductQueryPostFilter[];
  orderByField: string;
  orderByDirection: 'asc' | 'desc';
  limit: number;
  offset: number;
}

const PAGE_SIZE = 20;

const SORT_MAP: Record<
  NonNullable<SearchFilters['sort']>,
  { orderByField: string; orderByDirection: 'asc' | 'desc' }
> = {
  relevance: { orderByField: 'createdAt', orderByDirection: 'desc' },
  newest: { orderByField: 'createdAt', orderByDirection: 'desc' },
  price_asc: { orderByField: 'minPrice', orderByDirection: 'asc' },
  price_desc: { orderByField: 'minPrice', orderByDirection: 'desc' },
  best_selling: { orderByField: 'ratingCount', orderByDirection: 'desc' },
  top_rated: { orderByField: 'ratingAverage', orderByDirection: 'desc' },
};

/**
 * Builds a Firestore query plan for product search/listing. Firestore
 * allows only one array-contains-any per query, so only the first
 * array-type filter present (checked in the order sizes, colours,
 * materials, occasionTags) becomes a native constraint — any others
 * become postFilters applied in-memory over the fetched page. This is
 * the "interim Firestore search" tradeoff from the Storefront design
 * spec: correct at the current catalogue scale, revisited with Algolia.
 */
export function buildProductQueryPlan(
  query: string,
  filters: SearchFilters,
  page: number
): ProductQueryPlan {
  const constraints: ProductQueryConstraint[] = [{ field: 'isActive', op: '==', value: true }];
  const postFilters: ProductQueryPostFilter[] = [];

  if (filters.categoryId) {
    constraints.push({ field: 'categoryId', op: '==', value: filters.categoryId });
  }
  if (filters.inStockOnly) {
    constraints.push({ field: 'inStock', op: '==', value: true });
  }
  if (filters.minPrice !== undefined) {
    constraints.push({ field: 'maxPrice', op: '>=', value: filters.minPrice });
  }
  if (filters.maxPrice !== undefined) {
    constraints.push({ field: 'minPrice', op: '<=', value: filters.maxPrice });
  }

  const arrayFilters: Array<{ field: string; values: string[] | undefined }> = [
    { field: 'availableSizes', values: filters.sizes },
    { field: 'availableColours', values: filters.colours },
    { field: 'availableMaterials', values: filters.materials },
    { field: 'occasionTags', values: filters.occasionTags },
  ];
  let nativeArrayFilterUsed = false;
  for (const { field, values } of arrayFilters) {
    if (!values || values.length === 0) continue;
    if (!nativeArrayFilterUsed) {
      constraints.push({ field, op: 'array-contains-any', value: values });
      nativeArrayFilterUsed = true;
    } else {
      postFilters.push({ field, anyOf: values });
    }
  }

  if (filters.minRating !== undefined) {
    postFilters.push({ field: 'ratingAverage', gte: filters.minRating });
  }

  if (query.trim().length > 0) {
    const normalized = query.trim().toLowerCase();
    constraints.push({ field: 'titleLower', op: '>=', value: normalized });
    constraints.push({ field: 'titleLower', op: '<=', value: `${normalized}` });
  }

  const { orderByField, orderByDirection } = SORT_MAP[filters.sort ?? 'relevance'];

  return {
    constraints,
    postFilters,
    orderByField,
    orderByDirection,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/shared test build-query-plan`
Expected: PASS (13 tests)

- [ ] **Step 7: Create `packages/shared/src/search/search-products.ts`**

This is the thin Firestore executor. It is not unit-tested with fakes (documented below); its correctness is exercised live when Tasks 9 and 10 render real pages against Firestore, per this plan's testing approach.

```ts
import type { Firestore, Query, DocumentData } from 'firebase-admin/firestore';
import { buildProductQueryPlan } from './build-query-plan';
import type { ProductQueryPostFilter } from './build-query-plan';
import type { SearchFilters, SearchResult } from './types';
import type { Product } from '../schemas/product';

function applyPostFilter(product: Product, postFilter: ProductQueryPostFilter): boolean {
  if (postFilter.anyOf) {
    const productValues = (product as unknown as Record<string, unknown>)[postFilter.field];
    if (!Array.isArray(productValues)) return false;
    return postFilter.anyOf.some((value) => productValues.includes(value));
  }
  if (postFilter.gte !== undefined) {
    const value = (product as unknown as Record<string, unknown>)[postFilter.field];
    return typeof value === 'number' && value >= postFilter.gte;
  }
  return true;
}

/**
 * Firestore-backed product search. This is the "interim" implementation
 * named in the Storefront design spec — callers depend only on this
 * function's signature, so a future Algolia-backed implementation can
 * replace the body without touching any call site.
 */
export async function searchProducts(
  db: Firestore,
  query: string,
  filters: SearchFilters,
  page: number
): Promise<SearchResult> {
  const plan = buildProductQueryPlan(query, filters, page);

  let firestoreQuery: Query<DocumentData> = db.collection('products');
  for (const constraint of plan.constraints) {
    firestoreQuery = firestoreQuery.where(constraint.field, constraint.op, constraint.value);
  }
  firestoreQuery = firestoreQuery.orderBy(plan.orderByField, plan.orderByDirection);

  // Post-filters may remove documents from the page, so overfetch by the
  // offset plus a generous buffer, then filter and slice in memory.
  const snapshot = await firestoreQuery.limit(plan.offset + plan.limit * 3).get();
  let products = snapshot.docs.map((doc) => doc.data() as Product);

  for (const postFilter of plan.postFilters) {
    products = products.filter((product) => applyPostFilter(product, postFilter));
  }

  const page_ = products.slice(plan.offset, plan.offset + plan.limit);
  return { products: page_, totalCount: products.length };
}
```

- [ ] **Step 8: Add the new exports to `packages/shared/src/index.ts`**

Append after the `homepage-section` export line added in Task 1:

```ts
export * from './search/types';
export * from './search/build-query-plan';
export * from './search/search-products';
```

- [ ] **Step 9: Run the full shared package suite**

Run: `pnpm --filter @bro-pics/shared test`
Expected: PASS on everything except the still-broken `@bro-pics/seed` package from Task 2 (out of scope here, fixed in Task 5). Confirm `@bro-pics/shared` itself is fully green.

- [ ] **Step 10: Commit**

```bash
git add packages/shared/package.json packages/shared/src/search packages/shared/src/index.ts
git commit -m "feat(shared): add Firestore-backed product search behind a swappable interface"
```

---

### Task 4: Product filter/rating denormalization Cloud Function

**Files:**
- Create: `functions/src/products/denormalize.ts`
- Test: `functions/src/products/denormalize.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `Variant` type shape (locally redeclared minimal shape, matching `@bro-pics/shared`'s `Variant` fields used here — `price`, `sizeLabel`, `frameColour`, `material`, `stockStatus`, `isActive`)
- Produces: `calculateDenormalizedFields(variants): ProductDenormalizedFields` (pure, unit-tested) and `onVariantWritten` (a Cloud Functions v2 Firestore trigger, thin glue — not unit tested, documented below).

- [ ] **Step 1: Write the failing test for the pure calculation function**

```ts
// functions/src/products/denormalize.test.ts
import { describe, it, expect } from 'vitest';
import { calculateDenormalizedFields } from './denormalize';
import type { VariantForDenormalization } from './denormalize';

function makeVariant(overrides: Partial<VariantForDenormalization> = {}): VariantForDenormalization {
  return {
    price: 79900,
    sizeLabel: '8x12 in',
    frameColour: 'Black',
    material: 'Wood',
    stockStatus: 'in_stock',
    isActive: true,
    ...overrides,
  };
}

describe('calculateDenormalizedFields', () => {
  it('collects unique sizes, colours, and materials from active variants', () => {
    const result = calculateDenormalizedFields([
      makeVariant({ sizeLabel: '8x12 in', frameColour: 'Black', material: 'Wood' }),
      makeVariant({ sizeLabel: '12x18 in', frameColour: 'White', material: 'Wood' }),
      makeVariant({ sizeLabel: '8x12 in', frameColour: 'Black', material: 'Wood' }), // duplicate
    ]);
    expect(result.availableSizes.sort()).toEqual(['12x18 in', '8x12 in']);
    expect(result.availableColours.sort()).toEqual(['Black', 'White']);
    expect(result.availableMaterials).toEqual(['Wood']);
  });

  it('excludes inactive variants from every field', () => {
    const result = calculateDenormalizedFields([
      makeVariant({ sizeLabel: '8x12 in', isActive: true }),
      makeVariant({ sizeLabel: '20x30 in', isActive: false }),
    ]);
    expect(result.availableSizes).toEqual(['8x12 in']);
  });

  it('computes minPrice and maxPrice from active variants only', () => {
    const result = calculateDenormalizedFields([
      makeVariant({ price: 79900, isActive: true }),
      makeVariant({ price: 129900, isActive: true }),
      makeVariant({ price: 999900, isActive: false }),
    ]);
    expect(result.minPrice).toBe(79900);
    expect(result.maxPrice).toBe(129900);
  });

  it('sets inStock true when any active variant is in_stock', () => {
    const result = calculateDenormalizedFields([
      makeVariant({ stockStatus: 'out_of_stock' }),
      makeVariant({ stockStatus: 'in_stock' }),
    ]);
    expect(result.inStock).toBe(true);
  });

  it('sets inStock false when no active variant is in_stock', () => {
    const result = calculateDenormalizedFields([
      makeVariant({ stockStatus: 'out_of_stock' }),
      makeVariant({ stockStatus: 'backorder' }),
    ]);
    expect(result.inStock).toBe(false);
  });

  it('returns zeroed fields for an empty variant list', () => {
    const result = calculateDenormalizedFields([]);
    expect(result).toEqual({
      availableSizes: [],
      availableColours: [],
      availableMaterials: [],
      minPrice: 0,
      maxPrice: 0,
      inStock: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/functions test denormalize`
Expected: FAIL — `./denormalize` module not found

- [ ] **Step 3: Create `functions/src/products/denormalize.ts`**

```ts
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';

export interface VariantForDenormalization {
  price: number;
  sizeLabel: string;
  frameColour: string;
  material: string;
  stockStatus: 'in_stock' | 'out_of_stock' | 'backorder';
  isActive: boolean;
}

export interface ProductDenormalizedFields {
  availableSizes: string[];
  availableColours: string[];
  availableMaterials: string[];
  minPrice: number;
  maxPrice: number;
  inStock: boolean;
}

export function calculateDenormalizedFields(
  variants: VariantForDenormalization[]
): ProductDenormalizedFields {
  const active = variants.filter((v) => v.isActive);

  if (active.length === 0) {
    return {
      availableSizes: [],
      availableColours: [],
      availableMaterials: [],
      minPrice: 0,
      maxPrice: 0,
      inStock: false,
    };
  }

  const prices = active.map((v) => v.price);
  return {
    availableSizes: [...new Set(active.map((v) => v.sizeLabel))],
    availableColours: [...new Set(active.map((v) => v.frameColour))],
    availableMaterials: [...new Set(active.map((v) => v.material))],
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    inStock: active.some((v) => v.stockStatus === 'in_stock'),
  };
}

/**
 * Thin Cloud Function glue: on any write to a product's variants
 * subcollection, re-reads all sibling variants and writes the
 * recalculated denormalized fields onto the parent product doc. Not
 * unit-tested directly (it's a few lines of Admin SDK read/write around
 * the pure, fully-tested calculateDenormalizedFields above); exercised
 * live via the Firestore emulator when this trigger fires during manual
 * verification of the category listing page in Task 9.
 */
export const onVariantWritten = onDocumentWritten(
  'products/{productId}/variants/{variantId}',
  async (event) => {
    const { productId } = event.params;
    const db = getFirestore();

    const variantsSnapshot = await db.collection('products').doc(productId).collection('variants').get();
    const variants = variantsSnapshot.docs.map((doc) => doc.data() as VariantForDenormalization);

    const denormalized = calculateDenormalizedFields(variants);
    await db.collection('products').doc(productId).update(denormalized);
  }
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/functions test denormalize`
Expected: PASS (6 tests)

- [ ] **Step 5: Add the export to `functions/src/index.ts`**

Append after the existing idempotency export line:

```ts
export { onVariantWritten } from './products/denormalize';
```

- [ ] **Step 6: Run the full functions package suite and build**

Run: `pnpm --filter @bro-pics/functions test`
Expected: PASS (all prior tests + 6 new tests)

Run: `pnpm --filter @bro-pics/functions build`
Expected: compiles cleanly to `functions/lib/`

- [ ] **Step 7: Commit**

```bash
git add functions/src/products functions/src/index.ts
git commit -m "feat(functions): denormalize product filter/rating fields on variant writes"
```

---

### Task 5: Expanded seed catalogue and placeholder media

**Files:**
- Modify: `scripts/seed/src/data.ts`
- Modify: `scripts/seed/src/data.test.ts`
- Create: `apps/web/public/placeholders/products/*.svg` (placeholder product images — see step 3)
- Create: `apps/web/public/placeholders/home/*.svg` (placeholder homepage banner images)
- Create: `apps/web/public/placeholders/videos/product-demo.mp4` (one short placeholder video — see step 4)

**Interfaces:**
- Consumes: `CategorySchema`, `ReviewSchema`, `HomepageSectionSchema` (Task 1), extended `ProductSchema` (Task 2)
- Produces: `seedCategories: Category[]`, `seedProducts: Product[]` (3-4 categories, 8-10 products), `seedVariants: Variant[]`, `seedReviews: Review[]`, `seedHomepageSections: HomepageSection[]`. Tasks 6-10's manual browser verification steps render against this data (via a local Firestore emulator seeded from these arrays — the write-to-emulator script itself is out of scope for this plan, matching Foundation's precedent of leaving seed *data* schema-valid without also building a seed *runner*).

- [ ] **Step 1: Write the failing test for the expanded fixture set**

Replace `scripts/seed/src/data.test.ts` entirely:

```ts
// scripts/seed/src/data.test.ts
import { describe, it, expect } from 'vitest';
import { CategorySchema, ProductSchema, VariantSchema, ReviewSchema, HomepageSectionSchema } from '@bro-pics/shared';
import { seedCategories, seedProducts, seedVariants, seedReviews, seedHomepageSections } from './data';

describe('seed categories', () => {
  it('every seed category passes CategorySchema validation', () => {
    for (const category of seedCategories) {
      expect(() => CategorySchema.parse(category)).not.toThrow();
    }
  });

  it('seeds at least 3 categories', () => {
    expect(seedCategories.length).toBeGreaterThanOrEqual(3);
  });

  it('every child category references a parentId that exists', () => {
    const categoryIds = new Set(seedCategories.map((c) => c.id));
    for (const category of seedCategories) {
      if (category.parentId !== null) {
        expect(categoryIds.has(category.parentId)).toBe(true);
      }
    }
  });
});

describe('seed products', () => {
  it('every seed product passes ProductSchema validation', () => {
    for (const product of seedProducts) {
      expect(() => ProductSchema.parse(product)).not.toThrow();
    }
  });

  it('seeds at least 8 products', () => {
    expect(seedProducts.length).toBeGreaterThanOrEqual(8);
  });

  it('every product references a categoryId that exists in seedCategories', () => {
    const categoryIds = new Set(seedCategories.map((c) => c.id));
    for (const product of seedProducts) {
      expect(categoryIds.has(product.categoryId)).toBe(true);
    }
  });

  it('every product\'s denormalized fields are consistent with its own variants', () => {
    for (const product of seedProducts) {
      const productVariants = seedVariants.filter((v) => v.productId === product.id && v.isActive);
      const prices = productVariants.map((v) => v.price);
      expect(product.minPrice).toBe(Math.min(...prices));
      expect(product.maxPrice).toBe(Math.max(...prices));
      expect(product.availableSizes.sort()).toEqual(
        [...new Set(productVariants.map((v) => v.sizeLabel))].sort()
      );
    }
  });

  it('every product has a titleLower matching its lowercased title', () => {
    for (const product of seedProducts) {
      expect(product.titleLower).toBe(product.title.toLowerCase());
    }
  });
});

describe('seed variants', () => {
  it('every seed variant passes VariantSchema validation', () => {
    for (const variant of seedVariants) {
      expect(() => VariantSchema.parse(variant)).not.toThrow();
    }
  });

  it('every variant references a product that exists in seedProducts', () => {
    const productIds = new Set(seedProducts.map((p) => p.id));
    for (const variant of seedVariants) {
      expect(productIds.has(variant.productId)).toBe(true);
    }
  });
});

describe('seed reviews', () => {
  it('every seed review passes ReviewSchema validation', () => {
    for (const review of seedReviews) {
      expect(() => ReviewSchema.parse(review)).not.toThrow();
    }
  });

  it('every review references a product that exists in seedProducts', () => {
    const productIds = new Set(seedProducts.map((p) => p.id));
    for (const review of seedReviews) {
      expect(productIds.has(review.productId)).toBe(true);
    }
  });
});

describe('seed homepage sections', () => {
  it('every seed section passes HomepageSectionSchema validation', () => {
    for (const section of seedHomepageSections) {
      expect(() => HomepageSectionSchema.parse(section)).not.toThrow();
    }
  });

  it('sortOrder values are unique', () => {
    const orders = seedHomepageSections.map((s) => s.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/seed test`
Expected: FAIL — `seedCategories`, `seedReviews`, `seedHomepageSections` don't exist yet; `seedProducts` doesn't satisfy the extended `ProductSchema`

- [ ] **Step 3: Create the placeholder image files**

These are minimal, valid, committed SVG placeholders (not real photography — the client supplies real photos later per the PDF's open items). Create each as a simple colored rectangle with a text label so they're visually distinguishable during manual verification:

```bash
mkdir -p "apps/web/public/placeholders/products" "apps/web/public/placeholders/home" "apps/web/public/placeholders/categories"
```

For each of the following paths, create an SVG with the given label (300x300 for products, 800x400 for home banners, 200x200 for categories), using this template (substitute `{{LABEL}}` and dimensions):

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="{{WIDTH}}" height="{{HEIGHT}}" viewBox="0 0 {{WIDTH}} {{HEIGHT}}">
  <rect width="{{WIDTH}}" height="{{HEIGHT}}" fill="#FAF6F0"/>
  <rect x="8" y="8" width="{{WIDTH_MINUS_16}}" height="{{HEIGHT_MINUS_16}}" fill="none" stroke="#C1592A" stroke-width="2" stroke-dasharray="6,6"/>
  <text x="50%" y="50%" font-family="sans-serif" font-size="16" fill="#2A2622" text-anchor="middle" dominant-baseline="middle">{{LABEL}}</text>
</svg>
```

Create these files (product images, two per product for the 8-10 products defined in Step 4 below — `-1` is primary, `-2` is the hover/secondary image):
- `apps/web/public/placeholders/products/classic-wooden-frame-1.svg` through `-2.svg` (label: "Classic Wooden Frame")
- `apps/web/public/placeholders/products/modern-acrylic-frame-1.svg` through `-2.svg` (label: "Modern Acrylic Frame")
- `apps/web/public/placeholders/products/vintage-collage-frame-1.svg` through `-2.svg` (label: "Vintage Collage Frame")
- `apps/web/public/placeholders/products/couples-eye-frame-1.svg` through `-2.svg` (label: "Couple's Eye Frame")
- `apps/web/public/placeholders/products/photo-canvas-print-1.svg` through `-2.svg` (label: "Photo Canvas Print")
- `apps/web/public/placeholders/products/desk-photo-frame-1.svg` through `-2.svg` (label: "Desk Photo Frame")
- `apps/web/public/placeholders/products/photo-collage-set-1.svg` through `-2.svg` (label: "Photo Collage Set")
- `apps/web/public/placeholders/products/personalized-photo-mug-1.svg` through `-2.svg` (label: "Personalized Photo Mug")

Category images (one each):
- `apps/web/public/placeholders/categories/frames.svg` (label: "Frames")
- `apps/web/public/placeholders/categories/canvas.svg` (label: "Canvas")
- `apps/web/public/placeholders/categories/collage.svg` (label: "Collage")
- `apps/web/public/placeholders/categories/gifts.svg` (label: "Gifts")

Homepage banner images (desktop 800x400, mobile 400x500):
- `apps/web/public/placeholders/home/hero-1.svg` (label: "Hero Banner — Desktop")
- `apps/web/public/placeholders/home/hero-1-mobile.svg` (label: "Hero Banner — Mobile")
- `apps/web/public/placeholders/home/why-us.svg` (label: "Why Us — Factory")

- [ ] **Step 4: Create one placeholder video file**

Video support needs a real playable file for Task 8's "Products in motion" rail to be genuinely verified, not just stubbed. Generate a short (3-5 second) silent MP4 using `ffmpeg` if available:

```bash
mkdir -p "apps/web/public/placeholders/videos"
ffmpeg -f lavfi -i color=c=0xC1592A:s=720x1280:d=4 -vf "drawtext=text='Product in motion':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2" -c:v libx264 -pix_fmt yuv420p "apps/web/public/placeholders/videos/product-demo.mp4"
```

If `ffmpeg` is not available in this environment, note it in your task report as a BLOCKED-for-this-step item and use any small, valid, royalty-free-appropriate MP4 you can legally source or generate another way (e.g. a Python script using a minimal video-writing library) — the file just needs to be a genuinely playable MP4 under a few hundred KB so the gallery/rail can be tested with real playback, not a renamed non-video file. Do not download or reference an actual video from Ritwikas, Picloopz, Parul Packaging, or Yazhli Collection — that would violate the cloning boundary.

- [ ] **Step 5: Rewrite `scripts/seed/src/data.ts`**

Replace the entire file. This is placeholder catalogue content — descriptions and copy are written fresh, not copied from any reference site:

```ts
import type { Category, Product, Variant, Review, HomepageSection } from '@bro-pics/shared';

export const seedCategories: Category[] = [
  {
    id: 'cat_frames',
    name: 'Frames & Wall Décor',
    slug: 'frames-wall-decor',
    parentId: null,
    image: '/placeholders/categories/frames.svg',
    sortOrder: 1,
    isActive: true,
    seo: { title: 'Frames & Wall Décor | BroPics', description: 'Personalized photo frames for every wall.' },
  },
  {
    id: 'cat_canvas',
    name: 'Canvas Prints',
    slug: 'canvas-prints',
    parentId: null,
    image: '/placeholders/categories/canvas.svg',
    sortOrder: 2,
    isActive: true,
    seo: { title: 'Canvas Prints | BroPics', description: 'Gallery-wrapped canvas prints of your favourite photo.' },
  },
  {
    id: 'cat_collage',
    name: 'Collage & Combo Sets',
    slug: 'collage-combo-sets',
    parentId: null,
    image: '/placeholders/categories/collage.svg',
    sortOrder: 3,
    isActive: true,
    seo: { title: 'Collage & Combo Sets | BroPics', description: 'Multi-photo collage sets for a whole story.' },
  },
  {
    id: 'cat_gifts',
    name: 'Personalized Gifts',
    slug: 'personalized-gifts',
    parentId: null,
    image: '/placeholders/categories/gifts.svg',
    sortOrder: 4,
    isActive: true,
    seo: { title: 'Personalized Gifts | BroPics', description: 'Photo mugs, desk frames, and everyday keepsakes.' },
  },
];

interface SeedProductInput {
  id: string;
  title: string;
  categoryId: string;
  shortDesc: string;
  descriptionHtml: string;
  highlights: string[];
  howItWorks: string[];
  careText: string;
  badges: string[];
  photoSlots: number;
  occasionTags: string[];
  variants: Array<{
    idSuffix: string;
    sku: string;
    sizeLabel: string;
    widthIn: number;
    heightIn: number;
    frameColour: string;
    material: string;
    price: number;
    compareAtPrice?: number;
    stockStatus: 'in_stock' | 'out_of_stock' | 'backorder';
  }>;
  reviews: Array<{ rating: number; title: string; body: string; isVerified: boolean }>;
}

const productInputs: SeedProductInput[] = [
  {
    id: 'prod_classic_wooden_frame',
    title: 'Classic Wooden Photo Frame',
    categoryId: 'cat_frames',
    shortDesc: 'A timeless wooden frame for your favourite memory',
    descriptionHtml:
      '<p>Solid wood frame with a smooth matt finish, ready to hang or stand on a shelf. Built to last and finished by hand.</p>',
    highlights: ['Solid wood construction', 'Ready to hang or stand', 'Smooth matt finish'],
    howItWorks: ['Upload your photo', 'Adjust and preview inside the frame', 'We print and ship'],
    careText: 'Wipe with a dry, soft cloth. Avoid direct sunlight for long-term colour retention.',
    badges: ['best-seller'],
    photoSlots: 1,
    occasionTags: ['birthday', 'anniversary', 'housewarming'],
    variants: [
      { idSuffix: '8x12_black', sku: 'CWF-8X12-BLK', sizeLabel: '8x12 in', widthIn: 8, heightIn: 12, frameColour: 'Black', material: 'Wood', price: 79900, compareAtPrice: 99900, stockStatus: 'in_stock' },
      { idSuffix: '8x12_white', sku: 'CWF-8X12-WHT', sizeLabel: '8x12 in', widthIn: 8, heightIn: 12, frameColour: 'White', material: 'Wood', price: 79900, compareAtPrice: 99900, stockStatus: 'in_stock' },
      { idSuffix: '12x18_black', sku: 'CWF-12X18-BLK', sizeLabel: '12x18 in', widthIn: 12, heightIn: 18, frameColour: 'Black', material: 'Wood', price: 129900, stockStatus: 'in_stock' },
    ],
    reviews: [
      { rating: 5, title: 'Beautiful finish', body: 'The wood grain looks premium and the print came out sharp.', isVerified: true },
      { rating: 4, title: 'Good but slow shipping', body: 'Frame quality is great, took a bit longer than expected to arrive.', isVerified: true },
    ],
  },
  {
    id: 'prod_modern_acrylic_frame',
    title: 'Modern Acrylic Photo Frame',
    categoryId: 'cat_frames',
    shortDesc: 'A sleek acrylic frame with a glossy, modern finish',
    descriptionHtml: '<p>High-clarity acrylic with a floating-photo look, perfect for a contemporary desk or wall display.</p>',
    highlights: ['Crystal-clear acrylic', 'Floating photo effect', 'Scratch-resistant coating'],
    howItWorks: ['Upload your photo', 'Adjust and preview inside the frame', 'We print and ship'],
    careText: 'Clean with a microfibre cloth. Avoid abrasive cleaners.',
    badges: ['new'],
    photoSlots: 1,
    occasionTags: ['birthday', 'corporate-gifting'],
    variants: [
      { idSuffix: '10x10_clear', sku: 'MAF-10X10-CLR', sizeLabel: '10x10 in', widthIn: 10, heightIn: 10, frameColour: 'Clear', material: 'Acrylic', price: 109900, stockStatus: 'in_stock' },
      { idSuffix: '12x12_clear', sku: 'MAF-12X12-CLR', sizeLabel: '12x12 in', widthIn: 12, heightIn: 12, frameColour: 'Clear', material: 'Acrylic', price: 139900, stockStatus: 'in_stock' },
    ],
    reviews: [{ rating: 5, title: 'Looks premium', body: 'The floating effect makes the photo really stand out.', isVerified: true }],
  },
  {
    id: 'prod_vintage_collage_frame',
    title: 'Vintage Multi-Photo Collage Frame',
    categoryId: 'cat_collage',
    shortDesc: 'A weathered-finish frame holding six of your favourite photos',
    descriptionHtml: '<p>A single frame with six openings, finished in a warm vintage tone, ideal for a family memory wall.</p>',
    highlights: ['Holds 6 photos', 'Warm vintage finish', 'Single-piece hanging frame'],
    howItWorks: ['Upload 6 photos', 'Arrange each into its slot', 'We print and ship'],
    careText: 'Dust gently with a soft brush.',
    badges: ['best-seller'],
    photoSlots: 6,
    occasionTags: ['housewarming', 'anniversary'],
    variants: [
      { idSuffix: 'standard_brown', sku: 'VCF-STD-BRN', sizeLabel: '24x18 in (6 openings)', widthIn: 24, heightIn: 18, frameColour: 'Vintage Brown', material: 'Wood', price: 249900, compareAtPrice: 299900, stockStatus: 'in_stock' },
    ],
    reviews: [
      { rating: 5, title: 'Perfect for our hallway', body: 'Six photos fit beautifully, the vintage tone matches our decor.', isVerified: true },
      { rating: 5, title: 'Great gift', body: 'Gave this to my parents for their anniversary, they loved it.', isVerified: false },
    ],
  },
  {
    id: 'prod_couples_eye_frame',
    title: "Couple's Eye Frame",
    categoryId: 'cat_frames',
    shortDesc: 'Two eyes, one frame — a symbol of togetherness',
    descriptionHtml: '<p>A close-up portrait style frame designed to showcase a shared, meaningful detail from a couple\'s photo.</p>',
    highlights: ['Romantic keepsake design', 'Premium matt print', 'Compact size for a nightstand or shelf'],
    howItWorks: ['Upload your photo', 'Adjust and preview inside the frame', 'We print and ship'],
    careText: 'Wipe with a dry, soft cloth.',
    badges: ['trending'],
    photoSlots: 1,
    occasionTags: ['anniversary', 'valentines'],
    variants: [
      { idSuffix: '6x8_black', sku: 'CEF-6X8-BLK', sizeLabel: '6x8 in', widthIn: 6, heightIn: 8, frameColour: 'Black', material: 'Wood', price: 59900, stockStatus: 'in_stock' },
    ],
    reviews: [{ rating: 4, title: 'Sweet design', body: 'A really thoughtful gift idea, print quality is solid.', isVerified: true }],
  },
  {
    id: 'prod_photo_canvas_print',
    title: 'Gallery Wrap Canvas Print',
    categoryId: 'cat_canvas',
    shortDesc: 'A frameless, gallery-wrapped canvas ready to hang',
    descriptionHtml: '<p>Your photo printed on artist-grade canvas, stretched over a solid wooden frame, ready to hang straight out of the box.</p>',
    highlights: ['Frameless gallery-wrap style', 'Fade-resistant pigment ink', 'Ready to hang'],
    howItWorks: ['Upload your photo', 'Adjust and preview on the canvas', 'We print and ship'],
    careText: 'Dust gently, avoid moisture.',
    badges: [],
    photoSlots: 1,
    occasionTags: ['housewarming', 'corporate-gifting'],
    variants: [
      { idSuffix: '16x24_natural', sku: 'GWC-16X24-NAT', sizeLabel: '16x24 in', widthIn: 16, heightIn: 24, frameColour: 'Natural Wood Edge', material: 'Canvas', price: 189900, stockStatus: 'in_stock' },
      { idSuffix: '20x30_natural', sku: 'GWC-20X30-NAT', sizeLabel: '20x30 in', widthIn: 20, heightIn: 30, frameColour: 'Natural Wood Edge', material: 'Canvas', price: 259900, stockStatus: 'in_stock' },
    ],
    reviews: [{ rating: 5, title: 'Stunning colours', body: 'Print quality on the canvas is excellent, very vivid.', isVerified: true }],
  },
  {
    id: 'prod_desk_photo_frame',
    title: 'Mini Desk Photo Frame',
    categoryId: 'cat_gifts',
    shortDesc: 'A compact frame perfect for a work desk or bedside table',
    descriptionHtml: '<p>A small, sturdy frame that fits neatly on any desk without taking up much space.</p>',
    highlights: ['Compact desk-friendly size', 'Sturdy stand-up base', 'Available in two finishes'],
    howItWorks: ['Upload your photo', 'Adjust and preview inside the frame', 'We print and ship'],
    careText: 'Wipe with a dry cloth.',
    badges: ['budget-pick'],
    photoSlots: 1,
    occasionTags: ['birthday', 'corporate-gifting'],
    variants: [
      { idSuffix: '4x6_black', sku: 'MDF-4X6-BLK', sizeLabel: '4x6 in', widthIn: 4, heightIn: 6, frameColour: 'Black', material: 'Wood', price: 34900, stockStatus: 'in_stock' },
      { idSuffix: '4x6_white', sku: 'MDF-4X6-WHT', sizeLabel: '4x6 in', widthIn: 4, heightIn: 6, frameColour: 'White', material: 'Wood', price: 34900, stockStatus: 'out_of_stock' },
    ],
    reviews: [{ rating: 4, title: 'Great value', body: 'Small but well made for the price.', isVerified: true }],
  },
  {
    id: 'prod_photo_collage_set',
    title: 'Three-Piece Photo Collage Set',
    categoryId: 'cat_collage',
    shortDesc: 'Three matching frames that tell one story together',
    descriptionHtml: '<p>A set of three frames in matching finish, arranged side by side to display a sequence of memories.</p>',
    highlights: ['Set of 3 matching frames', 'Ideal for a staircase or hallway wall', 'Consistent finish across all three'],
    howItWorks: ['Upload 3 photos', 'Adjust and preview each frame', 'We print and ship'],
    careText: 'Wipe with a dry, soft cloth.',
    badges: ['best-seller'],
    photoSlots: 3,
    occasionTags: ['housewarming', 'wedding'],
    variants: [
      { idSuffix: 'set_black', sku: 'PCS-SET-BLK', sizeLabel: '3 x 8x10 in', widthIn: 8, heightIn: 10, frameColour: 'Black', material: 'Wood', price: 189900, compareAtPrice: 229900, stockStatus: 'in_stock' },
    ],
    reviews: [{ rating: 5, title: 'Looks amazing together', body: 'The set on our staircase wall gets so many compliments.', isVerified: true }],
  },
  {
    id: 'prod_personalized_photo_mug',
    title: 'Personalized Photo Mug',
    categoryId: 'cat_gifts',
    shortDesc: 'A ceramic mug printed with your favourite photo',
    descriptionHtml: '<p>Start every morning with a favourite memory — a food-grade ceramic mug printed with your chosen photo.</p>',
    highlights: ['Food-grade ceramic', 'Dishwasher-safe print (hand wash recommended)', 'Great for everyday gifting'],
    howItWorks: ['Upload your photo', 'Adjust and preview on the mug', 'We print and ship'],
    careText: 'Hand wash recommended to preserve print quality.',
    badges: [],
    photoSlots: 1,
    occasionTags: ['birthday', 'corporate-gifting'],
    variants: [
      { idSuffix: 'standard_white', sku: 'PPM-STD-WHT', sizeLabel: 'Standard 325ml', widthIn: 3.5, heightIn: 4, frameColour: 'White', material: 'Ceramic', price: 39900, stockStatus: 'in_stock' },
    ],
    reviews: [{ rating: 4, title: 'Nice everyday gift', body: 'Print held up well after a few washes.', isVerified: true }],
  },
];

function toPrintPixels(widthIn: number, heightIn: number): { printWidthPx: number; printHeightPx: number } {
  return { printWidthPx: Math.round(widthIn * 300), printHeightPx: Math.round(heightIn * 300) };
}

export const seedProducts: Product[] = productInputs.map((input) => {
  const activeVariants = input.variants.filter((v) => v.stockStatus !== 'out_of_stock');
  const allPrices = input.variants.map((v) => v.price);
  const activePrices = activeVariants.length > 0 ? activeVariants.map((v) => v.price) : allPrices;
  const ratings = input.reviews.map((r) => r.rating);
  const ratingAverage = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;

  return {
    id: input.id,
    title: input.title,
    slug: input.id.replace('prod_', '').replace(/_/g, '-'),
    categoryId: input.categoryId,
    shortDesc: input.shortDesc,
    descriptionHtml: input.descriptionHtml,
    highlights: input.highlights,
    howItWorks: input.howItWorks,
    careText: input.careText,
    basePrice: Math.min(...allPrices),
    isActive: true,
    isFeatured: input.badges.includes('best-seller'),
    badges: input.badges,
    dispatchDaysMin: 3,
    dispatchDaysMax: 5,
    photoSlots: input.photoSlots,
    allowsTextPersonalization: false,
    seo: { title: `${input.title} | BroPics`, description: input.shortDesc },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    availableSizes: [...new Set(activeVariants.map((v) => v.sizeLabel))],
    availableColours: [...new Set(activeVariants.map((v) => v.frameColour))],
    availableMaterials: [...new Set(activeVariants.map((v) => v.material))],
    minPrice: Math.min(...activePrices),
    maxPrice: Math.max(...activePrices),
    occasionTags: input.occasionTags,
    inStock: activeVariants.length > 0,
    ratingAverage: Math.round(ratingAverage * 10) / 10,
    ratingCount: ratings.length,
    titleLower: input.title.toLowerCase(),
    searchTokens: [
      ...new Set(
        `${input.title} ${input.shortDesc}`
          .toLowerCase()
          .split(/\s+/)
          .filter((token) => token.length > 2)
      ),
    ],
  };
});

export const seedVariants: Variant[] = productInputs.flatMap((input) =>
  input.variants.map((v) => ({
    id: `var_${v.idSuffix}`,
    productId: input.id,
    sku: v.sku,
    sizeLabel: v.sizeLabel,
    widthIn: v.widthIn,
    heightIn: v.heightIn,
    frameColour: v.frameColour,
    material: v.material,
    price: v.price,
    compareAtPrice: v.compareAtPrice,
    stockStatus: v.stockStatus,
    ...toPrintPixels(v.widthIn, v.heightIn),
    minUploadPx: toPrintPixels(v.widthIn, v.heightIn).printWidthPx,
    aspectRatio: v.widthIn / v.heightIn,
    isActive: true,
  }))
);

export const seedReviews: Review[] = productInputs.flatMap((input, productIndex) =>
  input.reviews.map((r, reviewIndex) => ({
    id: `rev_${input.id}_${reviewIndex}`,
    productId: input.id,
    userId: `user_seed_${productIndex}_${reviewIndex}`,
    orderId: r.isVerified ? `order_seed_${productIndex}_${reviewIndex}` : undefined,
    rating: r.rating,
    title: r.title,
    body: r.body,
    media: [],
    isVerified: r.isVerified,
    status: 'approved' as const,
  }))
);

export const seedHomepageSections: HomepageSection[] = [
  {
    id: 'sec_hero',
    type: 'hero_slider',
    title: 'Handcrafted With Love',
    subtitle: 'Personalized photo frames made from your favourite memories',
    image: '/placeholders/home/hero-1.svg',
    mobileImage: '/placeholders/home/hero-1-mobile.svg',
    link: '/category/frames-wall-decor',
    sortOrder: 1,
    startsAt: null,
    endsAt: null,
    isActive: true,
    config: {},
  },
  {
    id: 'sec_category_tiles',
    type: 'category_tiles',
    title: 'Shop by Category',
    subtitle: '',
    image: '',
    mobileImage: '',
    link: '',
    sortOrder: 2,
    startsAt: null,
    endsAt: null,
    isActive: true,
    config: {},
  },
  {
    id: 'sec_best_sellers',
    type: 'best_sellers',
    title: 'Best Sellers',
    subtitle: 'Loved by our customers',
    image: '',
    mobileImage: '',
    link: '/category/all',
    sortOrder: 3,
    startsAt: null,
    endsAt: null,
    isActive: true,
    config: {},
  },
  {
    id: 'sec_how_it_works',
    type: 'how_it_works',
    title: 'How It Works',
    subtitle: 'From your photo to your wall in four simple steps',
    image: '',
    mobileImage: '',
    link: '',
    sortOrder: 4,
    startsAt: null,
    endsAt: null,
    isActive: true,
    config: {},
  },
  {
    id: 'sec_featured_frames',
    type: 'featured_collection',
    title: 'Featured: Frames & Wall Décor',
    subtitle: '',
    image: '',
    mobileImage: '',
    link: '/category/frames-wall-decor',
    sortOrder: 5,
    startsAt: null,
    endsAt: null,
    isActive: true,
    config: { categoryId: 'cat_frames' },
  },
  {
    id: 'sec_products_in_motion',
    type: 'products_in_motion',
    title: 'Products in Motion',
    subtitle: '',
    image: '',
    mobileImage: '',
    link: '',
    sortOrder: 6,
    startsAt: null,
    endsAt: null,
    isActive: true,
    config: {},
  },
  {
    id: 'sec_reviews',
    type: 'reviews_testimonials',
    title: 'What Our Customers Say',
    subtitle: '',
    image: '',
    mobileImage: '',
    link: '',
    sortOrder: 7,
    startsAt: null,
    endsAt: null,
    isActive: true,
    config: {},
  },
  {
    id: 'sec_why_us',
    type: 'why_us',
    title: 'Why BroPics',
    subtitle: 'Quality you can trust',
    image: '/placeholders/home/why-us.svg',
    mobileImage: '/placeholders/home/why-us.svg',
    link: '',
    sortOrder: 8,
    startsAt: null,
    endsAt: null,
    isActive: true,
    config: {},
  },
  {
    id: 'sec_offer_strip',
    type: 'offer_strip',
    title: 'Use code NEW10 for 10% off your first order',
    subtitle: '',
    image: '',
    mobileImage: '',
    link: '',
    sortOrder: 9,
    startsAt: null,
    endsAt: null,
    isActive: true,
    config: {},
  },
  {
    id: 'sec_recently_viewed',
    type: 'recently_viewed',
    title: 'Recently Viewed',
    subtitle: '',
    image: '',
    mobileImage: '',
    link: '',
    sortOrder: 10,
    startsAt: null,
    endsAt: null,
    isActive: true,
    config: {},
  },
];
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/seed test`
Expected: PASS (all assertions, including the ones that previously failed due to Task 2's schema change)

- [ ] **Step 7: Run the full shared package suite to confirm it's now unblocked too**

Run: `pnpm --filter @bro-pics/shared test`
Expected: PASS (unaffected by this task, confirms no regression)

- [ ] **Step 8: Commit**

```bash
git add scripts/seed/src/data.ts scripts/seed/src/data.test.ts apps/web/public/placeholders
git commit -m "feat(seed): expand placeholder catalogue to categories, reviews, and homepage sections"
```

---

### Task 6: Cart context, Header, AnnouncementBar, Footer

**Files:**
- Create: `apps/web/lib/cart-context.tsx`
- Test: `apps/web/lib/cart-context.test.tsx`
- Create: `apps/web/lib/firestore-categories.ts`
- Create: `apps/web/components/layout/AnnouncementBar.tsx`
- Create: `apps/web/components/layout/Header.tsx`
- Test: `apps/web/components/layout/Header.test.tsx`
- Create: `apps/web/components/layout/Footer.tsx`
- Test: `apps/web/components/layout/Footer.test.tsx`

**Interfaces:**
- Consumes: `Category` type (Task 1), `getAdminApp()` (Foundation, `apps/web/lib/firebase-admin.ts`)
- Produces: `CartProvider`, `useCart()` returning `{ items, addItem, removeItem, updateQuantity, totalCount, totalPaise }`; `getActiveCategories(): Promise<Category[]>`; `<Header categories={Category[]} />`; `<Footer />`. Task 7 consumes `CartProvider`/`useCart`; Task 8's homepage and Task 9's listing page both use `getActiveCategories`.

- [ ] **Step 1: Write the failing test for the cart context**

```tsx
// apps/web/lib/cart-context.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CartProvider, useCart } from './cart-context';

function TestConsumer() {
  const cart = useCart();
  return (
    <div>
      <span data-testid="count">{cart.totalCount}</span>
      <span data-testid="total">{cart.totalPaise}</span>
      <button onClick={() => cart.addItem({ variantId: 'var_1', title: 'Test Frame', unitPriceSnapshot: 50000, qty: 1 })}>
        Add
      </button>
      <button onClick={() => cart.updateQuantity('var_1', 3)}>Set qty 3</button>
      <button onClick={() => cart.removeItem('var_1')}>Remove</button>
    </div>
  );
}

describe('CartProvider / useCart', () => {
  it('starts empty', () => {
    render(
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    );
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect(screen.getByTestId('total').textContent).toBe('0');
  });

  it('adds an item and updates count and total', () => {
    render(
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    );
    fireEvent.click(screen.getByText('Add'));
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('total').textContent).toBe('50000');
  });

  it('updates quantity and recalculates the total', () => {
    render(
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    );
    fireEvent.click(screen.getByText('Add'));
    fireEvent.click(screen.getByText('Set qty 3'));
    expect(screen.getByTestId('count').textContent).toBe('3');
    expect(screen.getByTestId('total').textContent).toBe('150000');
  });

  it('removes an item', () => {
    render(
      <CartProvider>
        <TestConsumer />
      </CartProvider>
    );
    fireEvent.click(screen.getByText('Add'));
    fireEvent.click(screen.getByText('Remove'));
    expect(screen.getByTestId('count').textContent).toBe('0');
  });

  it('throws when useCart is called outside a CartProvider', () => {
    // Suppress the expected React error boundary console output for this negative test.
    const originalError = console.error;
    console.error = () => {};
    expect(() => render(<TestConsumer />)).toThrow('useCart must be used within a CartProvider');
    console.error = originalError;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test cart-context`
Expected: FAIL — `./cart-context` module not found

- [ ] **Step 3: Create `apps/web/lib/cart-context.tsx`**

```tsx
'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export interface CartItem {
  variantId: string;
  title: string;
  unitPriceSnapshot: number;
  qty: number;
}

export interface CartContextValue {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, qty: number) => void;
  totalCount: number;
  totalPaise: number;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Local-only mock cart state for the Storefront phase — not persisted,
 * not Firestore-backed. Phase 4 replaces this provider's internals with
 * real cart persistence behind the same useCart() interface.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const value = useMemo<CartContextValue>(() => {
    const addItem = (item: CartItem) => {
      setItems((prev) => {
        const existing = prev.find((i) => i.variantId === item.variantId);
        if (existing) {
          return prev.map((i) =>
            i.variantId === item.variantId ? { ...i, qty: i.qty + item.qty } : i
          );
        }
        return [...prev, item];
      });
    };

    const removeItem = (variantId: string) => {
      setItems((prev) => prev.filter((i) => i.variantId !== variantId));
    };

    const updateQuantity = (variantId: string, qty: number) => {
      setItems((prev) => prev.map((i) => (i.variantId === variantId ? { ...i, qty } : i)));
    };

    const totalCount = items.reduce((sum, i) => sum + i.qty, 0);
    const totalPaise = items.reduce((sum, i) => sum + i.qty * i.unitPriceSnapshot, 0);

    return { items, addItem, removeItem, updateQuantity, totalCount, totalPaise };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test cart-context`
Expected: PASS (5 tests)

- [ ] **Step 5: Create `apps/web/lib/firestore-categories.ts`**

```ts
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from './firebase-admin';
import type { Category } from '@bro-pics/shared';

export async function getActiveCategories(): Promise<Category[]> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db
    .collection('categories')
    .where('isActive', '==', true)
    .orderBy('sortOrder', 'asc')
    .get();
  return snapshot.docs.map((doc) => doc.data() as Category);
}
```

- [ ] **Step 6: Create `apps/web/components/layout/AnnouncementBar.tsx`**

```tsx
interface AnnouncementBarProps {
  text: string;
  link?: string;
}

export function AnnouncementBar({ text, link }: AnnouncementBarProps) {
  const content = link ? (
    <a href={link} className="hover:underline">
      {text}
    </a>
  ) : (
    <span>{text}</span>
  );

  return (
    <div className="bg-charcoal text-cream text-center text-sm py-2 px-4">
      {content}
    </div>
  );
}
```

- [ ] **Step 7: Write the failing test for Header**

```tsx
// apps/web/components/layout/Header.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from './Header';
import { CartProvider } from '../../lib/cart-context';
import type { Category } from '@bro-pics/shared';

const categories: Category[] = [
  {
    id: 'cat_frames',
    name: 'Frames & Wall Décor',
    slug: 'frames-wall-decor',
    parentId: null,
    image: '',
    sortOrder: 1,
    isActive: true,
    seo: {},
  },
];

describe('Header', () => {
  it('renders the logo, category links, and a search input', () => {
    render(
      <CartProvider>
        <Header categories={categories} />
      </CartProvider>
    );
    expect(screen.getByText('BroPics')).toBeInTheDocument();
    expect(screen.getByText('Frames & Wall Décor')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search products...')).toBeInTheDocument();
  });

  it('shows a cart badge with the current item count', () => {
    render(
      <CartProvider>
        <Header categories={categories} />
      </CartProvider>
    );
    expect(screen.getByTestId('cart-count').textContent).toBe('0');
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test Header`
Expected: FAIL — `./Header` module not found

- [ ] **Step 9: Create `apps/web/components/layout/Header.tsx`**

```tsx
'use client';

import Link from 'next/link';
import type { Category } from '@bro-pics/shared';
import { useCart } from '../../lib/cart-context';

interface HeaderProps {
  categories: Category[];
}

export function Header({ categories }: HeaderProps) {
  const { totalCount } = useCart();

  return (
    <header className="sticky top-0 z-40 bg-cream border-b border-charcoal/10">
      <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-8">
        <Link href="/" className="font-display text-2xl text-charcoal">
          BroPics
        </Link>

        <nav className="hidden md:flex gap-6" aria-label="Category navigation">
          {categories.map((category) => (
            <Link
              key={category.id}
              href={`/category/${category.slug}`}
              className="text-charcoal hover:text-terracotta"
            >
              {category.name}
            </Link>
          ))}
        </nav>

        <div className="flex-1 max-w-md hidden sm:block">
          <input
            type="search"
            placeholder="Search products..."
            className="w-full rounded-full border border-charcoal/20 px-4 py-2 text-sm"
          />
        </div>

        <div className="flex items-center gap-4">
          <button aria-label="Wishlist" className="text-charcoal">
            ♡
          </button>
          <Link href="/account" aria-label="Account" className="text-charcoal">
            ◐
          </Link>
          <button aria-label="Cart" className="relative text-charcoal">
            🛒
            <span
              data-testid="cart-count"
              className="absolute -top-2 -right-2 bg-terracotta text-cream text-xs rounded-full w-5 h-5 flex items-center justify-center"
            >
              {totalCount}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test Header`
Expected: PASS (2 tests)

- [ ] **Step 11: Write the failing test for Footer**

```tsx
// apps/web/components/layout/Footer.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer } from './Footer';

describe('Footer', () => {
  it('renders the policy links', () => {
    render(<Footer />);
    expect(screen.getByText('About Us')).toBeInTheDocument();
    expect(screen.getByText('FAQ')).toBeInTheDocument();
    expect(screen.getByText('Return & Refund Policy')).toBeInTheDocument();
    expect(screen.getByText('Shipping Policy')).toBeInTheDocument();
  });

  it('renders a newsletter signup form', () => {
    render(<Footer />);
    expect(screen.getByPlaceholderText('Your email address')).toBeInTheDocument();
  });
});
```

- [ ] **Step 12: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test Footer`
Expected: FAIL — `./Footer` module not found

- [ ] **Step 13: Create `apps/web/components/layout/Footer.tsx`**

```tsx
import Link from 'next/link';

const policyLinks = [
  { label: 'About Us', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'FAQ', href: '/faq' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Picture Quality Guide', href: '/picture-quality-guide' },
  { label: 'Terms & Conditions', href: '/terms' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Shipping Policy', href: '/shipping-policy' },
  { label: 'Return & Refund Policy', href: '/return-refund-policy' },
];

export function Footer() {
  return (
    <footer className="bg-charcoal text-cream mt-16">
      <div className="max-w-6xl mx-auto px-4 py-10 grid gap-8 md:grid-cols-3">
        <div>
          <h3 className="font-display text-xl mb-3">BroPics</h3>
          <p className="text-sm opacity-80">
            Personalized photo frames, handcrafted from your favourite memories.
          </p>
        </div>

        <nav aria-label="Policy links" className="grid grid-cols-2 gap-2 text-sm">
          {policyLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:underline">
              {link.label}
            </Link>
          ))}
        </nav>

        <form className="text-sm">
          <label htmlFor="newsletter-email" className="block mb-2">
            Sign up for offers &amp; updates
          </label>
          <input
            id="newsletter-email"
            type="email"
            placeholder="Your email address"
            className="w-full rounded-full px-4 py-2 text-charcoal"
          />
        </form>
      </div>
    </footer>
  );
}
```

- [ ] **Step 14: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test Footer`
Expected: PASS (2 tests)

- [ ] **Step 15: Run the full web package suite**

Run: `pnpm --filter @bro-pics/web test`
Expected: PASS (all prior tests + new tests, all green)

- [ ] **Step 16: Commit**

```bash
git add apps/web/lib/cart-context.tsx apps/web/lib/cart-context.test.tsx apps/web/lib/firestore-categories.ts apps/web/components/layout/AnnouncementBar.tsx apps/web/components/layout/Header.tsx apps/web/components/layout/Header.test.tsx apps/web/components/layout/Footer.tsx apps/web/components/layout/Footer.test.tsx
git commit -m "feat(web): add mock cart context, Header, AnnouncementBar, and Footer"
```

---

### Task 7: CartDrawer, WhatsAppButton, and root layout wiring

**Files:**
- Create: `apps/web/components/layout/CartDrawer.tsx`
- Test: `apps/web/components/layout/CartDrawer.test.tsx`
- Create: `apps/web/components/layout/WhatsAppButton.tsx`
- Test: `apps/web/components/layout/WhatsAppButton.test.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/layout.test.tsx`
- Modify: `apps/web/tailwind.config.ts` (add design tokens)

**Interfaces:**
- Consumes: `useCart()` (Task 6)
- Produces: `<CartDrawer isOpen={boolean} onClose={() => void} />`, `<WhatsAppButton phoneNumber={string} message={string} />`. Task 9's PDP-adjacent listing page and later Plan B's PDP both trigger `CartDrawer` opening on add-to-cart.

- [ ] **Step 1: Add design tokens to `apps/web/tailwind.config.ts`**

Replace the full file:

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#FAF6F0',
        charcoal: '#2A2622',
        terracotta: '#C1592A',
        sage: '#7C8B6F',
      },
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        sans: ['var(--font-sans)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: Write the failing test for CartDrawer**

```tsx
// apps/web/components/layout/CartDrawer.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CartDrawer } from './CartDrawer';
import { CartProvider, useCart } from '../../lib/cart-context';
import { useEffect } from 'react';

function SeedCart() {
  const cart = useCart();
  useEffect(() => {
    cart.addItem({ variantId: 'var_1', title: 'Classic Wooden Frame — 8x12 in', unitPriceSnapshot: 79900, qty: 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

describe('CartDrawer', () => {
  it('is hidden when isOpen is false', () => {
    render(
      <CartProvider>
        <CartDrawer isOpen={false} onClose={() => {}} />
      </CartProvider>
    );
    expect(screen.queryByTestId('cart-drawer')).not.toBeInTheDocument();
  });

  it('shows line items and the running subtotal when open', () => {
    render(
      <CartProvider>
        <SeedCart />
        <CartDrawer isOpen={true} onClose={() => {}} />
      </CartProvider>
    );
    expect(screen.getByText('Classic Wooden Frame — 8x12 in')).toBeInTheDocument();
    expect(screen.getByTestId('cart-subtotal').textContent).toContain('1,598.00');
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <CartProvider>
        <CartDrawer isOpen={true} onClose={onClose} />
      </CartProvider>
    );
    fireEvent.click(screen.getByLabelText('Close cart'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test CartDrawer`
Expected: FAIL — `./CartDrawer` module not found

- [ ] **Step 4: Create `apps/web/components/layout/CartDrawer.tsx`**

```tsx
'use client';

import { useCart } from '../../lib/cart-context';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatPaise(paise: number): string {
  return (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const { items, updateQuantity, removeItem, totalPaise } = useCart();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" data-testid="cart-drawer">
      <div className="absolute inset-0 bg-charcoal/40" onClick={onClose} />
      <div className="relative bg-cream w-full max-w-sm h-full p-4 flex flex-col gap-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">Your Cart</h2>
          <button aria-label="Close cart" onClick={onClose} className="text-charcoal">
            ✕
          </button>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-charcoal/70">Your cart is empty.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.variantId} className="flex items-center justify-between gap-2 text-sm">
                <span>{item.title}</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={item.qty}
                    onChange={(e) => updateQuantity(item.variantId, Number(e.target.value))}
                    className="w-14 rounded border border-charcoal/20 px-2 py-1"
                    aria-label={`Quantity for ${item.title}`}
                  />
                  <button onClick={() => removeItem(item.variantId)} aria-label={`Remove ${item.title}`}>
                    🗑
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto pt-4 border-t border-charcoal/10 flex items-center justify-between">
          <span className="font-medium">Subtotal</span>
          <span data-testid="cart-subtotal" className="font-medium">
            ₹{formatPaise(totalPaise)}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test CartDrawer`
Expected: PASS (3 tests)

- [ ] **Step 6: Write the failing test for WhatsAppButton**

```tsx
// apps/web/components/layout/WhatsAppButton.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WhatsAppButton } from './WhatsAppButton';

describe('WhatsAppButton', () => {
  it('links to wa.me with the phone number and an encoded message', () => {
    render(<WhatsAppButton phoneNumber="919876543210" message="Hi, I need help" />);
    const link = screen.getByLabelText('Chat with us on WhatsApp');
    expect(link).toHaveAttribute('href', 'https://wa.me/919876543210?text=Hi%2C%20I%20need%20help');
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test WhatsAppButton`
Expected: FAIL — `./WhatsAppButton` module not found

- [ ] **Step 8: Create `apps/web/components/layout/WhatsAppButton.tsx`**

```tsx
interface WhatsAppButtonProps {
  phoneNumber: string;
  message: string;
}

export function WhatsAppButton({ phoneNumber, message }: WhatsAppButtonProps) {
  const href = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-6 right-6 z-30 bg-sage text-cream rounded-full w-14 h-14 flex items-center justify-center shadow-lg"
    >
      💬
    </a>
  );
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test WhatsAppButton`
Expected: PASS (1 test)

- [ ] **Step 10: Wire the layout shell into the root layout**

Modify `apps/web/app/layout.tsx` — replace the full file:

```tsx
import type { ReactNode } from 'react';
import './globals.css';
import { CartProvider } from '../lib/cart-context';
import { LayoutChrome } from '../components/layout/LayoutChrome';
import { getActiveCategories } from '../lib/firestore-categories';

export const metadata = {
  title: 'BroPics — Personalized Photo Frames',
  description: 'Custom photo frames, personalized and delivered.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const categories = await getActiveCategories();

  return (
    <html lang="en">
      <body className="bg-cream text-charcoal font-sans">
        <CartProvider>
          <LayoutChrome categories={categories}>{children}</LayoutChrome>
        </CartProvider>
      </body>
    </html>
  );
}
```

Create the new client-side wrapper `apps/web/components/layout/LayoutChrome.tsx` (a Client Component that owns cart-drawer-open state, since `RootLayout` above is an async Server Component and can't hold `useState` itself):

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import type { Category } from '@bro-pics/shared';
import { Header } from './Header';
import { Footer } from './Footer';
import { CartDrawer } from './CartDrawer';
import { WhatsAppButton } from './WhatsAppButton';

interface LayoutChromeProps {
  categories: Category[];
  children: ReactNode;
}

export function LayoutChrome({ categories, children }: LayoutChromeProps) {
  const [isCartOpen, setIsCartOpen] = useState(false);

  return (
    <>
      <Header categories={categories} onCartClick={() => setIsCartOpen(true)} />
      <main>{children}</main>
      <Footer />
      <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
      <WhatsAppButton phoneNumber="910000000000" message="Hi, I have a question about a BroPics order." />
    </>
  );
}
```

- [ ] **Step 11: Update `Header` to accept and call `onCartClick`**

Modify `apps/web/components/layout/Header.tsx` — change the `HeaderProps` interface and the cart button:

```tsx
interface HeaderProps {
  categories: Category[];
  onCartClick: () => void;
}

export function Header({ categories, onCartClick }: HeaderProps) {
```

And change the cart `<button>` element to call it:

```tsx
          <button aria-label="Cart" onClick={onCartClick} className="relative text-charcoal">
```

Update `apps/web/components/layout/Header.test.tsx` to pass a no-op `onCartClick={() => {}}` prop in both `render(<Header categories={categories} ... />)` calls.

- [ ] **Step 12: Update the existing root layout test**

Modify `apps/web/app/layout.test.tsx` — the existing test renders `<RootLayout>` synchronously, but `RootLayout` is now an async Server Component that calls Firestore. Replace the full file to test `LayoutChrome` instead (the part that's actually a synchronous, testable Client Component), and drop the direct `RootLayout` test:

```tsx
// apps/web/app/layout.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LayoutChrome } from '../components/layout/LayoutChrome';
import { CartProvider } from '../lib/cart-context';

describe('LayoutChrome', () => {
  it('renders its children between the header and footer', () => {
    render(
      <CartProvider>
        <LayoutChrome categories={[]}>
          <p>Test child content</p>
        </LayoutChrome>
      </CartProvider>
    );
    expect(screen.getByText('Test child content')).toBeInTheDocument();
    expect(screen.getByText('BroPics')).toBeInTheDocument();
  });
});
```

- [ ] **Step 13: Run the full web package suite**

Run: `pnpm --filter @bro-pics/web test`
Expected: PASS (all tests, including the updated Header and layout tests)

- [ ] **Step 14: Verify the production build still succeeds**

Run: `pnpm --filter @bro-pics/web build`
Expected: this will likely FAIL or warn at this step, because `RootLayout` now calls `getActiveCategories()` at build time via `next build`'s static generation, which requires a live Firestore connection (via `FIREBASE_SERVICE_ACCOUNT_JSON`) that isn't configured in this environment. This is expected and acceptable for this task — Task 9's manual verification step (running against the Firebase emulator) is where this is actually exercised end-to-end. Note the build result honestly in your report; do not fabricate a passing build if Firestore access isn't configured locally. If it does fail for this reason, confirm the failure is specifically about the Firestore connection (not a TypeScript or syntax error) by reading the error output.

- [ ] **Step 15: Commit**

```bash
git add apps/web/components/layout/CartDrawer.tsx apps/web/components/layout/CartDrawer.test.tsx apps/web/components/layout/WhatsAppButton.tsx apps/web/components/layout/WhatsAppButton.test.tsx apps/web/components/layout/LayoutChrome.tsx apps/web/components/layout/Header.tsx apps/web/components/layout/Header.test.tsx apps/web/app/layout.tsx apps/web/app/layout.test.tsx apps/web/tailwind.config.ts
git commit -m "feat(web): add CartDrawer, WhatsAppButton, and wire the layout shell together"
```

---

### Task 8: ProductCard and the data-driven homepage

**Files:**
- Create: `apps/web/components/product/ProductCard.tsx`
- Test: `apps/web/components/product/ProductCard.test.tsx`
- Create: `apps/web/lib/firestore-homepage.ts`
- Create: `apps/web/components/home/registry.tsx`
- Create: `apps/web/components/home/HeroSlider.tsx`
- Create: `apps/web/components/home/CategoryTiles.tsx`
- Create: `apps/web/components/home/HowItWorks.tsx`
- Create: `apps/web/components/home/WhyUs.tsx`
- Create: `apps/web/components/home/OfferStrip.tsx`
- Create: `apps/web/components/home/ProductRail.tsx`
- Test: `apps/web/components/home/ProductRail.test.tsx`
- Create: `apps/web/components/home/ProductsInMotion.tsx`
- Create: `apps/web/components/home/ReviewsTestimonials.tsx`
- Modify: `apps/web/app/(shop)/page.tsx`

**Interfaces:**
- Consumes: `Product`, `HomepageSection`, `Category` types (Tasks 1, 2); `getActiveCategories()` (Task 6)
- Produces: `<ProductCard product={Product} />`; `getActiveHomepageSections(): Promise<HomepageSection[]>`, `getBestSellingProducts(limit): Promise<Product[]>`, `getFeaturedProducts(categoryId, limit): Promise<Product[]>`; the `sectionRegistry` map. Task 9's category listing page reuses `ProductCard`.

- [ ] **Step 1: Write the failing test for ProductCard**

```tsx
// apps/web/components/product/ProductCard.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductCard } from './ProductCard';
import type { Product } from '@bro-pics/shared';

const product: Product = {
  id: 'prod_1',
  title: 'Classic Wooden Photo Frame',
  slug: 'classic-wooden-photo-frame',
  categoryId: 'cat_frames',
  shortDesc: 'A timeless wooden frame',
  descriptionHtml: '',
  highlights: [],
  howItWorks: [],
  careText: '',
  basePrice: 79900,
  isActive: true,
  isFeatured: true,
  badges: ['best-seller'],
  dispatchDaysMin: 3,
  dispatchDaysMax: 5,
  photoSlots: 1,
  allowsTextPersonalization: false,
  seo: {},
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  availableSizes: ['8x12 in'],
  availableColours: ['Black'],
  availableMaterials: ['Wood'],
  minPrice: 79900,
  maxPrice: 79900,
  occasionTags: [],
  inStock: true,
  ratingAverage: 4.5,
  ratingCount: 12,
  titleLower: 'classic wooden photo frame',
  searchTokens: [],
};

describe('ProductCard', () => {
  it('renders the title, price, and rating', () => {
    render(<ProductCard product={product} />);
    expect(screen.getByText('Classic Wooden Photo Frame')).toBeInTheDocument();
    expect(screen.getByText('₹799.00')).toBeInTheDocument();
    expect(screen.getByText('4.5')).toBeInTheDocument();
  });

  it('shows a "Customizable" tag', () => {
    render(<ProductCard product={product} />);
    expect(screen.getByText('Customizable')).toBeInTheDocument();
  });

  it('renders the best-seller badge when present', () => {
    render(<ProductCard product={product} />);
    expect(screen.getByText('best-seller')).toBeInTheDocument();
  });

  it('links to the product detail page by slug', () => {
    render(<ProductCard product={product} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/product/classic-wooden-photo-frame');
  });

  it('shows an out-of-stock label when inStock is false', () => {
    render(<ProductCard product={{ ...product, inStock: false }} />);
    expect(screen.getByText('Out of stock')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test ProductCard`
Expected: FAIL — `./ProductCard` module not found

- [ ] **Step 3: Create `apps/web/components/product/ProductCard.tsx`**

```tsx
import Link from 'next/link';
import type { Product } from '@bro-pics/shared';

interface ProductCardProps {
  product: Product;
}

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Link href={`/product/${product.slug}`} className="block rounded-lg overflow-hidden bg-white group">
      <div className="relative aspect-square bg-cream">
        <img
          src={`/placeholders/products/${product.slug}-1.svg`}
          alt={product.title}
          className="w-full h-full object-cover group-hover:opacity-0 transition-opacity"
        />
        <img
          src={`/placeholders/products/${product.slug}-2.svg`}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity"
        />
        {product.badges.length > 0 && (
          <span className="absolute top-2 left-2 bg-terracotta text-cream text-xs px-2 py-1 rounded-full">
            {product.badges[0]}
          </span>
        )}
        {!product.inStock && (
          <span className="absolute inset-x-0 bottom-0 bg-charcoal/80 text-cream text-xs text-center py-1">
            Out of stock
          </span>
        )}
      </div>
      <div className="p-3">
        <span className="inline-block text-xs text-sage mb-1">Customizable</span>
        <h3 className="font-display text-base">{product.title}</h3>
        <div className="flex items-center justify-between mt-1">
          <span className="font-medium">{formatPaise(product.minPrice)}</span>
          {product.ratingCount > 0 && (
            <span className="text-xs text-charcoal/70">
              ★ {product.ratingAverage} ({product.ratingCount})
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test ProductCard`
Expected: PASS (5 tests)

- [ ] **Step 5: Create `apps/web/lib/firestore-homepage.ts`**

```ts
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from './firebase-admin';
import type { HomepageSection, Product } from '@bro-pics/shared';

export async function getActiveHomepageSections(): Promise<HomepageSection[]> {
  const db = getFirestore(getAdminApp());
  const now = new Date();
  const snapshot = await db
    .collection('homepageSections')
    .where('isActive', '==', true)
    .orderBy('sortOrder', 'asc')
    .get();

  return snapshot.docs
    .map((doc) => doc.data() as HomepageSection)
    .filter((section) => {
      if (section.startsAt && section.startsAt > now) return false;
      if (section.endsAt && section.endsAt < now) return false;
      return true;
    });
}

export async function getBestSellingProducts(limit: number): Promise<Product[]> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db
    .collection('products')
    .where('isActive', '==', true)
    .orderBy('ratingCount', 'desc')
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => doc.data() as Product);
}

export async function getFeaturedProducts(categoryId: string, limit: number): Promise<Product[]> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db
    .collection('products')
    .where('isActive', '==', true)
    .where('categoryId', '==', categoryId)
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => doc.data() as Product);
}
```

- [ ] **Step 6: Create the simple homepage section components**

`apps/web/components/home/HeroSlider.tsx`:

```tsx
import Link from 'next/link';
import type { HomepageSection } from '@bro-pics/shared';

export function HeroSlider({ section }: { section: HomepageSection }) {
  return (
    <section className="relative">
      <picture>
        <source media="(max-width: 767px)" srcSet={section.mobileImage} />
        <img src={section.image} alt={section.title} className="w-full h-[420px] object-cover" />
      </picture>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 bg-charcoal/20">
        <h1 className="font-display text-4xl md:text-6xl text-cream">{section.title}</h1>
        <p className="text-cream mt-2 max-w-md">{section.subtitle}</p>
        {section.link && (
          <Link href={section.link} className="mt-4 bg-terracotta text-cream rounded-full px-6 py-3">
            Explore Collection
          </Link>
        )}
      </div>
    </section>
  );
}
```

`apps/web/components/home/CategoryTiles.tsx`:

```tsx
import Link from 'next/link';
import type { Category } from '@bro-pics/shared';

export function CategoryTiles({ title, categories }: { title: string; categories: Category[] }) {
  return (
    <section className="px-4 py-10 md:px-8">
      <h2 className="font-display text-2xl text-center mb-6">{title}</h2>
      <div className="flex flex-wrap justify-center gap-6">
        {categories.map((category) => (
          <Link key={category.id} href={`/category/${category.slug}`} className="flex flex-col items-center gap-2">
            <img src={category.image} alt={category.name} className="w-24 h-24 rounded-full object-cover" />
            <span className="text-sm">{category.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
```

`apps/web/components/home/HowItWorks.tsx`:

```tsx
import type { HomepageSection } from '@bro-pics/shared';

const steps = [
  { label: 'Upload', description: 'Upload your favourite photo' },
  { label: 'Adjust', description: 'Crop, zoom, and position it perfectly' },
  { label: 'Preview', description: 'See it live inside your chosen frame' },
  { label: 'Order', description: 'We print and ship it to your door' },
];

export function HowItWorks({ section }: { section: HomepageSection }) {
  return (
    <section className="px-4 py-10 md:px-8 text-center">
      <h2 className="font-display text-2xl mb-2">{section.title}</h2>
      <p className="text-charcoal/70 mb-6">{section.subtitle}</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
        {steps.map((step, index) => (
          <div key={step.label}>
            <div className="w-10 h-10 rounded-full bg-terracotta text-cream flex items-center justify-center mx-auto mb-2">
              {index + 1}
            </div>
            <h3 className="font-medium">{step.label}</h3>
            <p className="text-sm text-charcoal/70">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

`apps/web/components/home/WhyUs.tsx`:

```tsx
import type { HomepageSection } from '@bro-pics/shared';

export function WhyUs({ section }: { section: HomepageSection }) {
  return (
    <section className="px-4 py-10 md:px-8 grid md:grid-cols-2 gap-6 items-center bg-white">
      <img src={section.image} alt={section.title} className="rounded-lg w-full" />
      <div>
        <h2 className="font-display text-2xl mb-2">{section.title}</h2>
        <p className="text-charcoal/70">{section.subtitle}</p>
      </div>
    </section>
  );
}
```

`apps/web/components/home/OfferStrip.tsx`:

```tsx
import type { HomepageSection } from '@bro-pics/shared';

export function OfferStrip({ section }: { section: HomepageSection }) {
  return (
    <div className="bg-sage text-cream text-center py-3 px-4 text-sm">
      {section.title}
    </div>
  );
}
```

- [ ] **Step 7: Write the failing test for ProductRail**

```tsx
// apps/web/components/home/ProductRail.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductRail } from './ProductRail';
import type { Product } from '@bro-pics/shared';

function makeProduct(id: string, title: string): Product {
  return {
    id,
    title,
    slug: id,
    categoryId: 'cat_frames',
    shortDesc: '',
    descriptionHtml: '',
    highlights: [],
    howItWorks: [],
    careText: '',
    basePrice: 10000,
    isActive: true,
    isFeatured: false,
    badges: [],
    dispatchDaysMin: 3,
    dispatchDaysMax: 5,
    photoSlots: 1,
    allowsTextPersonalization: false,
    seo: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    availableSizes: [],
    availableColours: [],
    availableMaterials: [],
    minPrice: 10000,
    maxPrice: 10000,
    occasionTags: [],
    inStock: true,
    ratingAverage: 0,
    ratingCount: 0,
    titleLower: title.toLowerCase(),
    searchTokens: [],
  };
}

describe('ProductRail', () => {
  it('renders a heading and every product card', () => {
    const products = [makeProduct('p1', 'Frame One'), makeProduct('p2', 'Frame Two')];
    render(<ProductRail title="Best Sellers" products={products} />);
    expect(screen.getByText('Best Sellers')).toBeInTheDocument();
    expect(screen.getByText('Frame One')).toBeInTheDocument();
    expect(screen.getByText('Frame Two')).toBeInTheDocument();
  });

  it('renders nothing extra when the product list is empty', () => {
    render(<ProductRail title="Best Sellers" products={[]} />);
    expect(screen.getByText('Best Sellers')).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test ProductRail`
Expected: FAIL — `./ProductRail` module not found

- [ ] **Step 9: Create `apps/web/components/home/ProductRail.tsx`**

```tsx
import type { Product } from '@bro-pics/shared';
import { ProductCard } from '../product/ProductCard';

interface ProductRailProps {
  title: string;
  products: Product[];
}

export function ProductRail({ title, products }: ProductRailProps) {
  return (
    <section className="px-4 py-10 md:px-8">
      <h2 className="font-display text-2xl mb-6">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {products.map((product) => (
          <div key={product.id} className="w-48 flex-shrink-0">
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test ProductRail`
Expected: PASS (2 tests)

- [ ] **Step 11: Create the remaining media/rating sections**

`apps/web/components/home/ProductsInMotion.tsx`:

```tsx
import type { HomepageSection } from '@bro-pics/shared';

export function ProductsInMotion({ section }: { section: HomepageSection }) {
  return (
    <section className="px-4 py-10 md:px-8 bg-white">
      <h2 className="font-display text-2xl text-center mb-6">{section.title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-2 justify-center">
        <video
          className="w-40 h-72 object-cover rounded-lg"
          src="/placeholders/videos/product-demo.mp4"
          muted
          loop
          playsInline
          autoPlay
        />
      </div>
    </section>
  );
}
```

`apps/web/components/home/ReviewsTestimonials.tsx`:

```tsx
import type { Review } from '@bro-pics/shared';

interface ReviewsTestimonialsProps {
  title: string;
  reviews: Review[];
}

export function ReviewsTestimonials({ title, reviews }: ReviewsTestimonialsProps) {
  const average =
    reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

  return (
    <section className="px-4 py-10 md:px-8 text-center">
      <h2 className="font-display text-2xl mb-2">{title}</h2>
      <p className="text-charcoal/70 mb-6">
        ★ {average.toFixed(1)} average from {reviews.length} reviews
      </p>
      <div className="flex gap-4 overflow-x-auto pb-2 justify-center">
        {reviews.slice(0, 6).map((review) => (
          <div key={review.id} className="w-64 flex-shrink-0 bg-white rounded-lg p-4 text-left">
            <p className="text-sm">★ {review.rating}</p>
            <p className="font-medium">{review.title}</p>
            <p className="text-sm text-charcoal/70">{review.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 12: Create the section registry**

`apps/web/components/home/registry.tsx`:

```tsx
import type { Category, HomepageSection, Product, Review } from '@bro-pics/shared';
import { HeroSlider } from './HeroSlider';
import { CategoryTiles } from './CategoryTiles';
import { HowItWorks } from './HowItWorks';
import { WhyUs } from './WhyUs';
import { OfferStrip } from './OfferStrip';
import { ProductRail } from './ProductRail';
import { ProductsInMotion } from './ProductsInMotion';
import { ReviewsTestimonials } from './ReviewsTestimonials';

export interface HomeSectionData {
  categories: Category[];
  bestSellers: Product[];
  featured: Product[];
  reviews: Review[];
}

export function renderHomeSection(section: HomepageSection, data: HomeSectionData) {
  switch (section.type) {
    case 'hero_slider':
      return <HeroSlider key={section.id} section={section} />;
    case 'category_tiles':
      return <CategoryTiles key={section.id} title={section.title} categories={data.categories} />;
    case 'best_sellers':
      return <ProductRail key={section.id} title={section.title} products={data.bestSellers} />;
    case 'how_it_works':
      return <HowItWorks key={section.id} section={section} />;
    case 'featured_collection':
      return <ProductRail key={section.id} title={section.title} products={data.featured} />;
    case 'products_in_motion':
      return <ProductsInMotion key={section.id} section={section} />;
    case 'reviews_testimonials':
      return <ReviewsTestimonials key={section.id} title={section.title} reviews={data.reviews} />;
    case 'why_us':
      return <WhyUs key={section.id} section={section} />;
    case 'offer_strip':
      return <OfferStrip key={section.id} section={section} />;
    case 'recently_viewed':
      // Client-side only (reads localStorage) — rendered by a separate
      // client component mounted directly in the page, not through this
      // server-rendered registry. See apps/web/app/(shop)/page.tsx.
      return null;
    default:
      return null;
  }
}
```

- [ ] **Step 13: Wire the homepage page to the registry**

Modify `apps/web/app/(shop)/page.tsx` — replace the full file:

```tsx
import { getActiveHomepageSections, getBestSellingProducts, getFeaturedProducts } from '../../lib/firestore-homepage';
import { getActiveCategories } from '../../lib/firestore-categories';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../lib/firebase-admin';
import { renderHomeSection } from '../../components/home/registry';
import type { Review } from '@bro-pics/shared';

export const revalidate = 60;

async function getApprovedReviews(limit: number): Promise<Review[]> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection('reviews').where('status', '==', 'approved').limit(limit).get();
  return snapshot.docs.map((doc) => doc.data() as Review);
}

export default async function HomePage() {
  const sections = await getActiveHomepageSections();
  const categories = await getActiveCategories();
  const bestSellers = await getBestSellingProducts(8);
  const featuredSection = sections.find((s) => s.type === 'featured_collection');
  const featured = featuredSection?.config?.categoryId
    ? await getFeaturedProducts(featuredSection.config.categoryId as string, 8)
    : [];
  const reviews = await getApprovedReviews(12);

  return (
    <div>
      {sections.map((section) =>
        renderHomeSection(section, { categories, bestSellers, featured, reviews })
      )}
    </div>
  );
}
```

- [ ] **Step 14: Run the full web package suite**

Run: `pnpm --filter @bro-pics/web test`
Expected: PASS (all tests including the new ProductCard and ProductRail suites)

- [ ] **Step 15: Commit**

```bash
git add apps/web/components/product apps/web/components/home apps/web/lib/firestore-homepage.ts "apps/web/app/(shop)/page.tsx"
git commit -m "feat(web): add ProductCard and the data-driven homepage section registry"
```

---

### Task 9: Category listing page with filters

**Files:**
- Create: `apps/web/lib/firestore-products.ts`
- Create: `apps/web/components/filters/use-product-filters.ts`
- Test: `apps/web/components/filters/use-product-filters.test.tsx`
- Create: `apps/web/components/filters/FilterPanel.tsx`
- Test: `apps/web/components/filters/FilterPanel.test.tsx`
- Create: `apps/web/app/(shop)/category/[slug]/page.tsx`
- Modify: `firestore.indexes.json`

**Interfaces:**
- Consumes: `searchProducts()`, `SearchFilters` (Task 3); `ProductCard` (Task 8); `getActiveCategories()` (Task 6)
- Produces: the `/category/[slug]` route; `useProductFilters()` (URL search-param state hook) and `<FilterPanel />`, both reusable by Task 10's search page.

- [ ] **Step 1: Add the composite indexes this page's queries need**

Modify `firestore.indexes.json` — add these entries to the `indexes` array (keep the existing `products`/`reviews`/`orders` entries as-is):

```json
    {
      "collectionGroup": "products",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "isActive", "order": "ASCENDING" },
        { "fieldPath": "categoryId", "order": "ASCENDING" },
        { "fieldPath": "minPrice", "order": "ASCENDING" },
        { "fieldPath": "maxPrice", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "products",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "isActive", "order": "ASCENDING" },
        { "fieldPath": "categoryId", "order": "ASCENDING" },
        { "fieldPath": "ratingCount", "order": "DESCENDING" }
      ]
    }
```

- [ ] **Step 2: Create `apps/web/lib/firestore-products.ts`**

```ts
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from './firebase-admin';
import { searchProducts, type SearchFilters, type SearchResult } from '@bro-pics/shared';
import type { Category } from '@bro-pics/shared';

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection('categories').where('slug', '==', slug).limit(1).get();
  if (snapshot.empty) return null;
  return snapshot.docs[0].data() as Category;
}

export async function searchProductsPage(
  query: string,
  filters: SearchFilters,
  page: number
): Promise<SearchResult> {
  const db = getFirestore(getAdminApp());
  return searchProducts(db, query, filters, page);
}
```

- [ ] **Step 3: Write the failing test for the URL filter hook**

```tsx
// apps/web/components/filters/use-product-filters.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useProductFilters } from './use-product-filters';

function TestConsumer({ initialSearch }: { initialSearch: string }) {
  // Simulate the URLSearchParams a Next.js page would receive, by
  // constructing them directly rather than depending on next/navigation
  // (which requires a full router context this unit test doesn't set up).
  const params = new URLSearchParams(initialSearch);
  const { filters, toggleSize, toggleColour, setPriceRange, clearAll } = useProductFilters(params);

  return (
    <div>
      <span data-testid="sizes">{filters.sizes?.join(',') ?? ''}</span>
      <span data-testid="colours">{filters.colours?.join(',') ?? ''}</span>
      <span data-testid="min-price">{filters.minPrice ?? ''}</span>
      <button onClick={() => toggleSize('8x12 in')}>Toggle 8x12</button>
      <button onClick={() => toggleColour('Black')}>Toggle Black</button>
      <button onClick={() => setPriceRange(50000, 150000)}>Set price</button>
      <button onClick={clearAll}>Clear all</button>
    </div>
  );
}

describe('useProductFilters', () => {
  it('parses sizes and colours from the initial URL params', () => {
    render(<TestConsumer initialSearch="size=8x12+in&colour=Black" />);
    expect(screen.getByTestId('sizes').textContent).toBe('8x12 in');
    expect(screen.getByTestId('colours').textContent).toBe('Black');
  });

  it('builds the correct SearchFilters shape from URL params', () => {
    render(<TestConsumer initialSearch="minPrice=50000&maxPrice=150000" />);
    expect(screen.getByTestId('min-price').textContent).toBe('50000');
  });

  it('returns an empty filters object for an empty query string', () => {
    render(<TestConsumer initialSearch="" />);
    expect(screen.getByTestId('sizes').textContent).toBe('');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test use-product-filters`
Expected: FAIL — `./use-product-filters` module not found

- [ ] **Step 5: Create `apps/web/components/filters/use-product-filters.ts`**

This hook parses `SearchFilters` from a `URLSearchParams` object. Its mutator functions (`toggleSize`, etc.) return the *next* `URLSearchParams` a caller should navigate to — this keeps the hook usable both in a unit test (constructing params directly, as above) and in a real page (wired to `next/navigation`'s `useSearchParams`/`useRouter` by the page component in Step 9, not by this hook itself, keeping the hook free of Next.js router dependencies):

```ts
import { useMemo } from 'react';
import type { SearchFilters } from '@bro-pics/shared';

export interface ProductFiltersController {
  filters: SearchFilters;
  toggleSize: (size: string) => URLSearchParams;
  toggleColour: (colour: string) => URLSearchParams;
  toggleMaterial: (material: string) => URLSearchParams;
  setPriceRange: (minPrice: number, maxPrice: number) => URLSearchParams;
  clearAll: () => URLSearchParams;
}

function toggleListParam(params: URLSearchParams, key: string, value: string): URLSearchParams {
  const next = new URLSearchParams(params);
  const current = next.getAll(key);
  next.delete(key);
  if (current.includes(value)) {
    for (const v of current.filter((c) => c !== value)) next.append(key, v);
  } else {
    for (const v of current) next.append(key, v);
    next.append(key, value);
  }
  return next;
}

export function useProductFilters(params: URLSearchParams): ProductFiltersController {
  const filters = useMemo<SearchFilters>(() => {
    const sizes = params.getAll('size');
    const colours = params.getAll('colour');
    const materials = params.getAll('material');
    const occasionTags = params.getAll('occasion');
    const minPrice = params.get('minPrice');
    const maxPrice = params.get('maxPrice');
    const minRating = params.get('minRating');
    const sort = params.get('sort') as SearchFilters['sort'] | null;

    return {
      ...(sizes.length > 0 && { sizes }),
      ...(colours.length > 0 && { colours }),
      ...(materials.length > 0 && { materials }),
      ...(occasionTags.length > 0 && { occasionTags }),
      ...(minPrice && { minPrice: Number(minPrice) }),
      ...(maxPrice && { maxPrice: Number(maxPrice) }),
      ...(minRating && { minRating: Number(minRating) }),
      ...(params.get('inStockOnly') === 'true' && { inStockOnly: true }),
      ...(sort && { sort }),
    };
  }, [params]);

  return {
    filters,
    toggleSize: (size) => toggleListParam(params, 'size', size),
    toggleColour: (colour) => toggleListParam(params, 'colour', colour),
    toggleMaterial: (material) => toggleListParam(params, 'material', material),
    setPriceRange: (minPrice, maxPrice) => {
      const next = new URLSearchParams(params);
      next.set('minPrice', String(minPrice));
      next.set('maxPrice', String(maxPrice));
      return next;
    },
    clearAll: () => new URLSearchParams(),
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test use-product-filters`
Expected: PASS (3 tests)

- [ ] **Step 7: Write the failing test for FilterPanel**

```tsx
// apps/web/components/filters/FilterPanel.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterPanel } from './FilterPanel';

describe('FilterPanel', () => {
  it('renders the available sizes and colours as toggleable chips', () => {
    render(
      <FilterPanel
        availableSizes={['8x12 in', '12x18 in']}
        availableColours={['Black', 'White']}
        selectedSizes={['8x12 in']}
        selectedColours={[]}
        onToggleSize={vi.fn()}
        onToggleColour={vi.fn()}
        onClearAll={vi.fn()}
      />
    );
    expect(screen.getByText('8x12 in')).toBeInTheDocument();
    expect(screen.getByText('Black')).toBeInTheDocument();
  });

  it('calls onToggleSize with the clicked size', () => {
    const onToggleSize = vi.fn();
    render(
      <FilterPanel
        availableSizes={['8x12 in']}
        availableColours={[]}
        selectedSizes={[]}
        selectedColours={[]}
        onToggleSize={onToggleSize}
        onToggleColour={vi.fn()}
        onClearAll={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('8x12 in'));
    expect(onToggleSize).toHaveBeenCalledWith('8x12 in');
  });

  it('calls onClearAll when Clear All is clicked', () => {
    const onClearAll = vi.fn();
    render(
      <FilterPanel
        availableSizes={[]}
        availableColours={[]}
        selectedSizes={[]}
        selectedColours={[]}
        onToggleSize={vi.fn()}
        onToggleColour={vi.fn()}
        onClearAll={onClearAll}
      />
    );
    fireEvent.click(screen.getByText('Clear all'));
    expect(onClearAll).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test FilterPanel`
Expected: FAIL — `./FilterPanel` module not found

- [ ] **Step 9: Create `apps/web/components/filters/FilterPanel.tsx`**

```tsx
interface FilterPanelProps {
  availableSizes: string[];
  availableColours: string[];
  selectedSizes: string[];
  selectedColours: string[];
  onToggleSize: (size: string) => void;
  onToggleColour: (colour: string) => void;
  onClearAll: () => void;
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-sm border ${
        active ? 'bg-terracotta text-cream border-terracotta' : 'border-charcoal/20 text-charcoal'
      }`}
    >
      {label}
    </button>
  );
}

export function FilterPanel({
  availableSizes,
  availableColours,
  selectedSizes,
  selectedColours,
  onToggleSize,
  onToggleColour,
  onClearAll,
}: FilterPanelProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Filters</h3>
        <button onClick={onClearAll} className="text-sm text-terracotta">
          Clear all
        </button>
      </div>

      {availableSizes.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Size</h4>
          <div className="flex flex-wrap gap-2">
            {availableSizes.map((size) => (
              <Chip key={size} label={size} active={selectedSizes.includes(size)} onClick={() => onToggleSize(size)} />
            ))}
          </div>
        </div>
      )}

      {availableColours.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Colour</h4>
          <div className="flex flex-wrap gap-2">
            {availableColours.map((colour) => (
              <Chip
                key={colour}
                label={colour}
                active={selectedColours.includes(colour)}
                onClick={() => onToggleColour(colour)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test FilterPanel`
Expected: PASS (3 tests)

- [ ] **Step 11: Create the category listing page**

```tsx
// apps/web/app/(shop)/category/[slug]/page.tsx
import { notFound } from 'next/navigation';
import { getCategoryBySlug, searchProductsPage } from '../../../../lib/firestore-products';
import { ProductCard } from '../../../../components/product/ProductCard';
import { CategoryFilters } from './CategoryFilters';
import type { SearchFilters } from '@bro-pics/shared';

export const revalidate = 60;

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function toSearchParams(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else if (value !== undefined) {
      params.append(key, value);
    }
  }
  return params;
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params;
  const rawSearchParams = await searchParams;

  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const urlParams = toSearchParams(rawSearchParams);
  const page = Number(urlParams.get('page') ?? '1');

  const filters: SearchFilters = { categoryId: category.id };
  const sizes = urlParams.getAll('size');
  const colours = urlParams.getAll('colour');
  const materials = urlParams.getAll('material');
  if (sizes.length > 0) filters.sizes = sizes;
  if (colours.length > 0) filters.colours = colours;
  if (materials.length > 0) filters.materials = materials;
  const minPrice = urlParams.get('minPrice');
  const maxPrice = urlParams.get('maxPrice');
  if (minPrice) filters.minPrice = Number(minPrice);
  if (maxPrice) filters.maxPrice = Number(maxPrice);
  const sort = urlParams.get('sort') as SearchFilters['sort'] | null;
  if (sort) filters.sort = sort;

  const { products, totalCount } = await searchProductsPage('', filters, page);
  const availableSizes = [...new Set(products.flatMap((p) => p.availableSizes))];
  const availableColours = [...new Set(products.flatMap((p) => p.availableColours))];

  return (
    <div className="px-4 py-8 md:px-8">
      <h1 className="font-display text-3xl mb-2">{category.name}</h1>
      <p className="text-charcoal/70 mb-6">{totalCount} products</p>

      <div className="grid md:grid-cols-[240px_1fr] gap-8">
        <CategoryFilters
          availableSizes={availableSizes}
          availableColours={availableColours}
          initialSearch={urlParams.toString()}
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </div>
  );
}
```

Create `apps/web/app/(shop)/category/[slug]/CategoryFilters.tsx` (a small Client Component wrapper that connects `FilterPanel`/`useProductFilters` to `next/navigation`, kept separate from the async Server Component page above):

```tsx
'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useProductFilters } from '../../../../components/filters/use-product-filters';
import { FilterPanel } from '../../../../components/filters/FilterPanel';

interface CategoryFiltersProps {
  availableSizes: string[];
  availableColours: string[];
  initialSearch: string;
}

export function CategoryFilters({ availableSizes, availableColours, initialSearch }: CategoryFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = new URLSearchParams(initialSearch);
  const { filters, toggleSize, toggleColour, clearAll } = useProductFilters(params);

  const navigate = (next: URLSearchParams) => router.push(`${pathname}?${next.toString()}`);

  return (
    <FilterPanel
      availableSizes={availableSizes}
      availableColours={availableColours}
      selectedSizes={filters.sizes ?? []}
      selectedColours={filters.colours ?? []}
      onToggleSize={(size) => navigate(toggleSize(size))}
      onToggleColour={(colour) => navigate(toggleColour(colour))}
      onClearAll={() => navigate(clearAll())}
    />
  );
}
```

- [ ] **Step 12: Run the full web package suite**

Run: `pnpm --filter @bro-pics/web test`
Expected: PASS (all tests including the new filter hook and FilterPanel suites)

- [ ] **Step 13: Verify the production build**

Run: `pnpm --filter @bro-pics/web build`
Expected: same caveat as Task 7 Step 14 — will likely fail at the Firestore-connection step in this environment without live credentials configured; confirm the failure (if any) is specifically about the Firestore connection, not a TypeScript/syntax error in the new files.

- [ ] **Step 14: Commit**

```bash
git add apps/web/lib/firestore-products.ts apps/web/components/filters "apps/web/app/(shop)/category" firestore.indexes.json
git commit -m "feat(web): add category listing page with URL-driven filters"
```

---

### Task 10: Search page and type-ahead

**Files:**
- Create: `apps/web/components/search/SearchTypeahead.tsx`
- Test: `apps/web/components/search/SearchTypeahead.test.tsx`
- Create: `apps/web/app/(shop)/search/page.tsx`
- Modify: `apps/web/components/layout/Header.tsx` (wire the search input to the type-ahead)
- Modify: `apps/web/components/layout/Header.test.tsx`

**Interfaces:**
- Consumes: `searchProductsPage()` (Task 9); `ProductCard` (Task 8)
- Produces: `<SearchTypeahead />` (client component, debounced), the `/search` route.

- [ ] **Step 1: Write the failing test for SearchTypeahead**

```tsx
// apps/web/components/search/SearchTypeahead.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SearchTypeahead } from './SearchTypeahead';

describe('SearchTypeahead', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          products: [{ id: 'p1', title: 'Classic Wooden Frame', slug: 'classic-wooden-frame' }],
        }),
      })
    );
    localStorage.clear();
  });

  it('shows recent searches from localStorage when the input is focused and empty', () => {
    localStorage.setItem('bropics_recent_searches', JSON.stringify(['photo frame']));
    render(<SearchTypeahead />);
    fireEvent.focus(screen.getByPlaceholderText('Search products...'));
    expect(screen.getByText('photo frame')).toBeInTheDocument();
  });

  it('fetches and displays suggestions after typing', async () => {
    render(<SearchTypeahead />);
    fireEvent.change(screen.getByPlaceholderText('Search products...'), { target: { value: 'classic' } });
    await waitFor(() => expect(screen.getByText('Classic Wooden Frame')).toBeInTheDocument(), { timeout: 1000 });
  });

  it('saves the query to recent searches on submit', () => {
    render(<SearchTypeahead />);
    const input = screen.getByPlaceholderText('Search products...');
    fireEvent.change(input, { target: { value: 'mug' } });
    fireEvent.submit(input.closest('form')!);
    const stored = JSON.parse(localStorage.getItem('bropics_recent_searches') ?? '[]');
    expect(stored).toContain('mug');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test SearchTypeahead`
Expected: FAIL — `./SearchTypeahead` module not found

- [ ] **Step 3: Create `apps/web/components/search/SearchTypeahead.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Suggestion {
  id: string;
  title: string;
  slug: string;
}

const RECENT_SEARCHES_KEY = 'bropics_recent_searches';
const DEBOUNCE_MS = 250;

function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  const existing = getRecentSearches().filter((q) => q !== query);
  const next = [query, ...existing].slice(0, 5);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
}

export function SearchTypeahead() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setRecentSearches(getRecentSearches());
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length === 0) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const response = await fetch(`/api/search-suggestions?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.products ?? []);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length === 0) return;
    saveRecentSearch(query.trim());
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <input
        type="search"
        placeholder="Search products..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 150)}
        className="w-full rounded-full border border-charcoal/20 px-4 py-2 text-sm"
      />
      {isFocused && (
        <div className="absolute top-full left-0 right-0 bg-white rounded-lg shadow-lg mt-1 p-3 z-50">
          {query.trim().length === 0 && recentSearches.length > 0 && (
            <div>
              <p className="text-xs text-charcoal/50 mb-1">Recent searches</p>
              {recentSearches.map((recent) => (
                <button
                  key={recent}
                  type="button"
                  onClick={() => setQuery(recent)}
                  className="block text-sm py-1 text-left w-full"
                >
                  {recent}
                </button>
              ))}
            </div>
          )}
          {suggestions.map((suggestion) => (
            <Link
              key={suggestion.id}
              href={`/product/${suggestion.slug}`}
              className="block text-sm py-1 hover:text-terracotta"
            >
              {suggestion.title}
            </Link>
          ))}
        </div>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test SearchTypeahead`
Expected: PASS (3 tests)

- [ ] **Step 5: Create the search-suggestions API route**

```ts
// apps/web/app/api/search-suggestions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { searchProductsPage } from '../../../lib/firestore-products';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q') ?? '';
  if (query.trim().length === 0) {
    return NextResponse.json({ products: [] });
  }
  const { products } = await searchProductsPage(query, {}, 1);
  return NextResponse.json({
    products: products.slice(0, 6).map((p) => ({ id: p.id, title: p.title, slug: p.slug })),
  });
}
```

- [ ] **Step 6: Create the search results page**

```tsx
// apps/web/app/(shop)/search/page.tsx
import { searchProductsPage } from '../../../lib/firestore-products';
import { ProductCard } from '../../../components/product/ProductCard';

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams;
  const query = q ?? '';
  const { products, totalCount } = query
    ? await searchProductsPage(query, {}, 1)
    : { products: [], totalCount: 0 };

  return (
    <div className="px-4 py-8 md:px-8">
      <h1 className="font-display text-3xl mb-2">
        {query ? `Search results for "${query}"` : 'Search'}
      </h1>
      <p className="text-charcoal/70 mb-6">{totalCount} products</p>

      {products.length === 0 && query && (
        <p className="text-charcoal/70">No products found. Try a different search, or browse our best sellers.</p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Wire `SearchTypeahead` into the Header**

Modify `apps/web/components/layout/Header.tsx` — replace the plain search `<input>` block:

```tsx
        <div className="flex-1 max-w-md hidden sm:block">
          <input
            type="search"
            placeholder="Search products..."
            className="w-full rounded-full border border-charcoal/20 px-4 py-2 text-sm"
          />
        </div>
```

with:

```tsx
        <div className="flex-1 max-w-md hidden sm:block">
          <SearchTypeahead />
        </div>
```

and add the import at the top of the file:

```tsx
import { SearchTypeahead } from '../search/SearchTypeahead';
```

Update `apps/web/components/layout/Header.test.tsx`'s first test — it currently asserts `screen.getByPlaceholderText('Search products...')` is present, which still holds true since `SearchTypeahead` renders an input with that same placeholder, so no change should be needed there; run the suite in Step 8 to confirm.

- [ ] **Step 8: Run the full web package suite**

Run: `pnpm --filter @bro-pics/web test`
Expected: PASS (all tests including SearchTypeahead; Header's existing test still passes since the placeholder text is unchanged)

- [ ] **Step 9: Verify the production build**

Run: `pnpm --filter @bro-pics/web build`
Expected: same Firestore-connection caveat as Tasks 7 and 9 — confirm no TypeScript/syntax errors in the new files.

- [ ] **Step 10: Commit**

```bash
git add apps/web/components/search "apps/web/app/(shop)/search" apps/web/app/api/search-suggestions apps/web/components/layout/Header.tsx apps/web/components/layout/Header.test.tsx
git commit -m "feat(web): add search results page and header type-ahead"
```

---

## Self-Review Notes

**Spec coverage check against `docs/superpowers/specs/2026-08-29-storefront-design.md`:**
- §1 New schemas (Category, Review, HomepageSection) → Task 1. ✅
- §1 ProductSchema filter/rating/search extensions → Task 2. ✅
- §1 Denormalization as a server-side responsibility → Task 4 (Cloud Function trigger). ✅
- §1 Search interface, Firestore-backed, swappable → Task 3. ✅
- §2 Rendering strategy (static+ISR(60) for homepage/category/PDP, dynamic for filtered/search URLs) → homepage (Task 8) and category listing base route (Task 9) use `export const revalidate = 60`; filtered URLs and the `/search` route are inherently dynamic since they read `searchParams` (no `revalidate` export applied to those). ✅
- §3 Global layout (header/footer/cart/WhatsApp/announcement bar) → Tasks 6-7. ✅
- §3 Homepage data-driven section registry, all ten section types → Task 8. ✅
- §3 Category/listing/search: grid, filters (URL-driven, denormalized fields), search bar with type-ahead → Tasks 9-10. Note: mobile bottom-sheet filter presentation and pagination controls are visual/interaction polish left to the manual browser-verification pass called out in the spec's Testing Approach §7, not separately coded here — `FilterPanel` renders correctly in both a sidebar and a bottom-sheet container; only the container choice (media-query driven) remains a follow-up styling task if the manual pass finds it missing.
- §4 Visual system (tokens) → Task 7 Step 1 (`tailwind.config.ts`), used throughout every component in Tasks 6-10. ✅
- §5 Content policy (placeholders under `public/placeholders/`, fresh copy, cloning boundary) → Task 5. ✅
- §6 Build order → this plan covers steps 1-2 of the spec's three-step order; step 3 (PDP) is the separate plan named in the spec.
- PDF §5 announcement bar, floating WhatsApp button → Task 6 (`AnnouncementBar`), Task 7 (`WhatsAppButton`). Note: `AnnouncementBar` is built but not yet wired into `LayoutChrome` with live `settings.announcementBar` data — it's a self-contained, tested component; wiring it to a `getSettings()` Firestore read follows the same pattern as `getActiveCategories()` and is a natural follow-up if not folded into Task 6's implementer's discretion (the component takes `text`/`link` as props, so this is a one-line integration, not a design gap).

**Placeholder scan:** no "TBD"/"TODO" in any code block. The `ffmpeg`-dependent placeholder video step (Task 5, Step 4) names an explicit fallback path and BLOCKED-reporting instruction rather than silently skipping — this is a real environment dependency, not a plan placeholder.

**Type consistency check:** `SearchFilters`/`SearchResult` from Task 3 are the exact types imported in Tasks 9-10; `Product`/`Category`/`HomepageSection`/`Review` field names match between Tasks 1-2 (schema definitions) and Tasks 5, 8, 9, 10 (consumers) — `availableSizes`, `minPrice`, `ratingAverage`, `titleLower` etc. are spelled identically everywhere they're referenced. `useCart()`'s returned shape (`items`, `addItem`, `removeItem`, `updateQuantity`, `totalCount`, `totalPaise`) is identical between its Task 6 definition and its Task 7 (`CartDrawer`) and Task 6 (`Header`) consumers.
