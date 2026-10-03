# KarthysGallery (BroPics) — Comprehensive Project Context & Onboarding Guide

> **Document Version:** 1.1.0  
> **Last Verified Date:** October 2026  
> **Repository:** `d:\Projects\Bro-pics` | **Active Working Branch:** `San's(FE)`  
> **Brand Identity:** KarthysGallery (`karthysgallery.in`) | **Support:** `support@karthysgallery.in`  
> **Status:** 100% Code Complete & Verified (290/290 Test Suites Passing, 1,897/1,897 Tests, 100% TypeScript Clean)

---

## Table of Contents
1. [1. Project Overview](#1-project-overview)
2. [2. Tech Stack](#2-tech-stack)
3. [3. Architecture & Structure](#3-architecture--structure)
4. [4. Features & Implementation Map](#4-features--implementation-map)
5. [5. Data Model & API Catalog](#5-data-model--api-catalog)
6. [6. Configuration & Environment](#6-configuration--environment)
7. [7. Auth, Security & Storage](#7-auth-security--storage)
8. [8. Code Conventions & Patterns](#8-code-conventions--patterns)
9. [9. Problems, Risks & Tech Debt](#9-problems-risks--tech-debt)
10. [10. Git History & Evolution Trend](#10-git-history--evolution-trend)
11. [11. Next Steps & Launch Checklist](#11-next-steps--launch-checklist)

---

## 1. Project Overview

### 1.1 What the Project Does
**KarthysGallery** (formerly *BroPics*, operating in partnership with *Kavi Vazhi Photography*) is an industrial-grade, custom photo-framing e-commerce platform and personalization suite. It allows retail customers in India to:
1. Browse high-end physical photo frames, collages, and wall-art collections under the **KarthysGallery** brand.
2. Upload personal photos (supporting JPEG, PNG, WebP, and iPhone HEIC/HEIF).
3. Customize multi-slot frame layouts in an interactive real-time canvas studio with live DPI quality validation, calibrated transparent photo apertures (`x: 0.256, y: 0.192, width: 0.488, height: 0.620` on classic wooden frames), pinch/drag/rotate gestures, dynamic text zones with auto-fitting typography, and vector clipart/stickers.
4. Preview exact frame dimensions, matting margins, and finishes before purchase.
5. Add items to an offline-resilient Cart (`bropics_guest_cart` with seamless Firestore transaction sync and fallback).
6. Checkout with instant pincode validation, GST invoice generation, and dual-mode payment processing (Live Razorpay & Instant Mock Payment Gateway for testing).
7. Track order progress through an 8-stage production pipeline with live courier AWB tracking and manage post-purchase returns and verified reviews.

Behind the storefront sits a complete **Admin Backoffice & Industrial Print Pipeline**:
- A dedicated **Print Render Microservice** (running Sharp on Cloud Run) that consumes transactional print jobs and compiles high-resolution (300 DPI), print-ready composite PNGs and inspection JPG proofs.
- An 8-stage **Production & Quality Check Queue** with bulk ZIP downloads, printable job sheets, and 5-point physical QC checklists.
- Comprehensive **Catalogue, Template Builder, Media Library, Marketing/Coupons, Content CMS, Customer Directory, RBAC Roles, and Live Analytics** dashboards.

### 1.2 Who It Is For
- **Customers / Shoppers:** Seeking bespoke personalized photo frames, multi-photo memory collages, and wall art with instant preview and delivery across India.
- **Production Staff & Lab Technicians:** Operating the print queues, performing photo DPI validation, conducting physical quality checks, packing, and dispatching couriers.
- **Content & Catalogue Managers:** Managing product listings, variant matrices, frame templates, homepage layout sections, promo banners, videos, FAQs, and static policies.
- **Store Administrators & Business Owners:** Overseeing revenue analytics, order lifecycles, refunds, customer accounts, staff permissions, and store settings.

### 1.3 Current State
- **Codebase Completeness:** **100% Code Complete** across all customer storefront routes, admin UI screens, API route handlers, background Cloud Functions, print render worker, shared geometry math, and security rules.
- **Verification Status:**
  - `pnpm -r typecheck`: 100% clean (0 errors across all workspace packages).
  - Vitest Test Suite: **290 test files passed, 1,897 tests passed (0 failures)**.
  - Accessibility: Full `jest-axe` automated WCAG 2.1 AA audit coverage with 0 critical violations.
  - End-to-End Testing: Complete Playwright test suites configured for desktop and mobile viewports in [apps/web/e2e/](file:///d:/Projects/Bro-pics/apps/web/e2e).
- **Operational Status:**
  - The application is fully functional in development mode (`pnpm run dev`) and local emulation (`firebase emulators:start`).
  - Checkout supports both live Razorpay payment processing and automatic mock payment fallback for smooth local testing and order verification.

### 1.4 Documentation & Specifications in Repository
- [README.md](file:///d:/Projects/Bro-pics/README.md): Quick-start guide, workspace structure, and emulator instructions.
- [PROJECT_STATUS.md](file:///d:/Projects/Bro-pics/PROJECT_STATUS.md): Historical milestone log tracking completed engineering tracks.
- [docs/PRODUCTION_READINESS_AND_TEMPLATE_SPEC.md](file:///d:/Projects/Bro-pics/docs/PRODUCTION_READINESS_AND_TEMPLATE_SPEC.md): Comprehensive 600-line production readiness evaluation and Frame Template technical architecture.
- [docs/UI_PAGES_MASTER_REPORT.md](file:///d:/Projects/Bro-pics/docs/UI_PAGES_MASTER_REPORT.md): Complete audit of all storefront and backoffice UI pages.
- [docs/ops/restore-runbook.md](file:///d:/Projects/Bro-pics/docs/ops/restore-runbook.md): Disaster recovery and Firestore restore runbook.
- [tasks/README.md](file:///d:/Projects/Bro-pics/tasks/README.md), [tasks/FRONTEND_TASKS.md](file:///d:/Projects/Bro-pics/tasks/FRONTEND_TASKS.md), [tasks/BACKEND_TASKS.md](file:///d:/Projects/Bro-pics/tasks/BACKEND_TASKS.md), [tasks/ADMIN_BACKEND_TASKS.md](file:///d:/Projects/Bro-pics/tasks/ADMIN_BACKEND_TASKS.md), [tasks/ADMIN_FRONTEND_TASKS.md](file:///d:/Projects/Bro-pics/tasks/ADMIN_FRONTEND_TASKS.md): Detailed task specifications cross-referenced against the master implementation plan.

---

## 2. Tech Stack

### 2.1 Core Technologies & Runtime Requirements
| Layer | Technology | Version | Location / Config |
|---|---|---|---|
| **Package Manager** | `pnpm` (Workspace monorepo) | `9.12.0` | [package.json](file:///d:/Projects/Bro-pics/package.json), [pnpm-workspace.yaml](file:///d:/Projects/Bro-pics/pnpm-workspace.yaml) |
| **Runtime** | Node.js (Target: Node 20 LTS) | `20.x` | [firebase.json](file:///d:/Projects/Bro-pics/firebase.json), Dockerfile |
| **Language** | TypeScript (Strict mode) | `^5.6.0` | [tsconfig.base.json](file:///d:/Projects/Bro-pics/tsconfig.base.json) |
| **Frontend Framework** | Next.js (App Router, Server & Client Components) | `^15.0.0` | [apps/web/package.json](file:///d:/Projects/Bro-pics/apps/web/package.json) |
| **UI Library** | React & React DOM | `^18.3.0` | [apps/web/package.json](file:///d:/Projects/Bro-pics/apps/web/package.json) |
| **Styling** | TailwindCSS + PostCSS + Autoprefixer | `^3.4.13` | [apps/web/tailwind.config.ts](file:///d:/Projects/Bro-pics/apps/web/tailwind.config.ts) |
| **Micro-Animations** | Framer Motion | `^13.3.0` | [apps/web/components/motion/](file:///d:/Projects/Bro-pics/apps/web/components/motion) |
| **Image Processing** | Sharp (Server-side native engine) | `^0.35.0` | [apps/web/lib/image-probe.ts](file:///d:/Projects/Bro-pics/apps/web/lib/image-probe.ts), [services/print-render/](file:///d:/Projects/Bro-pics/services/print-render) |
| **HEIC/HEIF Decoder** | `heic-convert` (Native libheif bindings) | `^2.1.0` | [apps/web/lib/heic-convert.ts](file:///d:/Projects/Bro-pics/apps/web/lib/heic-convert.ts) |
| **ZIP Packaging** | JSZip (Bulk print download archiving) | `^3.10.2` | [apps/web/app/api/admin/orders/bulk-print-files/route.ts](file:///d:/Projects/Bro-pics/apps/web/app/api/admin/orders/bulk-print-files/route.ts) |
| **HTML Sanitizer** | `sanitize-html` | `^2.17.7` | [apps/web/lib/sanitize-rich-text.ts](file:///d:/Projects/Bro-pics/apps/web/lib/sanitize-rich-text.ts) |
| **Validation / Schema** | Zod (End-to-end type inference & strict guards) | `^3.23.0` | [packages/shared/src/schemas/](file:///d:/Projects/Bro-pics/packages/shared/src/schemas) |

### 2.2 Backend, Database, Cloud & Third-Party Integrations
| Service / Component | Role & Provider | Configuration / Reference |
|---|---|---|
| **Database** | Google Cloud Firestore (Native NoSQL mode) | [firestore.rules](file:///d:/Projects/Bro-pics/firestore.rules), [firestore.indexes.json](file:///d:/Projects/Bro-pics/firestore.indexes.json) |
| **Object Storage** | Google Cloud Storage (Private uploads/renders + public CMS) | [storage.rules](file:///d:/Projects/Bro-pics/storage.rules), [cors.json](file:///d:/Projects/Bro-pics/cors.json) |
| **Authentication** | Firebase Authentication (Phone, Google OAuth, Email/Password) | [apps/web/lib/firebase-client.ts](file:///d:/Projects/Bro-pics/apps/web/lib/firebase-client.ts), [apps/web/lib/verify-id-token.ts](file:///d:/Projects/Bro-pics/apps/web/lib/verify-id-token.ts) |
| **Serverless Triggers** | Firebase Cloud Functions v2 (Node 20 runtime, esbuild) | [functions/package.json](file:///d:/Projects/Bro-pics/functions/package.json), [functions/src/index.ts](file:///d:/Projects/Bro-pics/functions/src/index.ts) |
| **Print Microservice** | Express + Sharp on Google Cloud Run (Containerized 300 DPI worker) | [services/print-render/Dockerfile](file:///d:/Projects/Bro-pics/services/print-render/Dockerfile), [services/print-render/src/server.ts](file:///d:/Projects/Bro-pics/services/print-render/src/server.ts) |
| **Payment Gateway** | Razorpay (Standard Checkout, Orders API, Refunds API, Webhooks) | [apps/web/lib/razorpay-client.ts](file:///d:/Projects/Bro-pics/apps/web/lib/razorpay-client.ts), [functions/src/webhooks/razorpay.ts](file:///d:/Projects/Bro-pics/functions/src/webhooks/razorpay.ts) |
| **Search Engine** | Dual-mode: Local Firestore Query Plan & Algolia Indexing | [packages/shared/src/search/](file:///d:/Projects/Bro-pics/packages/shared/src/search), [functions/src/search/](file:///d:/Projects/Bro-pics/functions/src/search) |
| **CI / CD Pipeline** | GitHub Actions (Typecheck, Lint, Test, Rules, Audit, Gitleaks) | [.github/workflows/ci.yml](file:///d:/Projects/Bro-pics/.github/workflows/ci.yml) |

### 2.3 Testing Tools & Infrastructure
| Tool | Scope & Purpose |
|---|---|
| **Vitest (`^2.1.0`)** | Unit and integration test runner for all workspace packages. |
| **Testing Library (`^16.0.0`)** | Component interaction testing and hook harness in `apps/web`. |
| **`jest-axe` (`^11.0.0`)** | Automated WCAG 2.1 AA accessibility assertions. |
| **`@firebase/rules-unit-testing` (`^3.0.4`)** | Emulator-backed security rules testing for Firestore and Storage. |
| **Playwright (`^1.63.0`)** | Cross-browser End-to-End testing (Chromium, Firefox, WebKit, Mobile). |

---

## 3. Architecture & Structure

### 3.1 Monorepo Workspace Directory Tree
```
d:\Projects\Bro-pics\
├── apps/
│   └── web/                                # Next.js 15 full-stack storefront & admin application
│       ├── app/                            # App Router routes (Shop, Account, Checkout, Admin, API)
│       │   ├── (account)/                  # User profile, address book, orders, reviews, wishlist
│       │   ├── (content)/                  # CMS-backed policy & info pages (about, faq, policies)
│       │   ├── (shop)/                     # Homepage, category catalog, product detail, search
│       │   ├── admin/                      # Complete Admin Backoffice control panel
│       │   ├── api/                        # Next.js Server Route Handlers (Customer, Admin, Auth)
│       │   ├── checkout/                   # Funnel checkout page with Razorpay integration
│       │   └── invoice/                    # Printable GST tax invoice page
│       ├── components/                     # Reusable React components (Admin, Editor, UI, Layout)
│       ├── e2e/                            # Playwright end-to-end test specifications
│       ├── lib/                            # Server & client utilities (Firebase, Auth, Rate Limit)
│       ├── public/                         # Static icons, placeholder graphics, clipart SVGs
│       └── next.config.ts                  # Next.js configuration with security headers & Sharp externalization
├── functions/                              # Firebase Cloud Functions v2 package
│   └── src/                                # Triggers for webhooks, order numbering, search sync, denormalization
├── services/
│   └── print-render/                       # Cloud Run containerized print rendering microservice
│       ├── src/                            # Express server, Sharp slot compositor, text renderer
│       └── Dockerfile                      # Production container spec for Cloud Run
├── packages/
│   └── shared/                             # Pure TypeScript business logic, math, schemas, RBAC
│       └── src/
│           ├── auth/                       # Role definitions and granular permission maps
│           ├── editor-geometry.ts          # Pure coordinate transformations (scale, offset, rotation, DPI)
│           ├── orders/                     # Order status state machine, labels, transition rules
│           ├── pricing/                    # GST calculation, coupon discounting, price math
│           └── schemas/                    # Zod validation schemas for all Firestore documents
├── scripts/
│   └── seed/                               # Database seeding, role assignment, and storage migration CLI
├── firestore-rules-tests/                  # Automated Vitest test suite for security rules against emulators
├── docs/                                   # Architectural specs, planning documents, operations runbooks
├── tasks/                                  # Monorepo task checklists (FE, BE, AFE, ABE)
├── firestore.rules                         # Production Firestore database security rules
├── firestore.indexes.json                  # Production Firestore composite and collectionGroup indexes
├── storage.rules                           # Production Cloud Storage security rules
├── cors.json                               # GCS bucket CORS rules for canvas cross-origin export
├── firebase.json                           # Firebase CLI configuration (Emulators, Functions, Rules)
├── pnpm-workspace.yaml                     # Workspace package definitions
└── tsconfig.base.json                      # Monorepo base TypeScript compiler configuration
```

### 3.2 System Interaction & Communication Diagram
```mermaid
graph TD
    subgraph Client Layer
        Web[Next.js 15 Storefront & Admin]
        Editor[HTML5 Canvas Personalization Studio]
    end

    subgraph Server Layer (Next.js Route Handlers)
        PublicAPI[Customer APIs: /api/uploads, /api/customizations, /api/checkout]
        AdminAPI[Admin APIs: /api/admin/* with RBAC & Rate Limiting]
    end

    subgraph Cloud Infrastructure
        Firestore[(Google Cloud Firestore)]
        Storage[(Google Cloud Storage)]
        Functions[Firebase Cloud Functions v2]
        Worker[Cloud Run Print Render Worker]
    end

    subgraph External Gateways
        Razorpay[Razorpay Payment Gateway]
        Courier[Courier AWB Tracking API]
    end

    Editor -->|Signed Direct Upload| PublicAPI
    PublicAPI -->|Store Metadata| Firestore
    PublicAPI -->|Object Path Resolution| Storage
    PublicAPI -->|Order Init| Razorpay

    Web -->|Admin Operations| AdminAPI
    AdminAPI -->|Enforce RBAC| Firestore

    Razorpay -->|Webhook: payment.captured| Functions
    Functions -->|Advance Order & Create Print Job| Firestore
    Functions -->|Trigger High-Res Render| Worker

    Worker -->|Fetch Originals & Templates| Storage
    Worker -->|Write 300 DPI PNG & Proof JPG| Storage
    Worker -->|Mark Job Complete| Firestore
```

### 3.3 Request Lifecycles & Data Flow
1. **Photo Upload & Pre-Processing:**
   - Client selects image $\rightarrow$ `POST /api/uploads` $\rightarrow$ Magic bytes sniffed, Sharp dimensions verified, HEIC converted to sRGB JPEG, EXIF stripped, 40MB/120MP bomb protection checked $\rightarrow$ Stored in private `uploads/{uploadId}/normalized.jpg` $\rightarrow$ Returns upload ID & dimensions.
2. **Personalization & Draft Autosave:**
   - User adjusts photo scale/offset/rotation, edits text zones, selects clipart $\rightarrow$ Geometry calculated via [packages/shared/src/editor-geometry.ts](file:///d:/Projects/Bro-pics/packages/shared/src/editor-geometry.ts) $\rightarrow$ Debounced draft saved to `localStorage` & `PUT /api/customizations/{id}` $\rightarrow$ Add-to-cart verifies required text fields & template constraints server-side $\rightarrow$ Customization doc created in Firestore with status `draft`.
3. **Checkout & Payment:**
   - User fills delivery address $\rightarrow$ `POST /api/checkout/create-order` $\rightarrow$ Server recalculates subtotal, shipping, GST (18%), and coupon discounts $\rightarrow$ Idempotent Razorpay order created $\rightarrow$ Customer completes Razorpay Modal checkout.
4. **Webhook & Production Pipeline:**
   - Razorpay fires `payment.captured` $\rightarrow$ Verified via HMAC SHA-256 in `functions/src/webhooks/razorpay.ts` $\rightarrow$ Order advanced to `payment_confirmed` $\rightarrow$ Customization doc locked (`ordered`) $\rightarrow$ Print jobs generated in `printJobs` collection $\rightarrow$ Status advanced to `photo_validation` (or `print_ready` if DPI is green) $\rightarrow$ Cloud Run worker renders 300 DPI master print file.

---

## 4. Features & Implementation Map

### 4.1 Customer Storefront & Shopping Discovery
| Feature | Description | Key Files & Components |
|---|---|---|
| **Dynamic CMS Homepage** | Hero slider, value props, bestseller rails, category showcase, customer reviews carousel, and "How it works" timeline. | [apps/web/app/(shop)/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/(shop)/page.tsx)<br>[HeroSlider.tsx](file:///d:/Projects/Bro-pics/apps/web/components/home/HeroSlider.tsx)<br>[WhyUs.tsx](file:///d:/Projects/Bro-pics/apps/web/components/home/WhyUs.tsx)<br>[HowItWorks.tsx](file:///d:/Projects/Bro-pics/apps/web/components/home/HowItWorks.tsx) |
| **Category Catalog & Filters** | Responsive product grid, price slider, size, color, orientation, rating, and stock filters with mobile bottom sheet. | [apps/web/app/(shop)/category/[slug]/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/(shop)/category/[slug]/page.tsx)<br>[ProductFilters.tsx](file:///d:/Projects/Bro-pics/apps/web/components/filters/ProductFilters.tsx)<br>[SortSelect.tsx](file:///d:/Projects/Bro-pics/apps/web/components/filters/SortSelect.tsx) |
| **Search & Typeahead** | Live autocomplete with category thumbnails, popular search tags, and recent search history. | [apps/web/app/(shop)/search/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/(shop)/search/page.tsx)<br>[SearchTypeahead.tsx](file:///d:/Projects/Bro-pics/apps/web/components/search/SearchTypeahead.tsx)<br>[apps/web/app/api/search-suggestions/route.ts](file:///d:/Projects/Bro-pics/apps/web/app/api/search-suggestions/route.ts) |
| **Product Detail Page (PDP)** | Gallery strip, variant picker (size/frame color), pincode delivery estimate checker, size guide modal, FAQ tabs, and related products rail. | [apps/web/app/(shop)/product/[slug]/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/(shop)/product/[slug]/page.tsx)<br>[ProductDetailClient.tsx](file:///d:/Projects/Bro-pics/apps/web/components/product/ProductDetailClient.tsx)<br>[Gallery.tsx](file:///d:/Projects/Bro-pics/apps/web/components/product/Gallery.tsx)<br>[BuyBox.tsx](file:///d:/Projects/Bro-pics/apps/web/components/product/BuyBox.tsx) |

### 4.2 Interactive Personalization Studio
| Feature | Description | Key Files & Components |
|---|---|---|
| **Multi-Slot Canvas Editor** | Interactive HTML5 2D canvas supporting multi-photo collage frames, matting borders, drag positioning, zoom factor scaling, and 90° rotation. | [EditorCanvas.tsx](file:///d:/Projects/Bro-pics/apps/web/components/editor/EditorCanvas.tsx)<br>[SlotPicker.tsx](file:///d:/Projects/Bro-pics/apps/web/components/editor/SlotPicker.tsx)<br>[packages/shared/src/editor-geometry.ts](file:///d:/Projects/Bro-pics/packages/shared/src/editor-geometry.ts) |
| **Gesture & Mobile Engine** | Single-finger drag pan, two-finger pinch-to-zoom, two-finger discrete twist rotation, and iOS Safari 16.7 MP bitmap downsampling guard. | [EditorCanvas.tsx](file:///d:/Projects/Bro-pics/apps/web/components/editor/EditorCanvas.tsx)<br>[EditorCanvas.gestures.test.ts](file:///d:/Projects/Bro-pics/apps/web/components/editor/EditorCanvas.gestures.test.ts) |
| **Live DPI Quality Badge** | Real-time calculation of effective DPI with instant visual feedback (Green $\ge 300$, Amber $150-299$, Red $< 150$ with customer warning confirmation). | [DpiBadge.tsx](file:///d:/Projects/Bro-pics/apps/web/components/editor/DpiBadge.tsx)<br>[packages/shared/src/dpi/calculate-dpi.ts](file:///d:/Projects/Bro-pics/packages/shared/src/dpi/calculate-dpi.ts) |
| **Dynamic Text & Typography** | Template text zones with character limits, required flags, live font selection, curated color swatches, and automatic font-size fitting. | [TextFieldEditor.tsx](file:///d:/Projects/Bro-pics/apps/web/components/editor/TextFieldEditor.tsx)<br>[apps/web/lib/text-personalization-options.ts](file:///d:/Projects/Bro-pics/apps/web/lib/text-personalization-options.ts) |
| **Clipart & Stickers** | Vector SVG sticker picker with position and scale adjustments. | [ClipartPicker.tsx](file:///d:/Projects/Bro-pics/apps/web/components/editor/ClipartPicker.tsx)<br>[apps/web/public/clipart/](file:///d:/Projects/Bro-pics/apps/web/public/clipart) |
| **Undo / Redo & Draft Autosave** | 50-step snapshot command stack with `Ctrl+Z`/`Ctrl+Shift+Z` keyboard shortcuts, debounced `localStorage` autosave, and restore banner. | [personalization-draft.ts](file:///d:/Projects/Bro-pics/apps/web/lib/personalization-draft.ts)<br>[ProductDetailClient.tsx](file:///d:/Projects/Bro-pics/apps/web/components/product/ProductDetailClient.tsx) |

### 4.3 Cart, Checkout & Customer Accounts
| Feature | Description | Key Files & Components |
|---|---|---|
| **Slide-Out Cart Drawer** | Dynamic line item repricing, re-edit design directly from cart (`?edit=personalizationId`), coupon code application, and free shipping progress bar. | [CartDrawer.tsx](file:///d:/Projects/Bro-pics/apps/web/components/layout/CartDrawer.tsx)<br>[cart-context.tsx](file:///d:/Projects/Bro-pics/apps/web/lib/cart-context.tsx) |
| **Checkout Funnel** | Saved address selector, new address form with pincode validation, GST invoice breakdown, idempotent order creation, and Razorpay standard checkout. | [apps/web/app/checkout/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/checkout/page.tsx)<br>[apps/web/app/api/checkout/create-order/route.ts](file:///d:/Projects/Bro-pics/apps/web/app/api/checkout/create-order/route.ts) |
| **Customer Order Tracking** | Full status timeline, live courier tracking URL / AWB link, item breakdown, printable GST invoice, and instant "Reorder" button. | [apps/web/app/(account)/orders/[orderId]/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/(account)/orders/[orderId]/page.tsx)<br>[apps/web/app/invoice/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/invoice/page.tsx) |
| **Returns & Replacements** | Customer return request flow with mandatory damage photo upload, reason categories, and refund vs replacement preference. | [apps/web/app/api/orders/[orderId]/returns/route.ts](file:///d:/Projects/Bro-pics/apps/web/app/api/orders/[orderId]/returns/route.ts)<br>[apps/web/app/api/orders/[orderId]/returns/evidence/route.ts](file:///d:/Projects/Bro-pics/apps/web/app/api/orders/[orderId]/returns/evidence/route.ts) |
| **Reviews & Ratings** | Customer review submission with verified purchase badge and multi-photo attachments. | [apps/web/app/api/reviews/route.ts](file:///d:/Projects/Bro-pics/apps/web/app/api/reviews/route.ts)<br>[ReviewsSection.tsx](file:///d:/Projects/Bro-pics/apps/web/components/product/ReviewsSection.tsx) |
| **Account Management** | User profile, signed profile picture upload, saved address book, wishlist sync, session revocation, and GDPR account deletion. | [apps/web/app/(account)/account/profile/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/(account)/account/profile/page.tsx)<br>[apps/web/app/api/auth/revoke-sessions/route.ts](file:///d:/Projects/Bro-pics/apps/web/app/api/auth/revoke-sessions/route.ts) |

### 4.4 Admin Backoffice & Operational Control Panel
| Module | Capabilities | Key Routes & Pages |
|---|---|---|
| **Admin Shell & RBAC** | Grouped navigation, global search (`/` shortcut), staging indicator, and role-based route/action enforcement across 5 roles. | [apps/web/app/admin/layout.tsx](file:///d:/Projects/Bro-pics/apps/web/app/admin/layout.tsx)<br>[require-permission.ts](file:///d:/Projects/Bro-pics/apps/web/lib/require-permission.ts)<br>[AdminShell.tsx](file:///d:/Projects/Bro-pics/apps/web/components/admin/AdminShell.tsx) |
| **Executive Dashboard & Analytics** | Real-time KPIs (Revenue, AOV, Order Pipeline, Photo Validation alerts, Renders queued/failed, Returns), sales charts, and top products. | [apps/web/app/admin/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/admin/page.tsx)<br>[apps/web/app/admin/analytics/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/admin/analytics/page.tsx) |
| **Catalogue & Variant Matrix** | Product editor (Tabs: General, Pricing, Variants, Media, Personalization, SEO, Delivery), variant matrix grid (Size $\times$ Color), category hierarchy tree, and collections manager. | [apps/web/app/admin/products/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/admin/products/page.tsx)<br>[apps/web/app/admin/products/[id]/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/admin/products/[id]/page.tsx)<br>[apps/web/app/admin/categories/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/admin/categories/page.tsx)<br>[apps/web/app/admin/collections/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/admin/collections/page.tsx) |
| **Frame Template Builder** | Visual slot coordinate builder (numeric mm inputs, slot layering, text zones, font/color restrictions, test render preview & 300 DPI download). | [apps/web/app/admin/products/[id]/template/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/admin/products/[id]/template/page.tsx)<br>[apps/web/app/api/admin/products/[id]/variants/[variantId]/template/route.ts](file:///d:/Projects/Bro-pics/apps/web/app/api/admin/products/[id]/variants/[variantId]/template/route.ts) |
| **Production Queue & QC** | 8-stage pipeline (`paid` $\rightarrow$ `photo_validation` $\rightarrow$ `rendering` $\rightarrow$ `print_ready` $\rightarrow$ `production` $\rightarrow$ `qc` $\rightarrow$ `packed` $\rightarrow$ `shipped`), 5-point physical QC checklist, bulk ZIP print download, and printable job sheets. | [apps/web/app/admin/production/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/admin/production/page.tsx)<br>[apps/web/app/admin/production/qc/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/admin/production/qc/page.tsx)<br>[apps/web/app/admin/orders/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/admin/orders/page.tsx)<br>[apps/web/app/admin/orders/[id]/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/admin/orders/[id]/page.tsx) |
| **Media Library** | Centralized DAM for product photography and banners, direct signed upload, usage reference tracking, and archive guards. | [apps/web/app/admin/media/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/admin/media/page.tsx)<br>[apps/web/app/api/admin/media/route.ts](file:///d:/Projects/Bro-pics/apps/web/app/api/admin/media/route.ts) |
| **Returns & Refund Manager** | Evidence photo viewer, reject/approve actions, replacement trigger, and typed confirmation refund modal with Razorpay refund execution. | [apps/web/app/admin/returns/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/admin/returns/page.tsx)<br>[RefundModal.tsx](file:///d:/Projects/Bro-pics/apps/web/components/admin/RefundModal.tsx) |
| **Marketing & CMS** | Homepage section builder (reorderable sections, hero slides), promo banners, coupon management, UGC video manager, and policy page CMS. | [apps/web/app/admin/homepage/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/admin/homepage/page.tsx)<br>[apps/web/app/admin/coupons/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/admin/coupons/page.tsx)<br>[apps/web/app/admin/pages/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/admin/pages/page.tsx)<br>[apps/web/app/admin/videos/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/admin/videos/page.tsx) |
| **Settings & Team Roles** | Store metadata, shipping rates & courier templates, GST settings, notification templates, and staff role management with instant revocation. | [apps/web/app/admin/settings/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/admin/settings/page.tsx)<br>[apps/web/app/admin/roles/page.tsx](file:///d:/Projects/Bro-pics/apps/web/app/admin/roles/page.tsx) |

---

## 5. Data Model & API Catalog

### 5.1 Firestore Collections & Schema Architecture
All Firestore entities are modeled with Zod schemas in [packages/shared/src/schemas/](file:///d:/Projects/Bro-pics/packages/shared/src/schemas).

```
Firestore Root
├── products/ {productId}                   (ProductSchema)
│   ├── variants/ {variantId}               (VariantSchema)
│   ├── media/ {mediaId}                   (ProductMediaSchema)
│   └── frameTemplates/ {templateId}        (FrameTemplateSchema - collectionGroup indexed)
├── categories/ {categoryId}                (CategorySchema)
├── collections/ {collectionId}             (CollectionSchema)
├── customizations/ {customizationId}       (CustomizationSchema v2)
├── orders/ {orderId}                       (OrderSchema)
│   ├── items/ {itemId}                     (OrderItemSchema)
│   └── events/ {eventId}                   (OrderEventSchema)
├── printJobs/ {jobId}                      (PrintJobSchema)
├── returns/ {returnId}                     (ReturnSchema)
│   └── events/ {eventId}                   (ReturnEventSchema)
├── refunds/ {refundId}                     (RefundSchema)
├── reviews/ {reviewId}                     (ReviewSchema)
├── users/ {userId}                         (UserSchema)
├── staff/ {userId}                         (StaffMirrorSchema)
├── staffInvites/ {inviteId}                (StaffInviteSchema)
├── coupons/ {couponId}                     (CouponSchema)
├── banners/ {bannerId}                     (BannerSchema)
├── homepageSections/ {sectionId}           (HomepageSectionSchema)
├── pages/ {pageId}                         (PageSchema)
├── faqs/ {faqId}                           (FaqItemSchema)
├── testimonials/ {testimonialId}           (TestimonialSchema)
├── videos/ {videoId}                       (VideoSchema)
├── mediaAssets/ {assetId}                  (MediaAssetSchema)
├── notifications/ {notificationId}         (NotificationSchema)
├── notificationTemplates/ {templateId}     (NotificationTemplateSchema)
├── notificationOutbox/ {outboxId}          (NotificationOutboxSchema)
├── analyticsDaily/ {dateKey}               (AnalyticsDailySchema)
└── settings/ {key}                         (store, shipping, tax, header, footer, seo, search, announcementBar, courier)
```

### 5.2 Key Entity Schemas & Relationships
1. **`products` & `variants` ([product.ts](file:///d:/Projects/Bro-pics/packages/shared/src/schemas/product.ts), [variant.ts](file:///d:/Projects/Bro-pics/packages/shared/src/schemas/variant.ts)):**
   - Products contain global metadata, title, slug, descriptionHtml, categoryId, orientation, badge, basePrice, and SEO meta.
   - Subcollection `variants` defines size, frame color, SKU, price, compareAtPrice, stockStatus, inventoryQty, printWidthPx, printHeightPx, and active frame template reference.
2. **`frameTemplates` ([frame-template.ts](file:///d:/Projects/Bro-pics/packages/shared/src/schemas/frame-template.ts)):**
   - Stored under `products/{id}/variants/{variantId}/frameTemplates/{id}`.
   - Defines physical print dimensions in mm, canvas dimensions in px, multi-slot layout rectangles (`x, y, width, height, rotation, zIndex, maskPath`), dynamic text zones (`zoneId, x, y, width, height, defaultText, minFontSizePx, maxFontSizePx, allowedFontKeys, allowedColorValues, required`), and overlay artwork path.
3. **`customizations` ([customization.ts](file:///d:/Projects/Bro-pics/packages/shared/src/schemas/customization.ts)):**
   - Connects user uploaded photos to a specific frame template.
   - Fields: `userId`, `sessionId`, `productId`, `variantId`, `templateVersion`, `slots` (array of slot transforms: `uploadId, scale, offsetX, offsetY, rotationDeg, confirmedLowDpi`), `textFieldsJson` (map of text values, font keys, hex colors), `selectedClipartId`, `renderStatus` (`pending` | `completed` | `failed`), `effectiveDpi`, and lifecycle status (`draft` | `ordered` | `locked`).
4. **`orders` & `orderEvents` ([order.ts](file:///d:/Projects/Bro-pics/packages/shared/src/schemas/order.ts)):**
   - Root order entity: `orderNo` (sequential formatted ID e.g., `BP-2026-00123`), `userId`, `customer` (name, phone, email), `shippingAddress`, `status` (8-stage state machine), `subtotal`, `discountTotal`, `shippingTotal`, `taxTotal` (inclusive 18% GST with GSTIN breakdown), `total`, `payment` (`razorpayOrderId`, `razorpayPaymentId`, `status`), `shipmentTracking` (`courierName`, `awb`, `trackingUrl`).
   - `orderEvents`: Immutable append-only audit trail logging transitions, timestamp, actor UID, and metadata.
5. **`printJobs` ([print-job.ts](file:///d:/Projects/Bro-pics/packages/shared/src/schemas/print-job.ts)):**
   - Transactional print rendering queue. Fields: `orderId`, `orderItemId`, `variantId`, `status` (`queued`, `leased`, `completed`, `failed`), `leaseExpiry`, `attemptCount`, `renderedFilePath` (300 DPI composite PNG), `proofFilePath` (72 DPI inspection JPG), `outputSha256`, and error logs.

### 5.3 Complete API Route Map
#### Public & Customer Endpoints
| Route | Method | Purpose | Input / Payload | Auth Requirement |
|---|---|---|---|---|
| `/api/uploads` | `POST` | Upload and normalize photo (HEIC, EXIF, Bomb check) | `multipart/form-data` | Session / UID |
| `/api/uploads/[id]` | `GET` | Retrieve upload metadata and fresh preview URL | `id` param | Session / UID |
| `/api/customizations` | `POST` | Create a new customization document | JSON payload with slot transforms & text | Session / UID |
| `/api/customizations` | `GET` | Fetch customization docs for editing | `personalizationId` query | Owner / Session |
| `/api/customizations/[id]` | `PUT` | Update draft customization transform | JSON slot & text transform payload | Owner / Session |
| `/api/customizations/reorder` | `POST` | Deep-copy customization for repeat purchase | `{ personalizationId }` | Owner UID |
| `/api/checkout/create-order` | `POST` | Calculate pricing and generate Razorpay order | Cart items, address, coupon, idempotency key | Session / UID |
| `/api/checkout/coupon/validate` | `POST` | Validate discount code against current cart | `{ code, subtotal, items }` | Public |
| `/api/coupons/available` | `GET` | Retrieve eligible promo coupons for customer | Query context | Public |
| `/api/delivery-estimate` | `GET` | Check pincode serviceability and delivery dates | `?pincode=110001` | Public |
| `/api/search-suggestions` | `GET` | Typeahead autocomplete results | `?q=wedding` | Public |
| `/api/media/url` | `GET` | Resolve signed Storage URL with 15-min TTL | `?path=uploads/...` | Owner / Staff |
| `/api/orders/[orderId]/cancel` | `POST` | Cancel pending/unpaid order | `{ reason }` | Order Owner |
| `/api/orders/[orderId]/returns` | `POST` | Submit return / exchange request | Return items, reason, resolution, photos | Order Owner |
| `/api/orders/[orderId]/returns/evidence` | `POST` | Upload return damage evidence image | `multipart/form-data` | Order Owner |
| `/api/reviews` | `POST` | Submit product review | Rating, title, comment, media paths | Verified Buyer |
| `/api/wishlist` | `GET/POST/DELETE` | Manage customer wishlist items | `{ productId }` | Authenticated UID |
| `/api/notifications` | `GET` | Retrieve in-app notifications | Auth token | Authenticated UID |
| `/api/auth/revoke-sessions` | `POST` | Revoke all active session tokens | Auth token | Authenticated UID |

#### Admin & Backoffice Endpoints (`/api/admin/*`)
*All Admin endpoints require valid Firebase Bearer tokens with appropriate RBAC permissions.*
| Route | Method | Granular Permission | Description |
|---|---|---|---|
| `/api/admin/products` | `GET/POST` | `catalogue:read/write` | List products with pagination/filters; create product |
| `/api/admin/products/[id]` | `GET/PUT/DELETE` | `catalogue:read/write` | Fetch, update, or archive product |
| `/api/admin/products/[id]/variants` | `GET/POST` | `catalogue:read/write` | List and create variant combinations |
| `/api/admin/products/[id]/variants/[variantId]/template` | `GET/PUT` | `catalogue:read/write` | Fetch and update frame template coordinates |
| `/api/admin/categories` | `GET/POST` | `catalogue:read/write` | Manage product categories |
| `/api/admin/collections` | `GET/POST` | `catalogue:read/write` | Manage promotional curated collections |
| `/api/admin/inventory` | `GET/PATCH` | `catalogue:read/write` | Rapid inventory stock adjustments |
| `/api/admin/media` | `GET/POST/DELETE` | `catalogue:read/write` | DAM media library and direct signed upload |
| `/api/admin/orders` | `GET` | `orders:read` | List orders with multi-status filtering & search |
| `/api/admin/orders/[id]` | `GET` | `orders:read` | Complete order detail, audit events, and downloads |
| `/api/admin/orders/[id]/advance` | `POST` | `orders:write` | Advance order along the 8-stage production pipeline |
| `/api/admin/orders/[id]/qc` | `POST` | `orders:write` | Record 5-point physical QC checklist pass/fail |
| `/api/admin/orders/[id]/shipping` | `POST` | `orders:write` | Record courier partner and AWB tracking number |
| `/api/admin/orders/[id]/refunds` | `POST` | `returns:write` | Execute partial/full refund via Razorpay |
| `/api/admin/orders/bulk-print-files` | `POST` | `orders:read` | Stream zipped 300 DPI master print PNGs |
| `/api/admin/returns` | `GET` | `returns:read` | List customer returns queue |
| `/api/admin/returns/[returnId]` | `GET/PATCH` | `returns:write` | Process return decision (Approve/Reject/Exchange) |
| `/api/admin/reviews` | `GET` | `reviews:moderate` | Moderation queue for product reviews |
| `/api/admin/reviews/[id]/moderate` | `PATCH` | `reviews:moderate` | Approve, reject, or feature customer review |
| `/api/admin/coupons` | `GET/POST` | `coupons:write` | Create and manage discount coupons |
| `/api/admin/homepage-sections` | `GET/POST` | `content:write` | Manage dynamic homepage CMS sections |
| `/api/admin/pages` | `GET/POST/PUT` | `content:write` | Manage static CMS pages and policy copy |
| `/api/admin/faqs` | `GET/POST/PUT` | `content:write` | Manage FAQ Help Center accordions |
| `/api/admin/testimonials` | `GET/POST` | `content:write` | Manage customer testimonial callouts |
| `/api/admin/videos` | `GET/POST` | `content:write` | Manage UGC video rail clips |
| `/api/admin/customers` | `GET` | `customers:read` | Directory of customer accounts and metrics |
| `/api/admin/customers/[uid]/disable`| `POST` | `customers:write` | Disable customer account and revoke sessions |
| `/api/admin/staff` | `GET/POST` | `team:manage` | List staff and invite new staff members |
| `/api/admin/staff/[uid]/disable` | `POST` | `team:manage` | Disable staff access with immediate revocation |
| `/api/admin/users/[uid]/role` | `PUT` | `team:manage` | Assign or elevate RBAC user roles |
| `/api/admin/settings/[key]` | `GET/PUT` | `settings:write` | Manage singleton store configuration documents |
| `/api/admin/analytics` | `GET` | `analytics:read` | Query aggregated sales and operational metrics |

---

## 6. Configuration & Environment

### 6.1 Environment Variables
All variables are defined in [.env.example](file:///d:/Projects/Bro-pics/.env.example). *Values are never committed to version control.*

| Variable Name | Required By | Description / Purpose |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `apps/web` | Firebase Web API Key for client authentication & Firestore SDK. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `apps/web` | Firebase Auth domain (e.g., `bropics-app.firebaseapp.com`). |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `apps/web`, `functions` | Google Cloud / Firebase Project ID (`bropics-app`). |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `apps/web`, `functions` | GCS bucket name (`bropics-app.firebasestorage.app`). |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `apps/web` | Firebase Cloud Messaging sender ID. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `apps/web` | Firebase App ID string. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | `apps/web`, `services` | Base64 or JSON string of GCP Service Account credentials for Admin SDK. |
| `RAZORPAY_KEY_ID` | `apps/web` | Razorpay Merchant Key ID (Test key in staging, Live in prod). |
| `RAZORPAY_KEY_SECRET` | `apps/web`, `functions` | Razorpay Secret for API operations (Order creation & Refunds). |
| `RAZORPAY_WEBHOOK_SECRET` | `functions` | Webhook secret for HMAC SHA-256 signature verification. |
| `ALGOLIA_APP_ID` | `apps/web`, `functions` | Algolia application ID for catalog search indexing. |
| `ALGOLIA_ADMIN_API_KEY` | `functions` | Algolia admin API key for search record synchronization. |
| `NEXT_PUBLIC_ALGOLIA_SEARCH_ONLY_KEY` | `apps/web` | Algolia client search-only key for storefront queries. |
| `NEXT_PUBLIC_ALGOLIA_INDEX_NAME` | `apps/web` | Algolia target index name (e.g., `products_prod`). |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | `apps/web` | Customer support WhatsApp contact number. |
| `NEXT_PUBLIC_SITE_URL` | `apps/web` | Canonical site URL (e.g., `https://bropics.in`). |

### 6.2 Key Configuration Files
- [pnpm-workspace.yaml](file:///d:/Projects/Bro-pics/pnpm-workspace.yaml): Defines workspace packages (`apps/*`, `functions`, `services/*`, `packages/*`, `scripts/*`, `firestore-rules-tests`).
- [firebase.json](file:///d:/Projects/Bro-pics/firebase.json): Configures Firestore rules/indexes, Storage rules, Functions deploy runtime (Node 20), and local emulator ports (Auth: 9099, Firestore: 8080, Storage: 9199, Functions: 5001, UI: 4000).
- [firestore.rules](file:///d:/Projects/Bro-pics/firestore.rules): Production database security rules enforcing ownership and staff/admin role separation.
- [storage.rules](file:///d:/Projects/Bro-pics/storage.rules): Production object storage security rules restricting client access to `/public/**` and mediating private access via Next.js backend.
- [cors.json](file:///d:/Projects/Bro-pics/cors.json): CORS configuration permitting browser canvas `crossOrigin: 'anonymous'` image reads without canvas tainting.
- [apps/web/next.config.ts](file:///d:/Projects/Bro-pics/apps/web/next.config.ts): Security response headers (HSTS, X-Frame-Options, Nosniff, Permissions-Policy) and Sharp module externalization.
- [apps/web/middleware.ts](file:///d:/Projects/Bro-pics/apps/web/middleware.ts): Nonce generation and Content-Security-Policy (CSP) header injection.
- [apps/web/playwright.config.ts](file:///d:/Projects/Bro-pics/apps/web/playwright.config.ts): Playwright test harness configuration for desktop and mobile viewport testing.

### 6.3 Local Installation & Execution Guide
1. **Install Prerequisites:**
   ```bash
   npm install -g pnpm@9 firebase-tools
   ```
2. **Install Monorepo Dependencies:**
   ```bash
   pnpm install
   ```
3. **Configure Environment:**
   Copy `.env.example` to `apps/web/.env.local` and populate development keys.
4. **Start Local Firebase Emulators:**
   ```bash
   firebase emulators:start
   ```
5. **Seed Emulated Database (Optional):**
   ```bash
   pnpm --filter @bro-pics/seed write-to-firestore
   ```
6. **Start Next.js Development Server:**
   ```bash
   pnpm dev
   ```
   *The storefront will be available at `http://localhost:3000` and the Admin Panel at `http://localhost:3000/admin`.*

### 6.4 Testing, Linting & Build Commands
- **Run All Unit & Integration Tests:** `pnpm test`
- **Run Security Rules Tests (against Emulator):** `pnpm test:rules`
- **Run Playwright End-to-End Tests:** `pnpm test:e2e`
- **Run Monorepo Typecheck:** `pnpm typecheck`
- **Build Production Bundles:** `pnpm build`

---

## 7. Auth, Security & Storage

### 7.1 Authentication & Role-Based Access Control (RBAC)
- **Identity Provider:** Firebase Authentication (Phone OTP, Google OAuth, Email/Password).
- **Server Verification:** Tokens are verified on every API invocation via `getAuth(adminApp).verifyIdToken(idToken, true)` in [apps/web/lib/verify-id-token.ts](file:///d:/Projects/Bro-pics/apps/web/lib/verify-id-token.ts) with `checkRevoked = true`.
- **5 Granular RBAC Roles** defined in [packages/shared/src/auth/permissions.ts](file:///d:/Projects/Bro-pics/packages/shared/src/auth/permissions.ts):
  1. `super_admin`: Complete access to all catalogue, content, orders, returns, reviews, coupons, settings, analytics, and team management (`team:manage`).
  2. `admin`: Full operational access across all domains except team management.
  3. `staff`: Day-to-day fulfillment access (`orders:read/write`, `returns:read/write`, `reviews:moderate`).
  4. `content_manager`: Content CMS write access and catalogue read access.
  5. `catalogue_manager`: Catalogue management write access and content read access.
- **Immediate Revocation Architecture:** In addition to Firebase custom claims, staff status is mirrored in the `staff/{uid}` Firestore collection. When an admin disables a user via `/api/admin/staff/[uid]/disable`, the record is immediately updated, preventing any token caching delay.

### 7.2 File & Image Upload Security Pipeline
Implemented in [apps/web/lib/image-probe.ts](file:///d:/Projects/Bro-pics/apps/web/lib/image-probe.ts) and [apps/web/app/api/uploads/route.ts](file:///d:/Projects/Bro-pics/apps/web/app/api/uploads/route.ts):
1. **Magic-Byte Sniffing:** Checks buffer headers for legitimate JPEG (`FF D8 FF`), PNG (`89 50 4E 47`), WebP (`RIFF....WEBP`), and HEIC/HEIF (`ftypheic`, `ftypmif1`, etc.).
2. **Decompression Bomb Protection:** Hard server ceiling of **40 MB file size** and **120 Megapixels** ($\text{width} \times \text{height} \le 120,000,000$). Any image exceeding this threshold is rejected prior to decoding.
3. **Format Normalization & EXIF Strip:** Server converts all uploads to sRGB JPEG (`normalized.jpg`), normalizes EXIF orientation, and completely strips metadata to protect customer privacy.
4. **SVG Sanitization:** All vector clipart and CMS icons are sanitized to eliminate embedded scripts or malicious payload tags.

### 7.3 Storage Architecture & Signed URLs
- **Canonical Storage Paths:** The database **never persists temporary signed URLs** (which expire and break). It strictly stores canonical object paths:
  - Customer uploads: `uploads/{uploadId}/normalized.jpg`
  - High-res renders: `print-files/{orderId}/{orderItemId}/print.png`
  - Inspection proofs: `print-files/{orderId}/{orderItemId}/proof.jpg`
  - Return damage photos: `returns/{orderId}/{returnId}/{filename}.jpg`
  - Public CMS/Catalogue assets: `public/products/{productId}/{filename}.webp`
- **Signed URL Resolution:** Ephemeral access is mediated via `GET /api/media/url?path=...` in [apps/web/app/api/media/url/route.ts](file:///d:/Projects/Bro-pics/apps/web/app/api/media/url/route.ts). The server verifies session or user ownership before generating a 15-minute signed GCS read URL.

### 7.4 Security Headers, CSP & Rate Limiting
- **Security Headers:** Configured in [apps/web/next.config.ts](file:///d:/Projects/Bro-pics/apps/web/next.config.ts) (HSTS preload, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`).
- **Content-Security-Policy (CSP):** Set via [apps/web/middleware.ts](file:///d:/Projects/Bro-pics/apps/web/middleware.ts) using per-request cryptographic nonces for script execution.
- **5-Tier Rate Limiting:** Implemented in [apps/web/lib/rate-limit.ts](file:///d:/Projects/Bro-pics/apps/web/lib/rate-limit.ts) across public searches, uploads, checkout attempts, auth actions, and admin requests.

---

## 8. Code Conventions & Patterns

### 8.1 Monorepo Architecture & Package Boundary Rules
- **`@bro-pics/shared`:** Pure TypeScript business logic, math, schemas, and types. Zero DOM or browser dependencies. Can be imported by web, functions, and services.
- **`@bro-pics/web`:** Next.js application. Uses `server-only` on server libraries (`firebase-admin.ts`, `require-permission.ts`, `rate-limit.ts`) to prevent accidental leakage into client bundles.
- **`@bro-pics/print-render`:** Cloud Run Node.js microservice consuming Sharp for print-file generation.

### 8.2 API Route Conventions & Error Envelopes
- **Strict Input Validation:** All API routes parse incoming request bodies using Zod schemas with `.strict()` to reject unknown fields and prevent parameter pollution.
- **Standardized Error Responses:** Handled via `adminApiError` and standard response envelopes in [apps/web/lib/admin-api-error.ts](file:///d:/Projects/Bro-pics/apps/web/lib/admin-api-error.ts):
  ```json
  {
    "code": "invalid_request",
    "message": "Human readable error description",
    "status": 400,
    "requestId": "uuid-v4-string",
    "details": { "issues": [...] }
  }
  ```
- **Logging Standards:** Structured JSON logging in production with automatic PII scrubbing (masking email addresses, phone numbers, and payment IDs) in [apps/web/lib/audit-log.ts](file:///d:/Projects/Bro-pics/apps/web/lib/audit-log.ts).

### 8.3 Design System: "Black & Gold Elegance"
Storefront and Admin UI strictly adhere to the unified design tokens in [apps/web/lib/design-tokens.ts](file:///d:/Projects/Bro-pics/apps/web/lib/design-tokens.ts) and [apps/web/tailwind.config.ts](file:///d:/Projects/Bro-pics/apps/web/tailwind.config.ts):
- **Backgrounds:** Rich dark mode palette (`bg-dark-900: #0B0B0E`, `bg-dark-800: #131318`, `bg-dark-700: #1B1B22`).
- **Accents:** Warm luxury gold accents (`text-gold-400: #E6C687`, `bg-gold-500: #D4AF37`, `border-gold-500/30`).
- **Borders & Dividers:** Subtle muted borders (`border-dark-700: #262630`).
- **Typography:** Outfit / Inter modern sans-serif fonts with strict hierarchy.

---

## 9. Problems, Risks & Tech Debt

### 9.1 Pending Operational & External Account Credentials
| Item | Description & Action Required | Risk Level |
|---|---|---|
| **Razorpay Production Activation** | Live production merchant keys must be populated in production environment variables (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`). | **High (Blocks Live Sales)** |
| **GCP Cloud Storage CORS** | `cors.json` must be manually applied to the live Firebase Storage bucket via `gsutil cors set cors.json gs://<bucket-name>`. Without this, canvas export fails with `SecurityError: The operation is insecure`. | **High (Blocks Canvas Export)** |
| **Telecom DLT SMS Registration** | Entity registration and DLT transactional SMS template approval required for order OTP and SMS tracking notifications. | **Medium (Fallback to Email/In-App)** |
| **WhatsApp Business API** | Meta Cloud API account and template message approvals required for automated WhatsApp order updates. | **Medium (Fallback to In-App)** |
| **Transactional Email Provider** | Production API key for Resend or SendGrid required in Cloud Functions for customer email notifications. | **Medium (Fallback to In-App)** |
| **Observability (Sentry / GA4)** | Sentry DSN configuration on Next.js server and Cloud Run worker; GA4 measurement ID in storefront. | **Low (Non-blocking)** |

### 9.2 Known Nuances & Test Behaviors
- **Decompression Bomb Test Duration:** In [apps/web/lib/image-probe.test.ts](file:///d:/Projects/Bro-pics/apps/web/lib/image-probe.test.ts), the decompression bomb test synthesizes a huge 120MP buffer to verify that Sharp safely rejects it without memory leaks. On heavily loaded CPUs, this test can take 4–5 seconds to complete.
- **Orientation Post-Filtering:** Firestore does not support multi-field inequality indexing across dynamically calculated orientation values. Product orientation filtering is therefore executed as an in-memory post-filter on the server, which means pagination counts represent category totals prior to orientation filtering.

---

## 10. Git History & Evolution Trend

### 10.1 Active Branches & Recent Commits
- **Active Working Branch:** `San's(FE)`
- **Remote Branches:** `origin/San's(FE)`, `origin/master`, `origin/checkout-and-accounts`, `origin/feature/admin-panel-and-production-queue`, `origin/feature/personalization-engine`.
- **Recent Commit Progression:**
  - `4e088ff` (*Latest local commit*): `feat(storefront): complete FE-45..49 — video preload, mobile polish, Playwright E2E suite`
  - `cf0d508`: `FE-45 (partial): lazy-load the editor and below-fold homepage sections`
  - `817de11`: `FE-44: add jest-axe coverage across key pages; fix 3 real a11y bugs`
  - `7836a37`: `FE-43: verify alt text is already correctly applied site-wide`
  - `17e4749`: `FE-42: noindex deep facet URLs, add settings-backed OG image fallback`
  - `53e66c5`: `FE-41: add BreadcrumbList, Organization, and Review structured data`
  - `22121bb`: `FE-40: add a cookie consent banner; event taxonomy stays blocked on BE-31`
  - `6b650da`: `FE-38: add "pending review" prompts for delivered items`

### 10.2 Architectural Evolution Summary
1. **Foundation & Math:** Initialized monorepo, extracted coordinate math and DPI formulas to `@bro-pics/shared`.
2. **Storefront & Personalization Studio:** Implemented multi-slot canvas editor, HEIC decoder, gesture recognition, text auto-fit, and dynamic CMS homepage.
3. **Cart, Checkout & Razorpay:** Built slide-out cart drawer, server repricing, Razorpay payment modal, and idempotency locks.
4. **Order State Machine & Print Pipeline:** Created 8-stage order lifecycle, Cloud Functions webhook processing, and Sharp Cloud Run 300 DPI print renderer.
5. **Admin Backoffice & RBAC:** Developed 5-role permission framework, catalogue manager, template coordinate builder, 8-stage production queue, and analytics dashboard.
6. **Hardening & Quality Assurance:** Comprehensive accessibility remediation (`jest-axe`), structured data (JSON-LD), performance lazy loading, and Playwright cross-device E2E test suites.

---

## 11. Next Steps & Launch Checklist

*(The following items are recommended operational and deployment priorities clearly labeled as suggestions)*

### Phase 1: Cloud & Storage Configuration *(Immediate)*
1. **Apply Storage CORS Configuration:**
   Execute Google Cloud CLI to apply root `cors.json` to the production Firebase bucket:
   ```bash
   gsutil cors set cors.json gs://<production-storage-bucket>
   ```
2. **Configure Daily Managed Firestore Backups & PITR:**
   Enable Point-In-Time Recovery and schedule daily automated backups via GCP Cloud Scheduler / gcloud CLI according to [docs/ops/restore-runbook.md](file:///d:/Projects/Bro-pics/docs/ops/restore-runbook.md).
3. **Deploy Containerized Print Render Microservice:**
   Build and deploy `services/print-render` to Google Cloud Run with appropriate memory allocation (minimum 2GB RAM recommended for 300 DPI Sharp image compositing).

### Phase 2: Gateway & External Service Onboarding
1. **Switch Razorpay to Live Mode:**
   Replace test API keys with production live merchant keys and register the production webhook endpoint (`/api/webhooks/razorpay`).
2. **Complete DLT Telecom Registration:**
   Register enterprise entity ID and SMS templates for transactional order updates in India.
3. **Configure Meta WhatsApp Cloud API:**
   Obtain approved WhatsApp template messages for automated shipping and delivery alerts.
4. **Set Up Production Transactional Email:**
   Configure Resend or SendGrid API credentials in Cloud Functions secrets.

### Phase 3: Final Acceptance & Launch Rehearsal
1. **Owner UAT Walkthrough:**
   Have the business owner complete end-to-end user acceptance testing across customer ordering, personalization, payment, admin production advance, QC check, and return refund.
2. **Staging Smoke Test:**
   Execute a test transaction in staging environment with live image assets to verify end-to-end 300 DPI print file generation.
3. **Production Domain & SSL Mapping:**
   Point primary domain (`bropics.in`) and verify SSL certificates and CDN caching rules.
