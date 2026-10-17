# Personalization project — handover and current status

Updated 2026-10-08 (code at commit `0ddab07`, local only: nothing is pushed to `master`, production mode is OFF, DNS is unchanged).
Earlier detail: `docs/PERSONALIZATION_ENGINE_PROGRESS.md` (engine phases, file map, verify commands).

## Status 2026-10-17 (production-readiness audit; supersedes older "not deployed" notes where they differ)
Full detail, checklists and blockers: `docs/PRODUCTION_LAUNCH_AUDIT.md`. Nothing was pushed or deployed for the audit.
- **Live now (preview mode, sign-in closed):** website on Cloud Run (image `55ca8f0`), karthysgallery.in serving through Firebase Hosting, Diwali theme with offer code `DIWALIDHAMAKA`, Firestore rules (== repo), Razorpay live keys attached to Cloud Run (no live payment made), `reconcileSessionOnLogin`, `onMediaWritten`, `onVariantWritten`.
- **WhatsApp OTP:** Meta setup finished and tested (business verified, OTP number `+91 78453 13961`, template `karthys_auth_otp` approved, prepaid ₹50). Website switch is a pending owner-run Cloud Run command; it must include `WHATSAPP_MODE=disabled` so invoice/order messages do not auto-enable.
- **Not deployed:** 13 of the 16 Cloud Functions (invoices, print dispatch, stock release, Razorpay webhook, reconcile, ratings…), the print-render service, repo Storage rules (live Storage is deny-all, recommended to keep). Functions runtime Node 20 ends 2026-10-30.
- **Local, unpushed:** `f2db7b5` (real ratings only, real WhatsApp chat number in the build), `08b46b1` (audit docs), and the phase-1 preparation commit (Functions on Node 22, regions, tests, legal drafts in `docs/legal-drafts/`, `docs/SEED_DATA_CLEANUP_DRYRUN.md`, `docs/DEPLOYMENT_REQUIREMENTS.md`, `docs/REAL_ORDER_ACCEPTANCE_TEST.md`).
- **Open blockers:** empty store/GST/shipping settings, seed reviews and `NEW10` strip on the homepage, legal-page facts to confirm, real-person product subjects, no verified live payment/invoice/print flow.

## Freeze (owner instruction, 2026-10-08)
Implementation was FROZEN at commit `0ddab07`; the owner then approved two scoped changes (admin Files box, SEO) — everything else stays frozen. Do not push to `master`, do not deploy anything (Cloud Run, functions, print service, rules), do not change DNS, do not enable production mode. Only this documentation is maintained until the owner supplies the missing inputs below and starts the final go-live sequence.

**Awaiting from the owner:** the product-in-motion / reels video files; production credentials (WhatsApp OTP, Razorpay live keys + webhook secret); decisions on rules deployment, DNS and the `master` push.

## SEO (added 2026-10-08) — full detail in `docs/SEO_IMPLEMENTATION.md` and `docs/SEO_LAUNCH_GUIDE.md`
Architecture: Product DB → SEO generator (`lib/seo/product-seo.ts`) → SSR metadata + JSON-LD (`lib/structured-data.ts`, ProductGroup with per-variant offers) → canonical URL (`lib/seo/site.ts`, always https://karthysgallery.in) → sitemap index + product/category/page/combo/image sitemaps (route handlers, revalidated on every admin change) → Search Console → Merchant feed (`/feeds/google-merchant.xml`) → Merchant Center.
Status: BUILT + TESTED on a production build against the emulators (`pnpm --filter @bro-pics/web seo:audit -- --base <url> --db` → PASS 52 / WARN 10 / FAIL 0; warnings = short seed meta descriptions). Real 404s (global loading skeleton scoped away from SEO pages), cached product pages (ISR), 308 redirects for renamed products (`slugHistory`), noindex headers for private routes, admin "Search status".
NOT BUILT: GA4 (needs Measurement ID + consent decision), return-policy structured data (needs policy data), content guides. NOT TESTED: Rich Results Test, URL Inspection, Merchant acceptance, Core Web Vitals (all need the live domain).
Go-live gate: `seo:audit --base https://karthysgallery.in --db --expect-production` must show 0 FAIL. Preview mode (noindex) is still ON; nothing pushed or deployed.

## Admin control of the look (2026-10-08)
- **Colours & themes** (`/admin/themes`, existing): the Everyday palette is editable (9 colour roles, contrast check, "Reset to original"), plus festival themes on a calendar.
- **Appearance** (`/admin/appearance`, new, settings key `appearance`, `packages/shared/src/schemas/appearance.ts`): heading and body fonts (11 choices, loaded lazily with `preload:false`), corner roundness (sharp/soft/current/very round via CSS variables in `tailwind.config.ts`), main-button shape, browser-tab icon (a Media library image), and switches for product-page sections (trust bar, tabs, videos, reviews, frequently bought, related, recently viewed). Defaults = the original look and emit no CSS; "Reset to original look" restores them. The admin area is excluded from all of it.
- **Site text** (`/admin/site-text`): now also covers cart/checkout wording (heading, empty message, checkout button, checkout headline, order summary, coupon label, place-order button, address hint).
- Verified in the browser on the emulators: fonts, corners and button shape change on the storefront and not in the admin; hiding Reviews removes it; favicon links appear; defaults add nothing. Not changed: product-page layout (gallery side), fonts for the personalization text picker, round icon buttons/badges.

## Preloader (2026-10-08)
`components/brand/KarthysMark.tsx` (SVG of the logo's two tilted wooden frames: strokes are drawn, a photo "develops" in the small frame, a light sweeps the large one, the name rises in; `loop` mode sways like hung pictures) + `Preloader.tsx`: **SplashScreen** (first visit per session, ~1.7s, in the server HTML, CSS failsafe at 3s, skipped in admin/for crawlers/reduced-motion = still logo), **NavigationLoader** (progress bar at once, animated mark only if a page change takes >250ms, clears on arrival), **LoaderPanel** (used by loading.tsx in account/admin/checkout/cart/search). Keyframes `.kl-*` in `app/globals.css`. Admin switch: Appearance → "Show the animated logo when the shop first opens". The old global `app/loading.tsx` stays removed (it caused soft 404s). Tested: unit tests + browser (final frame matches the logo, splash leaves and is remembered, nav loader appears on a slow page change and stays away on fast ones).

## Collage detection, cut-out mosaics, calendars (2026-10-09)
- **Collage detection** (`packages/shared/src/personalization/slot-detection.ts`): background = median of an edge band (works on shaded/photographed designs); photo spaces snapped to the design's grid, pale photos recovered from the grid; printed wording becomes a text box and the detect route saves a copy of the design with that wording cleared. Owner's sample (`apps/web/__fixtures__/collage-forever-and-always.webp`) → 29 spaces + 1 text box.
- **Calendar** (`calendar.ts`, `CalendarSlot`, `state.dates`): customer picks a date; month title, weekday row, days, chosen day in a heart/circle; optional backdrop panel. One layout function drives both the canvas preview and the print SVG.
- **Cut-out main photo** (`PhotoSlot.removeBackground`): BiRefNet-lite (MIT) runs in **print-render** (`POST /cutout/:uploadId`, ~11 s on 2 CPUs, needs ~6 GB RAM); website route `POST /api/uploads/[id]/cutout` checks ownership and calls it with an identity token. The cut-out is stored as its own transparent-PNG upload (`cutoutOf`/`cutoutUploadId`/`subjectBox`) and framed on the people automatically.
- **Mosaics**: builder "Add a photo grid (mosaic)"; customer "Fill the empty spaces by repeating your photos" (never the same photo side by side).
- **Print fonts fix**: the print image now installs its fonts for fontconfig — before, all print text silently came out in a default font (proved in the Linux image). `/health` → `fonts.rendering` checks it.
- **Go-live needs for cut-outs**: run `pnpm --filter @bro-pics/print-render fetch-model` before building the print image; give print-render **8 GiB, 2 CPU, concurrency 1**; set `CUTOUT_SERVICE_URL` (or `PRINT_RENDER_URL`) on the website's Cloud Run service and grant its service account `run.invoker` on print-render. Until then a cut-out space keeps the photo as it is and tells the customer.
- Verified on the emulators (2 passes: admin UI + scripted admin routes; customer UI ×2): detection, publish/link, upload → cut-out → mosaic fill → date → cart → mock payment → print job → print file (4800×6000 and 5400×7170 px) → admin order view, Files box and zip.

## Running costs page (2026-10-09)
Admin → Intelligence → **Running costs** (owner/admins, `audit:read`): this month so far, expected month total, last month, budget bar, cost per service in plain words, day by day, month by month. Sources: Google budget alerts via Pub/Sub → `recordBudgetAlert` → `ops/runningCosts` (month total, includes spend before setup) and the BigQuery billing export (detail; `lib/running-costs.ts`, 1-hour cache). Setup steps: `docs/GO_LIVE_PENDING_AND_CLIENT_QUESTIONS.md` A2b. Verified on the emulators with a real-format budget message through the Pub/Sub emulator and a local BigQuery stand-in (`BIGQUERY_ENDPOINT`, dev only).

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

## Update 2026-10-17: business settings, state shipping, returns and policy pages (local, uncommitted)

The personalization / combo architecture was **not modified**. This work sits beside it:

- Shipping is now state-based and server-priced from the stored delivery address (`packages/shared/src/shipping/state-shipping.ts`, used by `apps/web/lib/order-pricing.ts`). Combo pricing and glitter-finish pricing are unchanged; their tests still pass with the new shipping rule (combo order test now expects no shipping for a Tamil Nadu address).
- Returns: a product is "personalized" when `productType` is `single_photo`/`collage`, it has photo slots, or it allows text personalization; this reuses the existing product fields (`packages/shared/src/returns/eligibility.ts`). Admin can set an explicit `returnPolicy` on a product or category.
- New admin pieces: business profile form, state shipping form, returns + policy-wording forms, readiness panel (Settings), policy-page status/preview/approve (Pages). See `docs/BUSINESS_SETTINGS_AND_POLICIES.md`.
- Owner inputs still missing are in `docs/LEGAL_OWNER_REVIEW_CHECKLIST.md`.
- Print/production behaviour is untouched.
