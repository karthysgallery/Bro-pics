# Phase 3 — Personalization Engine — Design

**Date:** 2026-08-31
**Status:** Approved by user, ready for implementation planning
**Depends on:** [2026-08-28-foundation-design.md](2026-08-28-foundation-design.md) (data model — `frameTemplates`, `uploads`, `customizations` collections originally sketched here), [2026-08-29-storefront-design.md](2026-08-29-storefront-design.md) and [2026-08-31-storefront-pdp-design.md](2026-08-31-storefront-pdp-design.md) (Storefront phase — this phase replaces the PDP's "coming soon" personalize modal)

## 1. Purpose and scope

This is Phase 3 of the BroPics build: the personalization engine (PDF §13) — upload, crop, zoom, rotate, reposition, live DPI check, and preview, built as an isolated, lazily-loaded editor. It replaces the `PersonalizeComingSoonModal` placeholder built in Storefront Plan B with a real editor, and completing it becomes a prerequisite for adding a personalized product to the cart.

Two client-supplied inputs this phase depends on — real frame mockup/mask images and text-personalization rules (which products, character limits, fonts) — remain unsupplied. Per the placeholder-first decision below, this phase does not block on them.

Out of scope, deliberately:
- **Text personalization.** Rules (which products allow it, limits, fonts) are completely unknown — not even which products. Deferred to a later phase once the client supplies them, rather than guessed at.
- **Server-side 300 DPI print-file rendering.** The `print-render` Cloud Run service stays a health-check skeleton. This phase produces a client-rendered preview image and a stored transform; nothing downstream (checkout, admin, fulfillment) exists yet to consume a real print file, so building that pipeline now would have no consumer. Becomes its own phase once an order can actually trigger it.
- **Real account-based upload ownership.** This phase uses an anonymous `localStorage` session ID. Phase 4 (accounts/checkout) reconciles session-owned uploads to a real account on login; this phase does not attempt to design that reconciliation.
- **Free-angle rotation.** Rotation snaps to `0°/90°/180°/270°` only, keeping the crop rectangle axis-aligned and the DPI math tractable.

## 2. Data model additions

### 2.1 New `UploadSchema`

Foundation's original data model named a `uploads` collection that was never built — same gap pattern as `ProductMedia` in Storefront Plan B.

```ts
// packages/shared/src/schemas/upload.ts
{
  id: string,
  sessionId: string,
  originalUrl: string,
  widthPx: number,       // server-probed from actual bytes, never client-reported
  heightPx: number,      // server-probed from actual bytes, never client-reported
  mime: string,
  bytes: number,
  exifStripped: boolean,
  status: 'ready' | 'rejected',
}
```

`widthPx`/`heightPx` are the values the DPI calculation trusts. A client-reported dimension is never used for this field — a customer's browser claiming a photo is 6000×4000 when it's actually 600×400 would produce a green DPI badge on a print that looks terrible. These fields are only ever written by the server route in §3.1, from bytes it received and probed itself.

### 2.2 New `FrameTemplateSchema`

Also named in Foundation's data model, never built.

```ts
// packages/shared/src/schemas/frame-template.ts
{
  id: string,
  variantId: string,
  mockupUrl: string,
  maskUrl: string | null,     // null until real photography-team assets exist
  overlayUrl: string | null,
  printableRects: Array<{
    slotIndex: number,
    x: number,       // fraction of mockup image width, 0-1
    y: number,        // fraction of mockup image height, 0-1
    width: number,    // fraction of mockup image width, 0-1
    height: number,   // fraction of mockup image height, 0-1
  }>,
  bleedMm: number,
  matInset: number,
}
```

`printableRects` is an array — one entry per slot — replacing Foundation's original singular `printableRect`, since multi-slot products (e.g. the seeded 6-opening collage frame) need one rectangle per opening. Units are fractions (0–1) of the mockup image's own dimensions, not pixels or inches: this keeps a rect valid regardless of the mockup PNG's actual resolution. The canvas layer converts fraction → canvas-pixel-space for rendering; the DPI layer converts fraction × the variant's `printWidthIn`/`printHeightIn` → real-world inches for the DPI calculation.

### 2.3 `CustomizationSchema` gains `sessionId`, `personalizationId`, and a constrained `rotationDeg`

```ts
// packages/shared/src/schemas/customization.ts
{
  id: string,
  sessionId: string,
  personalizationId: string,   // groups all slot-docs from one "customize + add to cart" action
  uploadId: string,
  variantId: string,
  slotIndex: number,
  transformJson: {
    scale: number,
    offsetX: number,
    offsetY: number,
    rotationDeg: 0 | 90 | 180 | 270,
    cropRect: { x: number; y: number; width: number; height: number },  // in original upload's pixel space
  },
  textFieldsJson: Record<string, string> | undefined,  // unused this phase, field kept for forward compat
  effectiveDpi: number,
  previewUrl: string | undefined,
  renderStatus: 'pending' | 'rendering' | 'done' | 'failed',   // stays 'pending' this phase
}
```

`personalizationId` is new: a multi-slot product produces multiple `Customization` docs (one per slot), and nothing in the original schema tied them together as one unit. The cart (§4) and, later, order-item attachment both need this grouping key. `sessionId` scopes each doc to the anonymous session that created it (§3.2). `rotationDeg` is a literal union, not `z.number()` — enforcing the 90°-snap decision at the schema level, not just in the UI. `printFileUrl` is dropped from this phase's schema (no server-side rendering yet); it can be added back when that phase happens.

## 3. Upload flow & security

### 3.1 Server routes (Approach A — server-mediated everything)

Storage is full-deny (`storage.rules`: `allow read, write: if false` on every path), so the browser cannot write to Storage directly regardless of any other decision. Given that constraint, this phase routes everything — uploads, and all reads of `uploads`/`customizations`/`frameTemplates` — through Next.js server route handlers using the Admin SDK, rather than adding new Firestore rules for a session-based model:

- **`POST /api/uploads`** — receives the file, probes real `widthPx`/`heightPx`/`mime`/`bytes` server-side (via `sharp`, already a dependency of `services/print-render`, added to `apps/web` here), strips EXIF (a `sharp` re-encode drops metadata by default), rejects (`status: 'rejected'`) if the probed dimensions fall under the variant's `minUploadPx`, writes the file to Storage at a session-scoped path (`uploads/{sessionId}/{uploadId}/original.jpg`), writes the `uploads/{id}` doc, and returns the upload id plus a short-lived signed read URL.
- **`POST /api/uploads/preview`** — a sibling endpoint for saving the Konva-rendered preview image (see §5), same probing/storage pattern minus the DPI-relevant validation.
- **`GET /api/frame-templates/:variantId`** — reads a variant's `FrameTemplate` doc(s) server-side, returns to the client.
- **`POST /api/customizations`** — writes one `Customization` doc per completed slot.

**Why not session-scoped Firestore rules instead:** an anonymous session ID has no auth token backing it, so a Firestore rule attempting to match `resource.data.sessionId` against anything client-supplied would be trusting a value the client controls — close to no security at all for those documents. Routing through server code sidesteps this: `firestore.rules` and `storage.rules` for `uploads`, `customizations`, and `frameTemplates` need **no changes** from what Foundation already established (server-only writes; `frameTemplates` stays public-read since it's non-sensitive catalog data — verify this rule is already in place, it is expected to be, no change needed there).

### 3.2 Session ID

A random UUID, generated client-side on first editor use, persisted in `localStorage` (not a cookie — no server-side session concept exists yet in this codebase, and a cookie would need infrastructure this phase doesn't otherwise require), sent as a request header (`X-Session-Id`) on every upload/customization request the server routes above receive. Phase 4 reconciles session-owned uploads/customizations to a real account on login; this phase's job is only to make the session ID durable and to stamp it onto every doc it creates.

## 4. Cart integration

`apps/web/lib/cart-context.tsx`'s `addItem` currently merges by `variantId` alone (`prev.find(i => i.variantId === item.variantId)`, incrementing `qty`) — correct when nothing distinguishes two lines for the same variant, wrong once personalization exists: customizing the same frame twice with two different photos must produce two distinct cart lines, not `qty: 2` of one personalization.

`CartItem` gains `personalizationId: string`, and the merge key becomes the pair `(variantId, personalizationId)`. `BuyBox.tsx`'s call to `addItem` passes the `personalizationId` the editor produced on completion (§5), generated as a fresh UUID by the client when the "Done" action fires, before the `Customization` docs are written.

## 5. Editor UX

**Library:** Konva.js + `react-konva`, loaded via `next/dynamic({ ssr: false })` — Konva touches `window` at import time and cannot be part of any server-rendered bundle. This is a known, planned-for import-boundary constraint (the same class of issue Storefront Task 6 hit with `server-only`), not something to be surprised by mid-build.

**Entry point:** `BuyBox.tsx`'s "Personalize & Add to Cart" button opens the editor in a modal (keeping the selected variant/quantity context visible), passing the currently-selected `variantId` and the product's `photoSlots` count. `PersonalizeComingSoonModal` and its tests are deleted — it was an explicit Phase-3 stand-in, not a permanent component.

**Multi-slot layout:** one slot editable at a time. The slot's `FrameTemplate.mockupUrl` renders as the base layer; the customer's uploaded photo renders beneath it, draggable/scalable within that slot's `printableRects[slotIndex]` rectangle (fraction-space converted to canvas-pixel-space for rendering); `maskUrl` renders as a clip on top when present (placeholder-first means it usually is `null` — see §6). A thumbnail strip above the canvas lists every slot (numbered, filled/empty state shown) for jumping between them; each slot keeps an independent transform.

**Controls:** drag to reposition, pinch/scroll or +/− buttons to scale, a 4-way rotate control snapping to `0°/90°/180°/270°`. A live DPI badge (green ≥300, amber ≥150, red below — reusing the existing, already-tested `dpiTier()` from `packages/shared`) updates as the customer drags or zooms.

**Completion gating:** all slots must have an upload; DPI at or above amber is required by default, but red-tier is allowed through behind an explicit confirmation ("this photo may print at lower quality — continue anyway?") rather than a hard block, since a customer may knowingly accept the trade-off. Once gated conditions are met, "Done" generates a fresh `personalizationId`, exports each slot's canvas via Konva's `toDataURL()`, uploads each preview through `POST /api/uploads/preview`, writes one `Customization` doc per slot via `POST /api/customizations` (all sharing the same `personalizationId`), and calls `addItem` on the cart.

## 6. Transform → DPI mapping

The existing, already-tested `calculateEffectiveDpi(originalWidthPx, originalHeightPx, cropScale, printWidthIn, printHeightIn)` in `packages/shared/src/dpi/calculate.ts` takes a single `cropScale` — it models zoom, not an arbitrary crop rectangle. The editor's `transformJson.cropRect` (in the original upload's pixel space) is the real source of truth for "how many original pixels are actually being used."

This phase adds a new function rather than modifying the existing one (which is used elsewhere and already tested against its current contract):

```ts
// packages/shared/src/dpi/calculate.ts — new export
export function effectiveDpiFromCropRect(
  uploadWidthPx: number,
  uploadHeightPx: number,
  cropRect: { width: number; height: number },
  printWidthIn: number,
  printHeightIn: number
): DpiResult {
  const cropScale = Math.max(uploadWidthPx / cropRect.width, uploadHeightPx / cropRect.height);
  return calculateEffectiveDpi(uploadWidthPx, uploadHeightPx, cropScale, printWidthIn, printHeightIn);
}
```

This reuses the existing, tested core math rather than duplicating it — `effectiveDpiFromCropRect` is the one new piece of DPI logic this phase adds, and it's the piece under test (§7).

## 7. Placeholder mockups/masks and content policy

Per the placeholder-first decision: each seed product gets one placeholder mockup **PNG** (not SVG — a flat vector outline would misrepresent how a real photographic mockup composites) — a plain frame outline with a rectangular cutout, not photoreal, sufficient to prove the upload/position/DPI/preview pipeline works end to end. `maskUrl` stays `null` for every seed `FrameTemplate` this phase; the rectangular `printableRects` clip alone stands in for masking until the photography team delivers real assets. No alpha-mask compositing is built against fake assets — that logic waits for real masks, since building and testing it against placeholders would need to be redone anyway once real assets land with actual alpha channels.

Placeholder mockup artwork is created fresh for this phase, consistent with BroPics' standing content-cloning boundary (nothing copied from Ritwikas/Picloopz/Parul Packaging/Yazhli Collection).

## 8. Testing approach

Canvas rendering itself is not unit-testable in this environment (no jsdom canvas support). Following the split that worked for `selectGalleryMedia`/`calculateCardImages` in Storefront, every piece of *logic* is extracted into pure, tested functions, independent of Konva:

- `effectiveDpiFromCropRect()` (§6) — the new DPI math.
- The mockup-fraction ↔ canvas-pixel coordinate conversion.
- Slot-completion validation (all slots filled, DPI at least amber unless explicitly confirmed).
- The `minUploadPx` rejection gate (tested as part of the upload route's logic, extracted from the route handler into a plain function).

The upload route's dimension-probing and EXIF-stripping are tested against real fixture images (small JPEG/PNG files checked into the repo under a test-fixtures directory), not mocked — probing/stripping behavior is exactly the kind of thing a mock would hide a real bug in.

## 9. Build order

1. **Data layer** — `UploadSchema`, `FrameTemplateSchema`, `CustomizationSchema` extensions, `effectiveDpiFromCropRect()`.
2. **Server routes** — `POST /api/uploads`, `POST /api/uploads/preview`, `GET /api/frame-templates/:variantId`, `POST /api/customizations`.
3. **Seed data** — one placeholder mockup PNG per product, `FrameTemplate` docs with `printableRects` for every product/variant.
4. **Editor shell** — Konva canvas, slot picker, drag/zoom/rotate controls, live DPI badge, lazy client-only loading.
5. **Session ID + cart integration** — `localStorage` session ID plumbing, `CartItem.personalizationId`, merge-key change in `cart-context.tsx`, `BuyBox` wiring to the real editor, `PersonalizeComingSoonModal` removal.

## 10. Infrastructure fix folded into this phase

Add a root `typecheck` script (`tsc --noEmit` across the workspace, or per-package as the existing `pnpm --filter` convention already does for `test`/`build`). This has been a known gap since Foundation and Storefront Plan A; Plan B's final review is concrete proof it catches real bugs the test suites miss — two type errors sat invisible through 55 passing tests because Vitest strips types via esbuild. Cheap to add now; every task in this phase's implementation plan runs it as part of its own per-task verification once it exists.
