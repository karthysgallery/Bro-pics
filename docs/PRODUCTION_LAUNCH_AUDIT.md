# Production launch audit — KarthysGallery

Audit date: 2026-10-17. Read-only: nothing was pushed, deployed, or changed on the live project
for this audit. Evidence is from the repo, live Firestore/Storage rules, live Firestore data
(read via the owner's gcloud token), the live Cloud Run/Functions listing, and public requests to
https://karthysgallery.in. Anything not directly verified is marked **NOT VERIFIED**.

Legend: **[OWNER]** only the owner/client can do it · **[CODE]** I can do in the repo ·
**[EXTERNAL]** needs a dashboard/provider/account action · **[BLOCKER]** must be done before opening to customers.

---

## 1. Store settings

How settings work: one Firestore document per key, `settings/{key}`, written by
`PUT /api/admin/settings/{key}` (needs `settings:write`), validated by `settings-registry.ts`.
`settings/*` is world-readable by design (the browser reads shipping/GST/store for checkout and invoices).

| Key | Required fields | Live now | Used by |
|---|---|---|---|
| `store` | `name`, `supportPhone`, `processingDays` (optional `legalName`, `address`, `description`) | **missing** | footer phone, contact page, **invoice seller block** (`lib/invoice-seller.ts`) |
| `gst` | `gstEnabled`, `taxRate` (optional `gstin`; admin UI validates the 15-char GSTIN pattern) | **missing** → GST off | order tax lines, invoice GSTIN (only when GST is on) |
| `shipping` | free-shipping threshold, flat, express (all paise) | **missing** → code defaults: free ≥ ₹1,500, flat ₹50, express ₹150 | checkout totals (`calculateShipping`), server re-prices |
| `seo` | default title/description | **missing** → code fallbacks | metadata |
| `theme` | — | present (written 2026-10-15) | storefront theme |
| `payments` / `notifications` / `courier` / `deliveryEstimates` | — | missing | admin-only config; **public-readable, never put secrets here** |

Findings
- Checkout and invoices read the saved settings correctly (server-side pricing re-reads `shipping`/`gst`; the invoice reads `store` + `gst`). With nothing saved they fall back safely: invoices show only "KarthysGallery", **no legal name, address or GSTIN**.
- **[BLOCKER][OWNER]** Save `store` (shop name, support phone, legal name = `KARTHYS GALLERY`, address from the Udyam certificate, processing days). The Udyam certificate does **not** give a GSTIN.
- **[OWNER]** Decide whether the business is GST-registered. If yes: enter GSTIN, enable GST and the rate. If no: leave GST off and make sure invoices are titled so they are not presented as tax invoices (confirm with the CA).
- **[OWNER]** Confirm shipping charges (the defaults above are code defaults, not a business decision).
- **[CODE]** Possible hardening: validate `supportPhone` format, require `legalName`+`address` before the shop can be opened (a launch gate in admin).

## 2. Legal pages

All nine footer links return HTTP 200 on the live site (`/about`, `/how-it-works`, `/faq`, `/contact`, `/shipping-policy`, `/return-refund-policy`, `/privacy`, `/terms`, `/picture-quality-guide`).
They are served from **built-in default text** because the Firestore `pages` collection is empty. The owner can replace any page in Admin → Pages (`isPublished` pages win over the defaults).

The default text is well written but states business facts that **only the owner can confirm**. They are listed here so they are confirmed or edited before launch. Nothing below is invented by this audit; it is already on the live site.

| Page | Claim to confirm |
|---|---|
| Privacy | contact mailbox `support@karthysgallery.in` exists and is monitored · requests actioned "within 30 days" · photos kept "a short period" after the order · Indian grievance officer name/contact **missing (required for e-commerce)** |
| Terms | governing law India (add jurisdiction/city if desired) · "we may decline unlawful or infringing content and refund in full" · legal business name and address **missing** |
| Shipping | dispatch window per product (2–4 working days seeded) · "metro 2–4 days, others 4–7" · courier partners · "we do not ship outside India" · charges are shown at checkout (matches code) |
| Returns & refunds | 48-hour fault-report window · response "within two working days" · refund "within 5–7 working days" · no change-of-mind returns · cancellation only before production starts |
| About | "made and finished in India", "workshop", "archival printing", "happiness guaranteed" are marketing claims to confirm |
| Contact | working hours Mon–Sat 10am–7pm · support email · WhatsApp number |

- **[BLOCKER][CODE]** The live WhatsApp button still points to the placeholder `910000000000` (the build default). Commit `f2db7b5` (local, not pushed) sets it to the shop's chat number `+91 63692 84351`; it goes live with the next build.
- **[OWNER]** Provide: legal name, registered address, GSTIN (or "none"), support email, grievance officer, courier partners, refund/return terms. Then paste final text into Admin → Pages or I can draft Firestore page documents for approval.
- Footer/Contact/Terms must show the legal entity once `store.legalName` and `store.address` exist (currently they cannot, because nothing is saved).

## 3. Product catalogue (live data, read-only)

14 products: **6 published and active**, **8 archived** seed demo products (`prod_*`, hidden from the shop).

Published: Clip On Rope Photo Collage Frame, Tamil Nadu Chief Minister … photo frame, One Last Vijay Photo Frame, Thalapathy Vijay Photo Frame, Cm Of Tamilnadu Photo Frame, Actor Vijay Photo Frame.

| Check | Result |
|---|---|
| Primary image | all 6 published have one |
| Personalization template | all 6 have `personalizationTemplateId` and 1–2 frame models |
| Variants | 3 sizes each (8×12, 12×18, 16×24 in; A4/A3/A2) |
| Prices (paise) | 8×12 ₹444 · 12×18 ₹555–₹999 · 16×24 ₹1,899–₹1,999 (compare-at prices present). **Not modified.** |
| ₹0 price | "One Last Vijay": 3 variants have price 0 but are `isActive: false`, so not sellable. **Delete or price them in the admin to avoid a future accident.** |
| Stock | variants carry no stock quantity (`stock` empty); products are `inStock: true`: treated as made-to-order. **NOT VERIFIED** that inventory logic is intended to be unlimited. |
| Dispatch | 2–4 working days on published products |
| Ratings | published products have 0 reviews (fake 4.9/128 fallback removed in `f2db7b5`, not live yet) |

Flags
- **[BLOCKER][OWNER]** Live **seed reviews**: 10 reviews (`user_seed_*`, "Beautiful finish", "Looks amazing together", "Stunning colours"…) are `approved`, and the homepage "What Our Customers Say" section shows some of them. They belong to demo products and are not real customers. They must be hidden/deleted before launch (deleting live data needs your approval).
- **[BLOCKER][OWNER]** Homepage offer strip says "Use code **NEW10** for 10% off your first order" (seed). The coupon `NEW10` exists live. Conflicts with the Diwali offer. Deactivate the strip or the coupon, or keep one offer only.
- **[OWNER]** Subject matter: several published products are named after a real actor and a political office holder. Using real people's names/photos may create **personality-rights, trademark and political-content risks**. This is a business/legal decision for the owner (and a lawyer), not a code issue.
- **[OWNER]** Seed demo products, test users (`user_seed_*`) and the 2 old test orders remain in the live database. Archive/delete after approval.
- **[OWNER]** Review each product description, FAQ and size guidance on the live page. **NOT VERIFIED**: copy quality of all 6 pages.

## 4. Security (rules reviewed, not deployed)

Rule sets
- **Firestore: live rules == repo rules** (released 2026-10-10; the only difference is one trailing blank line). Nothing to deploy. The older notes saying "live rules block cart writes" are out of date.
- **Storage: live = deny all** (2026-09-01). The repo `storage.rules` is different (see below) and is **not deployed**.

Review against your checklist
| Area | Finding |
|---|---|
| Cart ownership | `carts/{userId}`: only the owner reads/writes, ≤ 50 items. Server re-prices at checkout, so tampering with client cart prices has no effect. Item contents are not schema-validated in the rule (low risk). |
| Customer data | `users/{id}`: owner read; create/update limited to a key allow-list; `phone` must equal the token's phone number; no deletes; `users/{id}/private` is closed. |
| Addresses | `users/{id}/addresses`: owner read/write with **no field/size validation** (a customer could store arbitrary data in their own address docs). Low risk; **[CODE]** optional hardening. |
| Orders / items / events / refunds | owner read only, no client writes ✔ |
| Uploads / customizations | owner read only, no client writes ✔ (writes are server-side) |
| Staff roles | `staff`, `staffInvites`, `otpSessions`, `counters`, `printJobs`, `auditLogs`, `idempotencyKeys`, `webhookEvents`, `notification*`, `coupons`, `media`, `analyticsDaily`, `personalizationTemplates` are fully closed to clients; staff reach them only via the admin API (staff role + authenticator/passkey proof). ✔ |
| Invoices | no `invoices` rules, so default-deny to clients; served by admin/server routes. ✔ |
| Reviews | public read only when `status == 'approved'` ✔ (see seed-review finding above) |
| `settings/*` | world-readable: fine for store/shipping/gst/theme; **must never hold secrets** (the `payments.upiId` and `notifications` keys are readable by everyone). |

Inconsistencies / risks
- **Role names differ**: Firestore rules treat `admin`, `staff` and `super_admin` as staff; the repo **Storage** rules recognise only `admin` and `staff`, so a `super_admin` would lose direct reads if those rules were deployed. Currently harmless because the app reads Storage through the Admin SDK and live Storage is deny-all.
- **Recommendation: keep Storage deny-all** unless a feature needs direct client reads. The repo version makes `/public/**` world-readable and lets staff read uploads/print files directly; deploying it widens access for no current benefit.
- **NOT VERIFIED**: that every media URL the site uses goes through `/api/media/*` rather than direct Storage URLs (the live site loads images fine today with deny-all Storage, which is evidence it does).
### Storage access-control review (required before any Storage rule change)
| Path | Live (deny-all) | Repo `storage.rules` | Who must read it today | Verdict |
|---|---|---|---|---|
| `public/**` (catalogue/CMS images) | nobody directly | **anyone** | browsers load images via `/api/media/*` (server) | keep deny-all; opening it adds exposure and cost (egress bypasses the cache and resize route) |
| `uploads/**` (customer photos) | nobody directly | staff/admin read | admin/server through the Admin SDK; customers through the ownership-checked `/api/media/url` | keep deny-all; the repo rule grants staff direct read but `super_admin` is missing from it |
| `print-files/**` | nobody directly | staff/admin read | print-render writes (SA), admin Files Box reads through the server | keep deny-all |
| `returns/**` | nobody directly | staff/admin read | server | keep deny-all |
| everything else | denied | denied | — | same |
Decision: **do not deploy `storage.rules`**. If a feature ever needs direct client reads, first fix the role list (`super_admin`), narrow the rule to the exact path, add Storage rules tests, and re-review. The Admin SDK bypasses these rules, so deny-all does not stop the server or the print service.

- Rules tests: 54 passing in `firestore-rules-tests` (last run in this project).

## 5. Backend: code vs deployed

Deployed on `bropics-app` (verified by `gcloud functions list` / `gcloud run services list`):
`onMediaWritten`, `onVariantWritten` (asia-south1), `reconcileSessionOnLogin` (us-central1), and Cloud Run `karthys-gallery` (revision `00022`, image `55ca8f0`).

In the repo but **NOT deployed** (the code exports **16** triggers, 3 are live, **13 are not**; an earlier note said 17):

| Function | Purpose | Impact if missing |
|---|---|---|
| `razorpayWebhook` | backup payment confirmation | payments still confirmed by `/api/checkout/verify-payment` on the page; a customer who closes the page mid-payment may not be confirmed |
| `dispatchPrintJob`, `sweepPrintJobs` | start/retry print rendering | **paid orders never produce print files** |
| `invoiceOnPayment`, `creditNoteOnRefund` | create invoices/credit notes, send WhatsApp | **no invoice after payment** (the sample `KG-INV-…pdf` came from the emulator) |
| `reconcileStuckOrders` | fix orders stuck unpaid/paid | the 2 old test orders stay stuck |
| `releaseStockOnCancel`, `releaseUnpaidStock` | return reserved stock | stock stays reserved for abandoned/cancelled orders |
| `onReviewWritten` | update product rating averages | ratings don't update from new reviews |
| `cleanupStaleSessions`, `rollupDailyAnalytics`, `recordBudgetAlert`, `sendWhatsAppCampaigns` | housekeeping, analytics, budget alerts, campaigns | no cleanup/analytics; campaigns off |

Print-render service (Cloud Run, private): **NOT deployed** (no `print-render` service exists). Runbook: `services/print-render/DEPLOY.md`. Needs `PRINT_RENDER_URL` / `PRINT_DISPATCH_AFTER` in `functions/.env.bropics-app` (currently empty = dispatcher off).

Runtime
- `firebase.json` pinned functions to `nodejs20`, whose Google Cloud runtime is **decommissioned on 2026-10-30**. **Prepared locally (2026-10-17, uncommitted until approved): `nodejs22`** and esbuild `node22`; typecheck, 81 tests and the bundle pass on Node 20.20 and 25.8. Web and print-render are Docker images (`node:20-slim`) and are not affected by the Cloud Functions shutdown; left unchanged on purpose (the print renderer is proven; upgrading needs a render re-test).
- Five not-yet-deployed functions now declare `region: 'asia-south1'` (Razorpay webhook, order reconciler, session cleanup, analytics roll-up, rating trigger) so they run beside the database; the three deployed ones are untouched.
- **NOT VERIFIED**: that the full function set deploys cleanly on the Node 22 runtime (needs the deploy itself).

No claim is made that payments, invoices, or print processing work in production: **none has been exercised against live Razorpay, live functions, or the print service**. They were verified only on emulators.

## 6. WhatsApp and Razorpay: exact production configuration

### WhatsApp (OTP vs transactional vs marketing — kept separate)
Meta state (verified 2026-10-17): business `karthi` verified (Udyam) · WABA `1362452649298894` · OTP number `+91 78453 13961` (phone id `1280515481821881`, Cloud API, display name approved) · template `karthys_auth_otp` APPROVED · prepaid balance ₹50 · one real OTP delivered. The customer chat/ads number **+91 63692 84351 stays on the WhatsApp Business app, untouched**; the site's chat button points to it.

Cloud Run (website) settings for OTP:
```
WHATSAPP_OTP_MODE=production
WHATSAPP_PHONE_NUMBER_ID=1280515481821881
WHATSAPP_OTP_TEMPLATE_NAME=karthys_auth_otp
WHATSAPP_ACCESS_TOKEN   <- secret whatsapp-access-token
WHATSAPP_APP_SECRET     <- secret whatsapp-app-secret   (only needed for the inbound webhook)
WHATSAPP_MODE=disabled  <- IMPORTANT, see below
```
**Important finding:** `transportFromEnv()` (shared WhatsApp service used for invoices, order/payment/shipping messages and campaigns) turns itself **on automatically** whenever `WHATSAPP_OTP_MODE=production` and the token/phone-id exist. It would send invoice and order messages from the OTP number using templates (`karthys_invoice`, `karthys_order_confirmed`, `karthys_payment_received`, `karthys_order_shipped`) that **do not exist on Meta yet**. To keep OTP separate, set `WHATSAPP_MODE=disabled` until those utility templates are created, approved and a transactional sender decision is made. The OTP provider (`CloudWhatsAppOtpProvider`) is independent of `WHATSAPP_MODE`.
- Marketing campaigns (`sendWhatsAppCampaigns`) need Meta marketing templates, user consent, and ideally a separate number: **not enabled**.
- `WHATSAPP_MODE=disabled` is now covered by a unit test (production + credentials + disabled → disabled transport; Cloud Functions are disabled by default); a failed attempt is recorded in `whatsappMessages`, it never blocks an invoice.
- Webhook (delivery reports) is not configured: **NOT VERIFIED** delivery to every customer. One of two test numbers did not receive its code.
- Prepaid balance reaching ₹0 stops OTP: **[OWNER]** keep it topped up; consider a low-balance alert.
- The client's debit card was declined by the bank; the payment method is a UPI top-up (manual). Decide the long-term funding method.

### Razorpay (live)
- Live key id/secret are stored in Secret Manager (`razorpay-key-id`, `razorpay-key-secret`) and attached to the Cloud Run service with `PAYMENT_PROVIDER=razorpay` (revision `00020`). **No live payment has been made.**
- Still to do: create the webhook secret, store it (`RAZORPAY_WEBHOOK_SECRET`), deploy `razorpayWebhook`, register its URL in the Razorpay dashboard with events `payment.captured`, `payment.failed`, `refund.*`; confirm Razorpay account KYC/activation status and that the settlement bank account is set.
- **Do not enable live payments** until the webhook is registered and verified, and a small real payment + refund has been tested end to end.
- Razorpay live review usually requires the legal pages, refund policy, contact details and business name to be visible on the site.

## 7. Production test checklist
Run on the live site after the go-live steps, with a real test customer. Record pass/fail with a screenshot and the order id.

1. **WhatsApp OTP login**: new number; wrong code; expired code (5 min); resend cooldown (30 s); unknown-sender WhatsApp setting; number not on WhatsApp.
2. **Product personalization**: each of the 6 products; upload (JPG/PNG/HEIC), low-resolution warning, crop/rotate, text fields and fonts, preview scenes (Frame/Bedroom/Hall/Table), glitter option, collage with fewer photos than slots.
3. **Combo offers**: add a combo, swap frames, unsaved-photo restore, archived product inside a combo.
4. **Cart and inventory**: add/update/remove, quantity limits, login merge of a guest cart, price re-check on checkout, stock reservation and release on cancel/timeout (needs functions).
5. **Razorpay payment**: small real payment; failed payment; page closed mid-payment (needs webhook); refund; coupon `DIWALIDHAMAKA` (10%) and expired coupon.
6. **Invoice**: generated after payment, correct seller/legal name/address/GST, amount, shipping, discount; credit note after refund (needs functions).
7. **Order confirmation**: on-screen, orders page, WhatsApp message (needs approved utility template), email if enabled.
8. **Print rendering**: job created, rendered at the right DPI, printed artwork only, file visible to staff, failure/retry visible (needs print-render + functions).
9. **Admin order management**: list/filter, status changes, Files Box download, tracking number, refund, role limits (staff vs admin), authenticator and fingerprint sign-in, passkey reset.
10. **Devices**: desktop, tablet (768), phone (375/390), landscape, slow network; Chrome, Safari (macOS + iPhone), Android Chrome; keyboard focus; reduced-motion.
11. **SEO/ops after switching off preview**: `robots.txt`, sitemap, canonical URLs on `karthysgallery.in`, Search Console, no `noindex` header, HTTPS everywhere, www → apex redirect.

## 8. Documentation
`docs/PERSONALIZATION_PROJECT_HANDOVER.md` carries a new "Status 2026-10-17" section pointing to this file.

---

## A. Tasks the owner must complete
1. Provide/enter business facts: legal name, registered address (Udyam address), support email, phone, GSTIN or "no GST", shipping charges, return/refund terms, courier partners, grievance officer.
2. Save Admin → Settings (store, GST, shipping, SEO) and confirm/replace the legal pages.
3. Decide on seed/demo data: hide or delete the 10 seed reviews, the `NEW10` strip/coupon, the 8 archived demo products, test users and test orders.
4. Review the 6 published products (copy, images, prices, dispatch times) and decide on the real-person/political-subject products.
5. Change the admin password (and run `bootstrap-admin`), keep the WhatsApp balance funded, and decide the long-term payment method for Meta.
6. Delete `Downloads/wa-tokens.rtf` and `Downloads/rzp-key (2).csv`.
7. Razorpay dashboard: webhook registration once I give the URL; complete KYC/settlement setup.
8. Explicit approval for each of: push to `master`, rules/functions/service deploys, DNS, `SITE_PREVIEW=0`.

## B. Tasks I can complete in code (no push until approved)
1. Move the Functions runtime to a supported Node version and re-test; prepare deploy commands.
2. Optional hardening: launch gate in admin (refuse to open the shop until store settings exist), address-doc validation in rules, `WHATSAPP_MODE` documented default, low-balance WhatsApp alert.
3. Draft the legal pages as Firestore documents (marked "needs owner input" where data is missing) for owner review.
4. Prepare the final go-live commit (`_SITE_PREVIEW=0`, `_SITE_URL=https://karthysgallery.in`) on a branch, unpushed.
5. Write scripts: `audit-live-data`, a read-only launch-readiness check, and seed-data cleanup scripts (dry-run first).
6. Webhook route/function for WhatsApp delivery reports.

## C. External configuration required
- Meta: utility templates (`karthys_invoice`, `karthys_order_confirmed`, `karthys_payment_received`, `karthys_order_shipped`), optional webhook subscription, funding method, display-name/quality monitoring.
- Razorpay: live activation, webhook secret + URL, settlement account.
- Google Cloud: Cloud Functions + print-render deployment (service accounts, IAM per `DEPLOY.md`), TTL policy on `otpSessions.expireAt`, backups/PITR, budget alert (₹300), Firebase API-key restrictions, optional Storage rules decision.
- Search Console, domain email (`support@karthysgallery.in` mailbox), analytics consent.

## D. Production blockers
1. Store settings empty (invoices/footer/legal identity).
2. Seed reviews and `NEW10` strip on the live homepage.
3. Cloud Functions (invoices, print dispatch, stock release, webhook) and the print-render service are not deployed; Node 20 functions runtime ends 2026-10-30.
4. WhatsApp placeholder number (fixed locally, not live) and the auto-enabling transactional WhatsApp transport (`WHATSAPP_MODE=disabled` needed).
5. No Razorpay webhook / no verified live payment; Razorpay live review.
6. Legal pages not owner-confirmed; no grievance officer.
7. Real-person/political product subjects: owner/lawyer decision.
8. Sign-in and checkout are closed in preview mode and every end-to-end test above is still outstanding.

## E. Exact next steps in priority order
1. Owner: send the business facts (A1) and decide the seed-data and product questions (A3, A4).
2. Me: add `WHATSAPP_MODE=disabled` to the pending Cloud Run command (already advised in chat) and prepare the Functions runtime upgrade + test run.
3. Owner: save Admin → Settings; replace/confirm legal pages.
4. Me (after approval): dry-run, then clean the seed reviews/NEW10/demo data.
5. Me (after approval): deploy functions and print-render in the order in `DEPLOY.md`; verify with evidence (function logs, a test order's print job and invoice).
6. Owner: Razorpay webhook registration; me: verify the webhook with a test event.
7. Owner approves the go-live push: `_SITE_PREVIEW=0`, real site URL; Cloud Run env update.
8. Together: run section 7 with a real small order, refund it, and fix anything that fails before announcing.

---

## Update 2026-10-17 (later): business configuration, state shipping, returns, policy pages

All changes below are **local and uncommitted** (no push, no deploy, no live data touched). Architecture and admin guide: `docs/BUSINESS_SETTINGS_AND_POLICIES.md`. Owner checklist: `docs/LEGAL_OWNER_REVIEW_CHECKLIST.md`.

### Reconciliation of earlier findings against the code now in the working tree

| Earlier finding | Now |
|---|---|
| §1 `shipping`: free ≥ ₹1,500, flat ₹50, express ₹150 (code defaults) | **Replaced.** Tamil Nadu free; per-state charge for other states; an unconfigured state blocks checkout instead of being free; express off unless enabled. Legacy threshold/flat fields are ignored. A live `settings/shipping` document, if it exists, is read defensively (nothing is deleted). |
| §1 `store` is only name/phone/legalName/address | **Extended** to a full business profile (structured address, support email/WhatsApp, owner, grievance contact, GST status, invoice note). Old fields still parse. |
| §1 "supportPhone" required | Now optional (empty allowed) so no number is invented. |
| §2 Legal pages served from built-in text that makes unverified claims (48-hour window, 5–7 days, 30 days, hours, `support@karthysgallery.in`) | **Removed.** Built-in text is no longer shown. Legal pages show only owner-approved text; otherwise a neutral holding notice. The unverified claims are deleted from the code (FAQ wording, `/policies`, structured data, order pages, product help box). |
| §2 WhatsApp placeholder `910000000000` | Removed as a fallback: WhatsApp buttons are hidden until a number is saved. |
| §2 No grievance officer | Grievance contact is an admin field (name, designation, email/phone) and a Grievance page template exists; the owner must supply the details. |
| §D4 "auto-enabling transactional WhatsApp transport" | Unchanged by this work; still requires `WHATSAPP_MODE=disabled` in the Cloud Run command. |
| Returns API: hard-coded 7-day window, change-of-mind allowed for everything | **Replaced** by the owner-approved model (personalized vs ready-made, window only when approved). |

### New security review notes (server-side)
* Shipping is computed only from the address read from the database and the settings read from Firestore; `create-order`, `checkout/quote` and `coupon/validate` ignore any client-sent amount, state or PIN. A tampered request cannot lower shipping (tests: TN free, other state charged, unconfigured blocked, PIN/state mismatch blocked, express off).
* Approving a policy page needs `settings:write` (staff with only `content:write` cannot); approval is bound to a SHA-256 of the exact text and is voided by any edit. An automated review flagged the first (non-cryptographic) fingerprint; it was replaced by SHA-256 (verified against standard test vectors and `node:crypto`).
* The old Shipping Rates API (`PUT /api/admin/delivery/rates`) could write stale pricing fields into `settings/shipping`; it now returns 410 and writes nothing.
* Idempotency, Razorpay signature verification and webhook handling were not modified by this work; they were not re-audited here.
* Firestore and Storage rules were not changed and not deployed. Rules tests were **not run** in this pass (the emulator test suite was not part of it).

### Test results for this work (what ran, what did not)
See the final report in chat and the table below; "not run" means exactly that.

| Suite | Result |
|---|---|
| `packages/shared` vitest | pass: 702 passed, 10 skipped (83 files) |
| `apps/web` vitest | pass: 2174 passed, 31 skipped (327 files) |
| `functions` vitest | pass: 81 passed (14 files) |
| `tsc --noEmit`: shared, web, functions, seed | pass (no output) |
| Production `next build` | not run in this pass |
| Firestore/Storage rules emulator tests | not run |
| Browser/emulator visual QA of the new admin screens | not run |

### Still blocking launch (owner input or approval needed)
1. Business profile facts (legal name, address, support email, support WhatsApp, grievance contact) and policy wording (dispatch, delivery, cancellation, refund, retention, response time, hours, courts) — see the checklist.
2. A shipping charge for every state outside Tamil Nadu, or a fallback charge.
3. Decisions: claim window days, ready-made change-of-mind period, per-product personalized/ready-made type.
4. Tax: confirmation from a tax professional on GST registration obligations for an online seller; nothing here assumes it is resolved.
5. Approval of the eight policy pages (after a professional read).
6. All earlier owner/approval items (seed-data cleanup, placeholder super-admins, functions/print-render deploy, Razorpay webhook, Cloud Run WhatsApp env, go-live push).


---

## Verification pass 2026-10-17 (evening): see `docs/VERIFICATION_REPORT_2026-10-17.md`

Evidence-based status, nothing marked complete without a test or a read-only check:
* Build PASS, typecheck PASS, tests PASS (shared 713, web 2198, functions 81, seed 46, print-render 105), rules tests PASS (58, repo rules, local emulator). Node 22 runtime, e2e, mobile browser: not run.
* Browser pass on the emulators found and fixed: policy pages never showing after approval (Timestamp vs Date), page cache delaying withdrawal, readiness panel stale after save, addresses without `label`/`line2` blocking checkout, hard-coded emails on the 404/error pages, footer phone using the WhatsApp number.
* Security: new `policies:approve` permission guards what customers are promised; the `pages` Firestore read rule is tightened in the repo (not deployed); the Razorpay webhook does not compare amount/currency (not changed).
* Live read-only facts: 3 of 16 functions deployed, no print-render service, only `settings/theme` saved, 0 pages, shipping PIN directory empty, `SITE_PREVIEW=1` (noindex), domain resolves to Firebase Hosting, Cloud Run has no `WHATSAPP_*` variables.
* Still blocking: owner facts/decisions, professional legal and tax review, hard-coded delivery promises, deploys (rules, functions, print-render, webhook), real-order proof, data cleanup, go-live rebuild.
