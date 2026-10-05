# Launch Audit — working checklist

Baseline (before any change in this pass): `pnpm -r typecheck` clean · `pnpm test` all green
(web 245 files / 1562 tests, shared 388, functions 69, seed 43, print-render 35) · `next build` OK.
No linter is configured anywhere in the monorepo.

Safety snapshot of the pre-existing uncommitted working tree: `git show refs/backup/pre-launch-audit`.

Deliberate scope decisions
- Order states stay as the existing machine in `packages/shared/src/orders` (pending_payment → paid → payment_confirmed → photo_validation → print_rendering → …). The PENDING/CONFIRMED list in the brief was illustrative.
- Stock stays a status (`in_stock | out_of_stock | backorder`), not a quantity — fits made-to-order printing. No quantity tracking is being added.
- Only Login OTP and Razorpay remain mock.

## CRITICAL (launch blockers — money / auth / data)

| # | Finding | Where |
|---|---------|-------|
| C1 | Client can send `isMock: true` to `create-order` and get an order written as `paid` for free. Server also silently falls back to "mock paid" whenever `RAZORPAY_KEY_ID` is unset. Payment mode must be a server-side config, never request- or missing-env-driven. | `app/api/checkout/create-order/route.ts` |
| C2 | Mock-paid orders skip the entire post-payment pipeline the webhook runs: invoice number, `payment_confirmed → photo_validation → print_rendering`, print-job queueing, coupon `usedCount`, customization lock, sales stats, payment notification. With Razorpay mocked at launch **every order would stall at `paid` and never reach production.** | create-order vs `functions/src/webhooks/razorpay.ts` |
| C3 | Mock OTP is unusable in a production build: code is only logged/returned when `NODE_ENV !== 'production'`. Nobody could sign up or log in at launch. OTP store is an in-process `Map` (breaks on multi-instance / serverless). | `lib/services/whatsapp/*` |
| C4 | `firestore.rules` `users/{uid}`: owner may write **any** field (`role`, `phone`, `passwordHash`, `status`, `totalSpent`…). `UserStore.findByPhone` trusts `phone` from that doc → phone squatting / login to wrong account; stats forgeable. | `firestore.rules` |
| C5 | `firestore.rules` `isStaffOrAdmin()` omits `super_admin`, while the app (and dev token / seeded owner) uses `super_admin`. | `firestore.rules` |
| C6 | `UserStore.recordLogin` mints custom tokens with `{role:'customer'}` for *every* user, including staff/admin — can clobber elevated claims on OTP login. With mock OTP shown on-screen, OTP-only login for privileged accounts is also an account-takeover path. | `lib/services/user-store.ts` |
| C7 | `SESSION_SECRET` falls back to a hard-coded string in production. | `lib/services/session.ts` |
| C8 | Idempotency in `create-order` is query-then-write (race → duplicate orders on concurrent double-submit). | create-order |
| C9 | Personalization ownership check runs *after* order number consumed / Razorpay order created, and passes when zero customization docs exist (order with no artwork). | create-order |
| C10 | Checkout client shows "paid" when `!keyId` regardless of server status. | `app/checkout/page.tsx` |
| C11 | `UserStore` swallows Firestore/Admin errors and silently falls back to per-instance memory + fake `mock_custom_token_*` — in production this hides outages and creates accounts that vanish. | `lib/services/user-store.ts` |

## HIGH
- H1 No `paymentProvider` recorded on the order → staff can't tell that no money was collected.
- H2 In-memory rate limiter (documented, accepted) — fine for launch on one instance; note for scale-out.
- H3 CSP is Report-Only (documented).
- H4 No ESLint. Add minimal config only if cheap.
- H5 Need to verify: admin order status updates vs customer order views; order snapshot completeness; customer cancel flow; coupon global usage limit enforcement; backorder blocked at checkout (intended?).

## MEDIUM / LOW — tracked after Critical+High are fixed
UI/UX pass (mobile 320–430px), admin IA review, a11y pass, perf pass, dead-control sweep.
(Existing e2e specs: admin-workflows, desktop/mobile storefront, personalization-checkout-flow, responsive-qa-pass.)

## Fix log

### Batch 1 — payment architecture (C1, C2, C8, C9a, C10, H1) — DONE, tests green
- New `lib/payments/` (`PaymentProvider` → `MockPaymentProvider` | `RazorpayPaymentProvider`, `getPaymentProvider()` from `PAYMENT_PROVIDER`; production fails closed when unset; razorpay without keys throws — never silently mock).
- `create-order` no longer reads `isMock`, always creates `pending_payment`, stores `paymentProvider`, deterministic order id + `batch.create()` so concurrent double-submit can't duplicate, ownership check moved before order-number/payment-session side effects, no timestamp order-number fallback.
- Payment-settled pipeline moved to `packages/shared/src/payments/*` (handlers + Firestore adapters + `settlePaymentCaptured/Failed`); the Razorpay webhook now re-exports them, and the new `POST /api/checkout/mock-payment` runs the SAME code → mock orders get invoice no., photo-validation, print jobs, coupon accounting, notifications.
- Checkout: mock payment dialog (test mode, success/failure/cancel), "Resume payment" (no dead end after a dismissed window), confirmation keyed on `paymentStatus` (it could never show before — settlement moves status past `paid` in one transaction), dead Mobile input made read-only, hard-coded "GST 18%" line now driven by settings, request timeout, honest payment copy.
- Admin order detail shows a TEST PAYMENT notice for mock orders.

### Batch 2 — auth / rules (C3–C7, C11) — code DONE, tests green; rules tests NOT run (no JDK for the Firestore emulator)
- `firestore.rules`: `super_admin` added to `isStaffOrAdmin`; `users/{uid}` client writes limited to profile fields (no role/phone/passwordHash/stats changes; no client delete); `otpSessions` explicit deny. New rules tests written in `firestore-rules-tests/rules.test.ts`.
- OTP: factory fails closed in production unless `WHATSAPP_OTP_MODE` is set; mock mode returns the code in production (labelled "Demo mode" in UI); OTP store is now async over Memory/Firestore backends (Firestore in prod) with atomic attempt counting and a resend window; privileged accounts can't use OTP-only login in mock mode.
- `recordLogin` preserves existing custom claims; `UserStore` no longer masks Firestore/Auth failures in production; `SESSION_SECRET` mandatory (≥32 chars) in production; auth routes return JSON 503 on backend failure.

### Batch 3 — admin money units, order lifecycle, checkout funnel (found by running the app on the emulators)
Verified live (Auth+Firestore+Storage+Functions emulators, real UI, guest → sign-in → reconcile → address → order → pay → admin advance → customer view).
- **Admin money units (CRITICAL):** variant grid, shipping settings and refund modal edited rupees but saved paise-semantics values (₹999 → ₹9.99; "free above ₹1,499" → ₹14.99; a "500" refund → ₹5). All order/inventory/QC/collections screens printed raw paise (₹159800). Fixed via `lib/admin-money.ts` + `formatPaise`; Returns page passed rupees into the refund modal (refunds 100× too small) — fixed. `scripts/seed audit-live-data` (read-only, NOT run) lists values already saved wrong in the live project.
- **Admin settings forms pre-filled invented data** (GST on at 18% with a made-up GSTIN, fake UPI/phone, active "free delivery above ₹1,499" banner) and swallowed load errors → one Save published them. Now start from real defaults, block Save after a failed load, validate GSTIN.
- **Invoice** hard-coded a fabricated seller name/address/GSTIN → now reads Admin store settings only; "Tax invoice" only with a GSTIN; test orders marked; unpaid orders refused.
- **Order lifecycle:** customer could not cancel right after paying (allow-list missed the auto sub-stages); dashboard "on the way" count ignored them; order detail called paid orders "Pending payment", cancelled ones "checking your photos", showed no delivery address/price breakdown/payment status, said "Paid" for unpaid orders. Admin detail read wrong address fields (street never shown), listed illegal status moves, no confirmation for cancel/ship/deliver, audit trail attributed everything to "System", hard-coded STAGING badge.
- **Retry paid the stale order** (same idempotency key returned the old pending order after cart/address/coupon/delivery edits) → inputs fingerprint; changed inputs supersede the old pending order. Paid detection now uses `paymentStatus`.
- **One pricing function** (`lib/order-pricing.ts`) now backs coupon check, new `/api/checkout/quote`, and create-order. Fixed: coupon-validate counted abandoned orders toward per-user limit (one failed payment killed a one-use coupon); create-order silently dropped a stale coupon (now 409 `coupon_invalid`). Checkout page renders the server quote.
- **Mock refunds** (`lib/payments/refunds.ts`): refund routes were calling Razorpay for `pay_mock_*` → every mock refund failed. Provider chosen from the order's own `paymentProvider`.
- **Security:** hard-coded admin identity backdoor (phone/email → super_admin) removed server + client; open redirect via `?redirect=` fixed; `bootstrap-admin` script for the first owner.
- **UX/a11y:** sign-in returns to checkout; address form (per-field errors, state list, phone validation/normalisation, saving state, no duplicate saves); `FormField` labels now associated for all admin forms; mobile CSS rule that left-aligned every `text-center` button narrowed; hard-coded shipping promises now come from settings; brand unified to KarthysGallery.
