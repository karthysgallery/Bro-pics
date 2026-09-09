# Phase 6, Plan C — SEO Essentials — Design

**Date:** 2026-09-09
**Status:** Approved by user (continuous-execution directive), ready for implementation planning
**Depends on:** `apps/web/app/layout.tsx` (root metadata, already sets `metadataBase`/title/description), `apps/web/app/(shop)/product/[slug]/page.tsx`'s existing `generateMetadata` (the pattern this plan mirrors), `Category.seo`/`Product.seo` schemas (Foundation, `{ title?, description? }`)

## 1. Purpose and scope

PROJECT_STATUS.md confirms no SEO artifacts exist anywhere in the app: no `sitemap.xml`, no `robots.txt`, and — corrected by this plan's recon — most pages have no `generateMetadata` at all (the product detail page is the one exception, already correctly implemented since Storefront Plan B). This plan closes the gaps that don't require a live production domain: a sitemap, a robots policy, category-page metadata mirroring the product page's existing pattern, and marking the search-results page non-indexable (standard practice for a dynamic query page with duplicate-content risk).

Out of scope, deliberately:
- **Anything requiring the real production domain.** PROJECT_STATUS.md §6 already lists "domain" as a client-pending item. This plan reuses the existing `NEXT_PUBLIC_SITE_URL` convention (already wired into root `layout.tsx`'s `metadataBase`, currently `http://localhost:3000` in `.env.local` with a `https://bropics.example.com` code-level fallback) rather than inventing a new one — sitemap/robots URLs are correct relative to whatever that env var is set to, and will automatically become correct once the real domain is set there. No new placeholder domain logic is added.
- **About/Contact/FAQ pages.** These don't exist in the app tree at all (confirmed, not assumed) — the homepage footer links to them (`/about`, `/contact`, `/faq`) but nothing implements the routes. Building those pages is a content/product decision far outside an SEO plan's scope; a 404 there is a pre-existing gap, not something this plan should paper over by inventing site copy.
- **Sitewide `Organization`/`WebSite` JSON-LD structured data.** The product page already has `Product` JSON-LD (Storefront Plan B). Adding sitewide structured data is a real, separable enhancement, not required for "essentials," and risks scope creep into a plan that should stay small.
- **Per-product/per-category OG images beyond what already exists.** The product page's `generateMetadata` already sets `openGraph.images` from `product.primaryImageUrl` — this plan mirrors that exact approach for categories, nothing more elaborate (no dynamically-generated OG images, no `opengraph-image.tsx` route).

## 2. `apps/web/app/sitemap.ts`

Next.js 15's built-in file-convention API (`MetadataRoute.Sitemap`) — no new package (`next-sitemap` etc. isn't installed and isn't needed for App Router). Enumerates:
- Static routes: `/` (home), `/search` — included per Next.js convention even though `/search` itself is marked non-indexable in its own metadata (§4); a sitemap and a `noindex` directive serve different purposes (crawl discovery vs. index inclusion), and excluding a URL from the sitemap doesn't reliably stop crawling — the standard practice is `noindex` on the page itself, not omission from the sitemap. (`/checkout`, `/orders`, `/admin/*`, `/staff/*` are excluded — never meant to be crawled at all, not just deprioritized.)
- Every active product: `/product/{slug}`, reusing the existing `getAllActiveProductSlugs()` (`apps/web/lib/firestore-product-detail.ts`) — already used by the product page's own `generateStaticParams`, so this plan adds a second caller of an existing, proven function rather than writing new Firestore-read logic.
- Every active category: `/category/{slug}`, reusing the existing `getActiveCategories()` (`apps/web/lib/firestore-categories.ts`).

Base URL: `process.env.NEXT_PUBLIC_SITE_URL ?? 'https://bropics.example.com'` — matches `layout.tsx`'s existing fallback exactly, so both stay in sync if the env var is ever unset.

## 3. `apps/web/app/robots.ts`

Next.js 15's built-in file-convention API (`MetadataRoute.Robots`). Disallows `/admin`, `/staff`, `/checkout`, `/orders`, `/api` — all real, non-content routes that provide no value indexed and some of which (checkout, orders) are customer-account-specific pages that should never appear in search results. Allows everything else. References the sitemap URL (`${baseUrl}/sitemap.xml`) so crawlers that respect `robots.txt`'s `Sitemap:` directive find it without needing it linked elsewhere.

## 4. `/search` page — mark non-indexable

`apps/web/app/(shop)/search/page.tsx` gains a static `export const metadata: Metadata = { robots: { index: false, follow: true } };` (`follow: true` so crawlers still traverse links FROM a search-results page to real product pages, just don't index the search-results page itself as a destination). This is the standard, minimal-effort treatment for a query-string-driven results page — no `generateMetadata` needed since the directive doesn't vary per search term.

## 5. `/category/[slug]` — `generateMetadata`, mirroring the product page exactly

New `generateMetadata` function in `apps/web/app/(shop)/category/[slug]/page.tsx`, structurally identical to the product page's existing implementation (same fallback logic, same `alternates.canonical`, same `openGraph` shape) but reading `Category.seo`/`category.image` instead of `Product.seo`/`product.primaryImageUrl`:

```ts
export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: 'Category Not Found | BroPics' };
  return {
    title: category.seo.title ?? `${category.name} | BroPics`,
    description: category.seo.description ?? `Shop ${category.name} at BroPics.`,
    alternates: { canonical: `/category/${category.slug}` },
    openGraph: {
      title: category.seo.title ?? category.name,
      description: category.seo.description ?? `Shop ${category.name} at BroPics.`,
      images: [category.image],
    },
  };
}
```
(Exact fallback description copy is the implementer's call within this shape — the point is matching the product page's established pattern, not a specific string.)

## 6. Home page — no change

Root `layout.tsx` already provides a title/description that correctly describes the homepage (`'BroPics — Personalized Photo Frames'` / `'Custom photo frames, personalized and delivered.'`) — a page-level `generateMetadata` on `apps/web/app/(shop)/page.tsx` would only be worth adding if it needed to differ from those sitewide defaults, and nothing in this plan's scope calls for that. Not adding one is a deliberate no-op, not an oversight.

## 7. Testing

- `sitemap.ts`: unit test asserting the returned array includes the static routes, one entry per active product slug (mocking `getAllActiveProductSlugs`), and one entry per active category (mocking `getActiveCategories`) — matching this codebase's established pattern of testing App Router file-convention exports directly (the product page's `generateStaticParams`/`generateMetadata` already have precedent test coverage to follow).
- `robots.ts`: unit test asserting the disallow list and the sitemap reference URL.
- `/search`'s static metadata export: a simple assertion the exported object has `robots.index === false`.
- Category page `generateMetadata`: mirrors whatever test pattern the product page's own `generateMetadata` already uses (check `apps/web/app/(shop)/product/[slug]/page.test.tsx` if one exists covering `generateMetadata`, and match it) — covers the found-category case (title/description from `seo` fields, with and without them set) and the not-found case.
