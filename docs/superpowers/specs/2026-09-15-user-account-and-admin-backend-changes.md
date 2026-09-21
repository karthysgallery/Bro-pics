# Backend Changes Required for the User Account Module + Admin Panel — Requirements Doc

**Status:** Not implemented. This is a requirements list for whoever picks up backend work next, written alongside a frontend-only round (`apps/web`) that built out the full customer account area and a real admin panel (folding the former separate `/staff/*` pages into it). No backend/schema/Firestore rules/seed files were touched this round — everything below is what's needed to make the UI that was just built fully real.

**Context:** Most of what a signed-in customer needs (profile, addresses, orders, a real wishlist) already had backend support and was wired up for real this round — see §7. What follows is genuinely missing.

---

## 1. Product CRUD (admin)

**Today:** products are only ever written by `scripts/seed`. There is no API route or Firestore rule that lets an authenticated admin create, update, or delete a `Product` or its `Variant`/`FrameTemplate`/`media` subcollections from the app.

**New UI, ready to wire up:** `apps/web/app/admin/products/page.tsx` (list) and `apps/web/app/admin/products/[id]/page.tsx` (create/edit form covering `title`, `slug`, `categoryId`, `shortDesc`, `basePrice`, `photoSlots`, `badges`, `highlights`, `isActive`, `isFeatured`, `allowsTextPersonalization`). Save/Create/Delete currently only update local component state, with a visible "not yet connected" note near the button.

**Needed:**
- API routes, e.g. `POST /api/admin/products`, `PATCH /api/admin/products/[id]`, `DELETE /api/admin/products/[id]`, gated the same way `/api/admin/users/*` already is (`getAdminUserIdFromAuthHeader` in `lib/verify-id-token.ts`).
- Decide how `Variant` rows (size/colour/material/price/stock) are edited — a nested sub-form on the same page, or a separate `/admin/products/[id]/variants` screen. The current form only covers `Product`-level fields.
- Decide whether denormalized fields (`availableSizes`, `minPrice`/`maxPrice`, `primaryImageUrl`, `ratingAverage`, `searchTokens`, etc. — currently kept in sync by Cloud Function triggers per `functions/src/products/denormalize*.ts`) should be computed server-side on write, or left to the existing triggers to catch up after a write. The admin form deliberately does not expose these as editable fields.
- Firestore rule change: `products/{id}` (and its variant/media subcollections) currently has no client-writable path at all; either keep it server-only (writes go through the new API routes using firebase-admin, no rule change needed) or open a narrow admin-owner-writable rule if a future round wants direct client writes. Recommend keeping server-only via API routes — consistent with how `/api/admin/users/*` already works.

## 2. Category CRUD (admin)

**Today:** same situation as products — `Category` documents are seed-only.

**New UI, ready to wire up:** `apps/web/app/admin/categories/page.tsx` (list + inline create/edit form: `name`, `slug`, `sortOrder`, `isActive`). Save/Delete are local-state-only with a visible note.

**Needed:** `POST /api/admin/categories`, `PATCH /api/admin/categories/[id]`, `DELETE /api/admin/categories/[id]`, same auth pattern as above. Deleting a category that still has products pointing at it via `categoryId` needs a decision (block the delete, or leave the products with a dangling `categoryId`).

## 3. Homepage content (real, not hardcoded)

**Today:** hero banner copy, promo tiles, bento gallery, and the closing CTA banner are hardcoded directly in `apps/web/components/home/HeroSlider.tsx`, `PromoTiles.tsx`, `BentoGallery.tsx`, and `ClosingCta.tsx` (this round's storefront redesign). The `homepage_sections` Firestore collection still exists and is still read for the hero's `title`/`subtitle`/`link`, but the rest of the sections it used to describe are no longer read by the page at all — the homepage now renders a fixed section order (see `apps/web/app/(shop)/page.tsx`).

**New UI, ready to wire up:** `apps/web/app/admin/homepage/page.tsx` — edits hero title/subtitle/link and the closing banner's heading/link in local state only, with a note that promo tiles and the bento gallery need the same treatment (not built out per-tile in this round, to keep the form a reasonable size).

**Needed:**
- A real schema for each section's content (hero copy + image, an array of promo tiles with image/label/link, an array of bento gallery images/links, closing CTA heading/image/link) — either a redesign of `homepage_sections` or a new collection, since the old section-list/ordering model is no longer how the page renders.
- `GET`/`PATCH` API routes (or direct owner-writable Firestore rules, admin-only) for the admin page to read/write against.
- Once real, `apps/web/app/(shop)/page.tsx` and the four home components should read this data instead of their current hardcoded values/props.

## 4. Wishlist cross-device sync

**Today:** the wishlist (`apps/web/lib/wishlist.ts`) is a real, working feature — but localStorage-only, per-browser, mirroring the existing `recently-viewed.ts` pattern. It works correctly for a single browser but doesn't follow a signed-in user across devices or survive clearing site data.

**Needed:** a `users/{uid}/wishlist` subcollection (one doc per saved product, matching the `addresses` subcollection's shape) or a `wishlistProductIds: string[]` array field directly on `users/{uid}`. Either is owner-writable directly from the client under the existing `users/{uid}` ownership rule — no new API route needed, just a rule addition if using a subcollection. Once added, `lib/wishlist.ts`'s read/write functions should branch on auth state the same way `lib/cart-context.tsx` does (local-only when signed out, Firestore-backed when signed in, with a one-time reconcile of local wishlist items into the account on sign-in).

## 5. `staff` custom claim cleanup

The former `/staff/orders` and `/staff/reviews` pages have been removed; `/admin/orders` and `/admin/reviews` now cover that functionality (calling the exact same `/api/staff/orders/*` and `/api/staff/reviews/*` routes — no backend change was needed for this specific move, since `getStaffUserIdFromAuthHeader` already accepts either the `admin` or `staff` custom claim). The `staff` claim itself is **not removed** — `/admin/roles` (formerly `/admin/roles`, unchanged) can still grant it, and the API routes still accept it.

This is flagged as a cleanup decision for whoever picks up backend work next, not done now: decide whether the `staff` role should be retired entirely (since there's no `staff`-only UI surface left to use it) or kept as a lower-privilege tier for a future non-admin staff UI.

## 6. Order status display strings

Both the customer-facing order detail page and the new `/admin/orders` queue currently render raw `OrderStatus` enum values (`pending_payment`, `in_production`, etc.) rather than human-readable labels. Not a backend item — flagged here only because a `displayLabel` map would most naturally live in `packages/shared` next to `OrderStatus` itself (`packages/shared/src/schemas/order.ts` or wherever `isValidStatusTransition` lives) so both the customer and admin/staff UIs can share it.

## 7. What already has real backend support (no change needed)

For contrast, confirmed working and wired up for real this round, in case it's useful context for prioritizing the above:
- **Profile editing** (`/account/profile`) — real `setDoc` against `users/{uid}`, already owner-writable.
- **Address management** (`/account/addresses`) — real reads/writes against the `users/{uid}/addresses` subcollection, already owner-writable; reuses the existing `AddressForm`/`AddressPicker` components built for checkout.
- **Order history and detail** (`/orders`, `/orders/[orderId]`) — real, restyled only.
- **Admin order queue and advance, review moderation** (`/admin/orders`, `/admin/reviews`) — real, calling the existing `/api/staff/orders/*` and `/api/staff/reviews/*` routes.
- **Role management** (`/admin/roles`) — real, unchanged, restyled only.
