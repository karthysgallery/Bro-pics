# Template Auto-Detect Feasibility & Compatibility Audit

> **Date:** September 2026  
> **Scope:** Read-only analysis — no source files, schemas, configs, or dependencies modified  
> **Codebase:** `d:\Projects\Bro-pics` branch `San's(FE)` at commit `4e088ff`  

---

## 1. Executive Summary

**Verdict: GO WITH CHANGES**

The BroPics codebase is architecturally well-suited for the proposed template auto-detect feature. The Zod schemas use `.optional()` and `.default()` throughout, allowing additive field extension without breaking existing templates. The print pipeline already supports transparent-window mockup overlays, mask-based slot compositing, and immutable template versioning. However, **reliable fully-automatic detection is only feasible for a subset of frame styles** (transparent-PNG windows, high-contrast solid-gutter frames). Complex cases (textured frames, gradient backgrounds, low-contrast gutters, non-rectangular masks, overlapping slots) will require admin review or manual slot drawing. The Dockerfile uses `node:20-slim` which **lacks librsvg**, blocking server-side SVG overlay generation. The admin template builder page currently has no multi-slot visual editor — only a mockup preview with numeric text zone inputs.

---

## 2. Compatibility Matrix

| Area | Status | Evidence |
|---|---|---|
| **Schema & Data Model** | ✅ Compatible (needs additive fields) | `FrameTemplateSchema` uses `.optional()` on all newer fields; `.default([])` on arrays. Zod `.strict()` only on the request body schema, not the storage schema. See §3 below. |
| **Physical Frame vs Printed Artwork** | ⚠️ Needs Change | Mockup is composited INTO the print file (L87 of `render-print-file.ts`). No separation of "preview-only frame" from "printed layer". See §4. |
| **Template Builder & Admin API** | ⚠️ Needs Change | Admin page (`template/page.tsx`) has no visual slot editor, no frame image upload, no detection UI. Test render route exists and works. See §5. |
| **Image Processing (Sharp)** | ✅ Compatible (SVG rasterization unverified) | Sharp `^0.35.0` in both `apps/web` and `services/print-render`. Raw buffers, alpha, compositing, `dest-in` blend all used and tested. Dockerfile is `node:20-slim` — likely no librsvg. See §6. |
| **Render Pipeline (Print)** | ✅ Compatible | Supports transparent overlays, mask compositing, multi-slot. Reads only customer `uploadId` — sample photos cannot leak. See §7. |
| **Storefront Editor** | ⚠️ Needs Change | No "demo state" for unfilled slots. `validateSlotsComplete` requires every slot to have an upload. No non-rectangular mask rendering in clip path (only in mask branch). See §8. |
| **Storage, Rules & Security** | ⚠️ Needs Change | No `templates/` or `samples/` storage path exists. `storage.rules` only allows world-read on `/public/**`. CORS config missing production domain. See §9. |
| **Performance & Limits** | ⚠️ Needs Change | 6000×9000 raw buffer = ~216 MB in RGBA. Sharp `limitInputPixels` is 120 MP. Next.js route handlers have no explicit `maxDuration`. See §10. |
| **Testing & Tooling** | ✅ Compatible | Vitest + Playwright + fixture-driven tests. 230 suites, 1,500 tests passing. No fixture images for frame detection exist yet. See §11. |
| **Detection Strategy** | ⚠️ Partial (tiered approach required) | Alpha-window detection reliable. Solid-gutter detection partial. Textured/gradient cases need manual fallback. See §12. |

---

## 3. Schema & Data Model

### 3.1 Current FrameTemplateSchema (Full)

**Source:** `packages/shared/src/schemas/frame-template.ts` (lines 1–89)

```typescript
FrameTemplateSchema = z.object({
  id: z.string(),
  variantId: z.string(),
  mockupUrl: z.string().min(1),               // Frame preview image URL
  maskUrl: z.string().nullable(),              // Optional alpha cutout mask
  overlayUrl: z.string().nullable(),           // Optional foreground overlay
  printableRects: z.array(z.object({           // Photo slot positions
    slotIndex: z.number().int().nonnegative(),
    x: fraction,    // 0-1 normalized
    y: fraction,
    width: fraction,
    height: fraction,
    widthMm: z.number().positive().optional(),  // Physical mm (optional)
    heightMm: z.number().positive().optional(),
  })).min(1),
  bleedMm: z.number().nonnegative(),
  matInset: z.number().nonnegative(),
  version: z.number().int().positive(),        // Immutable version number
  isCurrent: z.boolean(),                      // Active version flag
  textZones: z.array(TextZoneSchema).default([]),
  clipartOptions: z.array(ClipartOptionSchema).default([]),
});
```

### 3.2 Coordinate System

- **Slot coordinates:** Stored as **normalized fractions** (0–1) of the mockup image dimensions. `fraction = z.number().min(0).max(1)`. See line 3 of `frame-template.ts`.
- **Origin:** Top-left (0,0) to bottom-right (1,1). Consistent with canvas 2D and Sharp compositing.
- **Conversion helper:** `fractionRectToCanvasRect()` in `packages/shared/src/editor-geometry.ts` (lines 18–25) converts fractions to pixel coordinates for any target canvas size.
- **mm fields:** `widthMm`/`heightMm` per slot are optional (added in ABE-12). No standalone mm↔px conversion helper exists; DPI calculation uses `variant.widthIn`/`variant.heightIn` (inches) and `variant.printWidthPx`/`variant.printHeightPx`.

### 3.3 Frame Style as Data

**No existing fields describe frame style as structured data.** There is no `borderWidth`, `borderColor`, `matColor` (in the actual schema — the spec doc mentions `matColor` but it was never implemented), `gutterWidth`, `gutterColor`, `backgroundType`, or `textureAssetPath`. The only style information is:

- `mockupUrl`: A single image containing the entire frame appearance (frame border + mat + gutters all baked in).
- `overlayUrl`: Optional foreground layer (glass reflection, embossed border).
- `maskUrl`: Optional per-slot alpha mask.
- `matInset`: A numeric mm value, but used only as metadata — not for rendering logic.

**The look is entirely baked into the mockup image.**

### 3.4 Adding Optional Fields — Compatibility Analysis

**Can we add optional fields without breaking anything?**

| Consumer | Impact | Evidence |
|---|---|---|
| **FrameTemplateSchema (Zod)** | ✅ Safe | Schema is NOT `.strict()`. Extra fields pass through `.parse()`. Default values via `.optional()` and `.default([])` already used (lines 82–85). |
| **CreateFrameTemplateBodySchema (API)** | ⚠️ Needs update | This IS `.strict()` (line 62 of `frame-template-request-schema.ts`). New fields must be added here to be accepted in POST. |
| **Firestore rules** | ✅ No impact | `frameTemplates/{templateId}` allows read:true, write:false (admin SDK bypasses rules). No field-level validation in rules. |
| **Print render service** | ✅ Safe | Reads only `mockupUrl`, `maskUrl`, `overlayUrl`, `printableRects` from template (see `firestore-render-deps.ts` lines 89–94). Extra fields ignored. |
| **Editor (EditorCanvas)** | ✅ Safe | Reads `mockupUrl`, `overlayUrl`, `maskUrl`, `printableRects`, `textZones`, `clipartOptions` from template prop. Extra fields ignored. |
| **Admin template page** | ⚠️ Needs update | Would need UI controls for any new fields. |
| **Seed scripts** | ✅ Safe | Seeds write through Firestore Admin SDK, not through schema parsing. |
| **Tests** | ✅ Safe | Existing test fixtures use minimal objects; `.parse()` with extra fields passes in non-strict mode. Confirmed by test at line 74–77 of `frame-template.test.ts`. |

**Candidate new fields and feasibility:**

| Field | Where to Add | Breaking? |
|---|---|---|
| `sampleImagePaths: z.array(z.string()).optional()` | FrameTemplateSchema | No — `.optional()` |
| `frameStyle: z.object({...}).optional()` | FrameTemplateSchema | No — `.optional()` |
| `sourceFrameImagePath: z.string().optional()` | FrameTemplateSchema | No — `.optional()` |
| Per-slot `borderRadius: z.number().optional()` | printableRects item | No — `.optional()` |
| Per-slot `shape: z.enum([...]).optional()` | printableRects item | No — `.optional()` |

### 3.5 Template Versioning

**How it works:** (`packages/shared/src/schemas/frame-template.ts` lines 71–78)

- Editing a template creates a NEW doc with `version + 1`, `isCurrent: true`; the previous doc gets `isCurrent: false`. Done in a Firestore transaction (`apps/web/app/api/admin/frame-templates/route.ts` lines 60–79).
- A `Customization` pins `templateVersion` (line 65 of `customization.ts`), never the "current" template.
- Print render fetches the exact pinned version (`render-job.ts` lines 97–98): `getFrameTemplate(orderItem.variantId, templateVersion)`.
- **Impact:** Existing orders are never affected by template edits. Auto-detect would create a new version, safely isolated from existing customizations.

---

## 4. Physical Frame vs Printed Artwork

### 4.1 What Is Currently Printed

**The mockup image IS composited into the print file.** In `render-print-file.ts` (lines 84–89):

```typescript
.composite([
  ...slotComposites,                           // Photos in slots
  { input: resizedMockup, left: 0, top: 0 },  // Mockup ON TOP of photos
  ...overlayComposite,                         // Overlay on top
  ...clipartComposite                          // Clipart on top
])
```

The mockup is resized to `printWidthPx × printHeightPx` and drawn OVER the photos. If the mockup has opaque frame borders, **those borders are printed**. If the mockup has transparent windows, photos show through.

### 4.2 Variants and Overlay Relationship

From `packages/shared/src/schemas/variant.ts`:

- Each variant has `frameColour`, `material`, `sizeLabel`, `printWidthPx`, `printHeightPx`.
- Frame templates are stored per-variant: `products/{id}/variants/{variantId}/frameTemplates/{id}` (collectionGroup indexed).
- **When a customer picks a different variant (frame color/size), a different template (and therefore different mockup) is loaded.** The `initialTemplatesByVariant` prop in `ProductDetailClient.tsx` (line 51) is a `Record<string, FrameTemplate>`, keyed by variantId.

### 4.3 What Should Change

> **IMPORTANT:** The system currently makes **no distinction** between "printed layer" and "preview-only frame rendering." The mockup is used for both the storefront preview AND the print composite.

**Proposed separation:**

| Layer | Purpose | Current | Needed |
|---|---|---|---|
| `mockupUrl` | Full visual preview (frame + mat + gutters + photos) | Used for both preview and print | Preview only |
| `printOverlayUrl` (NEW) | Print-ready transparent overlay (mat + gutters as alpha windows, no physical frame border) | Does not exist | Must be generated |
| `overlayUrl` | Decorative foreground (glass reflection, embossed border) | Drawn on top of mockup in both preview and print | Unchanged |

**Code assumptions that would need updating:**

- `render-print-file.ts` (lines 59–61): Currently resizes `mockupBuffer` to print dimensions and composites it. Would need to use `printOverlayUrl` instead (or additionally).
- `render-job.ts` (lines 103–104): `fetchPublicAsset(template.mockupUrl)` — would also need to fetch `printOverlayUrl`.
- `EditorCanvas.tsx` (lines 442–444): Draws mockup over photos for preview. This is correct for preview — no change needed.

### 4.4 Product Owner Questions

This is the **single most critical product question** before implementation:

1. **Is the dark border in a frame product image a physical wood/metal frame (sold as a variant) or printed artwork?** The codebase treats it as printed.
2. **Is the mat a physical cut mat or a printed mat?** Current code prints it.
3. **If the frame is physical, should the print file contain ONLY the photos + inner mat/gutters (no outer frame border)?** This changes what the generated overlay must contain.

---

## 5. Template Builder & Admin API

### 5.1 Current Admin Template Page

**File:** `apps/web/app/admin/products/[id]/template/page.tsx` (746 lines)

**Current capabilities:**
- Variant selector dropdown (line 331–343)
- **Mockup, Mask, Overlay asset selection** via `MediaPickerModal` (lines 454–525). Accepts any image from the media library.
- **Text zones** editor: add/remove zones, edit fieldKey, label, maxLength, align, and x/y/width/height (normalized fractions) via numeric inputs (lines 551–678).
- **Clipart options** editor (via MediaPickerModal for asset URLs).
- **Bleed (mm) and Mat Inset (mm)** numeric inputs (lines 528–548).
- **Version history** with activate/deactivate toggle (lines 681–724).
- **Test render button** — currently a **client-side dummy** (lines 270–296): creates an HTML canvas, writes text, and downloads it. Does NOT use the server-side test render route.
- **No visual slot editor**: `printableRects` is hardcoded to a single full-canvas slot `[{ x: 0, y: 0, width: 1, height: 1 }]` (line 191–198). There is no UI to define multi-slot layouts visually.

**State management:** React `useState` hooks, no external state library. `isDirty` flag tracks unsaved changes.

**Permission:** `catalogue:write` required (checked in API route, not in page component).

**Audit logging:** The API route writes `frame_template.create_version` audit logs (line 85–91 of `route.ts`).

### 5.2 Server-Side Test Render Route

**File:** `apps/web/app/api/admin/frame-templates/test-render/route.ts` (153 lines)

This route **does work correctly**:
- Accepts `multipart/form-data` with `variantId`, `templateVersion`, and a `photo` file.
- Probes the photo through `probeAndStripImage()` (same as customer uploads).
- Fetches template assets (mockup, overlay, mask) via URL or local filesystem.
- Calls the **same `renderPrintFile()`** from `@bro-pics/print-render` that the real pipeline uses.
- Returns the rendered PNG as a downloadable attachment.
- **Every slot gets the same sample photo** with full crop rect (uncropped), no rotation (lines 115–121).
- **20 MB limit** on test photo (line 19).
- Can use sample images in place of uploads — already does exactly this.

### 5.3 Upload Format/Size Limits

| Limit | Value | Source |
|---|---|---|
| Customer upload | 25 MB, 120 MP | `image-probe.ts` L21, `ProductDetailClient.tsx` L574 |
| Test render photo | 20 MB | `test-render/route.ts` L19 |
| Allowed formats | JPEG, PNG, WebP, HEIC/HEIF | `image-probe.ts` L11-15, magic byte sniffing |
| Media library | No explicit size limit found | MediaPickerModal/admin media route — UNVERIFIED |

### 5.4 What Would Need to Change for Auto-Detect

**New components needed:**
- `FrameImageUploadStep` — upload zone for the raw frame image, triggers detection
- `DetectionReviewPanel` — displays detected slots, confidence scores, allows manual adjustment
- `SlotRectEditor` — visual drag/resize handles for adjusting detected slot positions
- `FrameStyleControls` — border, mat, background, gutter color/texture pickers
- `OverlayPreview` — shows the generated transparent overlay

**Hooks affected:**
- New hook: `useFrameDetection()` — manages async detection call, state, errors
- New hook: `useOverlayGeneration()` — manages overlay generation call

**Routes needed:**
- `POST /api/admin/frame-templates/detect` — accepts frame image, returns detected slots + confidence
- `POST /api/admin/frame-templates/generate-overlay` — accepts slot definitions + style params, returns overlay PNG

**Existing routes affected:**
- `POST /api/admin/frame-templates` — needs to accept new optional fields (`sampleImagePaths`, `frameStyle`, `sourceFrameImagePath`, per-slot `borderRadius`/`shape`)
- `CreateFrameTemplateBodySchema` — must add the same optional fields to the `.strict()` schema

---

## 6. Image Processing

### 6.1 Sharp Version and Capabilities

| Feature | apps/web | services/print-render | Supported? |
|---|---|---|---|
| **Sharp version** | `^0.35.0` | `^0.35.0` | ✅ |
| **Raw pixel buffers** | Used in `image-probe.ts` | Used extensively in `render-slot.ts` and tests | ✅ |
| **Alpha channels** | `ensureAlpha()` in `render-slot.ts` L75, L95 | `ensureAlpha()` | ✅ |
| **Compositing** | N/A (server-side only) | `.composite()` with array of layers | ✅ |
| **`dest-in` blend** | N/A | Mask compositing in `render-slot.ts` L106 | ✅ |
| **SVG input** | UNVERIFIED | UNVERIFIED | ⚠️ See §6.2 |
| **Tiling/repeating textures** | Not used anywhere | Not used | ✅ Sharp supports `tile` option |
| **Gradients** | Not used | Not used | ⚠️ Would need SVG overlay → rasterize |
| **Rounded-corner masks** | Not used (only rectangular clips) | `maskBuffer` via `dest-in` supports any shape | ✅ Via mask images |
| **Extract/crop** | `.extract()` in `render-slot.ts` L86-92 | Yes | ✅ |
| **Resize** | `.resize()` used extensively | Yes | ✅ |

### 6.2 SVG Rasterization (librsvg)

**Dockerfile:** `services/print-render/Dockerfile` — `FROM node:20-slim`

`node:20-slim` is a Debian-based minimal image. Sharp's prebuilt binaries for Linux include **limited SVG support** via libvips's built-in SVG loader (based on librsvg if available, or a basic fallback). On `node:20-slim`, **librsvg is NOT installed by default** — `apt-get install librsvg2-dev` would be needed.

**Impact:** If we want to generate overlays as SVG (gradients, rounded corners, text) and rasterize them via Sharp, the Dockerfile must install librsvg. Alternatively, overlays can be generated as PNG directly using Sharp's raw buffer API without SVG.

**Status: UNVERIFIED** — cannot confirm SVG rasterization works in the deployed build without testing.

### 6.3 Image Probe (Reusability)

**File:** `apps/web/lib/image-probe.ts`

| Protection | Value | Reusable for admin frame uploads? |
|---|---|---|
| Magic-byte sniffing | JPEG, PNG, WebP, HEIC/HEIF | ✅ Frame images will be these formats |
| Decompression bomb | 120 MP (`limitInputPixels`) | ⚠️ A 6000×9000 frame image = 54 MP, well within limit. But the re-encode to JPEG would destroy alpha. |
| EXIF strip | Always strips | ✅ Fine for admin uploads |
| sRGB conversion | Forces sRGB | ✅ Correct for print pipeline |
| Format normalization | Re-encodes to same format as JPEG/PNG/WebP | ⚠️ Must NOT re-encode PNG → JPEG (loses alpha). Need to preserve PNG format for transparent overlays. |

**Recommendation:** Create a separate `probeAdminFrameImage()` that uses the same magic-byte and bomb checks but preserves PNG format and alpha channel.

### 6.4 Where Should Detection Run?

| Option | Memory | Timeout | Cold Start | Verdict |
|---|---|---|---|---|
| **Next.js API route** | Vercel: 1 GB (Pro); self-hosted: unlimited | Vercel: 60s (Pro); self-hosted: none | Warm (Next.js server is persistent) | ⚠️ Tight on Vercel |
| **Cloud Function** | 256 MB – 32 GB configurable | 540s max | 2–8s cold start | ✅ Good for batch |
| **services/print-render (Cloud Run)** | Configurable (recommended ≥ 2 GB, per launch checklist) | 300s default, 3600s max | Variable | ✅ **Recommended** |

**Recommendation: Cloud Run (`services/print-render`)** — already has Sharp, already configured for memory-intensive image work, already has Firebase Admin SDK access. Add a `/detect` endpoint alongside `/render/:jobId`. No `maxDuration` issue. The existing `firebase.json` has no Cloud Run config (it's deployed separately).

**Memory estimate for detection:** A 6000×9000 RGBA raw buffer = 216 MB. Sharp's `.metadata()` reads only headers (a few KB). `.raw().toBuffer()` for the full image = 216 MB. Clustering/edge detection on the raw buffer adds ~50–100 MB working space. **Total: ~400–500 MB**. The 2 GB Cloud Run recommendation in the launch checklist is sufficient.

---

## 7. Render Pipeline (Print + Preview)

### 7.1 Compositing Layer Order

From `render-print-file.ts` (lines 84–89):

```
Layer 0: White background (RGBA 255,255,255,1) — created via sharp({ create: { ... } })
Layer 1: Slot photos (each positioned at their fractional rect, masked if maskBuffer)
Layer 2: Mockup image (resized to print dimensions, drawn ON TOP of photos)
Layer 3: Overlay image (if present, resized to print dimensions)
Layer 4: Clipart (if present, at its fractional position)
```

### 7.2 Slot Transform Application

In `render-slot.ts` (lines 42–109):

1. Extract `cropRect` from original photo (with transparent padding for out-of-bounds crops)
2. Rotate by `rotationDeg` (Sharp clockwise, matches Konva)
3. Resize to `targetWidthPx × targetHeightPx` with `fit: 'fill'`
4. Apply mask via `dest-in` blend if `maskBuffer` present

### 7.3 Feature Support Matrix

| Feature | Print Pipeline | Editor Canvas | Gap? |
|---|---|---|---|
| Transparent-window overlays above photos | ✅ `overlayBuffer` composited on top | ✅ `overlayImage` drawn after mockup | No |
| `maskPath` shapes (non-rectangular) | ✅ `dest-in` blend | ✅ Offscreen canvas `destination-in` | No |
| Rounded corners | ✅ Via mask images | ✅ Via mask images | No (but no roundedRect shortcut) |
| Rotated slots | ⚠️ Photo rotation yes; slot rect rotation NO | ⚠️ Same limitation | **Yes — no slot rotation field exists** |
| Overlapping slots | ✅ Multiple composites at arbitrary positions | ✅ Drawn sequentially (later slots overlap earlier) | No |
| Background layers below photos | ✅ White background hardcoded | ✅ `PAPER` constant fill | **Yes — not configurable** |
| Overlay dimensions assumption | Resized to `printWidthPx × printHeightPx` (fill) | Drawn at `CANVAS_SIZE × CANVAS_SIZE` | No — both normalize to canvas |

### 7.4 Sample Photo Leakage Prevention

**Confirmed safe.** The print pipeline reads only customer `uploadId` from `Customization.uploadId`:

- `render-job.ts` (lines 110–113): `deps.getUpload(customization.uploadId)` → `downloadPrivateFile(upload.originalPath)`
- Customization docs require `uploadId: z.string()` — a real upload ID, not a sample path
- Sample images would be stored in template data, never in customization data
- `status: 'locked'` customizations are immutable after payment

### 7.5 Admin Test Render

The server-side test render route (`test-render/route.ts`) already uses sample photos in place of uploads — it fills every slot with the same admin-uploaded test photo. This can be extended to use per-slot sample images from the template's `sampleImagePaths`.

**Note:** The admin template page's "test render" button (lines 270–296 of `template/page.tsx`) is a **client-side dummy** that just creates a canvas with text. It does NOT call the server-side test render route. This is misleading and should be wired to the real route.

---

## 8. Storefront Editor

### 8.1 Slot Drawing

**EditorCanvas.tsx** (lines 427–440):
- Iterates ALL slots, draws each simultaneously
- Each slot is clipped to its `canvasRect` (rectangular `ctx.clip()` for maskless slots, offscreen `destination-in` for masked slots)
- Only the `activeSlotIndex` gets pointer-drag handlers and a stroke outline
- Drawing order: photos → mockup → overlay → text → clipart

### 8.2 Demo State (Unfilled Slots)

**Does not exist.** Currently:
- A slot with no `photoUrl` is simply not drawn (line 282 of `drawSlotPhoto`: `if (!photoImage) return`)
- `SlotPicker` shows empty numbered buttons for unfilled slots (line 25: `filledSlots.has(slotIndex) ? '✓' : slotIndex + 1`)
- `validateSlotsComplete()` (`apps/web/lib/editor-validation.ts` lines 33–47): **requires every slot to have a customization** — returns `{ complete: false, reason: 'Slot N has no photo yet' }` if missing

**For demo state, these changes are needed:**
1. `SlotDrawState.photoUrl` could be set to a sample image URL for unfilled slots
2. A new `isSample: boolean` flag distinguishes sample from real uploads
3. `validateSlotsComplete()` must reject sample-only slots (they don't have real `uploadId`s)
4. `handleAddToCart` in `ProductDetailClient.tsx` (line 726) iterates `slots` Map entries — must skip or reject sample-only entries

### 8.3 Add-to-Cart Validation

**Client-side:** `validateSlotsComplete()` checks every slot index 0..`slotCount-1` has an entry in the map and DPI is acceptable.

**Server-side:** The `POST /api/customizations` route validates:
- Upload exists in Firestore (`getUpload()`)
- Template version exists and is valid
- Text fields pass `validateTextFieldsAgainstTemplate()`
- DPI is computed and `dpiBand` set server-side

**Sample-only slots would be rejected** because:
- They would have no `uploadId` (or a fake one)
- `getUpload(uploadId)` would return null → error
- The server never accepts a customization without a real upload

### 8.4 DPI Validation and Sample Images

DPI is computed via `effectiveDpiFromCropRect()` using the photo's real pixel dimensions and the slot's physical print size. Low-resolution sample images (e.g., 800×600 preview thumbnails) would trigger red DPI warnings in the editor.

**Mitigation:** Sample images shown in demo state should not trigger DPI validation. The `isSample` flag would skip DPI computation and display.

### 8.5 Variant Change Reactivity

`ProductDetailClient.tsx` passes `initialTemplatesByVariant: Record<string, FrameTemplate>` — a map of templates keyed by variant ID, fetched server-side. When the user selects a different variant, the template changes immediately (no network fetch needed). The mockup, mask, overlay, slots, and text zones all update reactively.

**For the new feature:** When a variant changes (e.g., different frame color), the corresponding template's sample images and mockup would change automatically if each variant has its own template version with its own assets.

---

## 9. Storage, Rules & Security

### 9.1 Current Storage Structure

From `storage.rules`:

| Path | Read | Write | Used For |
|---|---|---|---|
| `/public/**` | World-readable | Admin SDK only | Product photos, CMS assets, **template mockups** |
| `/uploads/**` | Staff/admin only | Admin SDK only | Customer photo uploads |
| `/print-files/**` | Staff/admin only | Admin SDK only | Rendered print PNGs |
| `/returns/**` | Staff/admin only | Admin SDK only | Return damage photos |
| Everything else | Denied | Denied | — |

**Template assets live under `/public/**`** — mockup URLs like `/placeholders/mockups/classic-wooden-frame.png` are stored in `public/` in the Next.js app, not in Cloud Storage. In production, they would be under `public/products/{productId}/...` in Storage.

### 9.2 New Storage Paths Needed

| Path | Purpose | Read Access Needed |
|---|---|---|
| `public/templates/{templateId}/overlay.png` | Generated print overlay | World-readable (storefront preview + print render) |
| `public/templates/{templateId}/samples/slot_{n}.jpg` | Extracted sample photos | World-readable (storefront demo) |
| `public/templates/{templateId}/source.png` | Original uploaded frame image | Admin only |
| `public/templates/{templateId}/textures/...` | Optional texture assets | World-readable |

**`/public/**` is already world-readable** — no storage rule changes needed for new paths under `public/`. The source frame image should NOT be under `public/` if it should be admin-only — it needs a new path like `admin-assets/{templateId}/source.png` with a corresponding storage rule.

### 9.3 CORS Configuration

From `cors.json`:

```json
{
  "origin": ["http://localhost:3000", "https://*.web.app", "https://*.firebaseapp.com"],
  "method": ["GET"],
  "responseHeader": ["Content-Type", "Access-Control-Allow-Origin"]
}
```

**Missing:** The production domain (`bropics.in`) is not listed. This is already flagged as a pre-launch blocker in the launch checklist.

**Tainted-canvas risk:** `EditorCanvas.tsx` loads images with `crossOrigin: 'anonymous'` first, falling back to non-anonymous if that fails (lines 97–131). If new texture/background images are from a different domain or bucket without CORS, canvas `toDataURL()` will fail silently (caught at line 468–471, returns null preview).

### 9.4 Firestore Rules

`frameTemplates/{templateId}` under `products/{id}` — `allow read: if true; allow write: if false;` (lines 37–40 of `firestore.rules`). All writes go through Admin SDK. **No rule changes needed for new template fields.**

### 9.5 RBAC and Audit Logging

- Permission: `catalogue:write` required for template creation/modification
- Audit log: `frame_template.create_version` action recorded with `actorUid`, `variantId`, `version`
- New actions needed: `frame_template.detect_slots`, `frame_template.generate_overlay`

---

## 10. Performance & Limits

### 10.1 Memory Estimates

| Operation | Memory | Risk |
|---|---|---|
| Load 6000×9000 PNG into Sharp metadata | ~few KB | None |
| Decode to raw RGBA buffer | 6000×9000×4 = 216 MB | ⚠️ Within 2 GB Cloud Run |
| Edge detection / clustering working buffer | ~100–200 MB | ⚠️ Total ~400 MB |
| Generate 300 DPI overlay (e.g., 7200×10800 at 300 DPI for 24×36 frame) | 7200×10800×4 = 311 MB | ⚠️ Tight |
| **Total for detection + overlay generation** | **~700 MB–1 GB** | Needs ≥ 2 GB Cloud Run |

**Decompression-bomb limits:** Sharp's `limitInputPixels` is 120 MP in `image-probe.ts`. A 6000×9000 image = 54 MP — safe. The print render uses `limitInputPixels: false` explicitly (lines 59, 66, 74, 78 of `render-print-file.ts`).

**Recommendation:** Set a specific MP limit for admin frame uploads (e.g., 100 MP) and file size limit (e.g., 50 MB).

### 10.2 Editor Loading Impact

- `EditorCanvas.tsx` is dynamically imported (`next/dynamic` with `ssr: false`)
- `PersonalizationEditor` is also dynamically imported (line 40 of `ProductDetailClient.tsx`)
- Sample images would be loaded via the existing `useImageCache` hook — one additional URL per slot
- Textures/backgrounds would add more images to cache — moderate impact on initial load
- **Recommendation:** Lazy-load sample images only when editor mounts; use thumbnail variants for storefront cards

### 10.3 Caching Concerns

- **Next.js Image optimization:** `remotePatterns` in `next.config.ts` only allows `storage.googleapis.com/bropics-app.firebasestorage.app/**`. New asset URLs must match this pattern or be added.
- **CDN/browser caching:** Cloud Storage objects are cached per their `Cache-Control` headers. If an overlay is regenerated with the same path, stale versions could persist. **Recommendation:** Include template version in the asset path (e.g., `templates/{templateId}/v{version}/overlay.png`).

---

## 11. Testing & Tooling

### 11.1 Test Infrastructure

| Tool | Version | Location |
|---|---|---|
| Vitest | `^2.1.0` | All packages (`apps/web`, `services/print-render`, `packages/shared`, `firestore-rules-tests`) |
| Testing Library | `^16.0.0` | `apps/web` |
| jest-axe | `^11.0.0` | `apps/web` (accessibility) |
| Playwright | `^1.63.0` | `apps/web/e2e` |
| firebase/rules-unit-testing | `^3.0.4` | `firestore-rules-tests` |

### 11.2 Commands

| Command | Purpose |
|---|---|
| `pnpm test` | Run all Vitest unit/integration tests |
| `pnpm test:rules` | Run Firestore/Storage rules tests against emulator |
| `pnpm test:e2e` | Run Playwright end-to-end tests |
| `pnpm typecheck` | Run TypeScript type checking across all packages |

### 11.3 Existing Relevant Tests

| Test File | Tests | Risk of Breakage |
|---|---|---|
| `frame-template.test.ts` | 7 tests (valid/invalid parsing, defaults) | Low — adding optional fields won't break |
| `customization.test.ts` | Schema parsing tests | Low |
| `render-print-file.test.ts` | 5 tests (layer order, slot positioning, multi-slot) | Medium — if mockup compositing logic changes |
| `render-slot.test.ts` | Slot rendering with crop, rotation, mask | Low |
| `render-job.test.ts` | Job pipeline with mocked deps | Low |
| `server.test.ts` | HTTP endpoint tests | Low |
| `route.test.ts` (frame-templates) | Template creation API tests | Medium — if schema changes |
| `test-render/route.test.ts` | Test render route tests | Low |
| `editor-validation.test.ts` | Slot completion validation | Medium — if demo state changes validation logic |
| `image-probe.test.ts` | Bomb protection, format detection | Low |
| `ProductDetailClient.personalization.test.tsx` | Editor integration, add-to-cart flow | Medium — if demo state added |

**Known slow test:** `image-probe.test.ts` decompression bomb test (4–5 seconds, per PROJECT_CONTEXT.md line 522).

### 11.4 Fixture Images Needed

No fixture images for frame detection exist yet. Recommended fixture set:

| Fixture | Description | Priority |
|---|---|---|
| `black-border-white-mat.png` | Classic frame, high contrast | P0 |
| `no-border.png` | Frameless, photos only with gutters | P0 |
| `transparent-windows.png` | PNG with alpha cutouts for slots | P0 |
| `colored-mat.png` | Non-white mat (e.g., cream, grey) | P0 |
| `textured-wood.png` | Wood grain frame texture | P1 |
| `gradient-background.png` | Gradient mat/background | P1 |
| `thick-colored-gutters.png` | Wide colored gutters between slots | P1 |
| `rounded-slots.png` | Rounded-corner photo windows | P1 |
| `circular-slots.png` | Circular photo windows | P1 |
| `landscape-layout.png` | Landscape orientation frame | P0 |
| `no-gutters.png` | Photos touching with no spacing | P1 |
| `overlapping-polaroid.png` | Overlapping/rotated polaroid style | P2 |

**Recommended location:** `services/print-render/test-fixtures/frames/` or `packages/shared/test-fixtures/frames/`

---

## 12. Detection Strategy Review

### 12.1 Tiered Detection Approach

```
Tier 1: Alpha-Window Detection (PNG with transparency)
  ↓ (if no alpha or alpha doesn't yield clean slots)
Tier 2: Gutter-Color Detection (sample corners/edges, cluster, find uniform regions)  
  ↓ (if low confidence or complex layout)
Tier 3: Manual Slot Drawing (admin draws rects over the uploaded image)
  ↓ (or alternatively)
Tier 3b: JSON Import (admin provides slot coordinates from external tool)
```

### 12.2 Detection Feasibility by Frame Style

| Frame Style Category | Detection Method | Feasibility | Fallback |
|---|---|---|---|
| **Transparent PNG windows** | Alpha connected components | 🟢 **Reliable** | None needed |
| **Black border, white mat, white gutters** | Edge detection + white-region fill | 🟢 **Reliable** | Manual verify |
| **Solid-color border, solid mat** | Color sampling + clustering | 🟡 **Partial** | Admin confirms gutter/mat colors |
| **No border (frameless)** | Gutter-only detection | 🟡 **Partial** | Admin confirms gutter color |
| **Wood grain / textured frame** | Texture variance analysis + inner-edge detection | 🟡 **Partial** | Admin draws inner frame boundary |
| **Metallic / gradient frame** | Gradient-aware edge detection | 🔴 **Manual only** | Manual slot drawing |
| **No gutters (photos touching)** | Content-aware edge detection | 🔴 **Manual only** | Admin slot drawing or JSON |
| **Colored gutters matching photo content** | Ambiguous — can't distinguish gutter from photo | 🔴 **Manual only** | Admin slot drawing |
| **Rounded rectangle slots** | Alpha mask analysis / corner radius estimation | 🟡 **Partial** | Admin specifies radius |
| **Circular / heart-shaped slots** | Alpha connected component shape analysis | 🟢 **Reliable** (with alpha) / 🔴 (without) | Admin provides mask |
| **Rotated / overlapping photos** | Rotated bounding box detection | 🔴 **Manual only** | Admin slot drawing |
| **Polaroid with caption areas** | Detect asymmetric padding per slot | 🟡 **Partial** | Admin marks caption zones |
| **Mat-less frames** | Direct photo-in-frame detection | 🟡 **Partial** | Depends on frame contrast |
| **JPEG artifacts** | Lossy edges blur gutter boundaries | 🟡 **Partial** | Recommend PNG upload |
| **Near-white photo content** | False positive gutter detection | 🟡 **Partial** | Confidence threshold + admin review |
| **Mockup on scene background** | Background removal needed first | 🔴 **Manual only** | Admin provides cropped frame or draws slots |

### 12.3 Sharp Raw Buffer API Feasibility

All detection operations can be implemented using Sharp's raw pixel buffer API:

```typescript
// Get raw RGBA pixels
const { data, info } = await sharp(buffer)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
// data is Buffer of info.width * info.height * 4 bytes (RGBA)
```

- **Color sampling:** Read pixel values at specific coordinates
- **Line scanning:** Iterate rows/columns to find uniform-color lines (gutters)
- **Connected components:** Flood-fill from transparent regions (alpha < threshold)
- **Edge detection:** Sobel-like gradient computation on raw buffer
- **Clustering:** K-means on sampled colors to identify gutter/mat/frame colors

**No external CV library required** for basic detection. For more advanced features (Hough transform, contour detection), a library like `jimp` or custom implementations would be needed — but Sharp's raw buffer access makes this feasible in pure TypeScript.

### 12.4 Confidence Scoring and Admin UI

Each detection result should include:
- `confidence: number` (0–1) — overall detection confidence
- `perSlot: Array<{ rect, confidence, warnings }>` — per-slot results
- `detectedGutterColor: string | null`
- `detectedBorderWidth: { top, right, bottom, left } | null`
- `warnings: string[]` — e.g., "JPEG artifacts may affect accuracy", "Gutter color similar to photo content"

**Admin UI should:**
- Show confidence as a color-coded badge (green ≥ 0.8, amber 0.5–0.8, red < 0.5)
- Display detected slots as draggable/resizable rectangles over the frame image
- Allow manual adjustment of any detected slot
- Allow fallback to fully manual slot drawing
- Show a "Regenerate Overlay" button that takes the final slot positions

---

## 13. Frame Style Support Matrix

| Style Category | Detection | Overlay Generation | Editor Support | Print Support | Gaps |
|---|---|---|---|---|---|
| **No border (frameless)** | 🟡 Partial | ✅ Transparent windows on white/colored bg | ✅ | ✅ | Gutter color detection |
| **Thin solid border** | 🟢 Reliable | ✅ Draw rect border | ✅ | ✅ | None |
| **Thick solid border** | 🟢 Reliable | ✅ Draw rect border | ✅ | ⚠️ If physical frame, shouldn't print | Physical vs printed distinction |
| **Double/layered borders** | 🟡 Partial | ✅ Multiple rect strokes | ✅ | ⚠️ Same issue | Physical vs printed |
| **Wood grain texture** | 🔴 Manual | ⚠️ Need texture tile asset | ⚠️ Need texture loading | ⚠️ Need texture compositing | Texture asset pipeline |
| **Metallic finish** | 🔴 Manual | ⚠️ Need gradient/texture asset | ⚠️ Same | ⚠️ Same | Same |
| **Bevels / drop shadows** | 🔴 Manual | ⚠️ Need shadow rendering | ⚠️ CSS shadow on preview | ⚠️ Need shadow in overlay | Shadow rendering |
| **Rounded corners** | 🟡 With alpha | ✅ Rounded rect mask | ⚠️ Needs mask image, not ctx.clip() | ✅ Via mask | Per-slot mask generation |
| **White mat** | 🟢 Reliable | ✅ White fill outside slots | ✅ | ✅ | None |
| **Colored mat** | 🟡 Partial | ✅ Colored fill | ✅ | ✅ | Color detection accuracy |
| **Gradient/texture mat** | 🔴 Manual | ⚠️ Need gradient rendering | ⚠️ Need gradient in canvas | ⚠️ Need gradient in overlay | Gradient rendering |
| **White gutters** | 🟢 Reliable | ✅ White regions between slots | ✅ | ✅ | None |
| **Colored gutters** | 🟡 Partial | ✅ Colored regions | ✅ | ✅ | Detection accuracy |
| **Transparent gutters** | 🟢 With alpha | ✅ Alpha regions | ✅ | ✅ | None |
| **No gutters** | 🔴 Manual | ✅ Adjacent slot rects | ✅ | ✅ | Detection impossible |
| **Uniform grid** | 🟢 Reliable | ✅ Regular rect array | ✅ | ✅ | None |
| **Masonry/columns** | 🟡 Partial | ✅ Irregular rects | ✅ | ✅ | Complex detection |
| **Freeform/overlapping** | 🔴 Manual | ⚠️ Needs per-slot z-index | ⚠️ No slot rotation in schema | ⚠️ Same | Slot rotation, z-index |
| **Circle slots** | 🟢 With alpha | ✅ Circle mask | ✅ Via mask | ✅ Via mask | Need mask generation |
| **Heart/custom shapes** | 🟢 With alpha | ⚠️ Need shape-aware mask gen | ✅ Via mask | ✅ Via mask | Shape detection from alpha |

---

## 14. Required Changes List

### Group A: Schema & Data Model (Dependency: None)

| # | File | Change | Effort |
|---|---|---|---|
| A1 | `packages/shared/src/schemas/frame-template.ts` | Add optional fields: `sampleImagePaths`, `frameStyle`, `sourceFrameImagePath`, per-slot `borderRadius`/`shape`/`rotation` | S |
| A2 | `apps/web/app/api/admin/frame-templates/frame-template-request-schema.ts` | Mirror A1 in the `.strict()` request schema | S |
| A3 | `packages/shared/src/schemas/frame-template.test.ts` | Add tests for new optional fields | S |

### Group B: Detection & Overlay Generation (Dependency: A)

| # | File | Change | Effort |
|---|---|---|---|
| B1 | `services/print-render/src/detect-slots.ts` (NEW) | Slot detection logic: alpha-window, gutter-color, confidence scoring | L |
| B2 | `services/print-render/src/generate-overlay.ts` (NEW) | Overlay generation: transparent windows, border/mat rendering | L |
| B3 | `services/print-render/src/crop-samples.ts` (NEW) | Extract baked-in photos from source image per detected slot | M |
| B4 | `services/print-render/src/server.ts` | Add `/detect` and `/generate-overlay` endpoints | M |
| B5 | `services/print-render/Dockerfile` | Install `librsvg2-dev` if SVG overlay approach chosen | S |

### Group C: Admin UI (Dependency: A, B)

| # | File | Change | Effort |
|---|---|---|---|
| C1 | `apps/web/app/admin/products/[id]/template/page.tsx` | Add frame image upload step, detection review panel, slot editor | L |
| C2 | `apps/web/components/admin/SlotRectEditor.tsx` (NEW) | Visual drag/resize slot editor component | L |
| C3 | `apps/web/components/admin/DetectionReviewPanel.tsx` (NEW) | Display detection results, confidence, warnings | M |
| C4 | `apps/web/components/admin/FrameStyleControls.tsx` (NEW) | Border, mat, gutter color/texture controls | M |
| C5 | `apps/web/app/api/admin/frame-templates/detect/route.ts` (NEW) | API proxy to Cloud Run detection endpoint | S |

### Group D: Print Pipeline (Dependency: A)

| # | File | Change | Effort |
|---|---|---|---|
| D1 | `services/print-render/src/render-print-file.ts` | Support `printOverlayUrl` separate from `mockupUrl` for print vs preview | M |
| D2 | `services/print-render/src/render-job.ts` | Fetch `printOverlayUrl` in addition to mockup | S |
| D3 | Background fill | Make background color/image configurable instead of hardcoded white | S |

### Group E: Storefront Editor (Dependency: A)

| # | File | Change | Effort |
|---|---|---|---|
| E1 | `apps/web/components/editor/EditorCanvas.tsx` | Render sample images in unfilled slots (demo state) | M |
| E2 | `apps/web/components/editor/PersonalizationEditor.tsx` | Pass sample URLs to canvas, distinguish sample from upload | S |
| E3 | `apps/web/lib/editor-validation.ts` | Don't count sample-filled slots as complete | S |
| E4 | `apps/web/components/product/ProductDetailClient.tsx` | Handle demo state, skip DPI for samples | M |

### Group F: Storage & Security (Dependency: None)

| # | File | Change | Effort |
|---|---|---|---|
| F1 | `storage.rules` | Add `admin-assets/` path with staff-only read (for source frame images) | S |
| F2 | `cors.json` | Add production domain | S (already a known pre-launch item) |

### Group G: Tests (Dependency: A–F)

| # | File | Change | Effort |
|---|---|---|---|
| G1 | Test fixtures | Create frame image fixtures (see §11.4) | M |
| G2 | Detection tests | Unit tests for each detection tier | L |
| G3 | Overlay generation tests | Pixel-level verification of generated overlays | M |
| G4 | Schema migration tests | Verify old templates parse with new schema | S |
| G5 | Editor demo state tests | Test sample rendering and validation gating | M |

---

## 15. Recommended Architecture

### 15.1 Data Flow

```
Admin Template Builder
    │
    ▼
Upload frame image (PNG/JPG)
    │
    ├─► Store at admin-assets/{templateId}/source.png (Cloud Storage)
    │
    ▼
POST /detect → Cloud Run (print-render)
    │
    ├─► Download source image from Cloud Storage
    ├─► Detect slots (alpha → gutter → fallback)
    │
    ▼
Return { slots[], confidence, gutterColor, warnings }
    │
    ▼
Admin reviews & adjusts slots in visual editor
    │
    ▼
POST /generate-overlay → Cloud Run (print-render)
    │
    ├─► Generate transparent overlay PNG
    ├─► Crop sample images from detected slot positions
    ├─► Store overlay + samples in Cloud Storage
    │
    ▼
Return { overlayUrl, samplePaths[] }
    │
    ▼
POST /api/admin/frame-templates → Save as new version
    │
    ▼
Firestore: Write FrameTemplate doc with new fields
```

### 15.2 Storage Paths

```
Cloud Storage:
├── public/
│   └── templates/
│       └── {templateId}/
│           ├── v{version}/
│           │   ├── mockup.png          (preview-only frame graphic)
│           │   ├── print-overlay.png   (transparent windows for print)
│           │   └── samples/
│           │       ├── slot_0.jpg
│           │       ├── slot_1.jpg
│           │       └── ...
│           └── textures/               (optional texture assets)
│               └── wood-grain.png
├── admin-assets/
│   └── templates/
│       └── {templateId}/
│           └── source.png              (original uploaded frame image)
```

### 15.3 Printed vs Preview Layer Separation

| Asset | Used In Preview? | Used In Print? | Purpose |
|---|---|---|---|
| `mockupUrl` | ✅ Yes (drawn over photos in editor canvas) | ❌ No (if physical frame) / ✅ Yes (if printed frame) | Full visual frame appearance |
| `printOverlayUrl` (NEW) | ❌ No | ✅ Yes | Transparent windows + printed mat/gutters |
| `overlayUrl` | ✅ Yes | ✅ Yes | Decorative foreground (glass, emboss) |
| `sampleImagePaths` (NEW) | ✅ Yes (demo state) | ❌ Never | Preview placeholders |

---

## 16. Risks Table

| # | Risk | Severity | Evidence | Mitigation |
|---|---|---|---|---|
| R1 | **Physical vs printed frame ambiguity** — mockup currently printed into output; auto-generated overlay might include physical frame elements | **High** | `render-print-file.ts` L87 composites mockup into print | Product owner must define what is physical vs printed before implementation |
| R2 | **Detection unreliable for complex frames** — textured, gradient, low-contrast frames will produce incorrect slot positions | **High** | No CV library; Sharp raw buffers only | Tiered approach with mandatory admin review; confidence scores; manual fallback always available |
| R3 | **SVG rasterization unavailable** — `node:20-slim` Dockerfile may lack librsvg | **Medium** | Dockerfile line 1: `FROM node:20-slim AS base` | Install librsvg in Dockerfile OR generate overlays as PNG using Sharp raw buffer API directly |
| R4 | **Memory pressure on Cloud Run** — large frame images + overlay generation could exceed 2 GB | **Medium** | 6000×9000 RGBA = 216 MB × 2-3 buffers | Set frame upload limits (100 MP, 50 MB); configure Cloud Run with 4 GB for detection endpoint |
| R5 | **Stale overlay cache** — regenerated overlays served from CDN/browser cache after template edit | **Medium** | No cache-busting in current asset paths | Include version number in storage paths: `v{version}/overlay.png` |
| R6 | **CORS not applied to production bucket** — already a known pre-launch blocker | **Medium** | `cors.json` missing production domain; PROJECT_CONTEXT.md line 515 | Apply CORS config to production bucket before feature ships |
| R7 | **Admin test render is client-side dummy** — admin may believe they're testing real print output | **Low** | `template/page.tsx` lines 270–296: creates fake canvas, not real render | Wire button to existing server-side `test-render` route |
| R8 | **No slot rotation field** — rotated/angled photo slots cannot be represented | **Medium** | `printableRects` has no `rotation` field | Add optional `rotation: z.number().optional()` to slot schema; update render pipeline |
| R9 | **No background color/image field** — background hardcoded to white | **Low** | `render-print-file.ts` L26: `BACKGROUND = { r: 255, g: 255, b: 255, alpha: 1 }` | Add `backgroundColor` field to schema; parameterize in render function |
| R10 | **Sample image DPI warnings** — low-res samples trigger red DPI badges in editor | **Low** | `validateSlotsComplete` checks DPI for every slot | Skip DPI validation for sample-filled (demo) slots |

---

## 17. Open Questions for the Product Owner

| # | Question | Impact | Options |
|---|---|---|---|
| Q1 | **Is the frame border (black, wood, gold) a physical product or printed artwork?** | Determines what goes in the print overlay | A) Physical — print only mat/gutters/photos. B) Printed — include border in print file. |
| Q2 | **Is the mat a physical cut mat or printed?** | Same as above | A) Physical. B) Printed. C) Both options available per product. |
| Q3 | **What frame styles must be supported at launch?** | Scopes Phase 1 detection | Recommend: solid borders, solid mats, rectangular slots only at launch. |
| Q4 | **Where do texture assets (wood grain, metallic) come from?** | Asset pipeline design | A) Admin uploads them. B) Preset library provided. C) Not at launch. |
| Q5 | **Can sample photos be sourced from the uploaded frame image?** | Licensing concern | The baked-in photos in a frame mockup may be stock photos with licensing restrictions. |
| Q6 | **Should detection be automatic or always admin-initiated?** | UX flow design | Recommend: admin-initiated with "Detect Slots" button, not auto-triggered on upload. |
| Q7 | **What happens when a customer sees sample images but tries to order without replacing them?** | Demo state UX | Recommend: sample slots shown as "placeholder" with clear visual indicator; Add to Cart blocked. |
| Q8 | **Should the system support frame images in JPEG (no alpha)?** | Detection strategy | Recommend: accept both, but strongly recommend PNG for best results. |
| Q9 | **How many frame styles are expected at launch?** | Effort estimation | 10–20 frames → manual/assisted; 100+ → automation is critical. |
| Q10 | **Do variants of the same product (different sizes) always have the same slot layout?** | Template reuse | If yes, detect once and scale to variants. If no, detect per variant. |

---

## 18. Suggested Implementation Order

| Phase | Step | Dependencies | Effort | Description |
|---|---|---|---|---|
| **Phase 0** | Product owner answers Q1–Q4 | None | — | Critical design decisions |
| **Phase 1** | **A1–A3:** Schema extension | None | **S** | Add optional fields to FrameTemplateSchema |
| **Phase 1** | **F1–F2:** Storage rules + CORS | None | **S** | New storage paths, production domain |
| **Phase 2** | **B1:** Alpha-window detection | A | **M** | Tier 1 detection (transparent PNGs) |
| **Phase 2** | **B3:** Sample photo extraction | A | **M** | Crop baked-in photos from source image |
| **Phase 2** | **B4:** Cloud Run endpoints | B1, B3 | **M** | `/detect` and `/crop-samples` endpoints |
| **Phase 3** | **B2:** Overlay generation (basic) | A | **L** | Transparent windows on solid background |
| **Phase 3** | **D1–D3:** Print pipeline update | A, B2 | **M** | Separate print overlay from preview mockup |
| **Phase 4** | **C1–C5:** Admin UI | B1–B4 | **L** | Frame upload, detection review, slot editor |
| **Phase 5** | **E1–E4:** Storefront demo state | A | **M** | Sample images in editor, validation updates |
| **Phase 5** | **B1 expansion:** Gutter-color detection | B1 | **L** | Tier 2 detection for opaque frames |
| **Phase 6** | **G1–G5:** Test suite | All | **L** | Fixture images, detection tests, integration tests |
| **Phase 7** | Texture/gradient support | B2 | **L** | Advanced overlay generation with textures |
| **Phase 7** | Non-rectangular mask generation | B2 | **M** | Rounded corners, circles from detected shapes |

**Total estimated effort:** 8–12 weeks with 1 engineer, assuming product decisions are made upfront.

---

## 19. Conflicts with Existing Documentation

From `docs/PRODUCTION_READINESS_AND_TEMPLATE_SPEC.md`:

1. **Spec schema vs actual schema mismatch:** The spec doc (§4.3, lines 320–428) describes a richer schema (`physicalWidthMm`, `physicalHeightMm`, `printResolutionDpi`, `matColor`, `name`, `description`, `createdBy`, `createdAt`, per-slot `rotation`, `zIndex`, `maskPath`, per-text-zone `verticalAlign`, `letterSpacingEm`, `lineHeight`, `fontSizePt`) that was **never implemented** in the actual `FrameTemplateSchema`. The actual schema is simpler. This is not a conflict per se, but the spec should be updated to reflect reality before adding auto-detect features on top.

2. **Layer order in spec vs code:** The spec describes 7 layers (Background → Photos → Matboard Cutouts → Typography → Clipart → Frame Moulding → Glass Reflection). The actual code has 5 layers (Background → Photos → Mockup → Overlay → Clipart). Typography is deliberately NOT rendered server-side (noted in `render-print-file.ts` L34–39).

3. **Text rendering gap:** The spec describes an SVG-based server-side text engine (§4.5). The code explicitly defers this: "custom Google Font delivery to sharp/librsvg needs verification against a real Linux deployment target" (L35–38). This gap is relevant to overlay generation if we want to render text in overlays.

None of these conflicts **block** the auto-detect feature, but the spec doc should be updated alongside implementation.
