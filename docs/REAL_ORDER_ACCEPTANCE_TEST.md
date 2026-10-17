# Real-order acceptance test (step by step)

Do not start until every item in section 0 is done and the owner has approved the deployments. Use a real phone, a real WhatsApp number and a **small real payment** (the cheapest product, ideally with the 10% offer). Record for each step: time, screenshot, order id, PASS/FAIL. A step is PASS only with the evidence named in its last column.

## 0. Preconditions (all must be true)
1. Admin → Settings saved: store (legal name, address, phone, processing days), GST decision, shipping, SEO. Legal pages published with no `NEEDS OWNER INPUT` text left.
2. Seed/demo data cleanup done per `docs/SEED_DATA_CLEANUP_DRYRUN.md`; placeholder admins removed; owner password changed and authenticator/passkey working.
3. Cloud Functions deployed (all 16), print-render deployed and private, `PRINT_RENDER_URL`/`PRINT_DISPATCH_AFTER` set, website `CUTOUT_SERVICE_URL` + invoker bindings set.
4. Razorpay webhook registered with the function URL and secret; Razorpay account active.
5. Website env: `WHATSAPP_OTP_MODE=production`, phone id, template name, token secret, **`WHATSAPP_MODE=disabled`**, `SITE_PREVIEW=0`, site URL `https://karthysgallery.in`, real chat number; WhatsApp prepaid balance ≥ ₹200.
6. A Firestore export/backup exists.

## 1. WhatsApp OTP login
| # | Action | Expected | Evidence |
|---|---|---|---|
| 1.1 | Open https://karthysgallery.in/signin, enter your own WhatsApp number | "code sent" message | screenshot |
| 1.2 | Receive WhatsApp from "karthys Gallery" | 6-digit code + Copy code button within ~30 s | phone screenshot |
| 1.3 | Enter a wrong code | clear error, not logged in | screenshot |
| 1.4 | Request resend immediately | cooldown message (30 s) | screenshot |
| 1.5 | Enter the correct code | signed in; account page loads | screenshot |
| 1.6 | Wait > 5 min, use the old code | rejected (expired) | screenshot |
| 1.7 | Try a number that is not on WhatsApp | graceful failure message, no crash | screenshot |
Also check: the `otpSessions` doc stores a hash, not the code; no code appears in logs.

## 2. Product personalization
2.1 Open one published product; upload a good photo (JPG), a low-resolution photo (warning shows), and a HEIC/iPhone photo. 2.2 Crop/rotate/zoom; undo/redo. 2.3 Switch Frame/Bedroom/Hall/Table scenes: photo and text appear in all. 2.4 Text fields and fonts render the same in preview and zoom. 2.5 Glitter option changes the price by the configured amount. 2.6 Collage product: Add to cart stays disabled until every slot has a photo. Evidence: screenshots; browser console free of errors.

## 3. Combo offers (if a combo is published)
3.1 Add a combo; each frame keeps its own photos when switching. 3.2 Combo price shown once. 3.3 An archived product in a combo shows "currently unavailable".

## 4. Cart and checkout
4.1 Add item; cart badge and drawer correct. 4.2 Refresh; cart persists after login (guest→user merge keeps larger quantity). 4.3 Checkout: add address; pincode check; shipping matches Admin → Settings; GST lines match the GST decision. 4.4 Apply `DIWALIDHAMAKA` (or the live offer): discount 10%; remove; invalid code message. 4.5 Total on screen equals the total the server later stores (compare the order document `total`).

## 5. Razorpay payment (live, small amount)
5.1 Place order → Razorpay checkout opens in the correct amount and name. 5.2 Pay with UPI/card. 5.3 Success page shows the order number. Evidence: Razorpay dashboard shows the payment `captured` for the same amount and order id.
5.4 **Webhook proof:** the Cloud Function log shows a `payment.captured` event handled once; a replay returns "duplicate", no double processing.
5.5 **Close-the-tab test:** start a second tiny payment, close the page right after paying; the order must still become `paid` through the webhook within a few minutes.
5.6 Failed-payment test: cancel at Razorpay; order stays unpaid, no print job, stock released after the timeout.

## 6. Order confirmation
6.1 Orders page shows status and items. 6.2 Order document: `status: paid`, `paymentStatus: paid`, `razorpayOrderId` set, events `pending_payment → paid`. 6.3 WhatsApp/email confirmation is **not** expected while `WHATSAPP_MODE=disabled`; check `whatsappMessages` shows a failed/skipped record and no customer message was sent.

## 7. Invoice
7.1 Within minutes an invoice appears (`invoices` doc, number continues after `KG-INV-2026-000001` unless the accountant reset it). 7.2 Open the PDF from the customer order page and admin: seller legal name, address, GSTIN (if enabled), buyer, items, discount, shipping, total all correct. 7.3 Invoice is created once (retry/refresh does not duplicate).

## 8. Print rendering
8.1 `printJobs/{orderId_itemId}` appears `queued` → `leased` → `done`. 8.2 Order becomes `print_ready`. 8.3 Storage has `print-files/{orderId}/{itemId}/print.png` with non-zero size; download it from the admin Files Box and check: correct crop, only the customer's artwork (no frame mock-up), expected pixel size/DPI, text in the bundled fonts, glitter layer if chosen. 8.4 Cloud Run request log shows `POST /render/...` 200. 8.5 Force a failure (admin retry on a bad file) and confirm the sweep retries then `failed_permanent` is visible to staff.

## 9. Admin order management
9.1 Sign in with authenticator and with fingerprint/passkey. 9.2 Order list, filter, open the test order. 9.3 Change status, add tracking, mark shipped; customer sees it. 9.4 Refund the test order (small amount) from admin; Razorpay refund appears; credit note created; `releaseStockOnCancel`/refund events processed. 9.5 A staff-role user cannot reach owner-only pages (settings, team).

## 10. Devices and browsers
Desktop Chrome and Safari; iPhone Safari; Android Chrome; tablet width 768; 375/390 phone widths; landscape; slow 3G throttling. No horizontal scroll, keyboard focus visible, reduced-motion respected, banner and offer readable.

## 11. After-go-live checks
`robots.txt` allows crawling, no `noindex` header, sitemap lists real products only, canonical URLs use `karthysgallery.in`, `www` redirects to apex, Search Console verified, budget alert and WhatsApp balance alert exist, uptime of `https://karthysgallery.in/` checked from outside the home network.

## 12. Sign-off
List each failed step with owner and fix; repeat the failed section. Only when sections 1–9 are all PASS may the owner announce the shop.

## Added 2026-10-17: shipping, returns and policy-page checks (run on the real site only after the owner approves go-live)

Before: Admin > Settings has the business profile saved, a charge for every state (or a fallback), and the eight policy pages approved and published.

1. Footer shows each approved policy link; each page opens with approved text (no holding notice, no `{{...}}`, no "NEEDS OWNER" text).
2. Product page, cart, checkout and the confirmation show the real WhatsApp number/email from Settings and nothing else.
3. Order to a **Tamil Nadu** address: shipping is ₹0 on the cart/checkout summary, the Razorpay amount, the order, the invoice and the admin order page (which also shows "Free: delivered within the home state").
4. Order to **one other state** (small test): shipping equals the charge set for that state in every one of those places.
5. Try an address whose state/PIN do not match (for example "Tamil Nadu" with a Kerala PIN): checkout refuses with the address message and creates no order.
6. Try a state with no charge (only if no fallback exists): checkout refuses with the WhatsApp message.
7. After delivery, on a personalized item: "changed my mind" is refused with the explanation; "damaged" (with a photo) is accepted for review and appears in Admin > Returns with its policy flags.
8. Invoice reads "Invoice" (not "Tax invoice") while GST is off, shows the seller's legal name and address from the profile, and no GSTIN.
9. WhatsApp transactional messages remain disabled (`WHATSAPP_MODE=disabled`): no customer message is sent by this test.


## Added 2026-10-17 (verification pass)

10. Address with a PIN beginning 605, 607 or 609 and state "Tamil Nadu": shipping is free; the admin order page shows the "range shared with Puducherry" warning unless the PIN directory has been imported. Check the address by hand before dispatch.
11. Address "Puducherry" with a Chennai PIN: checkout refuses (state/PIN mismatch).
12. Save a policy page, open Preview (facts filled, nothing blocking), Approve, Publish: the public page shows the text and the footer shows the link. Edit one word: the page returns to Draft and the public page shows the holding notice. Approve and Publish again, then Withdraw: holding notice again within seconds.
13. Sign in as a marketing_manager (if such an account exists): shipping, returns, store profile and page approval return 403; SEO still saves.
14. Product with no return type set: "changed my mind" is refused; set it to Ready-made with an approved period: it is accepted within the period.
