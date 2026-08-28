# BroPics — Project Status

**Last updated:** 2026-08-29 (Storefront Shell & Catalog implementation plan written, ready to execute)
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

---

## 3. Phase roadmap

Each phase gets its own brainstorm → design spec → implementation plan → subagent-driven build → review cycle.

| # | Phase | Status | Spec | Plan |
|---|---|---|---|---|
| 1 | **Foundation** — architecture, data model, security rules, repo scaffold | ✅ **Complete**, merged to `master` | [design](docs/superpowers/specs/2026-08-28-foundation-design.md) | [plan](docs/superpowers/plans/2026-08-28-foundation-implementation.md) |
| 2 | Storefront — homepage, category/listing/search, product detail page, navigation | 🟡 Plan A written (shell/catalog), ready to execute. Plan B (PDP) not yet written | [design](docs/superpowers/specs/2026-08-29-storefront-design.md) | [plan A](docs/superpowers/plans/2026-08-29-storefront-shell-catalog-implementation.md) |
| 3 | Personalization engine — upload/crop/zoom/rotate/reposition/DPI/preview | Not started | — | — |
| 4 | Cart, checkout, Razorpay, accounts, order tracking | Not started | — | — |
| 5 | Admin panel & production queue | Not started | — | — |
| 6 | Reviews, videos, offers, SEO, analytics, performance pass | Not started | — | — |

---

## 4. What exists in the repo right now (Phase 1 output)

```
bro-pics/
├── apps/web/            Next.js App Router shell — (shop)/(account)/(admin) route
│                         groups, Firebase client+admin SDK init. Pages are placeholders.
├── functions/            Cloud Functions: order-number generator (transactional,
│                         BP-2026-00001 format), Razorpay webhook idempotency guard.
├── services/print-render/  Cloud Run skeleton (health check only — sharp-based
│                         rendering itself is Phase 3 work).
├── packages/shared/      zod schemas for every core entity (products, variants,
│                         orders, coupons, customizations, settings), integer-paise
│                         money math, coupon discount logic, effective-DPI calc.
├── scripts/seed/         One schema-valid placeholder product/variant for local dev.
├── firestore-rules-tests/  Security rules test suite (runs against the emulator).
├── firestore.rules, storage.rules, firestore.indexes.json, firebase.json
└── docs/superpowers/     specs/ and plans/ for every phase (this file's companions).
```

**Test status:** 34 unit/integration tests + 8 Firestore rules tests = 42, all passing. `pnpm test` (root) runs everything except the emulator-gated rules suite; `pnpm test:rules` runs those separately (needs JDK 21+ and the Firebase CLI). `pnpm --filter @bro-pics/web build` and `pnpm --filter @bro-pics/functions build` both succeed.

**Setup:** see [README.md](README.md) for install/run steps.

---

## 5. Known gaps / deferred items (tracked, not lost)

These were raised during Foundation-phase review and intentionally deferred — each has an owner phase where it needs to be resolved, not "someday":

- **Firestore rules:** `products` and `settings` are world-readable regardless of status/content. Fine while catalogue data is placeholder-only — **must be revisited before real GSTIN or draft-product data goes live** (Phase 2/5).
- **`CustomizationSchema`/`uploads` ownership model** doesn't yet cleanly support guest checkout (upload-before-login). **Phase 3's problem to solve.**
- **No lint/typecheck/CI workflow yet.** Should land before Phase 2 code volume grows.
- **`OrderSchema` doesn't self-validate its own money invariants** (subtotal − discount + shipping = total, amountPaidOnline + amountDueOnDelivery = total). Cheap to add now, expensive to retrofit once real orders exist — worth doing early in Phase 4.
- **`scripts/seed` has no category data**, and its one seed product's `categoryId` points at a category that doesn't exist yet. **Resolved by the Storefront phase plan** — `CategorySchema` is being added and seed data expanded to ~3-4 categories / 8-10 products.

## 6. Open items still waiting on the client (from the original spec, §21)

- Full product catalogue: sizes, colours, materials, prices, photo-slot counts per product
- Frame mockup/mask images per variant (required before Phase 3 can finish the live preview)
- Text personalization: which products allow it, character limits, font list
- Exact shipping rules: free-shipping threshold, flat charge, zone variance
- Domain, Razorpay KYC, and Firebase/GCP billing account — must be created in the client's name

---

## 7. Next action

Execute **Storefront Shell & Catalog** (Plan A, 10 tasks) via subagent-driven development: new Category/Review/HomepageSection schemas, denormalized product filtering, interim Firestore search, an expanded placeholder catalogue, the layout shell, the data-driven homepage, and category listing/search. Plan B (product detail page) gets written once Plan A is built and merged.
