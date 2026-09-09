# Phase 6, Plan D — Performance Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three measured defects: no `next/image` usage anywhere in the app (no responsive images, no lazy-loading, no AVIF/WebP), a silently broken font pipeline (Tailwind's `fontFamily.display`/`fontFamily.sans` reference CSS custom properties that are never defined), and unexplained ~130 kB First Load JS weight on `/product/[slug]` and `/checkout` versus the homepage.

**Architecture:** Convert all six raw-`<img>` sites to `next/image` after adding `images.remotePatterns` for the one real remote host (`storage.googleapis.com`, used by user-uploaded customization photos — product/category images are same-origin `/placeholders/...` files needing no remote config). Wire two `next/font/google` fonts into `apps/web/app/layout.tsx`, feeding the two CSS variable names Tailwind already expects. Investigate the Firebase-SDK-driven bundle weight with the `@next/bundle-analyzer` wiring already committed (`675bb95`), fixing only if a concrete, confirmed cause is found.

**Tech Stack:** Next.js 15 App Router (`apps/web`), `next/image`, `next/font/google`, `@next/bundle-analyzer` (already installed).

## Global Constraints

- Branch: `feature/admin-panel-and-production-queue` (current branch, do not create a new one). Commit after every task.
- `images.remotePatterns` covers exactly `storage.googleapis.com` — do not add a placeholder/example production domain; that stays client-pending per PROJECT_STATUS.md §6, same as the SEO plan's `NEXT_PUBLIC_SITE_URL` handling.
- Do not touch Konva/`react-konva` loading (already correctly isolated behind two chained `next/dynamic({ssr:false})` calls — confirmed by recon, out of scope) or any date/utility library (none exist in this repo).
- Do not restructure `auth-context.tsx`/`cart-context.tsx`'s initialization architecture. Task 4 is an investigation with a narrow, confirmed-cause-only fix — not a redesign.
- No new `sizes`/`next/image` convention exists in this codebase before this plan — the values below are this plan's decisions, not something to rediscover per task.
- Every task that changes rendered markup must be checked in a running dev server (Step "Manual check") before commit — these are UI files with no existing unit-test coverage for their JSX output, so a passing `pnpm -r test` alone does not prove the image renders correctly.

---

### Task 1: `next.config.ts` remote image config + `ProductCard` + `Gallery`

**Files:**
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/components/product/ProductCard.tsx`
- Modify: `apps/web/components/product/Gallery.tsx`

**Interfaces:**
- Produces: the `sizes` convention every later task in this plan reuses — rail/grid product images: `sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"`. Fixed-size thumbnails (Gallery's 64×64 strip, CartDrawer's 40×40) use explicit `width`/`height` instead of `fill`.

- [ ] **Step 1: Add `images.remotePatterns`**

Edit `apps/web/next.config.ts` — add an `images` key to `nextConfig` (keep the existing `transpilePackages`/`webpack` keys untouched):

```ts
const nextConfig: NextConfig = {
  transpilePackages: ['@bro-pics/shared'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'storage.googleapis.com' }],
  },
  webpack: (config) => {
    // ...unchanged...
  },
};
```

- [ ] **Step 2: Convert `ProductCard.tsx` to `next/image`**

Replace the two `<img>` tags in `apps/web/components/product/ProductCard.tsx` (the primary + hover image inside the `relative aspect-square` wrapper). Add `import Image from 'next/image';` at the top. Replace lines 16-31 with:

```tsx
{product.primaryImageUrl ? (
  <Image
    src={product.primaryImageUrl}
    alt={product.title}
    fill
    sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
    className={`object-cover transition-opacity ${product.hoverImageUrl ? 'group-hover:opacity-0' : ''}`}
  />
) : (
  <div className="w-full h-full bg-cream" />
)}
{product.hoverImageUrl && (
  <Image
    src={product.hoverImageUrl}
    alt=""
    fill
    sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 20vw"
    className="absolute inset-0 object-cover opacity-0 group-hover:opacity-100 transition-opacity"
  />
)}
```

`fill` requires an ancestor with `position: relative` and a defined size — the wrapping `<div className="relative aspect-square bg-cream">` (line 15, unchanged) already satisfies this.

- [ ] **Step 3: Convert `Gallery.tsx`'s main image and thumbnails to `next/image`; leave the zoom-modal image as a plain `<img>`**

Add `import Image from 'next/image';` to `apps/web/components/product/Gallery.tsx`.

Replace the main active-image block (lines 32-37):

```tsx
<Image
  src={active.url}
  alt={active.alt || productTitle}
  onClick={() => setIsZoomed(true)}
  fill
  sizes="(max-width: 768px) 100vw, 50vw"
  priority
  className="object-cover cursor-zoom-in"
/>
```

(`priority` because this is the PDP's above-the-fold hero image — a real LCP candidate on the product page.)

Replace the thumbnail image (line 55):

```tsx
<Image src={item.url} alt="" fill sizes="64px" className="object-cover" />
```

The thumbnail's parent `<button>` (line 48) already has `w-16 h-16` (64px) and no `position: relative` — add `relative` to that button's className so `fill` has a positioning context: change `className={\`w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border-2 ${...}\`}` to `className={\`relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border-2 ${...}\`}`.

Leave the zoom-modal `<img>` (line 67, inside the `isZoomed` block) as a plain `<img>` — it renders only after a click (not part of any route's initial JS/image weight), and its container is `max-w-full max-h-full` with no fixed dimensions, which doesn't fit `next/image`'s `fill`-needs-a-sized-ancestor or `width`/`height`-needs-known-dimensions model without inventing a fake size. This is a deliberate exception, not an oversight.

- [ ] **Step 4: Manual check**

Run `pnpm --filter @bro-pics/web dev`, open the homepage (product rail) and a product detail page. Confirm: product images render (not broken), hover-swap still works on a product card, the PDP gallery's main image and thumbnails render and clicking a thumbnail switches the main image, clicking the main image still opens the zoom modal.

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @bro-pics/web typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/next.config.ts apps/web/components/product/ProductCard.tsx apps/web/components/product/Gallery.tsx
git commit -m "feat(perf): add images.remotePatterns and convert ProductCard/Gallery to next/image"
```

---

### Task 2: `HeroSlider`, `CategoryTiles`, `WhyUs`, `CartDrawer` — convert to `next/image`

**Files:**
- Modify: `apps/web/components/home/HeroSlider.tsx`
- Modify: `apps/web/components/home/CategoryTiles.tsx`
- Modify: `apps/web/components/home/WhyUs.tsx`
- Modify: `apps/web/components/layout/CartDrawer.tsx`

**Interfaces:**
- Consumes: the `sizes` convention from Task 1.

- [ ] **Step 1: `HeroSlider.tsx` — preserve mobile/desktop art direction with two `next/image`s**

The current `<picture>`+`<source>` shows a different crop on mobile vs desktop — `next/image` doesn't support per-breakpoint art direction through a single element, so this needs two `Image`s toggled by CSS visibility (a standard, documented `next/image` pattern for this exact case). Add `import Image from 'next/image';` and replace the `<picture>` block (lines 7-10):

```tsx
<div className="relative w-full h-[420px]">
  <Image
    src={section.mobileImage}
    alt={section.title}
    fill
    priority
    sizes="100vw"
    className="object-cover md:hidden"
  />
  <Image
    src={section.image}
    alt={section.title}
    fill
    priority
    sizes="100vw"
    className="object-cover hidden md:block"
  />
</div>
```

Remove the now-unused `<section className="relative">` wrapper's redundant nesting is not required — keep `<section className="relative">` as the outer element (unchanged) and place the new `<div>` above as its first child, replacing only the old `<picture>...</picture>`.

`priority` on both — only one is visible at a time per breakpoint via CSS, and Next's `priority` preload hint is inert for the hidden one (no separate network cost beyond the responsive image Next would fetch anyway for that breakpoint).

- [ ] **Step 2: `CategoryTiles.tsx`**

Add `import Image from 'next/image';`. Replace line 11:

```tsx
<div className="relative w-24 h-24">
  <Image src={category.image} alt={category.name} fill sizes="96px" className="rounded-full object-cover" />
</div>
```

(Wrapped in a sized `relative` div since the original `<img>` had no wrapper of its own — `w-24 h-24` = 96px, matching the original `w-24 h-24` classes moved onto the new wrapper.)

- [ ] **Step 3: `WhyUs.tsx`**

Add `import Image from 'next/image';`. Replace line 6:

```tsx
<div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden">
  <Image src={section.image} alt={section.title} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
</div>
```

(The original `<img className="rounded-lg w-full" />` had no explicit aspect ratio — `aspect-[4/3]` is a reasonable content-image ratio consistent with this section's `md:grid-cols-2` layout; adjust only if manual check in Step 5 shows visible distortion against real seed images.)

- [ ] **Step 4: `CartDrawer.tsx`**

Add `import Image from 'next/image';`. Replace lines 37-40:

```tsx
{item.previewUrl && (
  <div className="relative w-10 h-10 flex-shrink-0">
    <Image src={item.previewUrl} alt={item.title} fill sizes="40px" className="object-cover rounded" />
  </div>
)}
```

Remove the `// eslint-disable-next-line @next/next/no-img-element` comment — it's no longer needed once this is a real `next/image`, and its presence was a pre-existing signal that this lint rule is active in this project's ESLint config (confirming `next/image` adoption is genuinely the intended direction here, not just this plan's preference).

- [ ] **Step 5: Manual check**

Run `pnpm --filter @bro-pics/web dev`. On the homepage: confirm the hero banner renders correctly at both mobile width (resize to <768px) and desktop width, confirm category tiles render as circles, confirm the "why us" section image isn't visibly stretched/cropped wrong. Add an item to the cart and open the cart drawer; confirm the line-item thumbnail renders.

- [ ] **Step 6: Run typecheck**

Run: `pnpm --filter @bro-pics/web typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/home/HeroSlider.tsx apps/web/components/home/CategoryTiles.tsx apps/web/components/home/WhyUs.tsx apps/web/components/layout/CartDrawer.tsx
git commit -m "feat(perf): convert HeroSlider, CategoryTiles, WhyUs, CartDrawer to next/image"
```

---

### Task 3: Fix the broken font pipeline with `next/font/google`

**Files:**
- Modify: `apps/web/app/layout.tsx`

**Interfaces:**
- Produces: `--font-display` and `--font-sans` CSS custom properties on `<html>`, consumed by `apps/web/tailwind.config.ts`'s existing (unchanged) `fontFamily.display`/`fontFamily.sans` definitions.

- [ ] **Step 1: Choose and wire two `next/font/google` fonts**

Edit `apps/web/app/layout.tsx`. Add near the top, after the existing imports:

```ts
import { Playfair_Display, Inter } from 'next/font/google';

const displayFont = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const sansFont = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});
```

(`Playfair_Display` is a warm serif matching the terracotta/sage/cream "personalized, crafted" palette already in `tailwind.config.ts`; `Inter` is a standard, highly-legible sans for body copy and form/staff UI. Both are self-hosted by `next/font/google` at build time — no runtime request to Google, no render-blocking `<link>`.)

- [ ] **Step 2: Apply the variable classes to `<html>`**

Change line 30 (`<html lang="en">`) to:

```tsx
<html lang="en" className={`${displayFont.variable} ${sansFont.variable}`}>
```

Leave `<body className="bg-cream text-charcoal font-sans">` (line 31) unchanged — Tailwind's `font-sans` utility now resolves `var(--font-sans)` to the real `Inter` font instead of an undefined custom property.

- [ ] **Step 3: Manual check**

Run `pnpm --filter @bro-pics/web dev`, open the homepage. Use the browser's dev tools (or `javascript_tool`/`getComputedStyle`) on an `h1`/`h2` with the `font-display` class (e.g. the hero title) and confirm `getComputedStyle(el).fontFamily` reports the display font's actual family name (e.g. `"Playfair Display"`), not a browser default like `Times New Roman` or `-apple-system`. Repeat for a `font-sans` body element.

- [ ] **Step 4: Run typecheck and full test suite**

Run: `pnpm --filter @bro-pics/web typecheck && pnpm -r test`
Expected: clean — this is a layout-level change with no new logic, so no new tests are required, but existing snapshot/rendering tests (if any touch `layout.tsx`) must still pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/layout.tsx
git commit -m "fix(perf): wire next/font/google to the previously-undefined --font-display/--font-sans variables"
```

---

### Task 4: Investigate and (if confirmed) fix Firebase-SDK route weight

**Files:**
- Read: `apps/web/lib/auth-context.tsx`, `apps/web/lib/cart-context.tsx`, `apps/web/lib/firebase-client.ts`, `apps/web/lib/firebase-functions-client.ts`, `apps/web/components/layout/LayoutChrome.tsx`
- Modify: none guaranteed — only if Step 2 finds a concrete, confirmed cause

**Interfaces:**
- Consumes: `ANALYZE=true pnpm --filter @bro-pics/web build` (bundle-analyzer wiring committed in `675bb95`), producing `apps/web/.next/analyze/client.html`.

- [ ] **Step 1: Establish the baseline empirically**

Run: `ANALYZE=true pnpm --filter @bro-pics/web build`

Record the route table's First Load JS for `/`, `/product/[slug]`, `/checkout` (these should roughly match this plan's design doc baseline of 106 kB / 241 kB / 236 kB, though Tasks 1-3's changes may shift the exact numbers slightly — record what you actually see, not the design doc's numbers verbatim).

- [ ] **Step 2: Find which routes' entrypoints actually reference the Firebase chunks**

Open `apps/web/.next/analyze/client.html` and inspect the `window.entrypoints` data embedded in the page (search the raw HTML for `entrypoints =`) to see which route entrypoints include the large Firebase chunks (the ones containing `@firebase/firestore`, `@firebase/auth`, `@firebase/app`/`@firebase/util`). Cross-reference against `apps/web/app/layout.tsx` (root layout wraps every route in `AuthProvider`/`CartProvider`, both of which statically import `firebase/auth`/`firebase/firestore`/`firebase/functions` at module scope) — the open question this step answers is *why the homepage's First Load JS doesn't already reflect that same weight* if these providers wrap every route. Read `apps/web/lib/auth-context.tsx` and `apps/web/lib/cart-context.tsx` in full to check for any conditional/lazy initialization (e.g., Firebase calls deferred to `useEffect` rather than module scope, which would explain why the *initial* JS payload can still differ from route to route despite both providers being present everywhere).

- [ ] **Step 3: Decide whether there's a confirmed, fixable cause**

Two honest outcomes, both acceptable:

- **A concrete cause is found** (e.g., a page directly re-imports `firebase/firestore` for a feature that could reuse the already-initialized `CartContext`/`AuthContext` state instead, or a specific import pulls in more of the SDK than needed). Apply the minimal fix, then re-run `ANALYZE=true pnpm --filter @bro-pics/web build` and confirm the target route's First Load JS actually decreased. If it didn't decrease, revert the change — this task does not ship an unconfirmed "fix."
- **No fixable cause is found** — the weight is inherent to genuinely needing live Firestore/Auth on those specific routes (e.g., checkout's real-time order-status listener, the product page's stock/price live updates), and the homepage/other lighter routes simply don't invoke those code paths at all despite the providers being present (Next's per-route client reference tracking only bundles what a route's rendered tree actually references at the module level, not everything a shared provider component merely could use). In this case, do not force a change — write up the finding for Step 4 to record.

- [ ] **Step 4: Record the finding**

Whichever outcome: write one paragraph (for use in Task 5's `PROJECT_STATUS.md` update) stating what was found, whether a fix was applied, and the before/after First Load JS numbers for `/product/[slug]` and `/checkout` if a fix was applied.

- [ ] **Step 5: Commit (only if a code fix was made in Step 3)**

```bash
git add <changed files>
git commit -m "fix(perf): <specific, confirmed cause and fix — fill in from Step 3>"
```

If no fix was made, skip this step — there's nothing to commit for this task, and that's a valid, expected outcome per this plan's own "no speculative fixes" principle.

---

### Task 5: Final verification and `PROJECT_STATUS.md` update

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Run the full test suite**

Run: `pnpm -r test`
Expected: every workspace passes.

- [ ] **Step 2: Run typecheck across every workspace**

Run: `pnpm -r typecheck`
Expected: clean.

- [ ] **Step 3: Run lint**

Run: `pnpm --filter @bro-pics/web lint` (or the repo's equivalent lint script — check `apps/web/package.json`'s `scripts` if the exact name differs)
Expected: clean — Task 2 removed an existing `@next/next/no-img-element` eslint-disable comment, so this step confirms no other suppressed instances were missed and no new `next/image` misuse (missing `alt`, missing `sizes` on a `fill` image, etc.) was introduced across all six converted files.

- [ ] **Step 4: Capture the final before/after build table**

Run: `pnpm --filter @bro-pics/web build` (no `ANALYZE=true` needed for this one — that was Task 4's diagnostic step). Record the final route table.

- [ ] **Step 5: Update `PROJECT_STATUS.md`**

Add a `6d` roadmap row to §3 for "Phase 6 Plan D — Performance pass", complete, on `feature/admin-panel-and-production-queue`, linking the design and plan docs (match the `6a`/`6b`/`6c` rows' exact format). Include: (1) the before/after First Load JS table for `/`, `/product/[slug]`, `/checkout` (baseline from this design doc's §1 vs. Step 4's final numbers); (2) a one-line note on Task 4's outcome (fixed-and-confirmed, or investigated-and-not-fixable-without-architecture-change — whichever it was); (3) confirmation that this closes out Phase 6's buildable scope, with analytics remaining explicitly skip-and-noted per the standing instruction (needs a live Google Analytics property). Update §4's test count if it changed.

Also update §3's Phase 6 top-level row (if one summarizes all of Plan A/B/C/D) to read as fully complete rather than "in progress."

- [ ] **Step 6: Commit**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: record Phase 6 Plan D completion in PROJECT_STATUS.md"
```
