# Live Inline Personalization + Print-Render Pipeline — Implementation Plan

**Status:** Approved plan, not yet implemented. Written to hand off cleanly between sessions/forks.

## 1. Context and how this plan came about

A generic "build a product customization feature" spec was supplied for analysis
(live preview panel, variant-driven backgrounds, live text rendering, crop-modal
image slots, clipart grid, template-driven architecture, Fabric.js/react-konva,
Postgres/Supabase, an Express backend, server-side re-render at checkout).

Analysis showed most of this **already exists in BroPics in a half-built form** —
the job here is reconciling that generic spec against what's real in this
codebase, not building from scratch. Key discoveries:

- `FrameTemplate.printableRects[]` (`packages/shared/src/schemas/frame-template.ts`)
  already supports N photo slots per template, keyed by `slotIndex`.
- `Customization.transformJson` (`packages/shared/src/schemas/customization.ts`)
  already persists crop as `{scale, offsetX, offsetY, rotationDeg, cropRect}` plus
  the original (uncropped) upload URL — already satisfies "persist enough to
  regenerate a higher-res crop later" without needing a separate crop-modal
  library (react-easy-crop etc.).
- `Customization.renderStatus: 'pending'|'rendering'|'done'|'failed'` and
  `FrameTemplate.maskUrl`/`overlayUrl` **already exist in the schema but are
  completely unused by any code today** — clearly placeholders added ahead of
  this exact feature.
- `services/print-render` already exists as a scaffolded Express/Cloud Run
  service (`/health` endpoint only, nothing else). The original personalization
  design doc
  (`docs/superpowers/specs/2026-08-31-personalization-engine-design.md`)
  explicitly deferred "server-side 300 DPI print-file rendering" to it, saying
  it "becomes its own phase once an order can actually trigger it." **This plan
  is that phase.**
- `PersonalizationEditor.tsx` hardcodes text fields as
  `TEXT_FIELD_DEFS = [{key:'name'}, {key:'date'}]` for every product — needs to
  become fully template-driven so products can differ (image only / image+date+
  quote / image+date+quote+emoji, etc.), configured in the admin.
- Today's editor opens as a `fixed inset-0 z-50` modal popup
  (`components/layout` pattern), triggered by clicking "Personalize & Add to
  Cart" in `BuyBox.tsx`. This is being replaced with an always-inline
  experience on the product page.
- A prior session removed `react-konva`/`konva`/`use-image` after they caused a
  real **production** crash (a `react-reconciler` vs. Next.js 15 React-internals
  incompatibility) — `EditorCanvas.tsx` now draws to a plain HTML5 `<canvas>`.
  This plan deliberately keeps that approach.

## 2. Locked decisions

All of the following were explicitly decided during planning — no open
questions remain.

| Decision | Answer |
|---|---|
| Extend existing system vs. rewrite to match the generic spec | **Extend** the existing `FrameTemplate` / `PersonalizationEditor` / `EditorCanvas` system |
| Canvas engine | **Keep plain `<canvas>`**, extend it — no Fabric.js, no react-konva |
| Database | **Firebase / Firestore only** — no Postgres/Supabase anywhere |
| Server-side print-render | **Build it out now**, not deferred further |
| Crop UX | **Keep inline canvas drag/zoom/rotate** — no separate crop modal |
| Clipart asset source | **Stock/dev-provided asset set for now**; admin-uploadable later (schema shaped so that's a data change later, not a schema change) |
| Template versioning | **Immutable version snapshots** — editing a template creates a new version doc; existing docs are never mutated in place |
| Editor placement | **Inline in the page, not a popup** — the live canvas replaces the product's main photo entirely |
| Marketing photos for personalizable products | **Disappear completely** — no thumbnail strip; the canvas is the only visual once a template exists for the selected variant |

## 3. Scope

**In scope** (this plan, end to end):
- The customer-facing editor: moving it inline, live canvas, slots, text
  fields, clipart, masks.
- The `FrameTemplate`/`Customization` schema and data model behind it
  (per-product config, versioning).
- The admin screen for configuring a product's template (slots / text zones /
  clipart per product).
- The server-side print-render pipeline that produces the final,
  authoritative order file.

**Not touched by this plan** — everything else stays exactly as it is:
- Storefront pages, homepage, palette/design work.
- The user account module (profile / addresses / wishlist / orders).
- The rest of the admin panel (products list, categories, orders, reviews,
  roles, homepage content editing).
- Cart/checkout/payment itself — only the "Add to Cart" trigger point on the
  PDP changes, not checkout or Razorpay.

**Standing-rule note:** this project has otherwise worked frontend-only all
session (`apps/web` only, never touch backend). Step 8 below (building out
`services/print-render`) is a deliberate, explicitly-approved exception to
that rule, since it's genuinely backend/infrastructure work with no
frontend-only substitute.

## 4. Implementation steps, in order

### Step 1 — Shared math + schema changes

- Move `apps/web/lib/editor-geometry.ts` → `packages/shared/src/editor-geometry.ts`.
  It's pure math (no DOM dependency); `print-render` needs the *exact same*
  cover-scale / crop-rect / rotation formulas the client uses, or the live
  preview and the final file will silently drift apart.
- `FrameTemplateSchema` — add:
  ```ts
  version: z.number().int().positive(),
  isCurrent: z.boolean(),
  textZones: z.array(z.object({
    fieldKey: z.string(), label: z.string(),
    x: fraction, y: fraction, width: fraction, height: fraction,
    maxLength: z.number().int().positive(),
    align: z.enum(['left', 'center', 'right']),
    defaultFontFamily: z.string().optional(),
    defaultColor: z.string().optional(),
  })).optional(),
  clipartOptions: z.array(z.object({
    id: z.string(), label: z.string(), assetUrl: z.string(),
    x: fraction, y: fraction, width: fraction, height: fraction,
  })).optional(),
  ```
  (`maskUrl`/`overlayUrl` stay exactly as they already are — already the right
  shape, just unused today.)
- `CustomizationSchema` — add:
  ```ts
  templateVersion: z.number().int().positive(),
  clipartId: z.string().optional(),
  renderedFileUrl: z.string().optional(),
  ```
  Upgrade `textFieldsJson` from `z.record(z.string(), z.string())` to
  `z.record(z.string(), z.object({ value: z.string(), fontFamily: z.string(), color: z.string() }))`.

### Step 2 — Modal → inline restructure

Done early since it changes the shell everything else lives in.

- Remove `BuyBox.tsx`'s `isEditorOpen` popup gating entirely (no more
  `fixed inset-0 z-50` modal, no `onComplete`/`onClose` lifecycle).
- `ProductDetailClient.tsx` becomes the owner of customization state (lifted
  up from `BuyBox`), since both the canvas and the buy box need to react to it.
- The live canvas **replaces** `Gallery`'s photo in the left column once the
  selected variant has a template. No marketing photos, no thumbnail strip —
  canvas is the only visual for personalizable products (per the locked
  decision above). `Gallery` remains only as a fallback for non-personalizable
  products, if any exist.
- Slot picker / upload buttons / text fields / clipart grid render as a panel
  directly under the canvas, same left column — the whole customization
  experience reads as one continuous block.
- Size / Colour / Orientation selectors stay in `BuyBox` (right column)
  exactly as today. Selecting one re-fetches that variant's `FrameTemplate`
  and swaps the canvas in place, live — no navigation, no remount.
- "Add to Cart" becomes one plain button in `BuyBox` — reads whatever is
  currently in the page-level customization state and submits, disabled until
  `validateSlotsComplete` passes (unchanged validation logic).
- Remove the hardcoded `TEXT_FIELD_DEFS = [name, date]` in
  `PersonalizationEditor.tsx` — the field list must come entirely from
  `template.textZones`, so a product can render 0, 2, or 4+ text fields
  depending on its admin-configured template.

### Step 3 — All filled slots render simultaneously

`EditorCanvas` currently accepts singular `photoUrl`/`slotRect` props, so only
whichever slot is "active" is drawn — every other filled slot is invisible
until you switch to it. This is a real gap versus a true live preview,
especially for multi-photo collage products.

- Change `EditorCanvas` props to accept an array of per-slot state
  (`slotRect`, `photoUrl`, `scale`, `offsetX`, `offsetY`, `rotationDeg`,
  `maskUrl?`), plus `activeSlotIndex`.
- Loop-draw every slot each render; only the active slot gets pointer-drag
  handlers (zoom/rotate/drag).

### Step 4 — Wire up `maskUrl` / `overlayUrl`

Both fields already exist in `FrameTemplateSchema` and are unused today.

- **Mask** (irregular photo-slot shapes): draw the photo to an offscreen
  canvas sized to the slot rect, then composite the mask image on top with
  `globalCompositeOperation = 'destination-in'` (mask's opaque pixels are
  kept, transparent pixels are cut away), then blit the result onto the main
  canvas. Falls back to today's plain-rectangle `ctx.clip()` when a slot has
  no `maskUrl` — zero risk to existing templates.
- **Overlay**: drawn once, after the mockup, before text/clipart — lets a
  template add a decorative element (glass glare, embossed border) on top of
  the composited photo without it being cropped by any slot mask.

### Step 5 — Per-template text zones, styled persistence, auto-shrink

- Replace the current one-size-fits-all bottom-strip position
  (`defaultTextZoneRect` in `lib/text-personalization-options.ts`) with real
  per-template `textZones` from Step 1.
- Persist the font/color the customer actually picked (today only the raw
  text value is saved to `Customization.textFieldsJson`).
- Replace the current crude `ctx.fillText(text, x, y, maxWidth)` approach
  (which visually squishes glyphs rather than shrinking font size) with a real
  loop: measure with `ctx.measureText()`, step the font size down until the
  text fits both the zone's width and height.
- Add `await document.fonts.ready` before `EditorCanvas`'s first paint
  (cheap, defensive — closes any remaining FOUT gap even though `next/font`
  self-hosting already makes it unlikely).
- Add a ~120ms debounce between `TextFieldEditor`'s `onChange` and the state
  update that feeds `EditorCanvas`, so fast typing doesn't thrash redraws
  (more relevant once auto-shrink measurement makes each redraw slightly more
  expensive).

### Step 6 — Clipart picker + canvas layer

- New `ClipartPicker` component (grid of thumbnails, same visual pattern as
  the existing `Swatch`/`SlotPicker` components), reading
  `template.clipartOptions`.
- Selecting an option sets `clipartId` in the (now page-level) customization
  state; `EditorCanvas` draws that option's `assetUrl` at its fixed
  `x/y/width/height`, positioned after text in z-order.
- Per the locked decision: `clipartOptions[].assetUrl` points at a small
  dev-provided/stock asset set for now (checked into `public/`, same pattern
  as the existing stock-image placeholders) — no upload/admin UI this round.
  The schema shape is written so swapping in admin-uploaded assets later is a
  data change, not a schema change.

### Step 7 — Template versioning

- Editing a template's layout in the admin writes a **new** `FrameTemplate`
  doc with `version` incremented and `isCurrent: true`; flips the previous
  doc's `isCurrent` to `false`; never mutates an existing doc.
- The editor always fetches `isCurrent: true` for a variant.
- A `Customization` always pins the exact `templateVersion` it was built
  against (Step 1's new field), so an existing order's re-render is never
  affected by a later template edit.
- New admin screen (e.g. `admin/products/[id]/template`) for editing
  `textZones`/`clipartOptions`/mask assignment per variant, built on this
  new-version-on-save rule. Follows the existing admin panel's established
  pattern (real reads, clearly-labeled mock/real writes where relevant).

### Step 8 — Build out `services/print-render` for real

The one deliberate exception to this session's frontend-only rule (see §3).

- **Trigger points:** (a) automatically when an order transitions to `paid`
  (the existing order-status flow already used by `admin/orders`), and (b) a
  manual "Re-render" button in `admin/orders` for retries — covers the
  `renderStatus: 'failed'` case that already exists in the schema.
- **Pipeline** (new Express endpoint, e.g. `POST /render`):
  1. Given a `personalizationId`, load every `Customization` doc for it
     (already grouped this way via `OrderItem.personalizationId`), plus the
     pinned `FrameTemplate` **version** doc (never the current one —
     reproducibility).
  2. For each slot: fetch the **original full-resolution** upload (not the
     client preview), apply the exact same crop/scale/rotate/mask math from
     the now-shared `editor-geometry.ts`, using `node-canvas`.
  3. Composite mockup → slots → `overlayUrl` → text (server-side font loading
     via `node-canvas`'s `registerFont` against the actual font files, not
     just `next/font`'s browser-side mechanism) → clipart.
  4. Upload the result to Firebase Storage; write the URL to
     `Customization.renderedFileUrl`; flip `renderStatus` to `done` (or
     `failed` with an error note).
- **Auth:** service-to-service only (called by a Cloud Function/admin action
  with a Firebase Admin SDK service account or shared secret) — never exposed
  to the client directly, consistent with Storage's existing full-deny rule.

## 5. Engineering commitments ("strict, smooth, correct")

Since the editor is now permanent above-the-fold page content instead of a
secondary popup, these are treated as requirements, not nice-to-haves:

- The canvas stays mounted across variant switches, slot switches, and
  text/clipart edits — updates via props only, never unmounts/remounts (which
  would show a blank flash on every variant click).
- Preload the next variant's mockup image before swapping (warm the image
  cache on selection) so switching Size/Colour never shows a blank canvas
  while the new mockup loads.
- One redraw path — everything (slot drag, zoom, rotate, text keystroke,
  clipart pick, variant swap) funnels through the same `EditorCanvas` effect;
  no parallel/competing draw calls.
- A real loading/skeleton state for the inline panel while the template
  fetches, sized to match the eventual canvas — no layout jump when it
  resolves.
- Test coverage on the new inline component: correct field/slot/clipart set
  per template variation, variant-swap re-fetch correctness, and confirmation
  that existing DPI/crop-math tests keep passing unchanged (the math itself
  isn't moving, only where it's mounted).

## 6. Sequencing summary

1. Shared math move + schema changes (`packages/shared`)
2. Modal → inline restructure (`ProductDetailClient` / `BuyBox` / `Gallery`)
3. `EditorCanvas` renders all filled slots simultaneously
4. Mask (`maskUrl`) + `overlayUrl` compositing
5. Per-template text zones + styled persistence + auto-shrink
6. Clipart picker + layer
7. Template versioning + admin template-editing screen
8. `print-render` service build-out + order-paid trigger + admin re-render button

Each step ships independently and is individually testable; nothing requires
the others to land first except step 1 (the schema/math foundation everything
else reads from).
