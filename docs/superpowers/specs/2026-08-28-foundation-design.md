# Foundation Phase — Design Spec

**Project:** BroPics & Kavi Vazhi Photography — Personalized Photo Frame E-Commerce Platform
**Source of truth:** `Bro Pics.pdf` (JASkrypt Techverse, Ref JT/SPEC/2026-001, 9 pages) — this design implements §3–§4 (stack, environments, data model) with Supabase replaced by Firebase throughout, per client instruction.
**Phase:** 1 of 6 in the overall build (see Roadmap below). This phase produces architecture decisions, data model, security model, and repository scaffold only — no feature code.

---

## 0. Roadmap (for context — not this phase's deliverable)

Following the PDF's own week-by-week build order (§20), decomposed into independently spec'd phases:

1. **Foundation** (this document) — architecture, data model, environments, repo scaffold
2. **Storefront** — homepage, category/listing/search, product detail page, navigation (PDF §5–§8)
3. **Personalization engine** — upload/crop/zoom/rotate/reposition/DPI/preview, built standalone with its own test harness (PDF §13)
4. **Cart, checkout, Razorpay, accounts, order tracking** (PDF §9–§10)
5. **Admin panel & production queue** (PDF §14–§15)
6. **Reviews, videos, offers, SEO, analytics, performance pass** (PDF §11–§12, §16–§19)

Each phase gets its own brainstorm → spec → plan → implementation cycle. Reference sites (Picloopz, Ritwikas, Parul Packaging, Yazhli Collection, WhatsApp catalogue) will be studied via the `/browse` skill during phases 2–3, where their UX patterns directly inform decisions — not during Foundation.

---

## 1. Architecture & tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Unchanged from PDF §3 |
| Styling | Tailwind CSS + small component layer | Unchanged from PDF §3 |
| Hosting | **Firebase App Hosting** (Cloud Run–backed) | Client chose full Firebase consolidation over Vercel |
| Database | **Firestore**, denormalized documents | Native Firebase service; fits the PDF's own snapshot pattern (order_items are already specced as denormalized). Chosen over Cloud SQL to keep the stack fully within Firebase. |
| Search | **Algolia**, synced via official Firebase Extension (Firestore writes → Algolia index) | Firestore has no full-text search; PDF §7 requires typo-tolerant search + type-ahead with thumbnails. Free tier (10k records/10k searches/mo) comfortably covers this catalogue's scale. |
| Auth | Firebase Auth — phone OTP + email | Direct swap for Supabase Auth (PDF §3, §9) |
| Storage | Firebase Storage, private buckets, Admin-SDK-issued signed URLs | Direct swap for Supabase Storage |
| Print rendering | **Cloud Run service**, not a Cloud Function | A 20×30in print at 300 DPI is 6000×9000px (54MP) plus bleed and sRGB conversion via `sharp` — exceeds Cloud Functions' practical memory/timeout envelope. Triggered async: order paid → Cloud Tasks queue → Cloud Run job. Matches PDF §13's "failures alert admin and are retryable" requirement. |
| Payments | Razorpay Orders API + webhooks (Cloud Function endpoint) | Unchanged from PDF §9 |
| Editor | React Konva (Fabric.js fallback if needed) | Unchanged from PDF §3, §13 |
| Notifications | Email (transactional) at launch. WhatsApp = `wa.me` deep links only (floating button + product inquiry), no Cloud API. | Resolves PDF §21 open question. Built behind a notification-dispatch abstraction (single call site per event: order paid/shipped/delivered) so WhatsApp Cloud API can be added later — per PDF's Phase 2/3 exclusion list — without touching call sites. |
| Analytics | GA4 + Microsoft Clarity | Unchanged from PDF §3, §19 |

### ISR / revalidation caveat (verified, not assumed)

Firebase App Hosting does **not** support Next.js on-demand revalidation (`revalidatePath` / `revalidateTag`) — confirmed via current documentation and reported platform behavior as of this writing. This is a real gap against PDF §16's "product data revalidated on admin save."

**Resolution:** use **time-based ISR** (`export const revalidate = 60`) on catalog pages instead of on-demand revalidation. Given the PDF's own expected load (500–1,000 visitors/day, peaking 3× during campaigns — well within Firestore's comfort zone), an admin save becoming visible within ~60 seconds is an acceptable trade against fighting the hosting platform. If a future requirement needs instant reflection (e.g. flash-sale pricing), the fallback is fully dynamic (uncached) rendering for that specific route, not a hosting migration.

---

## 2. Data model

Firestore collections (top-level unless noted as a subcollection). All monetary values stored as **integer paise**; Firestore numbers are IEEE754 doubles, so every write path validates integrality with zod at the API/Cloud Function boundary before persisting — client values are never trusted (PDF ground rule, §2).

```
categories/{id}
  name, slug, parentId, image, sortOrder, isActive, seo{title, description}

products/{id}
  title, slug, categoryId, shortDesc, descriptionHtml, highlights[], howItWorks[],
  careText, basePrice (paise, int), isActive, isFeatured, badges[],
  dispatchDaysMin, dispatchDaysMax, photoSlots, allowsTextPersonalization, seo{...}

products/{id}/variants/{id}
  sku, sizeLabel, widthIn, heightIn, frameColour, material, price (paise),
  compareAtPrice, stockStatus, printWidthPx, printHeightPx, minUploadPx,
  aspectRatio, isActive

products/{id}/media/{id}
  variantId?, type (image|video), url, alt, sortOrder

products/{id}/frameTemplates/{id}
  variantId, mockupUrl, maskUrl, printableRect, bleedMm, matInset, overlayUrl

uploads/{id}
  userId?, sessionId, originalUrl, widthPx, heightPx, mime, bytes,
  exifStripped, status

customizations/{id}
  uploadId, variantId, slotIndex,
  transformJson{scale, offsetX, offsetY, rotation, cropRect},
  textFieldsJson, effectiveDpi, previewUrl, printFileUrl, renderStatus

carts/{sessionId}
  userId?, items: [{variantId, qty, customizationIds[], unitPriceSnapshot}]

orders/{id}
  orderNo, userId, status, paymentStatus, subtotal, discount, shipping, total,
  couponId, addressJson, razorpayOrderId, razorpayPaymentId, notes, placedAt,
  paymentMode ("prepaid" | "partial_cod"),      # future-proofing: partial COD
  amountPaidOnline, amountDueOnDelivery,         # future-proofing: partial COD
  taxLines[] {gstin, rate, amount}                # future-proofing: GST invoice

orders/{id}/items/{id}
  variantId, productTitleSnapshot, variantLabelSnapshot, qty, unitPrice,
  customizationIds[], printFiles[]

orders/{id}/events/{id}
  fromStatus, toStatus, actor, note, createdAt

webhookEvents/{razorpayEventId}
  processedAt, orderId                            # idempotency dedupe

coupons/{code}
  type, value, minOrder, maxDiscountCap, startsAt, endsAt, usageLimit,
  perUserLimit, appliesTo (all|category|product), usedCount

coupons/{code}/redemptions/{userId}
  count                                           # per-user limit tracking

reviews/{id}
  productId, userId, orderId?, rating, title, body, media[], isVerified,
  status (pending|approved|rejected)

testimonials/{id}
  type (testimonial|factory|unboxing|reel), title, videoUrl, posterUrl,
  source, duration, sortOrder, isActive, placement

homepageSections/{id}
  type, title, subtitle, image, mobileImage, link, sortOrder, startsAt,
  endsAt, isActive

users/{uid}
  name, phone, email, role (customer|staff|admin)

users/{uid}/addresses/{id}
  lines, city, state, pincode, isDefault

settings/{key}
  valueJson — includes gstin, gstEnabled, taxRate,   # future-proofing: GST
  freeShippingThreshold, flatShippingCharge, processingDays,
  supportPhone, announcementBar

counters/orderSeq
  value (int)                                      # transactional order_no generator
```

### Why the future-proofing fields matter now

The client requires partial-COD and GST invoicing to be addable later **without rebuilding the payment/invoice system**. That constraint is only satisfiable if the fields exist in the schema from day one (unused, defaulted) — retrofitting `paymentMode` onto live orders later would require a migration; having it from the start costs nothing.

### Firestore mechanics requiring explicit handling

Firestore is document-oriented; these are the sharp edges that the PDF's Postgres design (with real transactions and tsvector) got for free:

- **`order_no` generation** (e.g. `BP-2026-00184`) — transactional increment on `counters/orderSeq`. A write hotspot in theory, harmless at the PDF's stated 10–20 orders/day.
- **Coupon `usedCount` / `perUserLimit`** — transactional increment on redemption, checked against `coupons/{code}/redemptions/{userId}` inside the same transaction as order creation, preventing concurrent-checkout double-spend on single-use coupons.
- **Webhook idempotency** — `webhookEvents/{razorpayEventId}` written in the *same transaction* as the order status flip. A retried webhook finds the doc already exists and no-ops. This directly satisfies PDF §9's "duplicate webhooks must not create duplicate orders."
- **Money discipline** — integer paise everywhere; zod-validated at every write boundary, never trusted from the client (PDF ground rule).

---

## 3. Security model

Firestore's equivalent of the PDF's Supabase RLS requirement (§18):

- **Firestore Security Rules + custom claims** (`role: admin | staff | customer`), set server-side via Admin SDK on user creation / role change.
- **All writes to business-critical collections** (`products`, `orders`, `coupons`, `settings`, variant/media/frameTemplate subcollections) go through server code only — Cloud Functions or Next.js server actions using the Admin SDK. Security rules default-deny direct client writes to these collections.
- **Client reads:** a user may read only their own `orders`, `uploads`, and `addresses` (rule: `resource.data.userId == request.auth.uid`). Public catalog collections (`products`, `categories`, and `reviews` where `status == 'approved'`) are readable by anyone, supporting SSR/SEO.
- **Storage:** private bucket, no public read; all image access via short-lived Admin-SDK-signed URLs (PDF §18).
- **Admin routes** are role-checked server-side, never only in the UI (PDF §18 explicit requirement).
- **Operational dependency to flag:** Firebase Phone Auth for Indian numbers requires reCAPTCHA configuration and has SMS billing/quota — this belongs alongside the existing "accounts must be in client's name" open item (PDF §21: domain, Razorpay KYC).

---

## 4. Repository structure

pnpm workspace monorepo. Three deployable units — web app, Cloud Functions, print-render service — share one `packages/shared` package for types, zod schemas, and pricing/DPI math, so the web app and backend can never disagree about a price or a quality threshold.

```
bro-pics/
├── apps/
│   └── web/                       # Next.js App Router — storefront + account + admin UI
│       ├── app/
│       │   ├── (shop)/            # public storefront: home, category, product, cart, checkout
│       │   ├── (account)/         # customer account, orders, tracking
│       │   ├── (admin)/           # admin panel (role-gated)
│       │   └── api/               # route handlers (Razorpay order creation, etc.)
│       ├── components/
│       │   ├── editor/            # personalization engine — isolated, lazily imported (PDF §13)
│       │   └── ...                # shared UI components
│       ├── lib/                   # firebase client/admin init, pricing, validation (zod), razorpay
│       └── public/
│
├── functions/                     # Firebase Cloud Functions
│   ├── src/
│   │   ├── webhooks/               # Razorpay webhook handler (idempotent, signature-verified)
│   │   ├── orders/                 # order state transitions, order_no counter, notifications
│   │   ├── coupons/                # coupon validation/redemption transactions
│   │   ├── search/                 # Algolia sync triggers
│   │   └── auth/                   # custom claims on user create/role change
│   └── package.json
│
├── services/
│   └── print-render/               # Cloud Run service — sharp-based print file rendering
│       ├── src/
│       ├── Dockerfile
│       └── package.json
│
├── packages/
│   └── shared/                     # types, zod schemas, pricing/DPI/paise-math — used by all three
│       ├── src/
│       │   ├── schemas/            # zod: product, variant, order, coupon, customization...
│       │   ├── types/
│       │   └── pricing/            # server-side price/DPI calculation
│       └── package.json
│
├── scripts/
│   └── seed/                       # seed categories/products/variants for local dev + preview
│
├── docs/
│   └── superpowers/specs/          # this document and future phase specs
│
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
├── firebase.json
├── pnpm-workspace.yaml
└── README.md                       # setup steps, env var reference, architecture overview
```

**Rationale:** top-level folders map 1:1 to the things a newcomer needs to distinguish — `apps/web` is the website, `functions` is server-side business logic triggered by events, `services/print-render` is the one heavyweight job that doesn't fit a Function, `packages/shared` is the single source of truth for types and money/DPI math. Route groups inside `apps/web/app` (`(shop)`, `(account)`, `(admin)`) mirror the PDF's own module boundaries (§5–§15) directly, so anyone cross-referencing the spec finds the matching folder immediately.

This structure is scaffolded (empty folders, configs, README, `package.json`s — no feature code) once this design is approved. Feature code is built phase by phase per the Roadmap.

---

## 5. Environments

Per PDF §3, adapted to Firebase:

- **local** — Firebase Emulator Suite (Firestore, Auth, Storage, Functions), Razorpay test keys.
- **preview** — a Firebase project per PR (or a shared dev project with prefixed collections), Razorpay test keys only.
- **production** — separate Firebase project, live Razorpay keys, custom domain, Firestore daily backups enabled, Storage lifecycle policy for abandoned uploads (PDF §18).

Conventions carried over unchanged from PDF §3: all money in integer paise; all timestamps stored as UTC (Firestore `Timestamp`), rendered in IST; every route/function boundary validates input with zod; feature branches, PR review, conventional commits.

---

## 6. Open items carried forward (not blocking this phase)

From PDF §21, still unresolved and deferred to the phase where they become relevant:

- **Text personalization** specifics (which products, character limits, font list) — depends on the final product catalogue (client-supplied), relevant to Phase 3 (Personalization Engine).
- **Shipping rules** (free-shipping threshold, flat charge, zone variance) — modeled as `settings` fields already; exact values to be supplied before Phase 4 (Checkout).
- **Frame mockups & masks** — client/photography-team deliverable required before Phase 3 (Personalization Engine) can be finished; the `frameTemplates` schema is ready to receive them.
- **Account ownership** — domain, Razorpay KYC, and now Firebase project + Google Cloud billing account must be created in the client's name (extends the PDF's existing item to cover Firebase/GCP).
- **Product catalogue** — full sizes/colours/materials/prices/photo-slot counts, needed to seed real data; `scripts/seed/` currently ships with placeholder data only.

---

## Decisions made in this document (summary)

| Decision | Choice |
|---|---|
| Database | Firestore (denormalized), not Cloud SQL |
| Search | Algolia, Firebase Extension sync |
| Hosting | Firebase App Hosting (not Vercel) |
| Revalidation | Time-based ISR (60s), not on-demand — platform limitation |
| Print rendering | Cloud Run service, not Cloud Function |
| WhatsApp | Link-only (`wa.me`) at launch, Cloud API deferred |
| COD | Prepaid only at launch; schema carries `paymentMode`/split-amount fields for future partial COD |
| GST | Not enabled at launch (no GSTIN yet); `settings.gstin`/`gstEnabled` and order `taxLines[]` present from day one |
| Courier | Manual AWB/tracking entry at launch; schema doesn't block future aggregator API |
| Repo layout | pnpm monorepo: `apps/web`, `functions`, `services/print-render`, `packages/shared` |
