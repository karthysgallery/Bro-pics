# Seed / demo / test data — cleanup DRY RUN

Date: 2026-10-17. **Nothing was deleted or changed.** Data was read from the live `bropics-app` Firestore
(`scripts/ops/seed_data_report.py` is the read-only collector). Phone numbers are masked. **Every action below needs the
owner's explicit approval; recommended order and rollback notes are at the end.**

Live collection counts: products 14 · reviews 10 · users 8 · staff 3 · orders 2 · invoices 1 · coupons 3 · carts 4 · uploads 135 ·
customizations 22 · media 116 · personalizationTemplates 10 · homepageSections 12 · printJobs 0 · combos 0 · auditLogs 176.

## 1. Fake reviews — 10 documents (`reviews/*`)
All `approved`, all written by non-existent seed users (`user_seed_*`) about demo products, with seed order ids (`order_seed_*`, which do not exist).
| Review | Product | Rating |
|---|---|---|
| Beautiful finish; Good but slow shipping | prod_classic_wooden_frame | 5, 4 |
| Sweet design | prod_couples_eye_frame | 4 |
| Great value | prod_desk_photo_frame | 4 |
| Looks premium | prod_modern_acrylic_frame | 5 |
| Nice everyday gift | prod_personalized_photo_mug | 4 |
| Stunning colours | prod_photo_canvas_print | 5 |
| Looks amazing together | prod_photo_collage_set | 5 |
| Perfect for our hallway; Great gift | prod_vintage_collage_frame | 5, 5 |
- **Where they show:** the homepage "What Our Customers Say" section (`reviews_testimonials`) draws from approved reviews; at least "Looks amazing together", "Great gift" and "Stunning colours" were found in the live homepage HTML.
- **Dependencies:** the 8 demo products carry denormalised `ratingAverage/ratingCount` (4–5 stars, 1–2 reviews). The function that recalculates these (`onReviewWritten`) is **not deployed**, so deleting reviews will **not** update the demo products' stored ratings (harmless while those products stay archived). No real customer wrote any of these.
- **Recommendation:** delete all 10 (or set `status` to `rejected` first as a reversible step; they then disappear from the site).

## 2. Demo products — 8 documents (`products/prod_*`), all `archived`, not sold
`prod_classic_wooden_frame`, `prod_couples_eye_frame`, `prod_desk_photo_frame`, `prod_modern_acrylic_frame`, `prod_personalized_photo_mug`, `prod_photo_canvas_print`, `prod_photo_collage_set`, `prod_vintage_collage_frame`.
Each has 1–3 variants in `products/{id}/variants` and seed images.
- **Dependencies:** both live test orders (BP-2026-00002, -00003) contain `prod_classic_wooden_frame` (order items keep a title snapshot, but the `productId` link would dangle). The 10 reviews point at these products. No cart, combo or customization references them. Categories (`cat_*`) are shared with the real products and **must stay**.
- **Recommendation:** they are already hidden (archived). Safest: **keep archived** until the test orders are removed; then delete products + their variants/media together. Archived products can still appear in admin lists.

## 3. NEW10 promotional content
- **Homepage strip:** `homepageSections` doc of type `offer_strip`, title "Use code NEW10 for 10% off your first order", image `/banners/gallery-wall.png`. It appears on the live homepage.
- **Coupon:** `coupons/NEW10` — 10% percent, `isActive` unset (= active), valid to 2030-01-01, used 0 times. **Any customer could use it today.**
- Also from the same seed: homepage hero images `/placeholders/redesign/*` (3 hero slides) and `/banners/artisan-framing-craft.jpg` (why-us) are placeholder art; replace with real photography before launch.
- **Recommendation:** deactivate the strip (`isActive: false`) and set coupon `isActive: false` (reversible), or delete both. Keep `DIWALIDHAMAKA` / `DIWALIDAMAKA` (created 2026-10-15, 10%, valid to 2026-11-10, used 0).

## 4. Test users and admin accounts — **security-relevant**
| Doc id | Masked phone | Name | Role | Comment |
|---|---|---|---|---|
| `OkgJTr22…` | …9999 | Admin User | **super_admin** | seed/QA admin (placeholder number) |
| `user_919999999999` | …9999 | Admin User | **super_admin** | legacy seed admin |
| `mRtr7vDs…` | …8888 | Test Customer | customer | owner of both test orders and a cart |
| `user_919888888888` | …8888 | Test Customer | customer | legacy seed customer |
| `test_admin_uid` | …9999 | — | customer | test account with an empty cart and uploads |
| `usr_1791096400482…` | …3210 | Allwin Karthik | customer | looks like a real person/developer test; confirm |
| `usr_1791096523788…` | …4849 | Admin | **super_admin** | the owner's real admin account — **keep** |
| `usr_1791174205467…` | — | — | customer | empty profile |
- **Finding:** two `super_admin` records belong to the placeholder number …9999. They are accounts nobody should be able to sign in as once real OTP is on. Their Firebase Auth passwords/providers were **not inspected** by this audit (needs an Auth listing). **Recommendation (high priority):** remove their staff documents (`staff/OkgJTr22…`, `staff/user_919999999999`) and disable the matching Auth users, then keep only the owner's admin. Do this **before** opening sign-in.
- Firebase Authentication users were not enumerated here: **NOT VERIFIED**.

## 5. Test orders and related records
| Order | Status | Total | Items | Customer |
|---|---|---|---|---|
| BP-2026-00002 | paid | ₹5,196.00 | Classic Wooden Photo Frame ×4 | Test Customer (…8888) |
| BP-2026-00003 | paid | ₹1,349.00 | Classic Wooden Photo Frame ×1 | Test Customer (…8888) |
- Both are `paid` with events `pending_payment → paid` and **no print jobs**, no refunds, no invoices (invoice/print functions were never deployed). They were made while payments were in mock mode.
- Related: `counters/*` (2 documents) hold the order-number sequence; deleting the orders does **not** reset them, so the first real order will be BP-2026-00004 unless the counter is edited (an owner decision: gaps in invoice/order numbering can matter for tax records).
- Invoices: **1** document `pos_s55d972d…` numbered **KG-INV-2026-000001** (a POS/emulator-style test invoice). The invoice counter has advanced; confirm with your CA whether a first real invoice may start at 000002 or the counter should be reset (accountant decision; do not reset after real invoices exist).
- Other test data: 4 carts (2 with items), **135 uploads** and **22 customizations** from test sessions (2026-09-29 → now), 10 personalization templates of which 3 are named "Screenshot 2026-10-…" (drafts), 176 audit-log entries, 116 media images (mix of real catalogue assets and seed images; not classified, **NOT VERIFIED** which are unused).
- Uploads/customizations also have files in Storage under the upload paths; deleting documents without deleting files (or vice versa) leaves orphans. A cleanup script must handle both.

## 6. References and dependencies summary
- reviews → demo products → test orders (via `productId`) → test customer user.
- NEW10 strip ↔ `coupons/NEW10` (independent documents; the strip text is not linked to the coupon).
- Demo products → variants/media subcollections; shared categories must stay.
- Test users → carts, uploads, customizations, orders, Firebase Auth accounts.
- Counters/invoice numbers are global and not reversible by deleting documents.

## 7. Proposed order of operations (after your approval — nothing here has run)
1. Export a backup of the affected collections (Firestore export or the JSON snapshot) and note its location.
2. **Reversible hides first:** deactivate the NEW10 strip and coupon; set the 10 seed reviews to `rejected`.
3. Remove staff documents + disable Auth users for the placeholder admins (`…9999`).
4. Delete the 2 test orders and their `items/events` subcollections.
5. Delete the 8 demo products with their variants/media; then delete the 10 seed reviews for real.
6. Delete test users, carts, uploads (documents **and** Storage files), customizations, the 3 draft "Screenshot" templates.
7. Decide on counters / invoice numbering with your CA; do **not** reset after the first real invoice.
8. Re-run the report: it must show only real data. Test the homepage, a product page and checkout in a browser.
Rollback: step 2 is undone by re-activating; steps 4–6 are permanent without the backup from step 1.
