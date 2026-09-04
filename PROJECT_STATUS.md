# BroPics — Project Status

**Last updated:** 2026-09-04 (`checkout-and-accounts` branch — Phase 4 Plan A complete and kept local per explicit instruction; Phase 4 Plan B starting)
**Maintained by:** Claude Code — this file is updated after every execution (every completed phase, task batch, or significant decision) so the current state is always readable from one place without digging through commit history.

**Branch topology (read this before touching git):**
- `master` — Foundation + Storefront (Phases 1-2) only. Nothing from Phase 3 or 4 has been merged here.
- `checkout-and-accounts` — the active branch, in the main checkout at `D:\Bro Pics` (not a worktree). Contains Storefront + the full Personalization Engine (Phase 3) + Phase 4 Plan A (Accounts & Cart Persistence). This is where Plan B work continues.
- `feature/personalization-engine` — Phase 3 alone, ends at `6d682f0`, one commit before Plan A's work began. Kept as a standalone reference/checkpoint; `checkout-and-accounts` is a strict superset of it (15 commits ahead).
- A remote (`origin` → `github.com/karthysgallery/Bro-pics.git`) exists and mirrors all local branches, including `checkout-and-accounts` — this was not something I pushed in this session; noting it here since the standing instruction has been "keep this local, don't merge to master," which is still honored (no merge has happened), but the remote's existence is worth knowing about if that instruction's intent was "don't put this anywhere else" rather than specifically "don't merge."
- Firebase project **`bropics-app`** (owner `karthysgallery@gmail.com`, Blaze plan) is live and connected — Firestore, Storage, Auth (phone provider not yet enabled in-console), and three Cloud Functions (`onVariantWritten`, `onMediaWritten`, `reconcileSessionOnLogin`) are deployed. `apps/web/.env.local` (gitignored) holds working credentials.

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

### Personalization Engine (Phase 3) decisions (2026-08-31 → 2026-09-01)

| Area | Decision | Why |
|---|---|---|
| Ownership before login | Anonymous `sessionId` (localStorage UUID) owns `uploads`/`customizations` | No accounts exist yet in this phase; Phase 4 was always the plan to reconcile session-owned records to a real user |
| Upload dimensions | Server-probed from actual bytes (`sharp`), never client-reported | A spoofed client-reported dimension would produce a false-positive green DPI badge on a genuinely bad photo |
| Rotation | Snaps to 0°/90°/180°/270° only | Keeps the crop rectangle axis-aligned and the DPI math tractable; free-angle rotation deferred |
| Print rendering | Client-rendered preview + stored transform only, no server 300 DPI render | The `print-render` Cloud Run service has no consumer yet (no order can trigger it) — building the real pipeline now would be dead code |
| Text personalization | Fully out of scope | Client never supplied which products allow it, character limits, or fonts (see §6) |
| Mockup/mask images | Placeholder mockups generated with real geometry/transparency, not real client photography | Client hasn't supplied real assets yet (see §6); `computePrintableRects` is shared between seed data and mockup generation so real assets can drop in without touching geometry code |

Full detail: [design](docs/superpowers/specs/2026-08-31-personalization-engine-design.md). This phase went through two authorized extra fix rounds beyond the normal one-wave cap during its final review (Konva canvas/DPI geometry bugs are exactly the class that survives multiple review rounds — see the dedicated lesson below).

**Lesson learned during Phase 3's final review (repeated twice, worth internalizing):** canvas/geometry code and any calculation duplicated between client and server (this phase's DPI math, computed both in a Next.js API route and in the React editor for the live badge) are bugs that no test suite catches on its own — only independent hand-tracing with concrete numbers surfaces them, because "a test exists" says nothing about whether the test used the right numbers. This bit the project three separate times in this one phase: a DPI-axis mispairing at 90°/270° rotation (fixed twice — once server-side, then again when the client-side recompute turned out to have the identical bug, finally consolidated into one shared `printDimensionsForRotation` function so client and server can never drift again); a mockup-image transparency bug where every generated PNG was fully opaque, completely hiding the customer's uploaded photo behind the frame graphic; and a printable-rect aspect-ratio bug where single-slot frame templates used a fixed square crop regardless of the product's real physical aspect ratio, silently degrading DPI on perfectly-sized uploads.

### Phase 4 Plan A (Accounts & Cart Persistence) decisions (2026-09-03)

| Area | Decision | Why |
|---|---|---|
| Sign-in method | Phone-OTP only; email is an optional profile field, never a second credential | Locked in during Foundation, reconfirmed during this phase's brainstorm |
| Role claims | None set in this plan — every account is implicitly a customer | `admin`/`staff` claims are Phase 5's concern; `firebase-functions` v6's blocking-function mechanism (`beforeUserCreated`) needs Identity Platform enabled, unnecessary overhead for a customer-only phase |
| Cart timing | Stays local-only (React state) until login; merges into Firestore (`carts/{userId}`) only at that point | No guest checkout at launch; matches the "login required before checkout" decision |
| Ownership field | `uploads`/`customizations` gain a new `userId` field, set by reconciliation — `sessionId` is left untouched as the original-session audit trail, not overwritten | An early spec draft would have overwritten `sessionId`, destroying audit history and missing that `firestore.rules` already (silently, unreachably) expected a `userId` field on `uploads` |
| Firestore rules fork | `users`/`addresses`/`carts` become owner-writable directly from the client (`isOwner(userId)`); `uploads`/`customizations` stay server-only for writes | This is the first phase with a real, verifiable `request.auth.uid` — routine cart operations no longer need a server round-trip the way Phase 3's unverifiable `sessionId` did |
| Reconciliation idempotency | `reconcileSessionOnLogin` keys a `reconciliations/{id}` marker doc (server transaction, same pattern as the existing Razorpay `webhookEvents` idempotency guard) so a client retry after a lost network response can't double-merge the cart | Found and fixed across two fix rounds during Task 7's review — a naive client-side retry-on-failure approach silently doubled cart quantities when the server had actually committed |
| Functions ↔ shared packaging | `functions/` bundles `@bro-pics/shared` via esbuild + tsconfig path mapping at deploy time, with zero `@bro-pics/shared` line in `functions/package.json` | Firebase's isolated remote Cloud Build runs `npm install` inside `functions/` alone and can't resolve pnpm's `workspace:*` protocol — this was hit and fixed once before (an *unused* dependency was simply removed); this phase needed the dependency for real (`mergeCartItems`), so the packaging problem had to be solved properly this time |

Full detail: [design](docs/superpowers/specs/2026-09-03-accounts-cart-design.md), [plan](docs/superpowers/plans/2026-09-03-accounts-cart-persistence.md).

**Lesson learned during Phase 4 Plan A's final fix wave (2026-09-03):** `firebase.json`'s functions `predeploy` hooks (`pnpm --filter @bro-pics/functions <script>`) were silently no-op'ing on this environment — root cause found: Firebase CLI's `cross-env-shell` wrapper collapses the whole predeploy command into a single string, and `cross-env` then runs Node's `path.normalize()` over that entire string on Windows, converting `@bro-pics/functions`'s forward slash into a backslash and breaking pnpm's `--filter` matching (pnpm treats "no projects matched" as non-fatal and exits 0, so the failure was invisible). Fixed by switching predeploy to `pnpm --dir functions <script>` (`--dir` takes a plain path with no `/`, so `path.normalize()` can't corrupt it) — verified end-to-end by breaking `functions/lib/index.js` and confirming a dry-run deploy regenerated it. Also: the same fix wave's own reconcile-on-sign-in effect fix (only call `reconcileSessionOnLogin` when there's real prior anonymous activity to reconcile, not on every signed-in page load) had a first-pass regression — a fallback path minted a fresh `crypto.randomUUID()` per call instead of persisting it, silently breaking the idempotent-retry guarantee — caught by this session's own full-suite re-run, not the original review.

**Lesson learned during Phase 4 Plan A's whole-branch review, worth internalizing for every future phase:** a *cross-task* interaction bug survived seven individually-clean task reviews and one Critical/two-fix-round-deep task review of the exact function involved — because a session-id-rotation fix in Task 7 (closing a real shared-browser data leak) violated an invariant that a completely different file (`/api/customizations`'s session-ownership check, written back in Phase 3) depended on. Neither task's own reviewer could have caught it: Task 7's reviewer never had reason to re-read Phase 3's route code, and Phase 3's route was untouched by this diff. Only a review that traces the *whole* end-to-end flow — anonymous upload → mid-flow sign-in → checkout attempt — found it. The fix (pin the session id once per personalization-editor session instead of re-reading `localStorage` at multiple points) also happened to close two Important findings at once (the reconcile-on-every-page-load spec drift, and the unbounded growth of the idempotency marker collection), because all three traced back to the same root cause: treating `localStorage`'s mutable, rotatable value as if it were a stable identity within one user flow.

---

## 3. Phase roadmap

Each phase gets its own brainstorm → design spec → implementation plan → subagent-driven build → review cycle.

| # | Phase | Status | Spec | Plan |
|---|---|---|---|---|
| 1 | **Foundation** — architecture, data model, security rules, repo scaffold | ✅ **Complete**, merged to `master` | [design](docs/superpowers/specs/2026-08-28-foundation-design.md) | [plan](docs/superpowers/plans/2026-08-28-foundation-implementation.md) |
| 2 | Storefront — homepage, category/listing/search, product detail page, navigation | ✅ **Complete** (Plans A + B), merged to `master` | [design A](docs/superpowers/specs/2026-08-29-storefront-design.md), [design B](docs/superpowers/specs/2026-08-31-storefront-pdp-design.md) | [plan A](docs/superpowers/plans/2026-08-29-storefront-shell-catalog-implementation.md), [plan B](docs/superpowers/plans/2026-08-31-storefront-pdp-implementation.md) |
| 3 | Personalization engine — upload/crop/zoom/rotate/reposition/DPI/preview | ✅ **Complete**, kept local on `checkout-and-accounts` (and standalone on `feature/personalization-engine`) — **not merged to `master`**, per explicit instruction | [design](docs/superpowers/specs/2026-08-31-personalization-engine-design.md) | [plan](docs/superpowers/plans/2026-08-31-personalization-engine-implementation.md) |
| 4a | Phase 4 Plan A — accounts (phone-OTP), cart persistence, session→user reconciliation | ✅ **Complete**, kept local on `checkout-and-accounts` — **not merged to `master`** | [design](docs/superpowers/specs/2026-09-03-accounts-cart-design.md) | [plan](docs/superpowers/plans/2026-09-03-accounts-cart-persistence.md) |
| 4b | Phase 4 Plan B — checkout, address collection, Razorpay Orders API + webhooks | 🔜 **Starting now** | — | — |
| 4c | Phase 4 Plan C — order tracking (manual AWB/status timeline) | Not started | — | — |
| 5 | Admin panel & production queue | Not started | — | — |
| 6 | Reviews, videos, offers, SEO, analytics, performance pass | Not started | — | — |

---

## 4. What exists in the repo right now

```
bro-pics/ (checkout-and-accounts branch — Storefront + Personalization Engine + Plan A)
├── apps/web/            Next.js App Router shell — global layout (Header w/ sign-in
│                         entry point + account modal, Footer, AnnouncementBar,
│                         CartDrawer w/ thumbnails, WhatsAppButton), a data-driven
│                         homepage, category listing with URL-driven filters, search +
│                         type-ahead, a full product detail page (/product/[slug]) with
│                         a real Konva-based personalization editor (upload/crop/zoom/
│                         rotate/DPI-check/preview) wired into the buy box, phone-OTP
│                         sign-in (useAuth() hook + PhoneSignIn component), and a
│                         Firestore-backed cart (local-only when signed out, carts/
│                         {userId} when signed in, reconciled at login).
├── functions/            Cloud Functions (esbuild-bundled for deploy): order-number
│                         generator, Razorpay webhook idempotency guard, product
│                         filter/rating + card-image denormalization on writes, and
│                         reconcileSessionOnLogin (idempotent, transactional: reassigns
│                         session-owned uploads/customizations to the signed-in user,
│                         merges the local cart into Firestore, upserts the user
│                         profile) — deployed live to the bropics-app project.
├── services/print-render/  Cloud Run skeleton (health check only — real server-side
│                         300 DPI print rendering has no consumer yet, still deferred).
├── packages/shared/      zod schemas for every core entity, now including User/
│                         Address (Plan A), Upload/FrameTemplate (Phase 3), a userId
│                         ownership field on Upload/Customization (Plan A), a pure
│                         mergeCartItems cart-merge function, integer-paise money math,
│                         coupon discount logic, effective-DPI + rotation-aware print-
│                         dimension calc (shared between client and server so the two
│                         can never drift), and Firestore-backed product search.
├── scripts/seed/         Placeholder catalogue (4 categories, 8 products/variants,
│                         reviews, homepage sections) plus a real seed-writer
│                         (write-to-firestore) that has actually populated the live
│                         bropics-app Firestore project, and placeholder frame-template
│                         mockup PNGs with real geometry/transparency.
├── firestore-rules-tests/  Security rules test suite (runs against the emulator) —
│                         now covers users/addresses/carts/customizations owner rules.
├── firestore.rules, storage.rules, firestore.indexes.json, firebase.json, cors.json
└── docs/superpowers/     specs/ and plans/ for every phase (this file's companions).
```

**Live Firebase project:** `bropics-app` (Blaze plan, `karthysgallery@gmail.com`) — Firestore (`asia-south1`), Storage (`bropics-app.firebasestorage.app`), Auth (Phone provider **not yet enabled in-console** — blocks live phone-OTP testing until done), and three deployed Cloud Functions. Seeded with the placeholder catalogue.

**Test status:** 304 tests passing across `packages/shared` (110), `functions` (26), `services/print-render` (1), `apps/web` (140), `scripts/seed` (27), plus the Firestore rules suite (run separately: `pnpm test:rules`, needs JDK 21+ and the Firebase CLI). `pnpm --filter @bro-pics/functions bundle` (esbuild) succeeds and deploys live; `pnpm --filter @bro-pics/web build` compiles TypeScript cleanly but fails prerendering without a live `FIREBASE_SERVICE_ACCOUNT_JSON` — expected in this environment, not a code defect.

**Setup:** see [README.md](README.md) for install/run steps.

---

## 5. Known gaps / deferred items (tracked, not lost)

Each has an owner phase where it needs to be resolved, not "someday":

- **Uploads/customizations created by an already-signed-in user never get a `userId` set.** Attribution to `userId` happens exclusively inside `reconcileSessionOnLogin` (a one-time, login-moment operation); `/api/uploads` and `/api/customizations` only ever read the `X-Session-Id` header, never an auth token. So any personalization made *after* signing in (not just the reconciled pre-login ones) carries only `sessionId`, and `firestore.rules`' owner-gated read (`isOwner(resource.data.userId)`) means the customer can't read their own doc client-side (server/Admin SDK reads still work, bypass rules). **Plan B's problem** — order fulfillment needs to read these client-side or via a route that can attribute them correctly.
- **Firestore rules:** `products`, `categories`, and `settings` are world-readable regardless of status/content. Fine while catalogue data is placeholder-only — **must be revisited before real GSTIN or draft-product data goes live** (Phase 5).
- **No lint/typecheck/CI workflow yet.** Getting more overdue as code volume grows — this has bitten review at least twice now (Storefront Plan B, and again implicitly relied-upon manual typecheck runs during Phase 4's fix waves) since Vitest strips types via esbuild and a test suite staying green says nothing about `tsc --noEmit`. Worth doing before Phase 5.
- **`OrderSchema` doesn't self-validate its own money invariants** (subtotal − discount + shipping = total, amountPaidOnline + amountDueOnDelivery = total). Cheap to add now, expensive to retrofit once real orders exist — **Plan B's job**, and the final whole-branch review flagged `unitPriceSnapshot` in the cart as strictly a display value: Plan B must re-derive every price/total server-side from `products/{id}/variants`, never trust the cart doc's own numbers.
- **`recently_viewed` homepage section is seeded and active but renders nothing.** No client component exists yet to mount it (client-side, reads localStorage). Low priority — cosmetic gap, not a broken feature.
- **No keyboard navigation on the search type-ahead.** Minor accessibility follow-up.
- **`users/{uid}` write access is owner-unrestricted** (`allow write: if isOwner(userId)`, no shape/field-level validation) — a signed-in client can overwrite their own server-set `phone`/`createdAt` fields. Matches the design spec's own §3 exactly, so not a defect, but worth Plan B knowing before it reads `phone` for order contact details.
- **`sessionId` is an unverifiable client-supplied claim that now grants real ownership**, not just read-scoping. Phase 3 accepted `sessionId` as a scoping key when nothing sensitive depended on it; Phase 4 Plan A's reconciliation means anyone who learns another browser's session id can claim its uploads/customizations by signing in and passing that id to `reconcileSessionOnLogin`. Session ids are `crypto.randomUUID()` (not guessable), and this was an accepted tradeoff in the design, not missed — recorded here so it isn't rediscovered as a surprise.
- **Firebase phone-OTP sign-in has never been tested against the live project.** The Phone provider hasn't been enabled in the `bropics-app` Firebase Console yet, and no test phone number is registered — Plan A's Task 8 (live end-to-end verification) was deliberately deferred for this reason. Needs doing before shipping, or at least before Plan B builds checkout on top of an unverified sign-in flow.
- **Four PDP design-spec elements were scoped out of Storefront Plan B's implementation plan, not just deferred by accident:** buy box isn't sticky on desktop scroll, no wishlist toggle on the PDP, no material selector UI, and `ReviewsSection` doesn't render `review.media` thumbnails. None block anything; worth a small follow-up pass, not urgent.
- **`getRelatedProducts`/`getAllActiveProductSlugs` in `firestore-product-detail.ts` don't `toDate()`-convert `createdAt`/`updatedAt`** the way `getProductBySlug` does. Inert today, but the exact Timestamp-vs-Date bug class this project has hit before.
- **No zod parsing at Firestore read boundaries anywhere in `apps/web`** (`doc.data() as Product` throughout) — an established pattern since Plan A of Storefront, worth a project-wide look at some point.
- **`packages/shared`'s `main`/`types` point directly at raw TypeScript source** (`src/index.ts`), not a built `dist/`. This works today because every current consumer (Next.js, `tsx`, esbuild-bundled Cloud Functions) can process raw TS directly — but it's a real constraint any *new* consumer of `@bro-pics/shared` needs to know about upfront: a plain-Node consumer (like an unbundled Cloud Function) cannot `require()` it without either bundling or a real build step. This has already caused two real regressions in Phase 4 (see the lessons above) — don't attempt to "fix" it again without re-reading those.

## 6. Open items still waiting on the client (from the original spec, §21)

- Full product catalogue: sizes, colours, materials, prices, photo-slot counts per product
- Frame mockup/mask images per variant (required before Phase 3 can finish the live preview)
- Text personalization: which products allow it, character limits, font list
- Exact shipping rules: free-shipping threshold, flat charge, zone variance
- Domain, Razorpay KYC, and Firebase/GCP billing account — must be created in the client's name

---

## 7. Next action

**Phase 4 Plan A (Accounts & Cart Persistence) is complete**, on `checkout-and-accounts` (not merged to `master`, kept local per explicit instruction). **Phase 4 Plan B (Checkout + Razorpay) is starting now** — scope per the original Plan A brainstorm's decomposition: address collection UI (schema already exists from Plan A, UI was deliberately left to this plan), `OrderSchema` money-invariant self-validation, Razorpay Orders API + webhook integration (reusing the already-built `generateOrderNo`/webhook-idempotency helpers from Foundation), and server-side re-derivation of every price/total from `products/{id}/variants` (never trusting the cart doc's `unitPriceSnapshot`). The shipping-rules open item (§6) is still unresolved by the client and should be surfaced early in this plan's brainstorm since it may block parts of the checkout flow.
