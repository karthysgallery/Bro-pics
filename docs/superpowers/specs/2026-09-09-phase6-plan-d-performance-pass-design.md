# Phase 6, Plan D — Performance Pass — Design

**Date:** 2026-09-09
**Status:** Approved by user (continuous-execution directive), ready for implementation planning
**Depends on:** recon findings below, gathered by direct investigation (Explore subagent + a manual `@next/bundle-analyzer` pass, commit `675bb95`) before writing this doc — not assumptions.

## 1. Purpose and scope

Unlike Plans A/B/C, this plan doesn't close a missing-feature gap — it fixes three concrete, measured defects found by recon:

1. **Every content image in the app is a raw `<img>`.** `next/image` is imported nowhere (`ProductCard`, `Gallery`, `HeroSlider`, `CategoryTiles`, `WhyUs`, `CartDrawer`). No responsive `srcset`, no automatic AVIF/WebP, no native lazy-loading below the fold, no `priority` hint for the LCP image (the hero banner).
2. **The site's typography has been silently broken.** `tailwind.config.ts` declares `fontFamily.display`/`fontFamily.sans` referencing `var(--font-display)`/`var(--font-sans)`, but neither CSS variable is ever defined anywhere (`globals.css` has no `:root` block, no `next/font` injection). `font-display` is used across nearly every page (headers, product cards, checkout, orders, staff pages — 19 files). Every one of those elements has been rendering in the browser's default font, not even the declared `serif`/`sans-serif` fallback, since Tailwind emits `font-family: var(--font-display), serif` and an undefined custom property makes the whole declaration compute to nothing usable, not a graceful fallback to `serif`.
3. **`/product/[slug]` (241 kB First Load JS) and `/checkout` (236 kB) are ~130 kB heavier than the homepage (106 kB), and the bundle-analyzer pass identifies exactly why:** the Firebase client SDK is pulled into those route bundles — `@firebase/firestore` (~51 kB gzip), `@firebase/auth` (~25 kB gzip), `@firebase/app`+`@firebase/util`+`@firebase/component`+`tslib` (~9 kB gzip combined) — plus `zod` (~13 kB gzip) for schema validation. Together these ~98 kB gzip account for essentially the entire gap. The two shared-by-all chunks (103 kB gzip total) are confirmed to be pure Next.js framework + React DOM — not app bloat, nothing to trim there.

Each of these has a verifiable before/after. This plan does not include speculative "could optimize" items with no measured backing.

Out of scope, deliberately:
- **Analytics.** Needs a live Google Analytics property (client-pending) — already tracked in PROJECT_STATUS.md as skip-and-noted, unrelated to this plan.
- **Konva/react-konva bundle splitting.** Recon confirmed it is already correctly isolated behind two chained `next/dynamic({ssr:false})` calls (`BuyBox` → `PersonalizationEditor` → `EditorCanvas`) and never enters the main bundle. Nothing to fix.
- **Trimming heavy utility libraries** (lodash/moment/dayjs/date-fns). Recon confirmed none are present anywhere in the repo.
- **Restructuring how/when the Firebase Auth SDK initializes** (e.g., deferring `AuthProvider` itself, splitting `firebase/auth` from `firebase/firestore` into separate dynamic chunks). This is a deeper architectural change to `lib/auth-context.tsx`/`lib/cart-context.tsx` — real, but separable from "add `next/image`", genuinely more open-ended, and risks touching every page's initial auth-state handshake. This plan's Item 3 fix (below) is the safe, high-confidence slice of the Firebase-weight problem: switching from the default `firebase` barrel imports (if that's what's happening) to modular subpath imports only where the recon's build-output inspection during implementation confirms it helps. If the implementer's own bundle-analyzer check shows modular imports don't move the number (e.g., tree-shaking already applies), this item is reported as a documented non-fix, not forced through.

## 2. Item 1 — Adopt `next/image` for all content images

**Config prerequisite:** `apps/web/next.config.ts` currently has no `images` key at all, which would make `next/image` reject any remote URL outright. Recon-verified image hosts:
- Product/category `primaryImageUrl`/`hoverImageUrl`/`image` values are same-origin static files under `/placeholders/...` (`scripts/seed/src/data.ts:310`) — `next/image` handles local `public/` paths with no `remotePatterns` entry needed.
- User-uploaded customization photos (`apps/web/app/api/uploads/route.ts`, `apps/web/app/api/uploads/preview/route.ts`) are Firebase Admin SDK signed URLs, always on the fixed host `storage.googleapis.com` regardless of which Firebase project/bucket is active — not client-pending the way the production domain is. Add:
  ```ts
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'storage.googleapis.com' }],
  },
  ```

**Components to convert** (all six raw-`<img>` sites recon found, no others exist):
| File | Image(s) | Notes |
|---|---|---|
| `apps/web/components/product/ProductCard.tsx` | primary + hover image | Used by every grid/rail via `ProductRail`. `fill` inside the existing `aspect-square` wrapper (already has `position: relative`); `sizes` reflects the card's real rendered width in each context it's used (rail: `192px` fixed-width card; category grid: check the grid's actual column-count/breakpoints in `apps/web/app/(shop)/category/[slug]/page.tsx` and size accordingly — do not guess a single `sizes` string without reading the grid CSS). |
| `apps/web/components/product/Gallery.tsx` | PDP gallery thumbnails + active image | `priority` on the initially-active image (it's above the fold on the PDP, a real LCP candidate). |
| `apps/web/components/home/HeroSlider.tsx` | homepage hero banner | `priority` — this is the homepage's LCP image. |
| `apps/web/components/home/CategoryTiles.tsx` | category tile images | Standard `next/image`, no `priority` (below the fold on most viewports — implementer confirms against the homepage's actual layout order). |
| `apps/web/components/home/WhyUs.tsx` | marketing image | Standard `next/image`, no `priority`. |
| `apps/web/components/layout/CartDrawer.tsx` | cart line-item thumbnails | Small, fixed-size thumbnails — `fill` with a small `sizes` value, or fixed `width`/`height` if the thumbnail is a constant pixel size (check the current CSS classes before choosing). |

No existing `sizes`/`next/image` convention exists in this codebase (recon confirmed) — this plan establishes the first one. Match `next/image`'s own guidance (`fill` + `sizes` for responsive containers, `width`/`height` for fixed-size images) rather than inventing a house convention from scratch.

## 3. Item 2 — Fix the broken font pipeline

Use `next/font/google` (self-hosted by Next at build time — no runtime request to Google, no render-blocking `<link>`, works within this repo's existing offline-friendly constraints) to load two fonts matching the two Tailwind slots already declared:
- A serif/display face for `--font-display` (headings, product titles, prices — the visual identity of "personalized photo frames," a warm/crafted brand per the existing terracotta/sage/cream palette already in `tailwind.config.ts`).
- A sans face for `--font-sans` (body copy, form fields, staff/admin UI).

Wire both in `apps/web/app/layout.tsx`: instantiate via `next/font/google`, apply their generated `.variable` class names to `<html>` (so the CSS custom properties are available to every page, matching how `next/font` typically integrates with a Tailwind `var(--font-*)` convention), keep the existing `font-sans` default on `<body>`.

Exact font choices are the implementer's call within "one serif/display, one sans, self-hosted via `next/font/google`, wired to the two existing variable names" — this design doc does not mandate specific font names; matching the existing warm/crafted palette is the only steer.

## 4. Item 3 — Firebase client SDK weight on `/product/[slug]` and `/checkout`

**Investigate first, fix only if it moves the number.** Read `apps/web/lib/firebase-client.ts` (or equivalent client-SDK init file) and every file importing from `firebase/*` in `apps/web/lib`/`apps/web/components`. Confirm whether imports are already modular (`import { getFirestore } from 'firebase/firestore'`) — likely already the case, since `firebase` v10 is modular-only — or whether something (a barrel re-export, an unnecessary `firebase/app` compat import) is pulling in more than needed.

If the audit finds a real, fixable cause (e.g., an accidental compat-mode import, or `firebase/auth` code paths loaded on routes that don't need auth), fix it and re-run the `ANALYZE=true` build (commit `675bb95` wired this in) to confirm the route's First Load JS actually drops. If the audit finds the Firebase SDK weight is already minimal and unavoidable given the app's real use of live Firestore/Auth on those routes, report that as a documented finding in PROJECT_STATUS.md rather than forcing a change that doesn't move the measured number — matching this plan's own "no speculative fixes" principle from §1.

## 5. Testing

- `next/image` conversions: existing component tests (if any) updated for the new markup; a visual/rendered-output check is not meaningfully unit-testable, so correctness here leans on the browser verification step below plus each component's existing test coverage for non-image behavior (badges, out-of-stock, hover state) staying green.
- Font wiring: no meaningful unit test (this is CSS/layout); verify via a browser check that `getComputedStyle` on a `font-display` element reports the actual font family, not a system fallback.
- Item 3: no new tests unless a real code change is made, in which case existing Firebase-lookup tests must stay green; the "did it move the number" check is the `ANALYZE=true` build output itself, recorded in the implementer's report, not a unit test.
- Whole-branch final review: run `pnpm build` (not `ANALYZE=true`) and record the new route table in PROJECT_STATUS.md as a before/after, matching the recon numbers already captured in this doc (106 kB / 236 kB / 241 kB baseline).

## 6. Live verification

Per this session's established pattern (Plan C's local dev-server smoke check), after implementation: start the dev server, visually confirm the hero image and a product-grid image both render correctly (no broken `next/image` host errors from `storage.googleapis.com`), confirm a heading renders in the new display font (not a system default), and capture the new `pnpm build` route table for comparison against §1's baseline.
