# Phase 6, Plan C — SEO Essentials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the SEO artifacts this project has never had — sitemap, robots.txt, category-page metadata, and a non-indexable search page — reusing the existing `NEXT_PUBLIC_SITE_URL` convention and mirroring the product page's already-correct `generateMetadata` pattern.

**Architecture:** Two new Next.js 15 App Router file-convention routes (`sitemap.ts`, `robots.ts`, both built-in, no new package), one new `generateMetadata` export on the existing category page (structurally identical to the product page's), one new static `metadata` export on the existing search page.

**Tech Stack:** Next.js App Router (`apps/web`), Vitest.

## Global Constraints

- Every new/changed piece of business logic gets a test in the same task that introduces it.
- Follow this codebase's existing patterns exactly: relative imports, the product page's `generateMetadata` test style (`apps/web/app/(shop)/product/[slug]/page.test.tsx`).
- Base URL convention: `process.env.NEXT_PUBLIC_SITE_URL ?? 'https://bropics.example.com'` — matches `apps/web/app/layout.tsx`'s existing `metadataBase` fallback exactly. Do not invent a different fallback or a different env var name.
- Do not build About/Contact/FAQ pages, sitewide JSON-LD, or per-product/category dynamic OG image generation — explicitly out of scope per the design doc.
- Branch: `feature/admin-panel-and-production-queue` (current branch, do not create a new one). Commit after every task.

---

### Task 1: `apps/web/app/sitemap.ts`

**Files:**
- Create: `apps/web/app/sitemap.ts`
- Create: `apps/web/app/sitemap.test.ts`

**Interfaces:**
- Consumes: `getAllActiveProductSlugs` (`apps/web/lib/firestore-product-detail.ts`, existing), `getActiveCategories` (`apps/web/lib/firestore-categories.ts`, existing).

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/sitemap.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/firestore-product-detail', () => ({
  getAllActiveProductSlugs: vi.fn(),
}));
vi.mock('../lib/firestore-categories', () => ({
  getActiveCategories: vi.fn(),
}));

import { getAllActiveProductSlugs } from '../lib/firestore-product-detail';
import { getActiveCategories } from '../lib/firestore-categories';
import sitemap from './sitemap';

describe('sitemap', () => {
  it('includes static routes, every active product, and every active category', async () => {
    vi.mocked(getAllActiveProductSlugs).mockResolvedValue(['classic-wooden-frame', 'canvas-print']);
    vi.mocked(getActiveCategories).mockResolvedValue([
      { id: 'cat_1', name: 'Frames', slug: 'frames-wall-decor', parentId: null, image: '', sortOrder: 1, isActive: true, seo: {} },
    ] as never);

    const result = await sitemap();
    const urls = result.map((entry) => entry.url);

    expect(urls).toContain(process.env.NEXT_PUBLIC_SITE_URL + '/');
    expect(urls).toContain(process.env.NEXT_PUBLIC_SITE_URL + '/search');
    expect(urls).toContain(process.env.NEXT_PUBLIC_SITE_URL + '/product/classic-wooden-frame');
    expect(urls).toContain(process.env.NEXT_PUBLIC_SITE_URL + '/product/canvas-print');
    expect(urls).toContain(process.env.NEXT_PUBLIC_SITE_URL + '/category/frames-wall-decor');
  });
});
```

(If `process.env.NEXT_PUBLIC_SITE_URL` isn't set in the test environment, the test's own assertions will naturally use whatever the fallback resolves to since they read the same env var the implementation does — no separate mock needed. Check `apps/web/vitest.config.ts`/test setup for whether `NEXT_PUBLIC_SITE_URL` is already set for tests; if not, this test still passes since both sides of each assertion read the same runtime value.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- sitemap.test.ts`
Expected: FAIL — the file doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/app/sitemap.ts`:

```ts
import type { MetadataRoute } from 'next';
import { getAllActiveProductSlugs } from '../lib/firestore-product-detail';
import { getActiveCategories } from '../lib/firestore-categories';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://bropics.example.com';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [productSlugs, categories] = await Promise.all([getAllActiveProductSlugs(), getActiveCategories()]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${baseUrl}/search`, changeFrequency: 'weekly', priority: 0.5 },
  ];

  const productRoutes: MetadataRoute.Sitemap = productSlugs.map((slug) => ({
    url: `${baseUrl}/product/${slug}`,
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  const categoryRoutes: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${baseUrl}/category/${category.slug}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- sitemap.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/sitemap.ts apps/web/app/sitemap.test.ts
git commit -m "feat(seo): add sitemap.ts covering static routes, products, and categories"
```

---

### Task 2: `apps/web/app/robots.ts`

**Files:**
- Create: `apps/web/app/robots.ts`
- Create: `apps/web/app/robots.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/robots.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import robots from './robots';

describe('robots', () => {
  it('disallows admin, staff, checkout, orders, and api routes', () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    expect(rules?.disallow).toEqual(
      expect.arrayContaining(['/admin', '/staff', '/checkout', '/orders', '/api'])
    );
  });

  it('references the sitemap URL', () => {
    const result = robots();
    expect(result.sitemap).toBe(`${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://bropics.example.com'}/sitemap.xml`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- robots.test.ts`
Expected: FAIL — the file doesn't exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/app/robots.ts`:

```ts
import type { MetadataRoute } from 'next';

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://bropics.example.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/staff', '/checkout', '/orders', '/api'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- robots.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/robots.ts apps/web/app/robots.test.ts
git commit -m "feat(seo): add robots.ts disallowing non-content routes"
```

---

### Task 3: `/search` page — mark non-indexable

**Files:**
- Modify: `apps/web/app/(shop)/search/page.tsx`
- Create: `apps/web/app/(shop)/search/page.test.tsx` (check first — if one already exists, extend it)

- [ ] **Step 1: Write the failing test**

Create (or extend) `apps/web/app/(shop)/search/page.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { metadata } from './page';

describe('search page metadata', () => {
  it('marks the page non-indexable but crawlable for links', () => {
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- "search/page.test.tsx"`
Expected: FAIL — no `metadata` export exists yet.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/app/(shop)/search/page.tsx`, add near the top (after imports, before the component):

```ts
import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: true },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- "search/page.test.tsx"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(shop)/search/page.tsx" "apps/web/app/(shop)/search/page.test.tsx"
git commit -m "feat(seo): mark /search non-indexable"
```

---

### Task 4: `/category/[slug]` — `generateMetadata`

**Files:**
- Modify: `apps/web/app/(shop)/category/[slug]/page.tsx`
- Create: `apps/web/app/(shop)/category/[slug]/page.test.tsx` (check first — if one already exists, extend it)

**Interfaces:**
- Consumes: `getCategoryBySlug` (`apps/web/lib/firestore-products.ts`, existing — already imported in this file for the page component itself).

- [ ] **Step 1: Write the failing test**

Create (or extend) `apps/web/app/(shop)/category/[slug]/page.test.tsx`, mirroring `apps/web/app/(shop)/product/[slug]/page.test.tsx`'s exact mocking style:

```tsx
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../lib/firestore-products', () => ({
  getCategoryBySlug: vi.fn(),
  searchProductsPage: vi.fn(),
}));

import { getCategoryBySlug } from '../../../../lib/firestore-products';
import { generateMetadata } from './page';

const mockCategory = {
  id: 'cat_frames', name: 'Frames & Wall Décor', slug: 'frames-wall-decor', parentId: null,
  image: '/placeholders/categories/frames.svg', sortOrder: 1, isActive: true,
  seo: { title: 'Frames & Wall Décor | BroPics', description: 'Shop our frame collection.' },
};

describe('category generateMetadata', () => {
  it('uses the category seo fields and image for OG image', async () => {
    vi.mocked(getCategoryBySlug).mockResolvedValue(mockCategory as never);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'frames-wall-decor' }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe('Frames & Wall Décor | BroPics');
    expect(metadata.description).toBe('Shop our frame collection.');
    expect(metadata.openGraph?.images).toEqual(['/placeholders/categories/frames.svg']);
  });

  it('falls back to name-derived title/description when seo fields are unset', async () => {
    vi.mocked(getCategoryBySlug).mockResolvedValue({ ...mockCategory, seo: {} } as never);

    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'frames-wall-decor' }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toBe('Frames & Wall Décor | BroPics');
  });

  it('returns fallback metadata when the category does not exist', async () => {
    vi.mocked(getCategoryBySlug).mockResolvedValue(null);
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: 'missing' }),
      searchParams: Promise.resolve({}),
    });
    expect(metadata.title).toBe('Category Not Found | BroPics');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- "category/\[slug\]/page.test.tsx"`
Expected: FAIL — `generateMetadata` isn't exported yet.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/app/(shop)/category/[slug]/page.tsx`, add `import type { Metadata } from 'next';` to the imports, then insert this function after the `CategoryPageProps` interface and before `CategoryPage`:

```ts
export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    return { title: 'Category Not Found | BroPics' };
  }

  const fallbackDescription = `Shop ${category.name} at BroPics.`;
  return {
    title: category.seo.title ?? `${category.name} | BroPics`,
    description: category.seo.description ?? fallbackDescription,
    alternates: { canonical: `/category/${category.slug}` },
    openGraph: {
      title: category.seo.title ?? category.name,
      description: category.seo.description ?? fallbackDescription,
      images: [category.image],
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- "category/\[slug\]/page.test.tsx"`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(shop)/category/[slug]/page.tsx" "apps/web/app/(shop)/category/[slug]/page.test.tsx"
git commit -m "feat(seo): add generateMetadata to category page, mirroring the product page"
```

---

### Task 5: Full verification and `PROJECT_STATUS.md` update

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Run the full test suite**

Run: `pnpm -r test`
Expected: every workspace passes, including all new/modified files above.

- [ ] **Step 2: Run typecheck across every workspace**

Run: `pnpm -r typecheck`
Expected: clean. This project's Phase 6 has hit real typecheck-only failures that `pnpm -r test` alone missed twice already (Plan A, Plan B) — do not skip this step.

- [ ] **Step 3: Update `PROJECT_STATUS.md`**

Add a `6c` roadmap row to §3 for "Phase 6 Plan C — SEO essentials", complete, on `feature/admin-panel-and-production-queue`, linking the design and plan docs (match the `6a`/`6b` rows' exact format). Update §4's test count. Add a new §5 gap bullet noting: (1) About/Contact/FAQ pages remain unbuilt despite being linked from the footer (a pre-existing gap this plan didn't create, surfaced by SEO work rather than caused by it), (2) sitemap/robots URLs are only correct once `NEXT_PUBLIC_SITE_URL` is set to the real production domain in the live environment (still a client-pending item per §6 — the code is domain-agnostic and needs no further changes once that's set), (3) no live verification has been done (fetching `/sitemap.xml`/`/robots.txt` against a running server) — note whether this task did or didn't do a local dev-server smoke check and say so honestly either way.

- [ ] **Step 4: Commit**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: record Phase 6 Plan C completion in PROJECT_STATUS.md"
```
