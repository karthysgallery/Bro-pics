# Personalization project — handover and current status

Updated 2026-10-08 (code at commit `0ddab07`, local only: nothing is pushed to `master`, production mode is OFF, DNS is unchanged).
Earlier detail: `docs/PERSONALIZATION_ENGINE_PROGRESS.md` (engine phases, file map, verify commands).

## Freeze (owner instruction, 2026-10-08)
Implementation was FROZEN at commit `0ddab07`; the owner then approved two scoped changes (admin Files box, SEO) — everything else stays frozen. Do not push to `master`, do not deploy anything (Cloud Run, functions, print service, rules), do not change DNS, do not enable production mode. Only this documentation is maintained until the owner supplies the missing inputs below and starts the final go-live sequence.

**Awaiting from the owner:** the product-in-motion / reels video files; production credentials (WhatsApp OTP, Razorpay live keys + webhook secret); decisions on rules deployment, DNS and the `master` push.

## SEO (added 2026-10-08) — full detail in `docs/SEO_IMPLEMENTATION.md` and `docs/SEO_LAUNCH_GUIDE.md`
Architecture: Product DB → SEO generator (`lib/seo/product-seo.ts`) → SSR metadata + JSON-LD (`lib/structured-data.ts`, ProductGroup with per-variant offers) → canonical URL (`lib/seo/site.ts`, always https://karthysgallery.in) → sitemap index + product/category/page/combo/image sitemaps (route handlers, revalidated on every admin change) → Search Console → Merchant feed (`/feeds/google-merchant.xml`) → Merchant Center.
Status: BUILT + TESTED on a production build against the emulators (`pnpm --filter @bro-pics/web seo:audit -- --base <url> --db` → PASS 52 / WARN 10 / FAIL 0; warnings = short seed meta descriptions). Real 404s (global loading skeleton scoped away from SEO pages), cached product pages (ISR), 308 redirects for renamed products (`slugHistory`), noindex headers for private routes, admin "Search status".
NOT BUILT: GA4 (needs Measurement ID + consent decision), return-policy structured data (needs policy data), content guides. NOT TESTED: Rich Results Test, URL Inspection, Merchant acceptance, Core Web Vitals (all need the live domain).
Go-live gate: `seo:audit --base https://karthysgallery.in --db --expect-production` must show 0 FAIL. Preview mode (noindex) is still ON; nothing pushed or deployed.

## Files Box (admin order page, 2026-10-08)
Each order item shows Preview, each original photo and the print-ready file (with print-job state and "Render again"), plus a per-order zip (`/api/admin/orders/[id]/files-zip`). Download route accepts `?upload=` and verifies the photo belongs to the item.

## What exists
- **Template engine (v2):** schema, validation, geometry, state, completeness, versioning, mockup scenes, legacy adapter — `packages/shared/src/personalization/`. Collage templates are created in `/admin/personalization-templates`, linked to a product or size, and give shoppers the multi-photo editor (`components/customizer/`).
- **Classic editor (legacy frame templates):** `components/product/ProductDetailClient.tsx` + `components/editor/`.
- **Unified preview gallery:** Frame / Bedroom / Hall / Table with thumbnails, tied to personalization state.
- **Print pipeline:** paid order → `printJobs/{orderId_itemId}` → `dispatchPrintJob` function → private `print-render` service → `print-files/{orderId}/{itemId}/print.png` (300 DPI, printed artwork only).
- **Combo Offers:** see `combo-offers` notes below.

## Verified on 2026-10-08 (Firebase emulators + local print service, seed copy of the catalogue)
| Area | Result |
|---|---|
| Standard frame (classic wooden): upload, change photo, remove photo | Works. Removing returns every scene to the default product picture and disables Add to cart |
| Collage (3-photo set): partial upload (2 of 3) | Add to cart stays disabled until the 3rd photo; enabled after |
| Frame / Bedroom / Hall / Table switching, before and after upload | Photo appears in all four; switching never changed slots or the Add button; changing a photo while on Table updates Table live |
| Desktop / tablet (768) / mobile (375) | State kept across resizes; no page-level horizontal scroll |
| Combo: unsaved photos when switching frames | Kept per frame; "Restore my design" offered only on that frame |
| Combo: admin create + publish through the real screen | Works (cover picked from the media library) |
| Combo order → print | 3 frames incl. a 6-photo collage → 3 jobs → each rendered `done` at exactly 300 DPI size, printed artwork only |
| Archived product inside a published combo | Notice + disabled add + frame pages redirect + "Currently unavailable" in the list |
| Typecheck (all packages), tests (web 1916, shared 558, functions 77, print-render 95, seed 46), rules tests (48), production build | Pass |

## Known limitations / not verified
- A combo frame that uses a **template-engine (v2) product** shares the same cart-swap mechanism but was only unit-tested; no live product links a v2 template today.
- Admin media **upload** can't be exercised on the emulator (signed-URL upload returns 501); the picker/library path was used instead.
- The emulator catalogue uses seed placeholder mockups (e.g. a brown frame image for "classic wooden frame"); real mockups come from the live data/admin.
- The print service was verified locally, not on Cloud Run (not deployed; follow `services/print-render/DEPLOY.md` only after the website release is live).
- No ESLint is configured in the repo (`pnpm lint` runs nothing).
- Admin-created videos ("products in motion" / reels): the live Firestore `videos` collection is EMPTY and the live bucket holds no video files; only the seed placeholder clip exists. Storage rules on the live project deny all reads (see go-live checklist).

## Open owner decisions
Push/merge to `master` (auto-deploys), DNS for karthysgallery.in (transfer pending), rules deployment, production flag, WhatsApp OTP + Razorpay live credentials, FOREVER AND ALWAYS design asset / PSD mockups / renderer choice.
