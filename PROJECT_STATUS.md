# BroPics — Project Status

**Last updated:** 2026-09-03 (`checkout-and-accounts` branch — Phase 4 Plan A final fix wave: all 8 whole-branch-review findings fixed, full test suite green)
**Maintained by:** Claude Code — this file is updated after every execution (every completed phase, task batch, or significant decision) so the current state is always readable from one place without digging through commit history.

---

## 1. What this project is

A custom e-commerce platform for **BroPics & Kavi Vazhi Photography**, replacing manual WhatsApp order-taking for personalized photo frames. Built from a 9-page developer handover spec (`Bro Pics.pdf`, JASkrypt Techverse, Ref JT/SPEC/2026-001) with one deliberate substitution: **Firebase instead of Supabase** for backend/database/auth/storage, per client instruction.

Core flow: **Category → Product → Customize (upload/crop/zoom/rotate/DPI-check) → Preview → Add to Cart → Checkout (Razorpay) → Order Tracking**.

### Reference sites (UX/structure inspiration only — never copied)
| Site | What it's for |
|---|---|
| picloopz.com | Core concept, site structure, category→product→customize flow |
| ritwikas.com | Product detail page depth, live preview, DPI/quality guidance |
| parulpackaging.com (product page) | Product video gallery / "in motion" video rail |
| yazhlicollection.com | Visual design, product cards, catalogue presentation |
| wa.me/c/916381120479 | Product catalogue reference (client will supply final catalogue separately) |

All four studied via `/browse` on 2026-08-29 for the Storefront phase design. Key findings: Ritwikas (PDF's own "closer match") — pill-button variant selectors, upload/preview in the buy box, delivery-timeline widget, WhatsApp help box, tabbed info, rating-breakdown reviews. Picloopz — chip+slider filtering, paginated grids. Parul Packaging — video files mixed directly into the image thumbnail rail (9:16 vertical). Yazhli — visual inspiration only (circular tiles, whitespace, badges).

---

## 2. Locked-in architecture decisions

| Area | Decision | Why |
|---|---|---|
| Database | **Firestore**, denormalized documents | Native Firebase; PDF's own order_items pattern is already denormalized |
| Search | **Algolia** via Firebase Extension sync | Firestore has no full-text search |
| Hosting | **Firebase App Hosting** (Cloud Run–backed), not Vercel | Client chose full Firebase consolidation |
| Revalidation | **Time-based ISR (60s)**, not on-demand | Verified: Firebase App Hosting doesn't support `revalidatePath`/`revalidateTag`. Acceptable at the spec's 500–1,000 visitors/day |
| Print rendering | **Cloud Run service**, not a Cloud Function | 20×30in @ 300 DPI = 54MP — exceeds Functions' memory/timeout envelope |
| Payments | Razorpay Orders API + webhooks; webhook is source of truth | Server-computed amounts only, never trusted from client |
| COD | **Prepaid only at launch** | Schema carries `paymentMode`/`amountPaidOnline`/`amountDueOnDelivery` so partial-COD can be added later without rebuilding |
| GST | **Not enabled at launch** (no GSTIN yet) | `settings.gstin`/`gstEnabled` and order `taxLines[]` present from day one |
| Courier | **Manual AWB/tracking entry** at launch | Schema doesn't block a future Shiprocket/Nimbus integration |
| WhatsApp | **Link-only** (`wa.me`) at launch, no Cloud API | Behind a notification-dispatch abstraction so Cloud API slots in later |
| Repo layout | pnpm monorepo: `apps/web`, `functions`, `services/print-render`, `packages/shared` | See design doc §4 for full rationale |

Full detail: [docs/superpowers/specs/2026-08-28-foundation-design.md](docs/superpowers/specs/2026-08-28-foundation-design.md)

### Storefront phase decisions (2026-08-29)

| Area | Decision | Why |
|---|---|---|
| Filter data | Denormalized onto `ProductSchema` (`availableSizes[]`, `minPrice`/`maxPrice`, etc.), synced by a Cloud Function on variant writes | Firestore can't do arbitrary multi-field filtering across a variants subcollection at the PDF's 500-product/400ms target |
| Search | Firestore-only interim (`titleLower`/`searchTokens[]`) behind a swappable `searchProducts()` interface | No Algolia account yet; interface means the swap later touches no call sites |
| Homepage | Data-driven section registry, not hardcoded | Matches "every list is admin-manageable" ground rule; Phase 5 only adds an admin UI on top |
| Personalize CTA | Visually complete, opens a "coming soon" placeholder modal | Editor is Phase 3; proves the layout/interaction point now |
| Cart/wishlist | Local-only mock state this phase | Real persistence needs Phase 4's checkout/accounts work |
| Video | Fully built with placeholder clips, not stubbed | Verifiable now; real assets drop in later without touching components |
| Visual system | Cream/charcoal/terracotta/sage palette, serif display + sans body — original, distinct from all 4 reference sites | Client's requirement for original BroPics identity |

Full detail: [docs/superpowers/specs/2026-08-29-storefront-design.md](docs/superpowers/specs/2026-08-29-storefront-design.md)

### Storefront Plan B (PDP) decisions (2026-08-31)

| Area | Decision | Why |
|---|---|---|
| Product media | New `ProductMedia` schema (`products/{id}/media/{id}`), replacing `ProductCard`'s slug-guessed image paths | Real client photography needs a real data model; Foundation had specified this collection but never built it |
| Card images | `primaryImageUrl`/`hoverImageUrl` denormalized onto `ProductSchema`, synced by a new `onMediaWritten` Cloud Function trigger | Same reasoning as the variant-filter denormalization — `ProductCard` renders on every rail/grid and must never issue a per-card subcollection read |
| Gallery/variant coupling | Variant-specific media shown when it exists, falls back to variant-agnostic media otherwise; size/colour options are mutually scoped so an impossible combination can't be selected | Seed data now includes one product with partial variant-specific media specifically to exercise the fallback path |
| Variant selection | Client-side React state, not a URL param | Keeps `/product/[slug]` statically generatable (`generateStaticParams` + `revalidate: 60`) — putting it in the URL would force dynamic rendering, the same trap Plan A's category page hit |
| Personalize CTA | Opens a "coming soon" placeholder modal (new component) | Same pattern as Plan A's homepage CTAs — editor itself is Phase 3 |
| Related products | Same-category only, reuses Plan A's `ProductRail` | Frequently-bought-together needs real order history, not available until Phase 4 |
| Reviews | `ReviewSchema` gained `createdAt`, sorted most-recent-first; rating breakdown shows all 5 star levels even at zero count | Recency sort was previously impossible — the field didn't exist despite the composite index already expecting it |

Full detail: [docs/superpowers/specs/2026-08-31-storefront-pdp-design.md](docs/superpowers/specs/2026-08-31-storefront-pdp-design.md)

**Lesson learned during Plan A's final review, worth carrying into Plan B and beyond:** Firestore requires the first `orderBy` clause to match whichever field carries a range/inequality filter (`>=`/`<=`) in the same query — get this wrong and the query either throws `FAILED_PRECONDITION` or silently ignores the requested sort. `packages/shared/src/search/build-query-plan.ts` now encodes this rule explicitly (and its test suite locks in all the distinct cases), but any new Firestore query written elsewhere in the app needs the same care, plus a matching composite index in `firestore.indexes.json` — none of this was ever caught by unit tests, only by the final review's manual trace, since nothing in this environment executes against a live Firestore. A design-token addendum: a fifth token, `surface` (`#FFFFFF`), was added to the palette above for card/section backgrounds — the original four didn't cover it.

**Lesson learned during Phase 4 Plan A's final fix wave (2026-09-03):** `firebase.json`'s functions `predeploy` hooks (`pnpm --filter @bro-pics/functions <script>`) were silently no-op'ing on this environment — root cause found: Firebase CLI's `cross-env-shell` wrapper collapses the whole predeploy command into a single string, and `cross-env` then runs Node's `path.normalize()` over that entire string on Windows, converting `@bro-pics/functions`'s forward slash into a backslash and breaking pnpm's `--filter` matching (pnpm treats "no projects matched" as non-fatal and exits 0, so the failure was invisible). Fixed by switching predeploy to `pnpm --dir functions <script>` (`--dir` takes a plain path with no `/`, so `path.normalize()` can't corrupt it) — verified end-to-end by breaking `functions/lib/index.js` and confirming a dry-run deploy regenerated it. Also: the same fix wave's own reconcile-on-sign-in effect fix (only call `reconcileSessionOnLogin` when there's real prior anonymous activity to reconcile, not on every signed-in page load) had a first-pass regression — a fallback path minted a fresh `crypto.randomUUID()` per call instead of persisting it, silently breaking the idempotent-retry guarantee — caught by this session's own full-suite re-run, not the original review. Full detail: [final-fix-wave-report.md](.superpowers/sdd/2026-09-03-accounts-cart-persistence/final-fix-wave-report.md) (local only, gitignored).

**Lesson learned during Plan B's final review:** a cross-task/whole-branch review catches things no single task's reviewer can — in this case, a client component (`ProductDetailClient`) letting the user select a size×colour combination with no matching variant, where the UI kept showing the "selected" pills while the price/gallery/cart silently used an unrelated fallback variant. No per-task review could catch this since Task 6 built both halves of the interaction together; it only surfaced when the whole page was read end-to-end. Fixed by scoping each variant dimension's options to what's actually available given the other's current selection. Separately, the final review's own **fix wave** introduced a new regression (`metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? fallback)` — `??` doesn't catch an empty string, and `.env.example` documents that exact empty value, so `new URL('')` would have crashed every page render in a real deployment). Caught by the scoped re-review of the fix itself, not the original review — a reminder that a fix diff needs the same scrutiny as the code it's fixing.

---

## 3. Phase roadmap

Each phase gets its own brainstorm → design spec → implementation plan → subagent-driven build → review cycle.

| # | Phase | Status | Spec | Plan |
|---|---|---|---|---|
| 1 | **Foundation** — architecture, data model, security rules, repo scaffold | ✅ **Complete**, merged to `master` | [design](docs/superpowers/specs/2026-08-28-foundation-design.md) | [plan](docs/superpowers/plans/2026-08-28-foundation-implementation.md) |
| 2 | Storefront — homepage, category/listing/search, product detail page, navigation | ✅ **Complete** (Plans A + B), merged to `master` | [design A](docs/superpowers/specs/2026-08-29-storefront-design.md), [design B](docs/superpowers/specs/2026-08-31-storefront-pdp-design.md) | [plan A](docs/superpowers/plans/2026-08-29-storefront-shell-catalog-implementation.md), [plan B](docs/superpowers/plans/2026-08-31-storefront-pdp-implementation.md) |
| 3 | Personalization engine — upload/crop/zoom/rotate/reposition/DPI/preview | Not started | — | — |
| 4 | Cart, checkout, Razorpay, accounts, order tracking | Not started | — | — |
| 5 | Admin panel & production queue | Not started | — | — |
| 6 | Reviews, videos, offers, SEO, analytics, performance pass | Not started | — | — |

---

## 4. What exists in the repo right now

```
bro-pics/
├── apps/web/            Next.js App Router shell — global layout (Header, Footer,
│                         AnnouncementBar, CartDrawer, WhatsAppButton), a data-driven
│                         homepage (10 section types rendered from Firestore), category
│                         listing with URL-driven filters, search + type-ahead, and a
│                         full product detail page (/product/[slug]): gallery with
│                         variant-aware image/video media, buy box with client-side
│                         variant selection, tabbed info, video rail, reviews with
│                         rating breakdown, related products, SEO metadata + JSON-LD.
│                         Cart/wishlist are local-only mock state (Phase 4 replaces
│                         with real persistence).
├── functions/            Cloud Functions: order-number generator (transactional,
│                         BP-2026-00001 format), Razorpay webhook idempotency guard,
│                         product filter/rating denormalization on variant writes,
│                         product card-image denormalization on media writes.
├── services/print-render/  Cloud Run skeleton (health check only — sharp-based
│                         rendering itself is Phase 3 work).
├── packages/shared/      zod schemas for every core entity (products incl. faq/
│                         card-image fields, product media, variants, categories,
│                         reviews incl. createdAt, homepage sections, orders, coupons,
│                         customizations, settings), integer-paise money math, coupon
│                         discount logic, effective-DPI calc, and a Firestore-backed
│                         product search behind a swappable interface (Algolia drops
│                         in later without touching call sites).
├── scripts/seed/         Placeholder catalogue: 4 categories, 8 products with variants,
│                         reviews (with timestamps), FAQ entries, product media (incl.
│                         one variant-specific-media + one video case), 10 homepage
│                         sections, plus placeholder SVG images and one placeholder MP4
│                         video, all under apps/web/public/placeholders/.
├── firestore-rules-tests/  Security rules test suite (runs against the emulator).
├── firestore.rules, storage.rules, firestore.indexes.json, firebase.json
└── docs/superpowers/     specs/ and plans/ for every phase (this file's companions).
```

**Test status:** 178 tests passing across `packages/shared` (75), `functions` (17), `services/print-render` (1), `apps/web` (55), `scripts/seed` (22), plus 8 Firestore rules tests run separately. `pnpm test` (root) runs everything except the emulator-gated rules suite; `pnpm test:rules` runs those separately (needs JDK 21+ and the Firebase CLI). `pnpm --filter @bro-pics/functions build` succeeds; `pnpm --filter @bro-pics/web build` compiles TypeScript cleanly but fails prerendering without a live `FIREBASE_SERVICE_ACCOUNT_JSON` — expected in this environment, not a code defect (every page now reads real Firestore data at build/request time).

**Setup:** see [README.md](README.md) for install/run steps.

---

## 5. Known gaps / deferred items (tracked, not lost)

Each has an owner phase where it needs to be resolved, not "someday":

- **Firestore rules:** `products`, `categories`, and `settings` are world-readable regardless of status/content. Fine while catalogue data is placeholder-only — **must be revisited before real GSTIN or draft-product data goes live** (Phase 5).
- **`CustomizationSchema`/`uploads` ownership model** doesn't yet cleanly support guest checkout (upload-before-login). **Phase 3's problem to solve.**
- **No lint/typecheck/CI workflow yet.** Getting more overdue as code volume grows — Plan B's final review is the first time this actually bit: `apps/web` silently failed `tsc --noEmit` (two test fixtures missing a required field) while every test suite stayed green, since Vitest strips types via esbuild. Caught only by an ad hoc typecheck run during review, not by anything routine. Worth doing before Phase 3.
- **`OrderSchema` doesn't self-validate its own money invariants** (subtotal − discount + shipping = total, amountPaidOnline + amountDueOnDelivery = total). Cheap to add now, expensive to retrofit once real orders exist — worth doing early in Phase 4.
- **`recently_viewed` homepage section is seeded and active but renders nothing.** The section registry intentionally defers it (client-side, reads localStorage) but no client component exists yet to mount it. Low priority — cosmetic gap, not a broken feature.
- **`CartDrawer`'s quantity input has no lower-bound guard** (clearing the field yields `qty: 0`/`NaN`). Harmless against today's mock local state; **must be fixed before Phase 4** wires up real persistence/pricing.
- **No keyboard navigation on the search type-ahead** (has ARIA roles now, but no arrow-key/enter-to-select). Minor accessibility follow-up.
- **Four PDP design-spec elements were scoped out of Plan B's implementation plan, not just deferred by accident:** buy box isn't sticky on desktop scroll, no wishlist toggle on the PDP, no material selector UI (inert with current seed data since every product has exactly one material, but the selector component would need it once that's no longer true), and `ReviewsSection` doesn't render `review.media` thumbnails. None block anything; worth a small follow-up pass, not urgent.
- **`getRelatedProducts`/`getAllActiveProductSlugs` in `firestore-product-detail.ts` don't `toDate()`-convert `createdAt`/`updatedAt`** the way `getProductBySlug` in the same file does. Inert today (no current caller renders those dates) but the exact Timestamp-vs-Date bug class this project has hit before — a trap for whoever first renders a "New" badge off a related-product card.
- **No zod parsing at Firestore read boundaries anywhere in `apps/web`** (`doc.data() as Product` throughout, not just in Plan B's new code) — an established pattern since Plan A, not a new violation, but worth a project-wide look at some point given "every schema/API boundary validates input with zod" is a standing ground rule.

## 6. Open items still waiting on the client (from the original spec, §21)

- Full product catalogue: sizes, colours, materials, prices, photo-slot counts per product
- Frame mockup/mask images per variant (required before Phase 3 can finish the live preview)
- Text personalization: which products allow it, character limits, font list
- Exact shipping rules: free-shipping threshold, flat charge, zone variance
- Domain, Razorpay KYC, and Firebase/GCP billing account — must be created in the client's name

---

## 7. Next action

**Storefront (Phase 2) is complete** — both plans merged to `master`. Next up is **Phase 3: Personalization Engine** (upload/crop/zoom/rotate/reposition/DPI-check/preview) — the client hasn't yet supplied frame mockup/mask images or the text-personalization rules it depends on (see §6), so that phase's brainstorm should surface those as open questions early rather than assume them.
