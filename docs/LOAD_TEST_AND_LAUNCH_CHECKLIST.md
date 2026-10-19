# Load test, cost estimate and launch checklist (2026-10-19)

## How it was tested
- Production build of the website (`next build` + `next start`) on the owner's Mac, talking to the **Firebase emulators**
  (Firestore, Auth, Storage) with throw-away credentials. Nothing touched the live site, live data, real payments or real WhatsApp.
- Each virtual customer used its own fake IP, so the per-IP rate limiter behaved as it would for real visitors.
- Scripts: `scratch/loadtest/` (`browse.mjs`, `pages.mjs`, `s3-uploads.mjs`, `s4-orders.mjs`, `s5-integrity.mjs`, `verify.mjs`).
- Numbers are from one laptop process. One Cloud Run instance (1 vCPU) will be slower or faster; treat them as relative, not promises.

## Results

| Test | Result | Verdict |
|---|---|---|
| 1,000 visitors (home → category → product), 50–150 at once | 1,000/1,000 OK | Pass |
| 5,000 product views, 50–150 at once | 5,000/5,000 OK, p95 49–161 ms, ~1,200 req/s | Pass |
| Search box typeahead x1,000 | 1,000 OK, p95 99–241 ms | Pass |
| 500 shoppers upload a ~5 MB photo, save, post preview (20–40 at once) | 500/500 OK, ~17/s, p95 1.6–3.2 s | Pass (see memory note) |
| Pay the same order 6x at once | settled once, one invoice, order count +1 | Pass |
| Submit the same checkout 6x at once | exactly one order | Pass |
| Last stock: 10 in stock, 30 buyers at once | exactly 10 orders, 20 told "Only 0 left", stock = 0 | Pass |
| 100 orders, 20 at once, BEFORE the fix | 35/100 OK, 60 "could not place order", 5 payment errors | **Fail** |
| 100 orders, 100 at once, BEFORE the fix | 1/100 OK | **Fail** |
| 100 orders, 20 at once, AFTER the fix | 100/100 OK | Pass |
| 100 orders, 100 at once, AFTER the fix | 100/100 OK | Pass |
| Order/invoice number integrity (≈1,000 test orders) | 0 duplicate order numbers, 0 duplicate invoice numbers, 0 paid orders without invoice | Pass |

## Problems found
1. **Order and invoice counters jam under a burst (fixed locally, not deployed).** Every checkout and every payment reads then writes the same counter document; at the same moment they deadlock until Firestore times one out. Fix: queue them inside each server and retry on collision (`packages/shared/src/payments/contention-retry.ts`, used by `settlePaymentCaptured`, `settlePaymentFailed` and the order-number step of `create-order`). 8 new unit tests; whole suite green (shared 789, web checkout 100, functions 85).
2. **Category pages (≈90 req/s) and /search (≈140 req/s) are ~10x slower than other pages.** They are rendered on every view because they read the URL filters. On the live site a category view is ~0.5–0.6 s from India vs ~0.08 s for the home page. Not a failure; the main speed improvement available. Idea: cache the plain (no filter) category page, or serve filters client-side.
3. **Memory.** Uploading 5 MB photos 40 at once pushed one server to ~1.6 GB of its 2 GiB limit. Cloud Run is set to 20 requests at once per instance. Bigger photos (12–20 MB) or more simultaneous uploads could run out of memory. Lower the instance concurrency to ~8–10 or raise memory to 4 GiB.
4. **Capacity ceiling.** Cloud Run is capped at 3 instances x 20 requests = 60 requests in flight. Beyond that visitors queue. Fine for the stated numbers; raise `maxScale` for a big campaign.
5. **Old missing index (fixed, deployed):** the Admin "Paid / Confirmed" tab failed (status + newest-first index). Index added and deployed.
6. **Customer storage bucket is in US-EAST1, the site and customers in India.** Every upload and every preview image crosses continents (slower and billed as inter-continent egress). Consider a Mumbai bucket later.
7. **Rate limiter is per server, keyed on the last X-Forwarded-For address.** Behind Firebase Hosting that last address may be a shared Google address, which would put many customers in one bucket (checkout is 8 per minute per bucket). Not measurable from here: check on the live site with two different networks before a big campaign.
8. **Emulator-only observation:** a paid order can be left `pending_payment` if the settle step fails. In production the Razorpay webhook backup function must be deployed (it is not yet) so a captured payment is never lost.

## Cost estimate for one very busy day
Assumptions (marked as estimates; prices change, check the Billing console): 1,000 visitors, 5,000 product views, 500 photo uploads, 100 orders.

| Item | Per busy day | Free allowance | Likely cost |
|---|---|---|---|
| Cloud Run requests (~55k/day ≈ 1.6M/month if every day) | ~55k | 2M/month | ₹0 |
| Cloud Run CPU/memory (~200 vCPU-s/day) | ~6,000 vCPU-s/month | 180,000 vCPU-s/month | ₹0 |
| Firestore reads (~100k/day: category views dominate) | 100k | 50k/day free | ~₹2/day if every day (≈₹50/month) |
| Firestore writes (~6k/day) | 6k | 20k/day free | ₹0 |
| Storage: 500 photos x ~5 MB = 2.5 GB/day | accumulates | 5 GB total free (US bucket) | ~₹4/month per 1 GB kept; delete unordered uploads regularly |
| Hosting bandwidth (~1.7 MB first visit, ~3 GB/day at 1,000 visitors) | ~90 GB/month | 10 GB/month | roughly ₹500–1,000/month if every day were this busy |
| WhatsApp order messages: 100 orders x ~4 messages | 400 | 1,000 free service conversations/month do not apply to utility templates | utility templates are charged per message by Meta; check the rate card in WhatsApp Manager |

An ordinary day (a few hundred visitors, a handful of orders) is inside the free allowances. The bandwidth line and photo storage are the ones to watch. Create the **Budget alert** (Billing → Budgets) so any surprise is emailed.

## Launch checklist (tick before announcing)
Pass/Fail is current status.

**Code and data**
- [x] Whole test suite green (web checkout 100, shared 789, functions 85, previous full run 2,171).
- [x] Firestore indexes deployed (includes status + newest-first orders).
- [ ] Deploy the counter fix (this change set): review, commit, push, watch Cloud Build.
- [ ] Deploy `razorpayWebhook` with its secret and add the webhook URL in Razorpay (payment backup).
- [ ] Deploy Firestore rules if not yet current; TTL policy on `otpSessions.expireAt`.
- [ ] Run the seed-data cleanup so test products are gone; enter real GSTIN/legal name/shipping in Admin → Settings.

**Speed and capacity**
- [ ] Decide on category-page caching (problem 2).
- [ ] Set Cloud Run concurrency/memory for photo uploads (problem 3) and `maxScale` for the campaign (problem 4).
- [ ] Billing budget alert created.

**WhatsApp**
- [x] 7 order templates + OTP template approved; test-number guard live; 4 order messages verified on a real phone.
- [ ] Publish the Meta app (needed for STOP replies and delivery receipts), then test STOP/START.
- [ ] Turn on website invoice messages with the same test guard, test once, then clear the test list.
- [ ] Marketing template + proven consent before any campaign.

**Final live smoke test (owner, one real order, then refund)**
- [ ] Sign in with OTP, upload a photo, see the preview, pay, receive confirmation + invoice, see the order in Admin, move it through production → shipped → delivered, receive each message.
