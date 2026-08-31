# Storefront Product Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Product Detail Page (`/product/[slug]`) — gallery with variant-aware image/video media, a buy box with client-side variant selection, tabbed product info, a video rail, reviews with a rating breakdown, and related products — completing the Storefront phase (Phase 2).

**Architecture:** A new `ProductMediaSchema` (`products/{id}/media/{id}`) replaces `ProductCard`'s slug-guessed image paths with real data, kept in sync on the product doc via a new `onMediaWritten` Cloud Function trigger (denormalizing `primaryImageUrl`/`hoverImageUrl`), mirroring Plan A's `onVariantWritten` pattern. `ReviewSchema` gains `createdAt` so reviews can sort by recency using the composite index Plan A already declared. The route is statically generated (`generateStaticParams` + `revalidate: 60`, matching the rest of the storefront); variant selection lives in client React state, not the URL, so the page stays static. SEO (`generateMetadata` + `Product`/`Offer`/`AggregateRating` JSON-LD) is wired from data the schema already carries.

**Tech Stack:** Next.js App Router (Server Components for data fetching, Client Components for variant-selection interactivity), Firebase Admin SDK, Firebase Cloud Functions v2, Tailwind CSS, zod, Vitest + Testing Library.

## Global Constraints

- All monetary values are integer paise. Never floats.
- Every schema/API boundary validates input with zod.
- TypeScript strict mode everywhere; no `any` in `packages/shared` exports.
- Package manager is pnpm.
- Mobile-first: every component is designed at 375px width first, then expanded to `md`/`lg` breakpoints (PDF §2).
- Design tokens are the only colors/fonts/radii used in new components — no ad hoc hex values: `cream` `#FAF6F0`, `charcoal` `#2A2622`, `terracotta` `#C1592A`, `sage` `#7C8B6F`, `surface` `#FFFFFF`; `font-display` (Playfair Display) for headings, `font-sans` (Inter) for body/UI; `rounded-lg` for cards/buttons, `rounded-full` for pills/circular elements.
- Placeholder product photos/videos live under `apps/web/public/placeholders/` as committed files, referenced by URL from `ProductMedia` docs — never Storage uploads (Storage rules are full-deny/signed-URL-only).
- All product copy (FAQ answers, etc.) added in this plan is written fresh — never copied from Ritwikas, Picloopz, Parul Packaging, or Yazhli Collection (PDF §2 cloning boundary).
- Firestore reads in Server Components use the Admin SDK (`getAdminApp()` from `apps/web/lib/firebase-admin.ts`), the existing pattern from Foundation/Plan A.
- Firestore Admin SDK returns `Timestamp`, not `Date` — any field read back and compared/rendered as a date must go through a `toDate()` conversion helper (see Task 4).
- Variant selection is client-side React state, not a URL search param — the PDP route must remain statically generatable (`generateStaticParams` + `revalidate: 60`); do not add a `searchParams` dependency to the base product page.
- Any new Firestore query must have its `orderBy` field match whichever field carries a range/inequality filter in the same query, and a matching entry in `firestore.indexes.json` — this class of bug is invisible to unit tests in this environment (no live Firestore here) and was the source of two real bugs in Plan A's final review.
- No lint/typecheck script exists yet in this repo (known gap) — this plan does not add one; each task's TypeScript still compiles cleanly under `next build`/`tsc --noEmit` as part of its own verification.

---

## File Structure

```
packages/shared/src/
├── schemas/
│   ├── product-media.ts            [Task 1 - new]
│   ├── product.ts                  [Task 1 - modified: + faq, primaryImageUrl, hoverImageUrl]
│   └── review.ts                   [Task 1 - modified: + createdAt]
└── index.ts                        [Task 1 - modified: new export]

functions/src/products/
├── denormalize-media.ts             [Task 2 - new]
└── denormalize-media.test.ts        [Task 2 - new]
functions/src/index.ts               [Task 2 - modified: export onMediaWritten]

scripts/seed/src/
├── data.ts                          [Task 3 - modified: seedProductMedia, faq, review createdAt]
└── data.test.ts                     [Task 3 - modified: new assertions]
firestore.indexes.json               [Task 3 - verified, no change expected]

apps/web/lib/
└── firestore-product-detail.ts      [Task 4 - new]

apps/web/app/(shop)/product/[slug]/
└── page.tsx                         [Task 5 - new]

apps/web/components/product/
├── ProductDetailClient.tsx          [Task 6 - new]
├── Gallery.tsx                      [Task 6 - new]
├── BuyBox.tsx                       [Task 6 - new]
├── VariantSelector.tsx              [Task 6 - new]
├── PersonalizeComingSoonModal.tsx   [Task 6 - new]
├── ProductTabs.tsx                  [Task 7 - new]
├── PictureQualityGuide.tsx          [Task 7 - new]
├── VideoRail.tsx                    [Task 7 - new]
├── ReviewsSection.tsx               [Task 8 - new]
├── RelatedProducts.tsx              [Task 8 - new]
└── ProductCard.tsx                  [Task 9 - modified: use denormalized image fields]
```

---

### Task 1: `ProductMedia` schema, `ProductSchema`/`ReviewSchema` field additions

**Files:**
- Create: `packages/shared/src/schemas/product-media.ts`
- Test: `packages/shared/src/schemas/product-media.test.ts`
- Modify: `packages/shared/src/schemas/product.ts`
- Modify: `packages/shared/src/schemas/product.test.ts`
- Modify: `packages/shared/src/schemas/review.ts`
- Modify: `packages/shared/src/schemas/review.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: nothing beyond `zod`.
- Produces: `ProductMediaSchema`, `ProductMedia` (exported from `@bro-pics/shared`); `ProductSchema` gains `faq: {question:string;answer:string}[]`, `primaryImageUrl: string`, `hoverImageUrl: string | null`; `ReviewSchema` gains `createdAt: Date`. Tasks 2-9 all depend on these exact field names and types.

- [ ] **Step 1: Write the failing test for `ProductMediaSchema`**

```ts
// packages/shared/src/schemas/product-media.test.ts
import { describe, it, expect } from 'vitest';
import { ProductMediaSchema } from './product-media';

const validMedia = {
  id: 'media_1',
  productId: 'prod_classic_wooden_frame',
  variantId: null,
  type: 'image' as const,
  url: '/placeholders/products/classic-wooden-frame-1.svg',
  alt: 'Classic Wooden Photo Frame, front view',
  sortOrder: 0,
};

describe('ProductMediaSchema', () => {
  it('accepts variant-agnostic image media', () => {
    expect(ProductMediaSchema.parse(validMedia)).toEqual(validMedia);
  });

  it('accepts variant-specific media with a variantId', () => {
    const variantSpecific = { ...validMedia, id: 'media_2', variantId: 'var_classic_wooden_frame_8x12_black' };
    expect(ProductMediaSchema.parse(variantSpecific)).toEqual(variantSpecific);
  });

  it('accepts type "video"', () => {
    const video = { ...validMedia, id: 'media_3', type: 'video' as const, url: '/placeholders/videos/product-demo.mp4' };
    expect(ProductMediaSchema.parse(video)).toEqual(video);
  });

  it('rejects an unknown type', () => {
    const invalid = { ...validMedia, type: 'gif' };
    expect(() => ProductMediaSchema.parse(invalid)).toThrow();
  });

  it('rejects a negative sortOrder', () => {
    const invalid = { ...validMedia, sortOrder: -1 };
    expect(() => ProductMediaSchema.parse(invalid)).toThrow();
  });

  it('rejects an empty url', () => {
    const invalid = { ...validMedia, url: '' };
    expect(() => ProductMediaSchema.parse(invalid)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/shared test -- product-media`
Expected: FAIL — `Cannot find module './product-media'`

- [ ] **Step 3: Implement `ProductMediaSchema`**

```ts
// packages/shared/src/schemas/product-media.ts
import { z } from 'zod';

export const ProductMediaSchema = z.object({
  id: z.string(),
  productId: z.string(),
  variantId: z.string().nullable(),
  type: z.enum(['image', 'video']),
  url: z.string().min(1),
  alt: z.string(),
  sortOrder: z.number().int().nonnegative(),
});

export type ProductMedia = z.infer<typeof ProductMediaSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/shared test -- product-media`
Expected: PASS (6 tests)

- [ ] **Step 5: Write the failing test for `ProductSchema`'s new fields**

Add to `packages/shared/src/schemas/product.test.ts` (create the file with this content if it doesn't already have a similar `validProduct` fixture — check the existing file first and extend its fixture in place rather than duplicating; the block below assumes a `validProduct` object already exists in the file and needs these three keys added to it):

```ts
// packages/shared/src/schemas/product.test.ts — add to the existing validProduct fixture:
  faq: [{ question: 'Does this frame come pre-assembled?', answer: 'Yes, it arrives ready to hang or stand.' }],
  primaryImageUrl: '/placeholders/products/classic-wooden-frame-1.svg',
  hoverImageUrl: '/placeholders/products/classic-wooden-frame-2.svg',

// and add these new test cases to the describe block:
  it('accepts a product with an empty faq array and null hoverImageUrl', () => {
    const noFaq = { ...validProduct, faq: [], hoverImageUrl: null };
    expect(ProductSchema.parse(noFaq)).toEqual(noFaq);
  });

  it('rejects a faq entry missing an answer', () => {
    const invalid = { ...validProduct, faq: [{ question: 'Only a question?' }] };
    expect(() => ProductSchema.parse(invalid)).toThrow();
  });

  it('rejects an empty primaryImageUrl', () => {
    const invalid = { ...validProduct, primaryImageUrl: '' };
    expect(() => ProductSchema.parse(invalid)).toThrow();
  });
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/shared test -- product.test`
Expected: FAIL — `faq`/`primaryImageUrl`/`hoverImageUrl` not recognized, or strict-shape mismatch depending on how `validProduct` was extended (zod objects without `.strict()` won't fail on extra keys, but the new assertions on empty/invalid values will fail since the fields don't exist yet to validate against)

- [ ] **Step 7: Add the new fields to `ProductSchema`**

In `packages/shared/src/schemas/product.ts`, add after the `searchTokens` line and before the closing `});`:

```ts
  // Product FAQ, admin-managed the same way as highlights/howItWorks.
  faq: z.array(z.object({ question: z.string().min(1), answer: z.string().min(1) })).default([]),

  // Denormalized card images — kept in sync by a Cloud Function trigger on
  // media writes (see functions/src/products/denormalize-media.ts). Both
  // sourced from variant-agnostic (variantId === null) image media only.
  primaryImageUrl: z.string().min(1),
  hoverImageUrl: z.string().nullable(),
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/shared test -- product.test`
Expected: PASS

- [ ] **Step 9: Write the failing test for `ReviewSchema.createdAt`**

Add to `packages/shared/src/schemas/review.test.ts` (extend the existing fixture and describe block the same way as Step 5):

```ts
// add createdAt: new Date('2026-06-15') to the existing validReview fixture, then:

  it('rejects a review missing createdAt', () => {
    const { createdAt, ...withoutCreatedAt } = validReview;
    expect(() => ReviewSchema.parse(withoutCreatedAt)).toThrow();
  });
```

- [ ] **Step 10: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/shared test -- review.test`
Expected: FAIL

- [ ] **Step 11: Add `createdAt` to `ReviewSchema`**

In `packages/shared/src/schemas/review.ts`, add to the object after `status: ReviewStatusSchema,`:

```ts
  createdAt: z.date(),
```

- [ ] **Step 12: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/shared test -- review.test`
Expected: PASS

- [ ] **Step 13: Export the new schema from the package root**

In `packages/shared/src/index.ts`, add after `export * from './schemas/review';`:

```ts
export * from './schemas/product-media';
```

- [ ] **Step 14: Run the full shared package test suite**

Run: `pnpm --filter @bro-pics/shared test`
Expected: PASS (all tests, including the new ones)

- [ ] **Step 15: Commit**

```bash
git add packages/shared/src/schemas/product-media.ts packages/shared/src/schemas/product-media.test.ts packages/shared/src/schemas/product.ts packages/shared/src/schemas/product.test.ts packages/shared/src/schemas/review.ts packages/shared/src/schemas/review.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add ProductMedia schema, faq/card-image fields, review createdAt"
```

---

### Task 2: `onMediaWritten` Cloud Function trigger

**Files:**
- Create: `functions/src/products/denormalize-media.ts`
- Create: `functions/src/products/denormalize-media.test.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `ProductMedia` shape (informally, via a local `MediaForDenormalization` interface matching `product-media.ts`'s fields — `functions/` does not import `@bro-pics/shared` today, following the existing `denormalize.ts` pattern of a locally-defined interface rather than a cross-package import).
- Produces: `calculateCardImages(media: MediaForDenormalization[]): ProductImageFields` (pure, unit-tested), `onMediaWritten` (Cloud Function trigger, exported from `functions/src/index.ts`). No other task consumes these directly — `ProductSchema.primaryImageUrl`/`hoverImageUrl` (Task 1) are the contract this trigger keeps in sync at runtime.

- [ ] **Step 1: Write the failing test for `calculateCardImages`**

```ts
// functions/src/products/denormalize-media.test.ts
import { describe, it, expect } from 'vitest';
import { calculateCardImages } from './denormalize-media';

describe('calculateCardImages', () => {
  it('returns empty primary and null hover when there is no media', () => {
    expect(calculateCardImages([])).toEqual({ primaryImageUrl: '', hoverImageUrl: null });
  });

  it('picks the two lowest-sortOrder variant-agnostic images as primary/hover', () => {
    const media = [
      { variantId: null, type: 'image' as const, url: '/a.svg', sortOrder: 1 },
      { variantId: null, type: 'image' as const, url: '/b.svg', sortOrder: 0 },
      { variantId: null, type: 'image' as const, url: '/c.svg', sortOrder: 2 },
    ];
    expect(calculateCardImages(media)).toEqual({ primaryImageUrl: '/b.svg', hoverImageUrl: '/a.svg' });
  });

  it('returns a null hoverImageUrl when only one variant-agnostic image exists', () => {
    const media = [{ variantId: null, type: 'image' as const, url: '/only.svg', sortOrder: 0 }];
    expect(calculateCardImages(media)).toEqual({ primaryImageUrl: '/only.svg', hoverImageUrl: null });
  });

  it('ignores variant-specific media when choosing card images', () => {
    const media = [
      { variantId: 'var_1', type: 'image' as const, url: '/variant-only.svg', sortOrder: 0 },
      { variantId: null, type: 'image' as const, url: '/generic.svg', sortOrder: 1 },
    ];
    expect(calculateCardImages(media)).toEqual({ primaryImageUrl: '/generic.svg', hoverImageUrl: null });
  });

  it('ignores video media when choosing card images', () => {
    const media = [
      { variantId: null, type: 'video' as const, url: '/clip.mp4', sortOrder: 0 },
      { variantId: null, type: 'image' as const, url: '/still.svg', sortOrder: 1 },
    ];
    expect(calculateCardImages(media)).toEqual({ primaryImageUrl: '/still.svg', hoverImageUrl: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/functions test -- denormalize-media`
Expected: FAIL — `Cannot find module './denormalize-media'`

- [ ] **Step 3: Implement `calculateCardImages` and the trigger**

```ts
// functions/src/products/denormalize-media.ts
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';

export interface MediaForDenormalization {
  variantId: string | null;
  type: 'image' | 'video';
  url: string;
  sortOrder: number;
}

export interface ProductImageFields {
  primaryImageUrl: string;
  hoverImageUrl: string | null;
}

export function calculateCardImages(media: MediaForDenormalization[]): ProductImageFields {
  const cardImages = media
    .filter((m) => m.variantId === null && m.type === 'image')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    primaryImageUrl: cardImages[0]?.url ?? '',
    hoverImageUrl: cardImages[1]?.url ?? null,
  };
}

/**
 * Thin Cloud Function glue: on any write to a product's media subcollection,
 * re-reads all sibling media and writes the recalculated card-image fields
 * onto the parent product doc. Same split as onVariantWritten in
 * denormalize.ts — a pure, fully-tested function plus a few lines of
 * Admin SDK read/write, exercised live via the Firestore emulator during
 * manual verification of the PDP gallery.
 */
export const onMediaWritten = onDocumentWritten(
  'products/{productId}/media/{mediaId}',
  async (event) => {
    const { productId } = event.params;
    const db = getFirestore();

    const mediaSnapshot = await db.collection('products').doc(productId).collection('media').get();
    const media = mediaSnapshot.docs.map((doc) => doc.data() as MediaForDenormalization);

    const fields = calculateCardImages(media);
    await db.collection('products').doc(productId).set(fields, { merge: true });
  }
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/functions test -- denormalize-media`
Expected: PASS (5 tests)

- [ ] **Step 5: Export the trigger from the functions entrypoint**

In `functions/src/index.ts`, add after `export { onVariantWritten } from './products/denormalize';`:

```ts
export { onMediaWritten } from './products/denormalize-media';
```

- [ ] **Step 6: Run the full functions package suite and build**

Run: `pnpm --filter @bro-pics/functions test && pnpm --filter @bro-pics/functions build`
Expected: PASS, build succeeds with no TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add functions/src/products/denormalize-media.ts functions/src/products/denormalize-media.test.ts functions/src/index.ts
git commit -m "feat(functions): denormalize product card images on media writes"
```

---

### Task 3: Seed data — product media, FAQ, review timestamps

**Files:**
- Modify: `scripts/seed/src/data.ts`
- Modify: `scripts/seed/src/data.test.ts`

**Interfaces:**
- Consumes: `ProductMediaSchema`/`ProductMedia`, `ProductSchema` (`faq`, `primaryImageUrl`, `hoverImageUrl`), `ReviewSchema` (`createdAt`) — all from Task 1.
- Produces: `seedProductMedia: ProductMedia[]`, exported from `data.ts`. Tasks 4+ don't read seed data directly (it's only consumed by the (not-yet-built) Firestore seed runner and by `data.test.ts`), but this is where the variant-specific-media fallback case required by the design spec (§2.3) is exercised for the first time.

- [ ] **Step 1: Write the failing consistency test for `seedProductMedia`**

Add to `scripts/seed/src/data.test.ts`:

```ts
// scripts/seed/src/data.test.ts — add to imports:
import { ProductMediaSchema } from '@bro-pics/shared';
// add to the destructured import from './data':
import { seedCategories, seedProducts, seedVariants, seedReviews, seedHomepageSections, seedProductMedia } from './data';

describe('seed product media', () => {
  it('every seed media doc passes ProductMediaSchema validation', () => {
    for (const media of seedProductMedia) {
      expect(() => ProductMediaSchema.parse(media)).not.toThrow();
    }
  });

  it('every media doc references a product that exists in seedProducts', () => {
    const productIds = new Set(seedProducts.map((p) => p.id));
    for (const media of seedProductMedia) {
      expect(productIds.has(media.productId)).toBe(true);
    }
  });

  it('every media doc with a non-null variantId references a variant that exists in seedVariants', () => {
    const variantIds = new Set(seedVariants.map((v) => v.id));
    for (const media of seedProductMedia) {
      if (media.variantId !== null) {
        expect(variantIds.has(media.variantId)).toBe(true);
      }
    }
  });

  it("every product's primaryImageUrl/hoverImageUrl match its own variant-agnostic image media, sorted by sortOrder", () => {
    for (const product of seedProducts) {
      const cardImages = seedProductMedia
        .filter((m) => m.productId === product.id && m.variantId === null && m.type === 'image')
        .sort((a, b) => a.sortOrder - b.sortOrder);
      expect(product.primaryImageUrl).toBe(cardImages[0]?.url ?? '');
      expect(product.hoverImageUrl).toBe(cardImages[1]?.url ?? null);
    }
  });

  it('at least one product has variant-specific media for some but not all of its active variants (exercises the gallery fallback rule)', () => {
    const hasPartialVariantMedia = seedProducts.some((product) => {
      const productVariantIds = seedVariants.filter((v) => v.productId === product.id && v.isActive).map((v) => v.id);
      const variantIdsWithMedia = new Set(
        seedProductMedia.filter((m) => m.productId === product.id && m.variantId !== null).map((m) => m.variantId)
      );
      return variantIdsWithMedia.size > 0 && variantIdsWithMedia.size < productVariantIds.length;
    });
    expect(hasPartialVariantMedia).toBe(true);
  });

  it('at least one product has video media', () => {
    expect(seedProductMedia.some((m) => m.type === 'video')).toBe(true);
  });
});

describe('seed products faq and reviews', () => {
  it('every product has at least one FAQ entry', () => {
    for (const product of seedProducts) {
      expect(product.faq.length).toBeGreaterThan(0);
    }
  });

  it('every review has a createdAt date', () => {
    for (const review of seedReviews) {
      expect(review.createdAt).toBeInstanceOf(Date);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/seed test`
Expected: FAIL — `seedProductMedia` is not exported from `./data`; `ProductSchema.parse` failures for missing `faq`/`primaryImageUrl`/`hoverImageUrl`/`createdAt`

- [ ] **Step 3: Add `faq` to each `SeedProductInput` and `createdAt` to review inputs**

In `scripts/seed/src/data.ts`, extend the `SeedProductInput` interface (after the `reviews` field):

```ts
  faq: Array<{ question: string; answer: string }>;
```

Add a `faq` array to each of the 8 entries in `productInputs` — for example, on `prod_classic_wooden_frame`:

```ts
    faq: [
      { question: 'What photo formats can I upload?', answer: 'JPG and PNG are both supported.' },
      { question: 'Can I change my photo after ordering?', answer: 'Once production has started we can no longer swap the photo — please double-check your preview before confirming.' },
    ],
```

Add an equivalent 1-2 entry `faq` array (fresh copy, not templated verbatim) to the remaining 7 products, matching each product's own theme (e.g. the acrylic frame's FAQ should mention its floating-photo look, the mug's FAQ should mention dishwasher safety, etc.) — the implementer writes these directly rather than reusing the wooden-frame text.

- [ ] **Step 4: Wire `faq`, `primaryImageUrl`, `hoverImageUrl` into `seedProducts`, and `createdAt` into `seedReviews`**

In the `seedProducts` map function in `scripts/seed/src/data.ts`, add after `searchTokens: [...]`:

```ts
    faq: input.faq,
    primaryImageUrl: `/placeholders/products/${input.id.replace('prod_', '').replace(/_/g, '-')}-1.svg`,
    hoverImageUrl: `/placeholders/products/${input.id.replace('prod_', '').replace(/_/g, '-')}-2.svg`,
```

In the `seedReviews` flatMap, add a `createdAt` value derived deterministically from the product/review index so it's reproducible and spread across a plausible date range:

```ts
    createdAt: new Date(2026, 1, 1 + productIndex * 7 + reviewIndex),
```

(This replaces the object literal's closing — add the field alongside `status: 'approved' as const,`.)

- [ ] **Step 5: Add `seedProductMedia`**

Add a new export to `scripts/seed/src/data.ts`, after `seedReviews`. This derives variant-agnostic media from the existing `-1.svg`/`-2.svg` placeholder files (already committed under `apps/web/public/placeholders/products/`), and adds variant-specific media plus one video for `prod_classic_wooden_frame` to exercise the fallback rule and the video rail:

```ts
export const seedProductMedia: ProductMedia[] = [
  ...productInputs.flatMap((input) => {
    const slug = input.id.replace('prod_', '').replace(/_/g, '-');
    return [
      {
        id: `media_${input.id}_1`,
        productId: input.id,
        variantId: null,
        type: 'image' as const,
        url: `/placeholders/products/${slug}-1.svg`,
        alt: `${input.title}, primary view`,
        sortOrder: 0,
      },
      {
        id: `media_${input.id}_2`,
        productId: input.id,
        variantId: null,
        type: 'image' as const,
        url: `/placeholders/products/${slug}-2.svg`,
        alt: `${input.title}, alternate view`,
        sortOrder: 1,
      },
    ];
  }),
  // Variant-specific media for a subset of prod_classic_wooden_frame's
  // variants — exercises the gallery fallback rule (§2.3 of the PDP
  // design spec): the black variant has its own photo, the white variant
  // does not and must fall back to the variant-agnostic media above.
  {
    id: 'media_prod_classic_wooden_frame_black_variant',
    productId: 'prod_classic_wooden_frame',
    variantId: 'var_classic_wooden_frame_8x12_black',
    type: 'image',
    url: '/placeholders/products/classic-wooden-frame-1.svg',
    alt: 'Classic Wooden Photo Frame in black, 8x12 in',
    sortOrder: 0,
  },
  // Product video — exercises the video rail (Task 7).
  {
    id: 'media_prod_classic_wooden_frame_video',
    productId: 'prod_classic_wooden_frame',
    variantId: null,
    type: 'video',
    url: '/placeholders/videos/product-demo.mp4',
    alt: 'Classic Wooden Photo Frame, in motion',
    sortOrder: 2,
  },
];
```

Add the `ProductMedia` type to the top-of-file import:

```ts
import type { Category, Product, Variant, Review, HomepageSection, ProductMedia } from '@bro-pics/shared';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/seed test`
Expected: PASS (all tests including the new media/faq/review assertions)

- [ ] **Step 7: Verify `firestore.indexes.json` already covers the reviews-by-recency query**

Open `firestore.indexes.json` and confirm the `reviews` collection group index is `(productId ASC, status ASC, createdAt DESC)` — it already is, added defensively in Plan A. No change needed; this step is a verification, not an edit. If it is missing or has a different field order, add it now as a fourth step before continuing (it is not expected to be missing).

- [ ] **Step 8: Run the full shared+seed suites once more for a clean baseline**

Run: `pnpm --filter @bro-pics/shared test && pnpm --filter @bro-pics/seed test`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add scripts/seed/src/data.ts scripts/seed/src/data.test.ts
git commit -m "feat(seed): add product media, FAQ entries, and review timestamps"
```

---

### Task 4: Product detail data-fetching layer

**Files:**
- Create: `apps/web/lib/firestore-product-detail.ts`
- Test: `apps/web/lib/firestore-product-detail.test.ts`

**Interfaces:**
- Consumes: `Product`, `Variant`, `ProductMedia`, `Review` from `@bro-pics/shared` (Task 1); `getAdminApp()` from `apps/web/lib/firebase-admin.ts` (existing).
- Produces: `getProductBySlug(slug: string): Promise<ProductDetail | null>` where `ProductDetail = { product: Product; variants: Variant[]; media: ProductMedia[]; reviews: Review[] }`; `getRelatedProducts(categoryId: string, excludeProductId: string, limit: number): Promise<Product[]>`; `getAllActiveProductSlugs(): Promise<string[]>`; `getCategoryById(categoryId: string): Promise<Category | null>` (for the page's breadcrumb — `apps/web/lib/firestore-categories.ts` from Plan A only exposes `getCategoryBySlug`/`getActiveCategories`, neither of which take an id, so this is a small new lookup rather than a duplicate). Tasks 5, 6, 8 import these by exact name.

- [ ] **Step 1: Write the failing unit test for the pure date-conversion and media-fallback logic**

This module is mostly thin Admin SDK glue (following the `firestore-homepage.ts`/`firestore-products.ts` precedent of not unit-testing Firestore reads directly), but the variant-media fallback selection is pure logic worth testing in isolation. Extract it as an exported helper:

```ts
// apps/web/lib/firestore-product-detail.test.ts
import { describe, it, expect } from 'vitest';
import { selectGalleryMedia } from './firestore-product-detail';
import type { ProductMedia } from '@bro-pics/shared';

const genericImage: ProductMedia = {
  id: 'm1', productId: 'p1', variantId: null, type: 'image', url: '/generic.svg', alt: '', sortOrder: 0,
};
const variantImage: ProductMedia = {
  id: 'm2', productId: 'p1', variantId: 'v1', type: 'image', url: '/variant.svg', alt: '', sortOrder: 0,
};

describe('selectGalleryMedia', () => {
  it('returns variant-specific media when the selected variant has any', () => {
    const result = selectGalleryMedia([genericImage, variantImage], 'v1');
    expect(result).toEqual([variantImage]);
  });

  it('falls back to variant-agnostic media when the selected variant has none', () => {
    const result = selectGalleryMedia([genericImage, variantImage], 'v2-with-no-media');
    expect(result).toEqual([genericImage]);
  });

  it('returns all variant-agnostic media, sorted by sortOrder, when no variant is selected', () => {
    const second: ProductMedia = { ...genericImage, id: 'm3', url: '/second.svg', sortOrder: 1 };
    const result = selectGalleryMedia([second, genericImage], null);
    expect(result).toEqual([genericImage, second]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- firestore-product-detail`
Expected: FAIL — `Cannot find module './firestore-product-detail'`

- [ ] **Step 3: Implement `firestore-product-detail.ts`**

```ts
// apps/web/lib/firestore-product-detail.ts
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getAdminApp } from './firebase-admin';
import type { Product, Variant, ProductMedia, Review, Category } from '@bro-pics/shared';

export interface ProductDetail {
  product: Product;
  variants: Variant[];
  media: ProductMedia[];
  reviews: Review[];
}

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(0);
}

/**
 * Gallery fallback rule (PDP design spec §2.3): show media belonging to the
 * selected variant if any exists; otherwise show variant-agnostic media,
 * sorted by sortOrder. Pure and unit-tested in isolation from the Admin SDK
 * reads below.
 */
export function selectGalleryMedia(media: ProductMedia[], selectedVariantId: string | null): ProductMedia[] {
  if (selectedVariantId !== null) {
    const variantMedia = media.filter((m) => m.variantId === selectedVariantId);
    if (variantMedia.length > 0) {
      return [...variantMedia].sort((a, b) => a.sortOrder - b.sortOrder);
    }
  }
  return media.filter((m) => m.variantId === null).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  const db = getFirestore(getAdminApp());

  const productSnapshot = await db
    .collection('products')
    .where('slug', '==', slug)
    .where('isActive', '==', true)
    .limit(1)
    .get();
  if (productSnapshot.empty) return null;

  const productDoc = productSnapshot.docs[0];
  const rawProduct = productDoc.data();
  const product = {
    ...(rawProduct as Product),
    createdAt: toDate(rawProduct.createdAt),
    updatedAt: toDate(rawProduct.updatedAt),
  };
  const productId = productDoc.id;

  const [variantsSnapshot, mediaSnapshot, reviewsSnapshot] = await Promise.all([
    db.collection('products').doc(productId).collection('variants').where('isActive', '==', true).get(),
    db.collection('products').doc(productId).collection('media').orderBy('sortOrder', 'asc').get(),
    db
      .collection('reviews')
      .where('productId', '==', productId)
      .where('status', '==', 'approved')
      .orderBy('createdAt', 'desc')
      .get(),
  ]);

  const variants = variantsSnapshot.docs.map((doc) => doc.data() as Variant);
  const media = mediaSnapshot.docs.map((doc) => doc.data() as ProductMedia);
  const reviews = reviewsSnapshot.docs.map((doc) => {
    const raw = doc.data();
    return { ...(raw as Review), createdAt: toDate(raw.createdAt) };
  });

  return { product, variants, media, reviews };
}

export async function getRelatedProducts(
  categoryId: string,
  excludeProductId: string,
  limit: number
): Promise<Product[]> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db
    .collection('products')
    .where('isActive', '==', true)
    .where('categoryId', '==', categoryId)
    .limit(limit + 1)
    .get();
  return snapshot.docs
    .map((doc) => doc.data() as Product)
    .filter((p) => p.id !== excludeProductId)
    .slice(0, limit);
}

export async function getAllActiveProductSlugs(): Promise<string[]> {
  const db = getFirestore(getAdminApp());
  const snapshot = await db.collection('products').where('isActive', '==', true).get();
  return snapshot.docs.map((doc) => (doc.data() as Product).slug);
}

export async function getCategoryById(categoryId: string): Promise<Category | null> {
  const db = getFirestore(getAdminApp());
  const doc = await db.collection('categories').doc(categoryId).get();
  if (!doc.exists) return null;
  return doc.data() as Category;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- firestore-product-detail`
Expected: PASS (3 tests)

- [ ] **Step 5: Verify the production build compiles**

Run: `pnpm --filter @bro-pics/web build`
Expected: same live-Firestore-connection caveat as Plan A's tasks (build fails at the prerendering step without `FIREBASE_SERVICE_ACCOUNT_JSON` — confirm there are no TypeScript/syntax errors in this new file, which is what this step is actually checking)

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/firestore-product-detail.ts apps/web/lib/firestore-product-detail.test.ts
git commit -m "feat(web): add product detail data-fetching layer"
```

---

### Task 5: `/product/[slug]` route, static generation, SEO

**Files:**
- Create: `apps/web/app/(shop)/product/[slug]/page.tsx`
- Test: `apps/web/app/(shop)/product/[slug]/page.test.tsx`

**Interfaces:**
- Consumes: `getProductBySlug`, `getRelatedProducts`, `getAllActiveProductSlugs` (Task 4); `ProductDetailClient` (Task 6, imported but the page renders a minimal placeholder for it that Task 6 replaces — see Step 3's note); `ReviewsSection`, `RelatedProducts` (Task 8, same note); `ProductTabs`, `VideoRail` (Task 7, same note).
- Produces: the live `/product/[slug]` route that `ProductCard`/`SearchTypeahead` already link to.

Because later tasks (6, 7, 8) add the components this page renders, this task builds the page shell with the data-fetching, `generateStaticParams`, `generateMetadata`, JSON-LD, and `notFound()` handling wired up now, using minimal inline placeholders for the sections that don't exist yet — each subsequent task replaces exactly one placeholder with the real component, so the page is real and testable at every step rather than being rewritten wholesale later.

- [ ] **Step 1: Write the failing test for `generateMetadata`**

```tsx
// apps/web/app/(shop)/product/[slug]/page.test.tsx
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../lib/firestore-product-detail', () => ({
  getProductBySlug: vi.fn(),
  getRelatedProducts: vi.fn(),
  getAllActiveProductSlugs: vi.fn(),
  getCategoryById: vi.fn(),
}));

import { getProductBySlug } from '../../../../lib/firestore-product-detail';
import { generateMetadata } from './page';

const mockProduct = {
  id: 'prod_test', title: 'Test Frame', slug: 'test-frame', categoryId: 'cat_frames',
  shortDesc: 'A test frame', descriptionHtml: '<p>Test</p>', highlights: [], howItWorks: [],
  careText: '', basePrice: 10000, isActive: true, isFeatured: false, badges: [],
  dispatchDaysMin: 3, dispatchDaysMax: 5, photoSlots: 1, allowsTextPersonalization: false,
  seo: { title: 'Test Frame | BroPics', description: 'Shop the test frame.' },
  createdAt: new Date(), updatedAt: new Date(),
  availableSizes: [], availableColours: [], availableMaterials: [],
  minPrice: 10000, maxPrice: 10000, occasionTags: [], inStock: true,
  ratingAverage: 4.5, ratingCount: 10, titleLower: 'test frame', searchTokens: [],
  faq: [], primaryImageUrl: '/placeholders/products/test-1.svg', hoverImageUrl: null,
};

describe('generateMetadata', () => {
  it('uses the product seo fields and primaryImageUrl for OG image', async () => {
    vi.mocked(getProductBySlug).mockResolvedValue({
      product: mockProduct, variants: [], media: [], reviews: [],
    });

    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'test-frame' }) });

    expect(metadata.title).toBe('Test Frame | BroPics');
    expect(metadata.description).toBe('Shop the test frame.');
    expect(metadata.openGraph?.images).toEqual(['/placeholders/products/test-1.svg']);
  });

  it('returns fallback metadata when the product does not exist', async () => {
    vi.mocked(getProductBySlug).mockResolvedValue(null);
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'missing' }) });
    expect(metadata.title).toBe('Product Not Found | BroPics');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- "product/\[slug\]/page"`
Expected: FAIL — `Cannot find module './page'`

- [ ] **Step 3: Implement the page shell**

```tsx
// apps/web/app/(shop)/product/[slug]/page.tsx
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import {
  getProductBySlug,
  getRelatedProducts,
  getAllActiveProductSlugs,
  getCategoryById,
} from '../../../../lib/firestore-product-detail';
import { ProductDetailClient } from '../../../../components/product/ProductDetailClient';
import { ProductTabs } from '../../../../components/product/ProductTabs';
import { VideoRail } from '../../../../components/product/VideoRail';
import { ReviewsSection } from '../../../../components/product/ReviewsSection';
import { RelatedProducts } from '../../../../components/product/RelatedProducts';

export const revalidate = 60;

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllActiveProductSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getProductBySlug(slug);

  if (!detail) {
    return { title: 'Product Not Found | BroPics' };
  }

  const { product } = detail;
  return {
    title: product.seo.title ?? `${product.title} | BroPics`,
    description: product.seo.description ?? product.shortDesc,
    alternates: { canonical: `/product/${product.slug}` },
    openGraph: {
      title: product.seo.title ?? product.title,
      description: product.seo.description ?? product.shortDesc,
      images: [product.primaryImageUrl],
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const detail = await getProductBySlug(slug);
  if (!detail) notFound();

  const { product, variants, media, reviews } = detail;
  const [relatedProducts, category] = await Promise.all([
    getRelatedProducts(product.categoryId, product.id, 8),
    getCategoryById(product.categoryId),
  ]);
  const defaultVariant = variants.find((v) => v.stockStatus === 'in_stock') ?? variants[0] ?? null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title,
    description: product.shortDesc,
    image: product.primaryImageUrl,
    aggregateRating:
      product.ratingCount > 0
        ? { '@type': 'AggregateRating', ratingValue: product.ratingAverage, reviewCount: product.ratingCount }
        : undefined,
    offers: defaultVariant
      ? {
          '@type': 'Offer',
          price: (defaultVariant.price / 100).toFixed(2),
          priceCurrency: 'INR',
          availability:
            defaultVariant.stockStatus === 'in_stock'
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
        }
      : undefined,
  };

  return (
    <div className="px-4 py-8 md:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav aria-label="Breadcrumb" className="text-xs text-charcoal/60 mb-6">
        <Link href="/">Home</Link>
        {category && (
          <>
            {' / '}
            <Link href={`/category/${category.slug}`}>{category.name}</Link>
          </>
        )}
        {' / '}
        <span className="text-charcoal">{product.title}</span>
      </nav>

      <ProductDetailClient product={product} variants={variants} media={media} />

      <ProductTabs product={product} />
      <VideoRail media={media} />
      <ReviewsSection product={product} reviews={reviews} />
      <RelatedProducts products={relatedProducts} />
    </div>
  );
}
```

- [ ] **Step 4: Add temporary stub components so the page compiles ahead of Tasks 6-8**

Create minimal stub files — each is fully replaced by its own task later, not left in place:

```tsx
// apps/web/components/product/ProductDetailClient.tsx (stub — replaced in Task 6)
import type { Product, Variant, ProductMedia } from '@bro-pics/shared';

interface ProductDetailClientProps {
  product: Product;
  variants: Variant[];
  media: ProductMedia[];
}

export function ProductDetailClient({ product }: ProductDetailClientProps) {
  return <h1 className="font-display text-3xl">{product.title}</h1>;
}
```

```tsx
// apps/web/components/product/ProductTabs.tsx (stub — replaced in Task 7)
import type { Product } from '@bro-pics/shared';

export function ProductTabs({ product }: { product: Product }) {
  return <div>{product.descriptionHtml}</div>;
}
```

```tsx
// apps/web/components/product/VideoRail.tsx (stub — replaced in Task 7)
import type { ProductMedia } from '@bro-pics/shared';

export function VideoRail({ media }: { media: ProductMedia[] }) {
  return null;
}
```

```tsx
// apps/web/components/product/ReviewsSection.tsx (stub — replaced in Task 8)
import type { Product, Review } from '@bro-pics/shared';

export function ReviewsSection({ product, reviews }: { product: Product; reviews: Review[] }) {
  return null;
}
```

```tsx
// apps/web/components/product/RelatedProducts.tsx (stub — replaced in Task 8)
import type { Product } from '@bro-pics/shared';

export function RelatedProducts({ products }: { products: Product[] }) {
  return null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- "product/\[slug\]/page"`
Expected: PASS (2 tests)

- [ ] **Step 6: Verify the production build compiles**

Run: `pnpm --filter @bro-pics/web build`
Expected: same live-Firestore caveat as prior tasks — confirm no TypeScript/syntax errors

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(shop)/product" apps/web/components/product/ProductDetailClient.tsx apps/web/components/product/ProductTabs.tsx apps/web/components/product/VideoRail.tsx apps/web/components/product/ReviewsSection.tsx apps/web/components/product/RelatedProducts.tsx
git commit -m "feat(web): add product detail page route with SEO metadata and JSON-LD"
```

---

### Task 6: Gallery, buy box, variant selector, placeholder modal

**Files:**
- Modify: `apps/web/components/product/ProductDetailClient.tsx` (replaces Task 5's stub)
- Test: `apps/web/components/product/ProductDetailClient.test.tsx`
- Create: `apps/web/components/product/Gallery.tsx`
- Create: `apps/web/components/product/BuyBox.tsx`
- Create: `apps/web/components/product/VariantSelector.tsx`
- Create: `apps/web/components/product/PersonalizeComingSoonModal.tsx`
- Test: `apps/web/components/product/PersonalizeComingSoonModal.test.tsx`

**Interfaces:**
- Consumes: `Product`, `Variant`, `ProductMedia` (Task 1); `selectGalleryMedia` (Task 4); `useCart()` from `apps/web/lib/cart-context.tsx` (existing, Plan A).
- Produces: `ProductDetailClient` — the real implementation Task 5's page already imports by this name, so no signature change is needed there.

- [ ] **Step 1: Write the failing test for `PersonalizeComingSoonModal`**

```tsx
// apps/web/components/product/PersonalizeComingSoonModal.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PersonalizeComingSoonModal } from './PersonalizeComingSoonModal';

describe('PersonalizeComingSoonModal', () => {
  it('renders nothing when closed', () => {
    render(<PersonalizeComingSoonModal isOpen={false} onClose={() => {}} />);
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it('renders the coming-soon message when open', () => {
    render(<PersonalizeComingSoonModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<PersonalizeComingSoonModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- PersonalizeComingSoonModal`
Expected: FAIL — `Cannot find module './PersonalizeComingSoonModal'`

- [ ] **Step 3: Implement `PersonalizeComingSoonModal`**

```tsx
// apps/web/components/product/PersonalizeComingSoonModal.tsx
'use client';

interface PersonalizeComingSoonModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PersonalizeComingSoonModal({ isOpen, onClose }: PersonalizeComingSoonModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-charcoal/40" onClick={onClose} />
      <div className="relative bg-surface rounded-lg max-w-sm w-full p-6 text-center">
        <button aria-label="Close" onClick={onClose} className="absolute top-3 right-3 text-charcoal">
          ✕
        </button>
        <h2 className="font-display text-xl mb-2">Personalization Coming Soon</h2>
        <p className="text-sm text-charcoal/70">
          Our live photo editor is almost ready. In the meantime, message us on WhatsApp with your photo and we&apos;ll
          help you get started.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- PersonalizeComingSoonModal`
Expected: PASS (3 tests)

- [ ] **Step 5: Implement `VariantSelector`, `Gallery`, `BuyBox` (no dedicated tests — pure presentational, exercised end-to-end by `ProductDetailClient`'s tests in Step 7)**

```tsx
// apps/web/components/product/VariantSelector.tsx
'use client';

import type { Variant } from '@bro-pics/shared';

interface VariantSelectorProps {
  label: string;
  options: string[];
  selected: string;
  onSelect: (value: string) => void;
}

export function VariantSelector({ label, options, selected, onSelect }: VariantSelectorProps) {
  if (options.length <= 1) return null;

  return (
    <div className="mb-3">
      <span className="block text-xs text-charcoal/70 mb-1">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            onClick={() => onSelect(option)}
            aria-pressed={option === selected}
            className={`px-3 py-1.5 rounded-full text-sm border ${
              option === selected
                ? 'bg-terracotta text-cream border-terracotta'
                : 'bg-surface text-charcoal border-charcoal/20'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
```

```tsx
// apps/web/components/product/Gallery.tsx
'use client';

import { useState } from 'react';
import type { ProductMedia } from '@bro-pics/shared';

interface GalleryProps {
  media: ProductMedia[];
  productTitle: string;
}

export function Gallery({ media, productTitle }: GalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const active = media[Math.min(activeIndex, media.length - 1)];

  if (!active) {
    return <div className="aspect-square bg-cream rounded-lg" />;
  }

  return (
    <div>
      <div className="aspect-square bg-cream rounded-lg overflow-hidden relative">
        {active.type === 'video' ? (
          <video src={active.url} controls className="w-full h-full object-cover" />
        ) : (
          <img
            src={active.url}
            alt={active.alt || productTitle}
            onClick={() => setIsZoomed(true)}
            className="w-full h-full object-cover cursor-zoom-in"
          />
        )}
      </div>

      {media.length > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto">
          {media.map((item, index) => (
            <button
              key={item.id}
              onClick={() => setActiveIndex(index)}
              aria-label={`Show media ${index + 1}`}
              className={`w-16 h-16 flex-shrink-0 rounded overflow-hidden border-2 ${
                index === activeIndex ? 'border-terracotta' : 'border-transparent'
              }`}
            >
              {item.type === 'video' ? (
                <div className="w-full h-full bg-charcoal/80 text-cream flex items-center justify-center text-xs">▶</div>
              ) : (
                <img src={item.url} alt="" className="w-full h-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}

      {isZoomed && active.type === 'image' && (
        <div
          className="fixed inset-0 z-50 bg-charcoal/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setIsZoomed(false)}
        >
          <img src={active.url} alt={active.alt || productTitle} className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}
```

```tsx
// apps/web/components/product/BuyBox.tsx
'use client';

import { useState } from 'react';
import type { Product, Variant } from '@bro-pics/shared';
import { useCart } from '../../lib/cart-context';
import { VariantSelector } from './VariantSelector';
import { PersonalizeComingSoonModal } from './PersonalizeComingSoonModal';

function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface BuyBoxProps {
  product: Product;
  variants: Variant[];
  selectedVariant: Variant | null;
  selectedSize: string;
  selectedColour: string;
  onSelectSize: (size: string) => void;
  onSelectColour: (colour: string) => void;
}

export function BuyBox({
  product,
  variants,
  selectedVariant,
  selectedSize,
  selectedColour,
  onSelectSize,
  onSelectColour,
}: BuyBoxProps) {
  const [quantity, setQuantity] = useState(1);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { addItem } = useCart();

  const sizes = [...new Set(variants.map((v) => v.sizeLabel))];
  const colours = [...new Set(variants.map((v) => v.frameColour))];
  const price = selectedVariant?.price ?? product.minPrice;
  const compareAtPrice = selectedVariant?.compareAtPrice;
  const inStock = selectedVariant ? selectedVariant.stockStatus === 'in_stock' : product.inStock;

  const handleAddToCart = () => {
    if (!selectedVariant) return;
    addItem({ variantId: selectedVariant.id, title: `${product.title} — ${selectedVariant.sizeLabel}`, unitPriceSnapshot: selectedVariant.price, qty: quantity });
    setIsModalOpen(true);
  };

  return (
    <div>
      <h1 className="font-display text-3xl mb-1">{product.title}</h1>
      {product.ratingCount > 0 && (
        <a href="#reviews" className="text-sm text-charcoal/70 mb-2 inline-block">
          ★ {product.ratingAverage} ({product.ratingCount} reviews)
        </a>
      )}

      <div className="flex items-center gap-2 my-3">
        <span className="text-2xl font-medium">{formatPaise(price)}</span>
        {compareAtPrice && compareAtPrice > price && (
          <span className="text-sm text-charcoal/50 line-through">{formatPaise(compareAtPrice)}</span>
        )}
      </div>

      <VariantSelector label="Size" options={sizes} selected={selectedSize} onSelect={onSelectSize} />
      <VariantSelector label="Colour" options={colours} selected={selectedColour} onSelect={onSelectColour} />

      <p className={`text-sm mb-3 ${inStock ? 'text-sage' : 'text-charcoal/50'}`}>
        {inStock ? `Dispatches in ${product.dispatchDaysMin}-${product.dispatchDaysMax} days` : 'Out of stock'}
      </p>

      <div className="flex items-center gap-3 mb-4">
        <label htmlFor="qty" className="text-sm">Qty</label>
        <input
          id="qty"
          type="number"
          min={1}
          value={quantity}
          onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
          className="w-16 rounded border border-charcoal/20 px-2 py-1"
        />
      </div>

      <button
        onClick={handleAddToCart}
        disabled={!inStock || !selectedVariant}
        className="w-full bg-terracotta text-cream rounded-lg py-3 font-medium disabled:opacity-50"
      >
        Personalize &amp; Add to Cart
      </button>

      <a
        href="https://wa.me/910000000000"
        target="_blank"
        rel="noopener noreferrer"
        className="block text-center mt-3 text-sm text-sage underline"
      >
        Need help? Chat with us on WhatsApp
      </a>

      <PersonalizeComingSoonModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  );
}
```

- [ ] **Step 6: Write the failing test for `ProductDetailClient`'s variant-driven gallery/price updates**

```tsx
// apps/web/components/product/ProductDetailClient.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductDetailClient } from './ProductDetailClient';
import { CartProvider } from '../../lib/cart-context';
import type { Product, Variant, ProductMedia } from '@bro-pics/shared';

const product = {
  id: 'prod_1', title: 'Classic Wooden Photo Frame', slug: 'classic-wooden-frame', categoryId: 'cat_frames',
  shortDesc: '', descriptionHtml: '', highlights: [], howItWorks: [], careText: '',
  basePrice: 79900, isActive: true, isFeatured: false, badges: [], dispatchDaysMin: 3, dispatchDaysMax: 5,
  photoSlots: 1, allowsTextPersonalization: false, seo: {}, createdAt: new Date(), updatedAt: new Date(),
  availableSizes: ['8x12 in'], availableColours: ['Black', 'White'], availableMaterials: ['Wood'],
  minPrice: 79900, maxPrice: 79900, occasionTags: [], inStock: true, ratingAverage: 0, ratingCount: 0,
  titleLower: '', searchTokens: [], faq: [], primaryImageUrl: '/generic.svg', hoverImageUrl: null,
} satisfies Product;

const variants: Variant[] = [
  { id: 'v_black', productId: 'prod_1', sku: 'A', sizeLabel: '8x12 in', widthIn: 8, heightIn: 12, frameColour: 'Black', material: 'Wood', price: 79900, stockStatus: 'in_stock', printWidthPx: 2400, printHeightPx: 3600, minUploadPx: 2400, aspectRatio: 0.67, isActive: true },
  { id: 'v_white', productId: 'prod_1', sku: 'B', sizeLabel: '8x12 in', widthIn: 8, heightIn: 12, frameColour: 'White', material: 'Wood', price: 84900, stockStatus: 'in_stock', printWidthPx: 2400, printHeightPx: 3600, minUploadPx: 2400, aspectRatio: 0.67, isActive: true },
];

const media: ProductMedia[] = [
  { id: 'm_generic', productId: 'prod_1', variantId: null, type: 'image', url: '/generic.svg', alt: '', sortOrder: 0 },
  { id: 'm_black', productId: 'prod_1', variantId: 'v_black', type: 'image', url: '/black.svg', alt: '', sortOrder: 0 },
];

describe('ProductDetailClient', () => {
  it('shows the first variant-agnostic image and the first variant price by default', () => {
    render(<CartProvider><ProductDetailClient product={product} variants={variants} media={media} /></CartProvider>);
    expect(screen.getByText('₹799.00')).toBeInTheDocument();
  });

  it('switches to variant-specific media and price when a colour is selected', () => {
    render(<CartProvider><ProductDetailClient product={product} variants={variants} media={media} /></CartProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Black' }));
    expect(screen.getByText('₹799.00')).toBeInTheDocument();
  });

  it('falls back to variant-agnostic media for a variant with no dedicated photos', () => {
    render(<CartProvider><ProductDetailClient product={product} variants={variants} media={media} /></CartProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'White' }));
    expect(screen.getByText('₹849.00')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- ProductDetailClient`
Expected: FAIL — stub `ProductDetailClient` doesn't render price or accept variant/media props meaningfully

- [ ] **Step 8: Implement the real `ProductDetailClient`, replacing Task 5's stub**

```tsx
// apps/web/components/product/ProductDetailClient.tsx
'use client';

import { useState, useMemo } from 'react';
import type { Product, Variant, ProductMedia } from '@bro-pics/shared';
import { selectGalleryMedia } from '../../lib/firestore-product-detail';
import { Gallery } from './Gallery';
import { BuyBox } from './BuyBox';

interface ProductDetailClientProps {
  product: Product;
  variants: Variant[];
  media: ProductMedia[];
}

export function ProductDetailClient({ product, variants, media }: ProductDetailClientProps) {
  const firstInStock = variants.find((v) => v.stockStatus === 'in_stock') ?? variants[0] ?? null;
  const [selectedSize, setSelectedSize] = useState(firstInStock?.sizeLabel ?? '');
  const [selectedColour, setSelectedColour] = useState(firstInStock?.frameColour ?? '');

  const selectedVariant = useMemo(
    () => variants.find((v) => v.sizeLabel === selectedSize && v.frameColour === selectedColour) ?? firstInStock,
    [variants, selectedSize, selectedColour, firstInStock]
  );

  const galleryMedia = useMemo(
    () => selectGalleryMedia(media, selectedVariant?.id ?? null),
    [media, selectedVariant]
  );

  return (
    <div className="grid md:grid-cols-2 gap-8">
      <Gallery media={galleryMedia} productTitle={product.title} />
      <BuyBox
        product={product}
        variants={variants}
        selectedVariant={selectedVariant}
        selectedSize={selectedSize}
        selectedColour={selectedColour}
        onSelectSize={setSelectedSize}
        onSelectColour={setSelectedColour}
      />
    </div>
  );
}
```

Note: `selectGalleryMedia` is imported from `firestore-product-detail.ts` (Task 4) rather than duplicated — it's a pure function with no Admin SDK dependency, safe to import into a client component; Next.js tree-shakes the unused server-only exports from that module out of the client bundle.

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- ProductDetailClient`
Expected: PASS (3 tests)

- [ ] **Step 10: Run the full web package suite**

Run: `pnpm --filter @bro-pics/web test`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add apps/web/components/product/ProductDetailClient.tsx apps/web/components/product/ProductDetailClient.test.tsx apps/web/components/product/Gallery.tsx apps/web/components/product/BuyBox.tsx apps/web/components/product/VariantSelector.tsx apps/web/components/product/PersonalizeComingSoonModal.tsx apps/web/components/product/PersonalizeComingSoonModal.test.tsx
git commit -m "feat(web): add PDP gallery, buy box, variant selection, and personalize modal"
```

---

### Task 7: Tabbed info, Picture Quality Guide, video rail

**Files:**
- Modify: `apps/web/components/product/ProductTabs.tsx` (replaces Task 5's stub)
- Test: `apps/web/components/product/ProductTabs.test.tsx`
- Create: `apps/web/components/product/PictureQualityGuide.tsx`
- Modify: `apps/web/components/product/VideoRail.tsx` (replaces Task 5's stub)
- Test: `apps/web/components/product/VideoRail.test.tsx`

**Interfaces:**
- Consumes: `Product`, `ProductMedia` (Task 1).
- Produces: real `ProductTabs`, `VideoRail` — Task 5's page already imports both by these exact names.

- [ ] **Step 1: Write the failing test for `ProductTabs`**

```tsx
// apps/web/components/product/ProductTabs.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductTabs } from './ProductTabs';
import type { Product } from '@bro-pics/shared';

const product = {
  id: 'p1', title: 'Frame', slug: 'frame', categoryId: 'cat_frames', shortDesc: '',
  descriptionHtml: '<p>A lovely frame.</p>', highlights: ['Solid wood'], howItWorks: ['Upload your photo'],
  careText: 'Wipe with a dry cloth.', basePrice: 0, isActive: true, isFeatured: false, badges: [],
  dispatchDaysMin: 3, dispatchDaysMax: 5, photoSlots: 1, allowsTextPersonalization: false, seo: {},
  createdAt: new Date(), updatedAt: new Date(), availableSizes: [], availableColours: [], availableMaterials: [],
  minPrice: 0, maxPrice: 0, occasionTags: [], inStock: true, ratingAverage: 0, ratingCount: 0,
  titleLower: '', searchTokens: [],
  faq: [{ question: 'Does it come framed?', answer: 'Yes, ready to hang.' }],
  primaryImageUrl: '', hoverImageUrl: null,
} satisfies Product;

describe('ProductTabs', () => {
  it('shows the description tab by default', () => {
    render(<ProductTabs product={product} />);
    expect(screen.getByText('A lovely frame.')).toBeInTheDocument();
  });

  it('switches to the FAQ tab and shows its content', () => {
    render(<ProductTabs product={product} />);
    fireEvent.click(screen.getByRole('button', { name: 'FAQ' }));
    expect(screen.getByText('Does it come framed?')).toBeInTheDocument();
  });

  it('switches to the Picture Quality Guide tab', () => {
    render(<ProductTabs product={product} />);
    fireEvent.click(screen.getByRole('button', { name: 'Picture Quality Guide' }));
    expect(screen.getByText(/resolution/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- ProductTabs`
Expected: FAIL — stub renders `descriptionHtml` unconditionally with no tab buttons

- [ ] **Step 3: Implement `PictureQualityGuide`**

This is the same static content across every product (PDF §8: "managed once") — a plain component, not per-product data:

```tsx
// apps/web/components/product/PictureQualityGuide.tsx
export function PictureQualityGuide() {
  return (
    <div className="text-sm text-charcoal/80 space-y-2">
      <p>For the sharpest print, upload a photo at 300 DPI or higher at your chosen print size.</p>
      <p>We check your photo&apos;s resolution automatically when you upload it and let you know before you order if it&apos;s too low for a crisp print.</p>
      <p>Well-lit, in-focus photos print best — avoid heavily compressed screenshots or images pulled from social media, which often lose quality.</p>
    </div>
  );
}
```

- [ ] **Step 4: Implement `ProductTabs`**

```tsx
// apps/web/components/product/ProductTabs.tsx
'use client';

import { useState } from 'react';
import type { Product } from '@bro-pics/shared';
import { PictureQualityGuide } from './PictureQualityGuide';

const TAB_LABELS = ['Description', 'Highlights', 'How It Works', 'Picture Quality Guide', 'Care', 'FAQ'] as const;
type Tab = (typeof TAB_LABELS)[number];

export function ProductTabs({ product }: { product: Product }) {
  const [activeTab, setActiveTab] = useState<Tab>('Description');

  return (
    <div className="mt-12">
      <div className="flex flex-wrap gap-2 border-b border-charcoal/10 mb-4">
        {TAB_LABELS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-sm ${
              activeTab === tab ? 'border-b-2 border-terracotta text-charcoal font-medium' : 'text-charcoal/60'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Description' && (
        <div dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
      )}

      {activeTab === 'Highlights' && (
        <ul className="list-disc list-inside text-sm space-y-1">
          {product.highlights.map((h) => <li key={h}>{h}</li>)}
        </ul>
      )}

      {activeTab === 'How It Works' && (
        <ol className="list-decimal list-inside text-sm space-y-1">
          {product.howItWorks.map((step) => <li key={step}>{step}</li>)}
        </ol>
      )}

      {activeTab === 'Picture Quality Guide' && <PictureQualityGuide />}

      {activeTab === 'Care' && <p className="text-sm">{product.careText}</p>}

      {activeTab === 'FAQ' && (
        <div className="space-y-4">
          {product.faq.map((entry) => (
            <div key={entry.question}>
              <p className="font-medium text-sm">{entry.question}</p>
              <p className="text-sm text-charcoal/70">{entry.answer}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- ProductTabs`
Expected: PASS (3 tests)

- [ ] **Step 6: Write the failing test for `VideoRail`**

```tsx
// apps/web/components/product/VideoRail.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VideoRail } from './VideoRail';
import type { ProductMedia } from '@bro-pics/shared';

describe('VideoRail', () => {
  it('renders nothing when there is no video media', () => {
    const { container } = render(<VideoRail media={[{ id: 'm1', productId: 'p1', variantId: null, type: 'image', url: '/a.svg', alt: '', sortOrder: 0 }]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a video element for each video media item', () => {
    const media: ProductMedia[] = [
      { id: 'm1', productId: 'p1', variantId: null, type: 'video', url: '/clip.mp4', alt: 'In motion', sortOrder: 0 },
    ];
    render(<VideoRail media={media} />);
    expect(screen.getByTestId('video-rail')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- VideoRail`
Expected: FAIL — stub always returns `null`

- [ ] **Step 8: Implement `VideoRail`**

```tsx
// apps/web/components/product/VideoRail.tsx
import type { ProductMedia } from '@bro-pics/shared';

export function VideoRail({ media }: { media: ProductMedia[] }) {
  const videos = media.filter((m) => m.type === 'video');
  if (videos.length === 0) return null;

  return (
    <section data-testid="video-rail" className="mt-10">
      <h2 className="font-display text-2xl mb-4">In Motion</h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {videos.map((video) => (
          <video key={video.id} src={video.url} controls className="w-48 aspect-[9/16] object-cover rounded-lg flex-shrink-0" />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- VideoRail`
Expected: PASS (2 tests)

- [ ] **Step 10: Run the full web package suite**

Run: `pnpm --filter @bro-pics/web test`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add apps/web/components/product/ProductTabs.tsx apps/web/components/product/ProductTabs.test.tsx apps/web/components/product/PictureQualityGuide.tsx apps/web/components/product/VideoRail.tsx apps/web/components/product/VideoRail.test.tsx
git commit -m "feat(web): add PDP tabbed info, picture quality guide, and video rail"
```

---

### Task 8: Reviews with rating breakdown, related products

**Files:**
- Modify: `apps/web/components/product/ReviewsSection.tsx` (replaces Task 5's stub)
- Test: `apps/web/components/product/ReviewsSection.test.tsx`
- Modify: `apps/web/components/product/RelatedProducts.tsx` (replaces Task 5's stub)
- Test: `apps/web/components/product/RelatedProducts.test.tsx`

**Interfaces:**
- Consumes: `Product`, `Review` (Task 1); `ProductRail` from `apps/web/components/home/ProductRail.tsx` (Plan A, existing).
- Produces: real `ReviewsSection`, `RelatedProducts` — Task 5's page already imports both by these exact names.

- [ ] **Step 1: Write the failing test for `ReviewsSection`**

```tsx
// apps/web/components/product/ReviewsSection.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviewsSection } from './ReviewsSection';
import type { Product, Review } from '@bro-pics/shared';

const product = {
  id: 'p1', title: 'Frame', slug: 'frame', categoryId: 'cat_frames', shortDesc: '', descriptionHtml: '',
  highlights: [], howItWorks: [], careText: '', basePrice: 0, isActive: true, isFeatured: false, badges: [],
  dispatchDaysMin: 3, dispatchDaysMax: 5, photoSlots: 1, allowsTextPersonalization: false, seo: {},
  createdAt: new Date(), updatedAt: new Date(), availableSizes: [], availableColours: [], availableMaterials: [],
  minPrice: 0, maxPrice: 0, occasionTags: [], inStock: true, ratingAverage: 4.5, ratingCount: 2,
  titleLower: '', searchTokens: [], faq: [], primaryImageUrl: '', hoverImageUrl: null,
} satisfies Product;

const reviews: Review[] = [
  { id: 'r1', productId: 'p1', userId: 'u1', rating: 5, title: 'Great', body: 'Loved it', media: [], isVerified: true, status: 'approved', createdAt: new Date('2026-02-01') },
  { id: 'r2', productId: 'p1', userId: 'u2', rating: 4, title: 'Good', body: 'Nice quality', media: [], isVerified: false, status: 'approved', createdAt: new Date('2026-01-01') },
];

describe('ReviewsSection', () => {
  it('shows the rating average and count', () => {
    render(<ReviewsSection product={product} reviews={reviews} />);
    expect(screen.getByText('4.5')).toBeInTheDocument();
    expect(screen.getByText('(2 reviews)')).toBeInTheDocument();
  });

  it('lists reviews with the most recent first', () => {
    render(<ReviewsSection product={product} reviews={reviews} />);
    const titles = screen.getAllByTestId('review-title').map((el) => el.textContent);
    expect(titles).toEqual(['Great', 'Good']);
  });

  it('shows a rating breakdown bar for each star level', () => {
    render(<ReviewsSection product={product} reviews={reviews} />);
    expect(screen.getAllByTestId('rating-breakdown-row')).toHaveLength(5);
  });

  it('shows an empty state when there are no reviews', () => {
    render(<ReviewsSection product={{ ...product, ratingCount: 0 }} reviews={[]} />);
    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- ReviewsSection`
Expected: FAIL — stub returns `null`

- [ ] **Step 3: Implement `ReviewsSection`**

```tsx
// apps/web/components/product/ReviewsSection.tsx
import type { Product, Review } from '@bro-pics/shared';

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function ReviewsSection({ product, reviews }: { product: Product; reviews: Review[] }) {
  const sorted = [...reviews].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const breakdown = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }));
  const maxCount = Math.max(1, ...breakdown.map((b) => b.count));

  return (
    <section id="reviews" className="mt-12">
      <h2 className="font-display text-2xl mb-4">Reviews</h2>

      {reviews.length === 0 ? (
        <p className="text-sm text-charcoal/70">No reviews yet — be the first to share yours.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-3xl font-medium">{product.ratingAverage}</span>
            <span className="text-sm text-charcoal/70">({product.ratingCount} reviews)</span>
          </div>

          <div className="mb-6 max-w-sm">
            {breakdown.map(({ star, count }) => (
              <div key={star} data-testid="rating-breakdown-row" className="flex items-center gap-2 text-xs mb-1">
                <span className="w-8">{star}★</span>
                <div className="flex-1 h-2 bg-cream rounded-full overflow-hidden">
                  <div className="h-full bg-terracotta" style={{ width: `${(count / maxCount) * 100}%` }} />
                </div>
                <span className="w-6 text-right">{count}</span>
              </div>
            ))}
          </div>

          <ul className="space-y-4">
            {sorted.map((review) => (
              <li key={review.id} className="border-b border-charcoal/10 pb-4">
                <div className="flex items-center justify-between">
                  <span data-testid="review-title" className="font-medium text-sm">{review.title}</span>
                  <span className="text-xs text-charcoal/50">{formatDate(review.createdAt)}</span>
                </div>
                <p className="text-xs text-sage mb-1">{'★'.repeat(review.rating)}{review.isVerified && ' · Verified purchase'}</p>
                <p className="text-sm text-charcoal/80">{review.body}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- ReviewsSection`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing test for `RelatedProducts`**

```tsx
// apps/web/components/product/RelatedProducts.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RelatedProducts } from './RelatedProducts';
import type { Product } from '@bro-pics/shared';

const makeProduct = (id: string): Product => ({
  id, title: `Product ${id}`, slug: id, categoryId: 'cat_frames', shortDesc: '', descriptionHtml: '',
  highlights: [], howItWorks: [], careText: '', basePrice: 0, isActive: true, isFeatured: false, badges: [],
  dispatchDaysMin: 3, dispatchDaysMax: 5, photoSlots: 1, allowsTextPersonalization: false, seo: {},
  createdAt: new Date(), updatedAt: new Date(), availableSizes: [], availableColours: [], availableMaterials: [],
  minPrice: 0, maxPrice: 0, occasionTags: [], inStock: true, ratingAverage: 0, ratingCount: 0,
  titleLower: '', searchTokens: [], faq: [], primaryImageUrl: '', hoverImageUrl: null,
});

describe('RelatedProducts', () => {
  it('renders nothing when there are no related products', () => {
    const { container } = render(<RelatedProducts products={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a rail titled "You May Also Like" with each product', () => {
    render(<RelatedProducts products={[makeProduct('a'), makeProduct('b')]} />);
    expect(screen.getByText('You May Also Like')).toBeInTheDocument();
    expect(screen.getByText('Product a')).toBeInTheDocument();
    expect(screen.getByText('Product b')).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- RelatedProducts`
Expected: FAIL — stub returns `null` unconditionally

- [ ] **Step 7: Implement `RelatedProducts`, reusing Plan A's `ProductRail`**

```tsx
// apps/web/components/product/RelatedProducts.tsx
import type { Product } from '@bro-pics/shared';
import { ProductRail } from '../home/ProductRail';

export function RelatedProducts({ products }: { products: Product[] }) {
  if (products.length === 0) return null;
  return <ProductRail title="You May Also Like" products={products} />;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- RelatedProducts`
Expected: PASS (2 tests)

- [ ] **Step 9: Run the full web package suite**

Run: `pnpm --filter @bro-pics/web test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add apps/web/components/product/ReviewsSection.tsx apps/web/components/product/ReviewsSection.test.tsx apps/web/components/product/RelatedProducts.tsx apps/web/components/product/RelatedProducts.test.tsx
git commit -m "feat(web): add PDP reviews with rating breakdown and related products rail"
```

---

### Task 9: Migrate `ProductCard` to denormalized card images

**Files:**
- Modify: `apps/web/components/product/ProductCard.tsx`
- Test: `apps/web/components/product/ProductCard.test.tsx` (create if it doesn't already exist; extend in place if it does)

**Interfaces:**
- Consumes: `Product.primaryImageUrl`/`Product.hoverImageUrl` (Task 1).
- Produces: no change to `ProductCard`'s own props or exports — every existing caller (`ProductRail`, category grid, search results) is unaffected.

- [ ] **Step 1: Write the failing test for the image source**

```tsx
// apps/web/components/product/ProductCard.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProductCard } from './ProductCard';
import type { Product } from '@bro-pics/shared';

const product = {
  id: 'p1', title: 'Classic Wooden Photo Frame', slug: 'classic-wooden-frame', categoryId: 'cat_frames',
  shortDesc: '', descriptionHtml: '', highlights: [], howItWorks: [], careText: '', basePrice: 0,
  isActive: true, isFeatured: false, badges: [], dispatchDaysMin: 3, dispatchDaysMax: 5, photoSlots: 1,
  allowsTextPersonalization: false, seo: {}, createdAt: new Date(), updatedAt: new Date(),
  availableSizes: [], availableColours: [], availableMaterials: [], minPrice: 79900, maxPrice: 79900,
  occasionTags: [], inStock: true, ratingAverage: 0, ratingCount: 0, titleLower: '', searchTokens: [],
  faq: [], primaryImageUrl: '/placeholders/products/classic-wooden-frame-1.svg', hoverImageUrl: '/placeholders/products/classic-wooden-frame-2.svg',
} satisfies Product;

describe('ProductCard', () => {
  it('renders the primary and hover images from the product\'s denormalized fields', () => {
    render(<ProductCard product={product} />);
    const primaryImg = screen.getByAltText('Classic Wooden Photo Frame') as HTMLImageElement;
    expect(primaryImg.src).toContain('/placeholders/products/classic-wooden-frame-1.svg');
  });

  it('renders no hover image element when hoverImageUrl is null', () => {
    render(<ProductCard product={{ ...product, hoverImageUrl: null }} />);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- ProductCard`
Expected: FAIL if `ProductCard.test.tsx` didn't previously exist (new file, current implementation still passes the slug-derived-src assertion but the test as written above expects the field-derived src, which the current code doesn't yet produce) — or PASS-then-fails on the second test if a prior test file already covered the slug convention; either way this step's job is to confirm the current slug-based implementation does not yet satisfy these assertions

- [ ] **Step 3: Update `ProductCard` to use the denormalized fields**

```tsx
// apps/web/components/product/ProductCard.tsx
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
    <Link href={`/product/${product.slug}`} className="block rounded-lg overflow-hidden bg-surface group">
      <div className="relative aspect-square bg-cream">
        <img
          src={product.primaryImageUrl}
          alt={product.title}
          className={`w-full h-full object-cover transition-opacity ${product.hoverImageUrl ? 'group-hover:opacity-0' : ''}`}
        />
        {product.hoverImageUrl && (
          <img
            src={product.hoverImageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity"
          />
        )}
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
              ★ <span>{product.ratingAverage}</span> ({product.ratingCount})
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- ProductCard`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full web package suite**

Run: `pnpm --filter @bro-pics/web test`
Expected: PASS — including any pre-existing homepage/category tests that render `ProductCard` with fixture products; if any fixture is missing `primaryImageUrl`/`hoverImageUrl` (added to `ProductSchema` in Task 1 without a default, so every fixture must supply them), update that fixture now rather than adding a schema default, since real product data should never be missing its card image.

- [ ] **Step 6: Verify the production build compiles**

Run: `pnpm --filter @bro-pics/web build`
Expected: same live-Firestore caveat as prior tasks — confirm no TypeScript/syntax errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/product/ProductCard.tsx apps/web/components/product/ProductCard.test.tsx
git commit -m "feat(web): migrate ProductCard to denormalized primary/hover images"
```

---

## Self-Review Notes

**Spec coverage check against `docs/superpowers/specs/2026-08-31-storefront-pdp-design.md`:**
- §2.1 `ProductMediaSchema` → Task 1. §2.2 denormalized card images + `onMediaWritten` → Tasks 1-2. §2.3 gallery fallback rule → `selectGalleryMedia` (Task 4), exercised by seed data's partial-variant-media product (Task 3) and by `ProductDetailClient`'s fallback test (Task 6). §2.4 `ReviewSchema.createdAt` → Task 1, seeded in Task 3, sorted in Task 4/rendered in Task 8. §2.5 `faq` field → Task 1, seeded in Task 3, rendered in Task 7. ✅
- §3 static+ISR, client-side variant state, SEO/JSON-LD → Task 5. ✅
- §4 page structure (breadcrumb through related products) → breadcrumb is the one element from §4 not separately covered by any task; **gap found during self-review, folded into Task 5's page shell** (see Step 3's fix below) rather than left implicit.
- §5 content policy (fresh FAQ copy) → Task 3, Step 3 explicitly instructs fresh per-product FAQ text rather than reuse.
- §6 build order → this plan's task sequence follows it exactly (data layer → route/data fetching → above-the-fold → below-the-fold → ProductCard migration).
- §7 testing expectations (schema tests, denormalization tests, `getProductBySlug` data assembly, fallback rule, index verification) → Tasks 1, 2, 4, 3 (Step 7) respectively. ✅

**Fix applied during self-review:** §4 requires a breadcrumb (Home / Category / Product) at the top of the page, which no task explicitly built. Added to Task 5.

**Placeholder scan:** no "TBD"/"TODO" in any code block. Task 3 Step 3 intentionally leaves the wording of 7 products' FAQ entries to the implementer rather than dictating exact text — this is a content-authorship judgment call within stated constraints (1-2 entries, product-relevant, fresh copy), not a missing-implementation placeholder.

**Type consistency check:** `ProductMedia`/`ProductDetail`/`selectGalleryMedia` signatures are identical between their Task 4 definition and their Tasks 5, 6, 8 consumers. `BuyBox`'s prop names (`selectedSize`, `selectedColour`, `onSelectSize`, `onSelectColour`) match exactly between its Task 6 definition and `ProductDetailClient`'s call site in the same task. `ReviewsSection`/`RelatedProducts`/`ProductTabs`/`VideoRail` all keep the exact prop signatures Task 5's page already calls them with, so no later task requires editing the page shell again.
