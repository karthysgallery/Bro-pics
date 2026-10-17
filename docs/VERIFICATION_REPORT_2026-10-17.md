# Focused verification pass — 2026-10-17

Scope: the local, uncommitted business-settings / state-shipping / returns / policy-approval work. Nothing was pushed, merged or deployed; DNS, payment credentials, production data, Firestore and Storage rules (live) were not touched. `WHATSAPP_MODE` was not changed. Browser testing used the **local Firebase emulators with throwaway QA data only**. Live systems were read **count-only / names-only** (no document contents, no secret values).

Legend: **PASS** ran and passed · **FIXED** found a defect, fixed it locally, re-tested (how stated) · **NOT RUN / NOT VERIFIED** exactly that · **OWNER** needs a decision.

## 1. Build and test results

| Check | Result |
|---|---|
| Production `next build` (apps/web, separate dist dir) | **PASS** on the final tree (exit 0). One earlier attempt failed inside `next/font` while fetching Google Fonts (`Cannot read properties of null`); an immediate retry passed. Treat as a transient network failure of the font fetch, not a code error; Cloud Build fetches fonts the same way, so a re-run is the remedy if it recurs. |
| `pnpm -r typecheck` (shared, web, functions, seed, print-render, rules tests where defined) | **PASS** (exit 0) |
| `packages/shared` vitest | **PASS** 713 passed, 10 skipped |
| `apps/web` vitest | **PASS** 2198 passed, 31 skipped (328 files; a later 10-file targeted re-run after the last small edits also passed, 135 tests) |
| `functions` vitest | **PASS** 81 passed |
| `scripts/seed` vitest | **PASS** 46 passed |
| `services/print-render` vitest | **PASS** 105 passed, 3 skipped |
| Firestore + Storage rules tests (`pnpm test:rules`, local emulator, repo rules files) | **PASS** 58 passed (44 Firestore + 14 Storage). These test the repo rules, not the deployed ones. |
| Node 22 runtime | **NOT VERIFIED.** `firebase.json` and the esbuild target are set to Node 22, but every test above ran on the local Node 20.20. |
| Playwright e2e (`test:e2e`) | **NOT RUN** |

## 2. Browser test results (emulator, real browser pane)

| Area | Result |
|---|---|
| Admin sign-in incl. authenticator (TOTP) enrolment | PASS |
| Business profile editing and saving (Settings > Store) | **PASS** — saved to `settings/store`, values checked in the emulator document |
| Readiness panel | PASS on first load (5 areas, correct counts). **Defect:** it did not refresh after a save. **FIXED** (it now re-checks on a "settings saved" event). Not re-verified in the browser after the fix; covered only by type-check. |
| State shipping form (Kerala ₹80) | **PASS** — saved as 8000 paise |
| Checkout, Tamil Nadu address | **PASS** — shipping Free, total = subtotal |
| Checkout, configured state (Kerala) | **PASS** — ₹80, total ₹879 |
| Checkout, unconfigured state (Maharashtra) | **PASS** — shipping "—", Place order disabled, message that the charge cannot be calculated |
| Checkout, "Tamil Nadu" with a Kerala PIN | **PASS** — blocked with the state/PIN mismatch message |
| Checkout, "Tamil Nadu" with a 605xxx PIN (Puducherry/Tamil Nadu shared prefix) | Free by design (see §4). **Defect found while testing:** addresses without `label`/`line2` keys failed the address schema, so checkout showed "Choose a delivery address" for every address. **FIXED**: both keys are now optional (test added). Re-run through the browser after the fix: **NOT RUN**. |
| Return-policy editing (Settings > Returns & Claims) | **PASS** — saved; policy wording preserved |
| Personalized vs ready-made eligibility | **PASS** through the real API as a customer (§5) |
| Policy draft, preview, approve, withdraw, text change | **PASS** after fixing a **real defect**: a page saved by the admin could never show publicly, because the stored dates come back from Firestore as Timestamps and the page schema expected Dates, so every approved page silently fell back to the holding notice. **FIXED** (`lib/firestore-dates.ts`; unit test with Timestamp objects; confirmed in the browser: approved + published terms page then showed the real text with business facts filled, was indexable, and the footer showed `/terms`). |
| Preview shows what blocks approval | PASS ("Missing business details: jurisdiction") |
| Approval refused while a fact is missing | PASS (HTTP 409). **Defect:** the admin screen showed a generic message instead of the reason, because it read the wrong error shape. **FIXED**; not re-verified in the browser. |
| Approved but unpublished page | PASS — holding notice, noindex, contact details from the saved profile |
| Text edited after approval | PASS — status returns to Draft ("Text changed since approval"), page unpublished/holding |
| Withdraw approval | PASS — holding notice and footer link disappear at once. **Defect:** before the fix the public pages were cached for 60 s; **FIXED** with cache revalidation on save/approve/withdraw (verified in the browser). |
| Footer lists only live policy pages | PASS (only `/terms` while live; none after withdrawal) |
| Missing WhatsApp / support email | PASS for `wa.me` links (none rendered anywhere). **Defect:** the 404 and error pages hard-coded `hello@` / `support@karthysgallery.in`. **FIXED** (`NeedAHand` uses saved details). Not re-verified in the browser. |
| Footer phone | **Defect:** the footer "tel:" link used the WhatsApp number. **FIXED** (it uses the support phone only). |
| Authorization: signed out | PASS — 401 on all 7 admin endpoints tried (readiness, settings read/write, pages, approve, preview) |
| Authorization: signed-in customer | PASS — 403 on 12 endpoints (settings, readiness, pages list/create/approve/withdraw/preview, product edit) |
| Authorization: a non-approver staff role | Covered by unit and route-enumeration tests (real `requirePermission`), **not** end to end in the browser: the staff paths need the authenticator proof, and I did not create staff test accounts. |
| Mobile viewport | **NOT RUN** |

Test data created (emulator only, discarded with it): a QA admin and customer, five QA addresses, one cart, four delivered QA orders, one draft page. No live data was written.

## 3. Security findings

| # | Finding | Severity | Status |
|---|---|---|---|
| S1 | `settings:write` (held by marketing_manager) could change shipping charges, return rules, policy wording, business identity and GST, and approve legal pages | High (customer promises) | **FIXED locally**: new `policies:approve` permission (super_admin, admin only) required for those settings keys, for approving/withdrawing pages, and for changing any product/category return type. Tests: permission matrix, settings route, approve route, product route, route-enumeration (84). Browser end-to-end for a marketing_manager account: not run. |
| S2 | Firestore rule `pages: allow read: if true` let anyone read draft and unapproved policy text (and editor/approver account ids) straight from Firestore | Medium | **FIXED in the repo rules** (`firestore.rules`: readable only when `isPublished == true`; rules tests added, 58 pass). **Not deployed**: the live rules still have the old line until the owner deploys rules. No site code reads `pages` from the browser, so the change does not affect the site. |
| S3 | Approval fingerprint was a non-cryptographic hash | Medium | FIXED earlier in this work (SHA-256) |
| S4 | Retired Shipping Rates API could write stale pricing fields | Low | FIXED (410, writes nothing) |
| S5 | The Razorpay **webhook** settles an order on `payment.captured` without comparing the payment's amount/currency to the order total (the browser verify-payment route does compare them) | Low–Medium (defence in depth: Razorpay itself fixes the amount per Razorpay order and the signature is verified) | **NOT CHANGED** (read-only audit). Recommend adding the amount/currency check in `handlePaymentCaptured` using the webhook payload; needs the payload shape confirmed against a real Razorpay event. |
| S6 | `settings/*` is world-readable by rules, so the business profile (including owner/grievance names, GST status) and policy wording are public by design | Info | Documented; never put private values in `settings/*` |
| S7 | `PUT /api/admin/delivery/rates` answers 410 without authentication (it reads nothing and writes nothing) | Info | Acceptable |
| S8 | Customer-facing delivery/dispatch promises are still hard-coded: "Estimated dispatch: 3-5 working days" (cart, order page, How it works), checkout transit "3-6 days after dispatch", and PIN-zone estimates ("Delivers in 4-7 days") | Medium (unverified promises) | **OPEN / OWNER.** Not changed. Proposal: take them from `policyFacts.dispatchTime` / `deliveryEstimate` and per-product dispatch days, and hide any estimate the owner has not set. |
| S9 | Damage claims require at least one photo to submit online (existing rule). The owner asked that evidence guidance not be a condition | Medium | **OWNER.** Not changed. Options: allow submission without a photo and flag it for staff; or keep and document that WhatsApp is the fallback. |

No credentials, tokens or secret values were read, printed or copied during this pass (one attempt to read a Razorpay key id from Secret Manager to learn test-vs-live mode was refused by the harness and not retried).

## 4. Shipping edge cases (Puducherry / state / PIN)

What the code now guarantees (tests in `state-shipping.test.ts`, `order-pricing.test.ts`):
* Invalid PIN, unknown state, or state/PIN disagreement never gets free shipping; an unconfigured state blocks checkout.
* The PIN-prefix table no longer lets Puducherry claim any Tamil Nadu / Kerala / Andhra range: a Puducherry address with a Chennai PIN is a mismatch. Puducherry is accepted only for 605, 607, 609 (Puducherry, Karaikal), 533 (Yanam) and 673 (Mahe).
* **Optional authoritative PIN directory.** If the shop's own PIN directory (`shippingServiceability/{pin}`, imported by an admin with the existing import tool) has the PIN, its state **must equal** the address state. A Puducherry PIN claimed as Tamil Nadu is then refused.
* The order stores `pinVerified` and `pinAmbiguous`; the admin order page warns "This PIN is in a range shared with Puducherry and is not in your PIN directory: check the address before dispatch".

Remaining limitation, stated plainly: **the directory is empty today** (0 documents live), so a Tamil Nadu address with a 605/607/609 PIN cannot be told apart from a Puducherry address and is treated as Tamil Nadu (free), but flagged. The prefix table is from public knowledge of India Post's structure and was **not** checked against the official PIN directory.

Safe, maintainable fix (needs the owner's go-ahead because it writes data): download India Post's all-India PIN directory (public, on data.gov.in), reduce it to PIN → state, and import it into `shippingServiceability` with the existing import route (1,000 PINs per request, audited). Then `pinVerified` becomes true for every real PIN, the prefix table becomes a fallback only, and a policy choice can be added later (for example: refuse home-state free delivery for ambiguous prefixes that are not in the directory). Refresh the import when India Post publishes changes (a yearly reminder is enough).

## 5. Return-policy safety (verified through the real API as a customer, emulator)

| Case | Result |
|---|---|
| Personalized product, change of mind | **Refused** (422 `return_not_eligible`), nothing written |
| Product with **no** return type set, change of mind | **Refused** (assumed personalized, flagged) — missing configuration never creates an entitlement |
| Ready-made product, change of mind, owner-approved 5 days | **Accepted** (policy kind `ready_made` recorded) |
| Ready-made, no approved period | Refused (unit test) |
| Damaged personalized item **without** a photo | Rejected 400 (existing photo requirement, see S9) |
| Damaged personalized item with a photo | Accepted for review |
| "Wrong item" (category other) | Accepted for review |
| Claim window | Enforced only when the owner ticked Approved (unit tests, both directions); unapproved = no deadline applied and the request is flagged for staff |
| Policy text vs statutory rights | The terms, returns and cancellation drafts each say nothing limits consumer-protection rights; the liability clause keeps what cannot lawfully be excluded; a test fails if any draft uses wording such as "non-refundable", "all sales final", "waive", "sole remedy". (The cancellation draft lacked the clause; **FIXED**.) This is a drafting check, **not legal advice**; a professional must read the final text. |
| FAQ and product-page wording | "replaced or refunded" promises removed (they were unverified) |
| Unauthorized staff changing policy / forcing a rejected claim | Policy changes need `policies:approve` (S1). **No force-override exists** and none was built (see below). |

### Force-override workflow: requirements to be agreed before anything is built
* **Who:** only `policies:approve` holders (super_admin, admin). Never staff or marketing roles.
* **What it does:** creates the return/replacement record the rule refused, marked `override: true`, without changing the product's or category's rule.
* **Reason capture:** a mandatory free-text reason (minimum length) plus a short category (goodwill, evidence seen on WhatsApp, rule error, other); the customer-visible text never shows the reason.
* **Audit:** audit-log entry with actor, order, the rule that refused, the reason, time; the return record stores the same fields; the override appears in a monthly list for the owner.
* **Limits:** per-actor daily count cap; cannot raise a refund above the order total; refunds still go through the existing refund route and its permission.
* **Not before:** the owner approves these rules.

## 6. Payment and order audit (read-only; no payment-to-print production claim)

| Area | Evidence | Finding |
|---|---|---|
| Browser payment confirmation (`verify-payment`) | read; its unit test file passes in the suite | Requires the signed-in owner of the order, a valid Razorpay checkout signature, and a payment fetched from Razorpay's own API with matching order id, amount (equal to the order total) and INR; captures if only authorised. Sound. |
| Webhook (`razorpayWebhook`, **not deployed**) | read + unit tests | HMAC-SHA256 of the raw body, timing-safe compare; fails closed without a secret. Duplicate events ignored (event id); an order not in `pending_payment` is ignored; refund events handled through notes. Gap: no amount/currency comparison (S5). |
| Idempotency | read `create-order` | Deterministic order id from the idempotency key **and** an inputs hash covering priced lines, address, coupon, delivery method, subtotal, discount, shipping and total; a changed cart/address/shipping creates a new order and supersedes the old pending one; an already-paid duplicate is refused 409. Sound. |
| Shipping and totals | tests + browser | One function prices the quote, coupon check, order and Razorpay amount; invoice engine takes the stored `shipping`. Consistent in the emulator. |
| Invoices | read | Seller details come from the saved profile; titled "Invoice" (not "Tax invoice") while GST is off. Tax treatment itself is **OWNER / tax professional**. |
| Payment-to-print | read + earlier emulator verification | The pipeline (`handlePaymentCaptured` → print job queue → render service) was verified on emulators earlier. **Not deployed** (13 functions and the print-render service are not live), so **payment-to-print is not production-ready and not proven in production.** |
| Razorpay key mode on the live Cloud Run (test vs live) | **NOT VERIFIED** (secret read refused) | Owner to confirm. |

## 7. Production readiness: status of each item (live reads were names/counts only)

| Item | Status, with evidence |
|---|---|
| 13 pending functions | Confirmed: `functions/src/index.ts` exports 16 triggers; `gcloud functions list` shows only 3 ACTIVE (`onMediaWritten`, `onVariantWritten`, `reconcileSessionOnLogin`). 13 are not deployed. |
| print-render service | Confirmed not deployed: no such Cloud Run service. Local tests pass. |
| Node.js 22 | Configured in the repo, not verified on a Node 22 runtime (see §1). |
| Storage rules | Live: deny-all (last audit; **not re-checked today**). Repo `storage.rules` tests pass (14) but must not be deployed (would open reads). Unchanged. |
| Firestore rules | Repo rules now differ from live by the `pages` fix (S2). Deploy only on owner approval. |
| Seed/test data | Live counts today: 14 products, 10 reviews, 2 orders, 3 coupons, 1 invoice, 8 users, 0 pages, 0 FAQs. Nothing cleaned. Dry-run doc exists. |
| Placeholder super-admin accounts | 1 user document has `role = super_admin`; custom claims and the placeholder identities were **not** inspected today. Not removed. |
| Business settings | Only `settings/theme` exists live. `store`, `shipping`, `returns`, `policyFacts`, `gst` are absent: after deploy, every state except Tamil Nadu is blocked at checkout and every policy page shows the holding notice until the owner fills and approves them. |
| Razorpay webhook | Function not deployed; webhook secret and dashboard registration not done. |
| WhatsApp | Live Cloud Run has **no** `WHATSAPP_*` variables. OTP therefore fails closed (and sign-in is closed by `SITE_PREVIEW=1`). `WHATSAPP_MODE=disabled` is still to be added to the next Cloud Run update. Meta side was set up earlier (see memory/docs). |
| Domain | DNS now at GoDaddy name servers with the apex A record at `199.36.158.100` and `www` CNAME to `bropics-app.web.app`; `https://karthysgallery.in` answers 200. Whois shows the transfer completed (status ACTIVE). No DNS was changed in this pass. |
| SEO | Live responses carry `x-robots-tag: noindex, nofollow` and `robots.txt` is `Disallow: /` (SITE_PREVIEW=1): correct while closed. The sitemap and canonical already use `https://karthysgallery.in`. At go-live: `SITE_PREVIEW=0` and a rebuild with the real site URL (the running service still has the run.app URL as `NEXT_PUBLIC_SITE_URL`). |
| Sign-in / checkout | Closed (SITE_PREVIEW=1). Not opened. |

## 8. Remaining launch blockers (nothing here is complete)

1. Owner facts and decisions in `docs/LEGAL_OWNER_REVIEW_CHECKLIST.md` (profile, wording, returns decisions, shipping charges, per-product return type).
2. Professional read of the eight policy pages, then approval; tax-professional confirmation on GST/registration.
3. S8 delivery/dispatch promises still hard-coded; S9 damage-photo rule decision.
4. Deploy of Firestore rules (S2) — owner approval; Storage rules stay as they are.
5. Functions (13) and print-render deploy, Razorpay webhook registration (and the S5 amount check), proof of one real small paid order through to a print job and an invoice.
6. Seed/test data cleanup and placeholder super-admin removal — owner approval.
7. WhatsApp: `WHATSAPP_MODE=disabled`, OTP env and wallet; Razorpay live/test mode confirmed.
8. Go-live rebuild (`SITE_PREVIEW=0`, site URL), after items 1–7.

## 9. Owner decisions still required (exact)

1. Legal name, the postal address customers see (Krishnankovil vs Srivilliputhur), support email, WhatsApp number, Manikandan's designation and contact, owner name.
2. Days to report a fault (and approve), whether ready-made items may be returned for change of mind and for how many days.
3. Whether a damage claim may be submitted online without a photo (S9).
4. Dispatch time, delivery estimate, cancellation rule, refund timing, photo retention, response time, support hours, courts.
5. A shipping charge for every state outside Tamil Nadu, or one fallback; whether express is offered.
6. Whether to import the India Post PIN directory (§4) and whether ambiguous Tamil Nadu/Puducherry PINs should one day be charged or held for review.
7. Approval of the force-override rules in §5 before it is built.
8. Per product: personalized or ready-made.
9. Tax: confirmation from a tax professional that selling online without GST registration is correct for the business, and the invoice wording.
10. Approval, separately, for: rules deploy, functions + print-render deploy, seed cleanup, super-admin removal, Razorpay webhook, WhatsApp env change, go-live.

## 10. Deployment prerequisites and rollback

Prerequisites, in order: settings saved and pages approved on the **live** admin (only after deploy of this code, because the new screens do not exist live yet) → rules deploy (S2) → functions and print-render → webhook → one real small order → go-live flags and rebuild.
Rollback: the web app is a Cloud Run revision, so rolling back is routing traffic to the previous revision (`karthys-gallery-00022-kn8` is the current one). Firestore rules: redeploy the previous rules file from git. Settings/pages written by the new admin screens are additive documents; old code ignores them. No data migration needs undoing. Functions: delete or redeploy the previous version per function.
