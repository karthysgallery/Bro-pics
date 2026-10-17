# Business settings, shipping, returns and policy pages

Status: built and tested locally. **Not committed, not pushed, not deployed.** Nothing in this document has changed any live data.

## 1. Principle

No business fact is hard-coded. Everything a customer reads about the business (name, address, contacts, grievance officer, shipping, returns, policy wording) is either typed by an administrator in **Admin > Settings** or is absent. When a fact is absent the thing that needs it is hidden or refuses to publish; it is never replaced by a guess.

## 2. Where each setting lives (Firestore `settings/{key}`, written by `PUT /api/admin/settings/{key}`, permission `settings:write`)

| Key | What it holds | Notes |
|---|---|---|
| `store` | **Business profile**: name, legal name, structured address (line 1, line 2, city, district, state, PIN, country), support email, support WhatsApp, support phone, owner, grievance contact (name, designation, email, phone), GST registration status (`not_registered` / `registered` / `unconfirmed`), invoice note, processing days | Validated by `packages/shared/src/business/business-profile.ts`. No defaults for contact data. GST status defaults to `unconfirmed`. |
| `shipping` | Home state (Tamil Nadu), a charge in paise per other state/UT, optional fallback charge for "other states", express on/off + charge | `packages/shared/src/shipping/state-shipping.ts`. The old threshold/flat/express fields are still accepted but ignored. |
| `returns` | Claim window days + approved flag, ready-made change-of-mind days + approved flag, unboxing-video guidance, claim instructions, replacement-first | A number only counts once **Approved** is ticked. |
| `policyFacts` | Owner-written sentences the policies quote: dispatch time, delivery estimate, cancellation rule, refund timing, photo retention, response time, support hours, courts/jurisdiction | Empty = the policy that needs it cannot be approved. |
| `pages` (collection) | The policy and content pages, with draft / approved / published workflow | See section 5. |

Settings documents are readable by browsers (Firestore rules), so only information that is meant to be public may be stored in them. Private costs and secrets never go in `settings/*`.

The admin Settings page shows a **readiness panel** (`GET /api/admin/readiness`): missing business details, how many states still have no charge, returns decisions still open, how many active products have no return type, and the status of each of the eight policy pages. It returns counts and labels only.

## 3. Shipping

Rule (owner-confirmed): Tamil Nadu is free; every other state or union territory pays the charge the admin sets for it.

* Computed in one place, `resolveShipping`, from the delivery address **the server reads from the database** and the shipping settings **the server reads from Firestore**. The browser sends only an address id, never an amount, state or PIN.
* A state is free only if the state name is Tamil Nadu **and** the PIN's first two digits are plausible for Tamil Nadu (or Puducherry's shared ranges). A Kerala PIN saved as "Tamil Nadu" is rejected (`state_pincode_mismatch`).
* A state with no charge is **never free**: checkout is blocked with `shipping_not_configured` (HTTP 422) unless the admin has set a fallback "other states" charge.
* Express is unavailable unless the admin enables it.
* The same function prices: product-page and cart messages, checkout display, the quote API, the coupon-validate API, the Razorpay amount, the saved order (`shipping` and a `shippingDetail` snapshot: state, PIN, basis), the confirmation, the invoice and the admin order page. A free-shipping coupon waives only a charge that was actually worked out.
* POS/in-store billing has no shipping (collected in person), so it does not use this rule.
* The old "Shipping Rates" admin page (free above ₹999 / flat rate) no longer decided any price; it is replaced by a pointer to Settings > Shipping and its API returns 410 so it cannot write stale fields.
* Known limitation: Puducherry enclaves share PIN prefixes 605/607/609 with Tamil Nadu. A Puducherry customer who picks "Tamil Nadu" with a Puducherry PIN is treated as Tamil Nadu. The PIN prefix check is coarse by design (it wrongly rejecting a real customer would cost a sale).

## 4. Returns, replacements and claims

* A product is **personalized** (made from a customer's photo/text: product type single photo or collage, photo slots, or text personalization) or **ready-made** (fixed design). The override order is: the order's product > the product's `returnPolicy` > its category's `returnPolicy` > assumed personalized (and flagged for staff).
* Personalized products are not accepted back for a change of mind. Damaged, defective, wrong or mis-printed items are always reviewed (never auto-refused).
* Ready-made change-of-mind is offered only for the number of days the owner has ticked **Approved**; otherwise it is refused.
* The claim window (days to report a problem) is enforced only when the owner has approved it. Until then no deadline is applied and the request is flagged for staff ("claim window not approved"). The admin screen and the policy pages never present an unconfirmed number as established.
* The unboxing-video request is guidance on the claim form, never a condition: a claim without a video is still reviewed.
* The decision is made server-side in `POST /api/orders/{id}/returns` (`decideReturnRequest`). Refused requests return 422 `return_not_eligible` and write nothing. Accepted requests store `policyKinds` and staff-only `policyFlags` on the return.
* Per-product and per-category return type is set in the product/category editors. Changing a product's return type is written to the audit log with the previous value. There is **no** staff button yet that forces through a customer request the rule refused (a refused customer is told to message the shop on WhatsApp; staff can then change the product/category type or handle it by hand). That bypass was not built because its authorisation and audit design needs the owner's say.

## 5. Legal and policy pages

Eight pages are "legal" and need approval: Privacy, Terms, Shipping policy, Return/Refund policy, Cancellation policy, Contact, Grievance, About.

1. **Draft.** Start from a template (Admin > Pages > Create > "Start from a template") or write your own. Text uses `{{tokens}}` for business facts.
2. **Preview.** The Preview button shows the page exactly as customers would see it, with the saved facts filled in, and lists everything blocking it (unfilled facts, internal notes such as "NEEDS OWNER CONFIRMATION", almost no text).
3. **Approve.** Only an administrator (`settings:write`) can approve, and only when nothing blocks the page. The approval is bound to a SHA-256 fingerprint of the exact text; editing the page voids it and unpublishes it. The approver and time are recorded.
4. **Publish.** A legal page goes public only while it is published **and** its approval matches the current text **and** nothing is unfilled. Otherwise visitors see a neutral holding notice (not indexed by search engines), never the built-in text.
5. **Navigation.** The footer links only to legal pages that are live. `/policies` redirects to the shipping policy.

Facts are filled at view time from the saved settings, so a changed address or email updates every page, invoice contact and message at once. The last editor (`updatedBy`) and approver are shown in the page list.

## 6. Contact details everywhere

`BusinessContactProvider` (from the saved profile) feeds the product page help box, order pages, footer, JSON-LD and the WhatsApp links. No support email or WhatsApp number is built into the code. If the profile has no WhatsApp number, WhatsApp buttons are hidden. Invoices take the seller name/legal name/address from the same profile.

## 7. What deployment will change for customers

* Policy pages show a holding notice until each is approved and published.
* Checkout refuses addresses in states with no charge (the owner must set charges or a fallback first).
* WhatsApp contact buttons are hidden until a number is saved.
* `/policies` redirects to the shipping policy; the old Contact and About text is replaced by approved text only.
* WhatsApp transactional messages stay disabled (`WHATSAPP_MODE=disabled`); this work does not touch messaging.


## 8. Added in the 2026-10-17 verification pass

* **Who may change what customers are promised:** the permission `policies:approve` (super_admin, admin) is required to save the `store`, `shipping`, `returns`, `policyFacts` and `gst` settings, to approve or withdraw a legal page, and to set or change a product's or category's return type. Roles with only `settings:write` (marketing_manager) or `content:write` (content_manager) cannot.
* **PIN directory (optional, authoritative):** if `shippingServiceability/{pin}` has the PIN, its state must equal the address state. The order records `shippingDetail.pinVerified` and `pinAmbiguous`; the admin order page warns when a shared-prefix PIN (605/607/609) was not confirmed. The directory is empty today.
* **Public pages are cached for 60 s but are refreshed immediately** when a page is saved, approved or withdrawn.
* **Firestore rules (repo, not deployed):** `pages` is readable only when published.
* **Force override:** not built; requirements are in `docs/VERIFICATION_REPORT_2026-10-17.md` §5.
* **Known gaps:** delivery/dispatch estimates are still partly hard-coded (see the report, S8); the Razorpay webhook does not compare amount/currency (S5).
