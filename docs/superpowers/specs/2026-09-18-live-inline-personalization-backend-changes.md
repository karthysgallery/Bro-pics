# Backend requirements: live inline personalization + print-render pipeline

Companion to `docs/superpowers/plans/2026-09-18-live-inline-personalization-and-print-render.md`
("Live Inline Personalization + Print-Render Pipeline"). That plan's steps
1–7 (shared math/schema, inline editor restructure, multi-slot rendering,
mask/overlay compositing, per-template text zones, clipart, template
versioning + an admin editing screen) are **implemented** in `apps/web` and
`packages/shared`. Step 8 — the actual print-render service — was
deliberately **not** built this round; this document is what's needed to
finish it for real, plus the one write path the new admin screen needs.

## 0. Storage bucket CORS policy not applied live (found 2026-09-18, blocks uploaded photos from previewing)

**Not caused by this round's work** — pre-existing infra gap, only now
surfaced because a real end-to-end upload was tested live for the first
time. `cors.json` at the repo root already correctly declares
`http://localhost:3000` (plus `*.web.app`/`*.firebaseapp.com`) as an allowed
GET origin for the Storage bucket, but it has never actually been applied
to the live `bropics-app.firebasestorage.app` bucket — confirmed via a
direct browser repro: the upload itself succeeds (DPI computed correctly,
slot marked filled), but the browser blocks the follow-up `crossOrigin:
'anonymous'` image load with a CORS error, and `EditorCanvas.tsx`'s
documented plain-`<img>` fallback is *also* failing (a second, distinct
error), so the customer's own uploaded photo never visually appears in the
slot even though it was saved correctly. The signed URL itself is valid —
`curl`-ing it directly returns 200.

**Needed:** run `gsutil cors set cors.json gs://bropics-app.firebasestorage.app`
(or the equivalent action in the Firebase console under Storage settings)
against the live bucket. This is a cloud infrastructure action, not an
application code change — `gsutil`/`gcloud` aren't usable from this
environment (missing Python runtime) to do it directly. Worth also
independently checking why the plain-`<img>` fallback in
`EditorCanvas.tsx`'s `useImageCache`/`useHtmlImage` didn't mask this for
the customer the way its own comment says it should (a second, distinct
`400 (Bad Request)` was seen in the console alongside the CORS error,
separate from the CORS block itself) once the CORS policy is live and this
can be re-tested cleanly.

## 1. Admin write API for `FrameTemplate` (new-version-on-save)

**Today:** `/admin/products/[id]/template` (new this round) reads a
variant's current template via the existing `GET /api/frame-templates/[variantId]`
route and lets an admin edit `mockupUrl`/`maskUrl`/`overlayUrl`/`textZones`/`clipartOptions`
in a full, real UI — but "Save as new version" only updates local component
state, with a visible "not yet connected" note. There is no write path for
the `frameTemplates` subcollection at all today (it's only ever populated by
`scripts/seed`).

**Needed:**
- `POST /api/admin/frame-templates` (or similar), admin-claim-gated the same
  way other admin routes are (`getAdminUserIdFromAuthHeader` in
  `lib/verify-id-token.ts`), that:
  1. Reads the variant's current `isCurrent: true` template doc (if any).
  2. Writes a **new** doc under `products/{productId}/frameTemplates` with
     `version` incremented by 1, `isCurrent: true`, and the submitted
     `mockupUrl`/`maskUrl`/`overlayUrl`/`printableRects`/`bleedMm`/`matInset`/`textZones`/`clipartOptions`.
  3. Flips the previous `isCurrent: true` doc (if any) to `isCurrent: false`
     — both writes should happen in one transaction/batch so a template is
     never left with zero or multiple `isCurrent: true` docs.
- The admin screen's "Save as new version" button should call this route
  instead of only setting local state once it exists.
- `GET /api/frame-templates/[variantId]` was updated this round to sort
  results with `isCurrent: true` first (falling back to highest `version`),
  filtered in memory rather than a Firestore query, so it already returns
  the right template once multiple version docs exist for a variant — no
  further change needed there.

## 2. Print-render pipeline — `services/print-render`

The one deliberate exception carved out of this round's frontend-only rule
by the source plan, and then *also* not built — the service is still
exactly the `/health`-only Express scaffold it was before this round
(`services/print-render/src/server.ts`). `Customization.renderStatus` stays
`'pending'` forever today; nothing ever advances it to `'rendering'` /
`'done'` / `'failed'`, and `Customization.renderedFileUrl` is never
populated.

**Trigger points:**
- Automatically when an order transitions to `paid` (the existing
  order-status flow already used by `admin/orders` — `order_events` already
  records every transition, so this can hook off that same write).
- A manual "Re-render" button in `admin/orders`, for retries — covers the
  `renderStatus: 'failed'` case the schema already models but nothing sets.

**Pipeline** (new endpoint, e.g. `POST /render`):
1. Given a `personalizationId`, load every `Customization` doc for it
   (already grouped this way via `OrderItem.personalizationId`), plus the
   **pinned** `FrameTemplate` version doc referenced by each
   `Customization.templateVersion` — never the current one, for
   reproducibility. (`templateVersion` is now a real field on every
   `Customization`, written by `ProductDetailClient.tsx`'s add-to-cart flow
   — see `apps/web/app/api/customizations/route.ts`.)
2. For each slot: fetch the **original full-resolution** upload (not the
   client preview — `Upload.originalUrl`), apply the exact same
   crop/scale/rotate math now in `packages/shared/src/editor-geometry.ts`
   (moved there this round specifically so client and server share one
   source of truth), using `node-canvas` or an equivalent server-side
   canvas library.
3. Composite, in this exact order (matching `EditorCanvas.tsx`'s draw
   order): mockup background → each slot's photo, masked via
   `FrameTemplate.maskUrl` if present (server-side equivalent of
   `EditorCanvas.tsx`'s `destination-in` offscreen-canvas compositing) or
   plain-rect-clipped otherwise → `FrameTemplate.overlayUrl` if present →
   text zones (`Customization.textFieldsJson`, now carrying
   `{value, fontFamily, color}` per field — server-side font loading via
   `node-canvas`'s `registerFont` against the actual font files used by
   `apps/web`'s `next/font` self-hosted set, not just the browser-side
   mechanism) → the selected clipart (`Customization.clipartId`, resolved
   against the pinned template's `clipartOptions[]`).
4. Upload the composited result to Firebase Storage; write the URL to
   `Customization.renderedFileUrl`; flip `renderStatus` to `'done'` (or
   `'failed'` with an error note on any step's failure).

**Auth:** service-to-service only (called by a Cloud Function or an admin
action using a Firebase Admin SDK service account or a shared secret) —
never exposed to the client directly, consistent with Storage's existing
full-deny client rule.

**Note on the auto-shrink text sizing**: the client (`EditorCanvas.tsx`'s
`drawTextField`) measures and shrinks font size live via `ctx.measureText()`
against each text zone's width/height. The server-side render must do the
same measurement independently (not just replay a client-computed font
size) since `node-canvas`'s font metrics for the same font file can differ
slightly from the browser's — replaying a client-side pixel value would
risk text overflowing its zone at the final 300 DPI print size.

## 3. Multi-photo collage seed data (carried over, still open)

Unrelated to this round's work but still real: no frontend code changes are
needed for multi-photo collage frames — the editor already fully supports
N-slot templates via `FrameTemplate.printableRects[]`. This is purely a
seed-data gap left over from an earlier catalog-narrowing pass: bring back
real multi-slot `FrameTemplate` docs (with matching `Product.photoSlots`)
for whichever collage products should return. See the superseded doc,
`2026-09-15-text-personalization-and-collage-backend-changes.md`, item #3.
