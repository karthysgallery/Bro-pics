# What is pending, what to ask the client, what to improve, what to avoid

Status date: 2026-10-08. Implementation frozen at commit `0ddab07` (see `PERSONALIZATION_PROJECT_HANDOVER.md`).
Nothing is pushed to `master`, nothing is deployed beyond the Cloud Run preview, DNS is unchanged, production mode is off.

---

## A. What is still to be done (in go-live order)

### A1. Owner-blocked (cannot be done without the owner/client)
1. **Domain**: finish the karthysgallery.in transfer, then point DNS at Firebase Hosting (apex A `199.36.158.100`, TXT `hosting-site=bropics-app`, keep the Google verification TXT, `www` CNAME `bropics-app.web.app`). Copy any records the old site/email used first.
2. **WhatsApp OTP** (login): real WhatsApp Business provider + approved message template + credentials. Until then sign-in is mock-only and OFF on the preview.
3. **Razorpay LIVE**: live key id/secret, a webhook secret, and the webhook URL registered in the Razorpay dashboard (webhook function `razorpayWebhook` is built, not deployed).
4. **Videos / reels / product-in-motion files** — none exist in the live project; they must be re-uploaded (Admin → Videos) after sign-in and Storage rules are live.
5. **Real business data in Admin → Settings**: GSTIN, legal name, registered address, store name, support phone/email, WhatsApp number (the site currently uses the placeholder `910000000000`), shipping charges / free-shipping threshold, delivery serviceability (pincodes), couriers.
6. **Decisions**: deploy rules at go-live (recommended), merge/push to `master`, the first combo(s) to publish.

### A2. Engineering steps that wait for the go-live sequence
1. Deploy **Firestore + Storage rules** (repo versions; 48 rules tests pass). Required before sign-in opens: live rules block cart writes, so signed-in carts/checkout cannot work, and block all Storage reads, so videos cannot play.
2. Run `bootstrap-admin` for the owner account BEFORE sign-in opens (the hard-coded admin backdoor was removed).
3. Run the read-only `audit-live-data` script (older admin screens saved rupee values as paise).
4. Set `NEXT_PUBLIC_SITE_URL=https://karthysgallery.in`, `SITE_PREVIEW=0`, `PAYMENT_PROVIDER=razorpay`, `WHATSAPP_OTP_MODE=production` (build values in `apps/web/cloudbuild-deploy.yaml` + the same env vars on the Cloud Run service). The app fails closed if any is missing.
5. Deploy **Cloud Functions** (reconcile already live; deploy `razorpayWebhook`, print dispatcher/sweeper) — **upgrade the functions runtime from Node 20 before 2026-10-30** (decommission date).
6. Deploy the **print-render service** (private Cloud Run) per `services/print-render/DEPLOY.md`, only after the website release is live; set `PRINT_RENDER_URL` and `PRINT_DISPATCH_AFTER` in `functions/.env.bropics-app`. Before building it run `pnpm --filter @bro-pics/print-render fetch-model` (background-removal model); deploy with **8 GiB / 2 CPU / concurrency 1**; set `CUTOUT_SERVICE_URL` on the website service and grant it `run.invoker` on print-render; check `/health` shows `fonts.rendering.ok: true` and `cutout.modelPresent: true`.
7. Set a **TTL policy** on `otpSessions.expireAt`.
8. Push/merge to `master` (the Cloud Build trigger then tests, builds and deploys). First real push is also the first real proof of the trigger.
9. DNS cut-over, HTTPS check, smoke test (browse, sign in, add to cart, pay a small real amount, refund it, verify print job, verify admin).
10. Resolve the two stuck real orders **BP-2026-00002 / 00003** (paid but never printed) — only after the print pipeline is live; contact the customers.
11. Submit `/sitemap.xml` to Google Search Console and verify the domain (Admin → Settings → SEO).

### A2b. Admin → Running costs (what the website costs)
The page is built; Google's figures need two one-time settings, then two engineering steps.
- **Owner (billing account owner, Google Cloud console):**
  1. Billing → Budgets & alerts → Create budget for project `bropics-app` (e.g. ₹1,000/month) → actions: **Connect a Pub/Sub topic**, create topic `billing-budget-alerts` in bropics-app.
  2. Billing → Billing export → BigQuery export → **Standard usage cost** → project bropics-app, new dataset `billing_export` (only covers days from then on).
- **Engineering (with the go-live deploy):** deploy the `recordBudgetAlert` function (functions bundle); set `BILLING_EXPORT_TABLE=bropics-app.billing_export.gcp_billing_export_v1_…` (exact table name from BigQuery) on the website's Cloud Run service; grant the website's service account **BigQuery Job User** on the project and **BigQuery Data Viewer** on the `billing_export` dataset.
- Until then the page shows "No cost figures yet" and the setup checklist; the same numbers are in the console under Billing → Reports.

### A3. Content to enter (admin work, not code)
- Product SEO titles/descriptions per product (live titles still say "| BroPics" from old seed data).
- Real product photos/mockups (the local catalogue uses placeholder mockups), template links for collage products.
- Policy pages (terms, privacy, shipping, returns, FAQ, about, contact) — confirm wording matches the client's real policies.
- Combo offers to publish; header link appears automatically.

---

## B. What to ask the client (production questionnaire)

**Business & legal**
- Legal entity name, GSTIN, registered address, state of supply; are prices GST-inclusive (the app assumes inclusive)? Invoice prefix/format and financial-year numbering rules.
- Return/refund/cancellation policy in plain terms (personalized items are usually non-returnable — what exactly is refundable, within how many days, who pays shipping?). Replacement policy for print defects.
- Terms of service/privacy policy approved by whoever advises them (legal review).

**Products & pricing**
- Final product list, sizes, finishes, prices, MRP/compare-at prices; which are made-to-order and dispatch time per product.
- Which combos to launch: name, frames, quantities, price, MRP, cover image, and whether coupons may apply.
- Minimum photo resolution they accept per size (the app blocks genuinely too-small photos and warns on low).
- Real mockup images / PSDs for each product and the "FOREVER AND ALWAYS" design asset; the renderer choice for mockups (Sharp warp vs Photoshop API vs Dynamic Mockups) and whether an AI fallback for photo-detection is wanted.

**Shipping & operations**
- Courier partner(s) and whether they want API integration (e.g. Shiprocket) or manual tracking entry; pincode coverage; shipping charge rules; free-shipping threshold; express option; COD yes/no (not built).
- Who prints, where, and the production workflow (photo validation → print → QC → pack → dispatch); who staffs the admin and with which roles.
- Packaging, dispatch cut-off times, holiday/closure handling.

**Payments**
- Razorpay account in the client's name, KYC complete, live keys, webhook secret, settlement account; refund handling process; GST on invoices.

**Customer communication**
- Which channels: WhatsApp (needs approved templates), SMS, email? Sender names/numbers; email provider and a domain email (there are no MX records today); notification wording; support hours and WhatsApp/phone number.

**Accounts & access**
- Owner/admin phone numbers to bootstrap; staff accounts; who owns the Google Cloud, Firebase, GitHub, Razorpay, domain registrar accounts (transfer ownership to the client, with billing).

**Content & brand**
- The reels/product-in-motion/feedback videos (source files), testimonials with permission, brand logo, colours, fonts, festival themes calendar, hero banners.

**Domain & hosting**
- Who controls DNS during/after the transfer; any email/other services on the domain that must keep working; acceptable monthly cloud budget (Cloud Run, Firestore, Storage, Cloud Build) and alert thresholds.

**Existing data**
- Real orders already received (BP-2026-00002/00003): contact details and promised delivery; any customers/orders/addresses on the deleted Vercel site that must be recovered; photo uploads from those customers.

**Launch**
- Target date, soft-launch audience, and who tests (a real-money test order is required).

---

## C. What should be improved (after the frozen release or before launch if time allows)

**Quality gates**
- No linter exists (`pnpm lint` runs nothing): add ESLint + a CI step. Add Playwright end-to-end tests (config exists) for browse → personalize → combo → checkout → admin, run in CI.
- Test a **template-engine (v2) product inside a combo** with real data (mechanism is unit-tested only).
- Test the print pipeline on the real Cloud Run service with real photos and real mockups; verify DPI/colour with a proof print.
- Real-device testing (iPhone Safari, Android Chrome) for upload (HEIC), camera orientation, large photos and the gallery.

**Operations & safety**
- Monitoring and alerts (Cloud Run errors, failed print jobs, failed payments/webhooks, function failures), error tracking, an uptime check.
- Scheduled Firestore export + Storage lifecycle/backup; budget alerts.
- Confirm the Cloud Build pipeline's permissions are least-privilege; consider a dedicated build service account and a staging service that deploys from a `staging` branch before `master`.
- Rate limits are in-memory per instance (resets on deploy / not shared across instances) — consider a shared store before heavy traffic.
- Dependency audit and update; functions runtime upgrade (Node 20 end of life).

**Product improvements**
- Combos: allow editing a combo already in the cart (today the customer removes and rebuilds); show per-frame preview thumbnails larger; optional "quantity" of whole combos; mixed-size choice per frame (today sizes are fixed per combo).
- Admin: media upload could not be verified on the emulator; test on the real project once sign-in is on. Admin Videos management needs a real run.
- Order views: production jobs list does not yet show "Combo · Frame N" (derive from the order item).
- Add notification templates review, invoice PDF, and a refund drill with Razorpay test mode before live.
- Performance pass (Lighthouse), image sizes, accessibility audit.

---

## D. What to avoid (lessons from this project)

1. **Never push/merge to `master` casually** — it auto-deploys. Push to a branch first.
2. **Never deploy the new rules without the rest of go-live in mind**, and never open sign-in/payments before rules, `bootstrap-admin`, and production env vars are done.
3. **Never run seed scripts (`write-to-firestore`, etc.) against the live project** — they write catalogue data. Seed only the emulator (`FIRESTORE_EMULATOR_HOST` set).
4. **Your local dev server on :3000 talks to the LIVE Firebase project** — test orders, uploads, customizations and admin edits made there are real data. Use the emulator setup (`web-emulator`) for testing.
5. **Do not leave mock modes on in production**: mock OTP lets anyone sign in as any customer; `PAYMENT_PROVIDER=mock` takes no money. The app fails closed if unset — keep it that way.
6. **Keep secrets out of git and chat**: Razorpay keys live only in `apps/web/.env.local` (git-ignored) / Secret Manager; paste production credentials into the Terminal prompt, not into messages. `functions/.env.bropics-app` is currently untracked — decide deliberately whether to commit it (it holds no secrets, only URLs).
7. **Do not change a published combo's items/price while carts hold it** without expecting customers to re-add it (version bump marks old carts stale); do not archive a product that is inside a live combo — unpublish the combo first.
8. **Do not delete hosting before the replacement is live** (the Vercel site was deleted; the old public site is currently down while the preview is noindex and sign-in is off).
9. **Do not edit money fields in rupees where paise are expected** — run `audit-live-data` before launch.
10. **Do not change DNS without recording the existing records first**, and never touch MX/SPF/DKIM/DMARC when email is in use.
11. **Do not skip the real-money test order** (pay small, refund, confirm print job and invoice) before announcing.
12. **Do not rely on the emulator for upload/signing behaviour** — signed-URL uploads are not supported there; verify admin media uploads on the real project.
