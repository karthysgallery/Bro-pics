# BroPics — Personalized Photo Frame E-Commerce Platform

Monorepo for the BroPics & Kavi Vazhi Photography storefront, personalization
engine, and admin panel. See `docs/superpowers/specs/2026-08-28-foundation-design.md`
for the full architecture.

## Structure

- `apps/web` — Next.js storefront, account, and admin UI
- `functions` — Firebase Cloud Functions (webhooks, order/coupon logic, search sync)
- `services/print-render` — Cloud Run service for print-file rendering
- `packages/shared` — shared types, zod schemas, pricing/DPI math
- `scripts/seed` — Firestore seed data for local dev
- `firestore-rules-tests` — security rules test suite

## Setup

1. Install pnpm: `npm install -g pnpm@9`
2. Install dependencies: `pnpm install`
3. Copy `.env.example` to `.env.local` in `apps/web` and fill in Firebase/Razorpay/Algolia keys
4. Install the Firebase CLI: `npm install -g firebase-tools`
5. Start emulators: `firebase emulators:start`
6. Run the web app: `pnpm dev`
7. Run all tests: `pnpm test`
   - Firestore security rules tests run separately via `pnpm test:rules` — they
     require a JDK 21+ (the Firebase emulator's requirement) in addition to the
     Firebase CLI installed above.

## Environments

- **local** — Firebase Emulator Suite, Razorpay test keys
- **preview** — per-PR or shared dev Firebase project, Razorpay test keys
- **production** — separate Firebase project, live Razorpay keys, custom domain
