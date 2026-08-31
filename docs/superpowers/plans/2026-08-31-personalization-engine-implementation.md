# Personalization Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 3 personalization engine for BroPics — server-mediated photo upload, a Konva-based crop/zoom/rotate editor with live DPI feedback, and its integration into the buy box and cart — replacing the Storefront phase's "coming soon" placeholder modal.

**Architecture:** New `Upload` and `FrameTemplate` schemas (both named in the original Foundation data model, never built), plus extensions to `CustomizationSchema` (`sessionId`, `personalizationId`, a constrained `rotationDeg`). Storage is deny-all and there's no auth yet, so every upload and every read of `uploads`/`customizations`/`frameTemplates` goes through Next.js server routes using the Admin SDK — no Firestore/Storage rules changes needed. An anonymous `localStorage` session ID scopes ownership until Phase 4 adds real accounts. The editor is a lazily-loaded, client-only Konva canvas; all its non-rendering logic (DPI math, coordinate conversion, slot-completion validation) is extracted into pure, unit-tested functions, since canvas rendering itself can't be tested in this environment.

**Tech Stack:** Next.js App Router (Route Handlers for server-mediated upload/read), Firebase Admin SDK (Firestore + Storage), `sharp` (server-side image dimension probing + EXIF stripping), Konva.js + `react-konva` (client-only canvas editor), zod, Vitest + Testing Library.

## Global Constraints

- All monetary values are integer paise. Never floats. (Unaffected by this phase, restated for completeness.)
- Every schema/API boundary validates input with zod.
- TypeScript strict mode everywhere; no `any` in `packages/shared` exports.
- Package manager is pnpm.
- Mobile-first: every new component is designed at 375px width first, then expanded to `md`/`lg` breakpoints.
- Design tokens are the only colors/fonts/radii used in new components: `cream` `#FAF6F0`, `charcoal` `#2A2622`, `terracotta` `#C1592A`, `sage` `#7C8B6F`, `surface` `#FFFFFF`; `font-display`/`font-sans`; `rounded-lg`/`rounded-full` radii only — no bare `rounded` or off-palette colors (a real finding in a prior phase's review).
- `widthPx`/`heightPx` on an `Upload` are ALWAYS server-probed from the actual file bytes — never trusted from client-reported values, at any point in this plan.
- Rotation is constrained to `0 | 90 | 180 | 270` degrees — never a free float — both in the schema type and in the editor's UI.
- Storage is full-deny (`storage.rules`: `allow read, write: if false` on every path) and `firestore.rules` for `uploads`/`customizations`/`frameTemplates` stays exactly as it is today (server-only writes; `frameTemplates` already public-read, `uploads`/`customizations` already owner-or-staff-read via `isOwner`/`isStaffOrAdmin`, neither of which resolves for an anonymous session) — this plan makes NO changes to `firestore.rules` or `storage.rules`. All reads/writes of these three collections happen through server routes using the Admin SDK, which bypasses rules entirely.
- Firebase reads in Server Components / Route Handlers use the Admin SDK (`getAdminApp()` from `apps/web/lib/firebase-admin.ts`), the existing established pattern.
- Placeholder mockup images are PNG, not SVG (a flat vector outline would misrepresent a photographic mockup's compositing) — and are written fresh for this phase, never copied from Ritwikas/Picloopz/Parul Packaging/Yazhli Collection (BroPics' standing content-cloning boundary).
- No server-side print-file rendering in this plan — `Customization.renderStatus` stays `'pending'` throughout; the `services/print-render` Cloud Run skeleton is untouched.
- No text personalization in this plan — `Customization.textFieldsJson` stays present in the schema (forward-compat) but unused by any code this plan writes.

---

## File Structure

```
packages/shared/src/
├── schemas/
│   ├── upload.ts                    [Task 2 - new]
│   ├── frame-template.ts            [Task 2 - new]
│   └── customization.ts             [Task 2 - modified: sessionId, personalizationId, rotationDeg]
├── dpi/
│   └── calculate.ts                 [Task 2 - modified: + effectiveDpiFromCropRect()]
└── index.ts                         [Task 2 - modified: new exports]

apps/web/lib/
├── firebase-admin.ts                [Task 3 - read only, no change]
├── image-probe.ts                   [Task 3 - new: sharp-based dimension probe + EXIF strip]
├── session-id.ts                    [Task 6 - new: localStorage session ID helper]
├── editor-geometry.ts               [Task 6 - new: mockup-fraction <-> canvas-pixel conversion]
└── editor-validation.ts             [Task 6 - new: slot-completion validation]

apps/web/app/api/
├── uploads/
│   ├── route.ts                     [Task 3 - new: POST /api/uploads]
│   └── preview/route.ts             [Task 4 - new: POST /api/uploads/preview]
├── frame-templates/[variantId]/
│   └── route.ts                     [Task 4 - new: GET /api/frame-templates/:variantId]
└── customizations/
    └── route.ts                     [Task 4 - new: POST /api/customizations]

apps/web/components/editor/
├── PersonalizationEditor.tsx        [Task 7 - new: lazy-loaded orchestrator, holds per-slot state]
├── EditorCanvas.tsx                 [Task 7 - new: Konva Stage/Layer, drag/zoom/rotate]
├── SlotPicker.tsx                   [Task 7 - new: thumbnail strip, slot navigation]
└── DpiBadge.tsx                     [Task 7 - new: green/amber/red indicator]

scripts/seed/src/
├── generate-mockups.ts              [Task 5 - new: one-off script, sharp-rendered placeholder PNGs]
└── data.ts                          [Task 5 - modified: seedFrameTemplates]
scripts/seed/src/data.test.ts        [Task 5 - modified: new assertions]
apps/web/public/placeholders/mockups/  [Task 5 - new: generated placeholder PNGs, committed]

apps/web/lib/cart-context.tsx        [Task 8 - modified: CartItem.personalizationId, merge key]
apps/web/components/product/BuyBox.tsx  [Task 8 - modified: opens PersonalizationEditor]
apps/web/components/product/PersonalizeComingSoonModal.tsx  [Task 8 - deleted]
```

---

### Task 1: Add a `typecheck` script across the monorepo

**Files:**
- Modify: `package.json` (root)
- Modify: `packages/shared/package.json`
- Modify: `apps/web/package.json`
- Modify: `functions/package.json`
- Modify: `scripts/seed/package.json`
- Modify: `services/print-render/package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `pnpm typecheck` (root) runs `tsc --noEmit` in every package that has one. No later task in this plan depends on this existing, but every later task SHOULD run it as part of its own verification, since a prior phase's final review found real type errors that 55 passing tests never caught (Vitest strips types via esbuild).

- [ ] **Step 1: Add a `typecheck` script to each package**

In `packages/shared/package.json`, `apps/web/package.json`, `functions/package.json`, `scripts/seed/package.json`, and `services/print-render/package.json`, add to the `"scripts"` object:

```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 2: Add the root delegating script**

In the root `package.json`, add to `"scripts"`, alongside the existing `"lint"` line:

```json
"typecheck": "pnpm -r --if-present typecheck"
```

- [ ] **Step 3: Run it and confirm a clean baseline**

Run: `pnpm typecheck` (from the repo root)
Expected: every package reports zero errors — this is the pre-existing, already-passing state; this task only wires up the command, it doesn't fix anything (there is nothing to fix yet).

- [ ] **Step 4: Commit**

```bash
git add package.json packages/shared/package.json apps/web/package.json functions/package.json scripts/seed/package.json services/print-render/package.json
git commit -m "chore: add typecheck script across the monorepo"
```

---

### Task 2: `Upload`, `FrameTemplate` schemas; `Customization` extensions; `effectiveDpiFromCropRect()`

**Files:**
- Create: `packages/shared/src/schemas/upload.ts`
- Test: `packages/shared/src/schemas/upload.test.ts`
- Create: `packages/shared/src/schemas/frame-template.ts`
- Test: `packages/shared/src/schemas/frame-template.test.ts`
- Modify: `packages/shared/src/schemas/customization.ts`
- Create: `packages/shared/src/schemas/customization.test.ts` (no test file exists for this schema yet)
- Modify: `packages/shared/src/dpi/calculate.ts`
- Modify: `packages/shared/src/dpi/calculate.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: nothing beyond `zod` and the existing `calculateEffectiveDpi`/`DpiResult` in `calculate.ts`.
- Produces: `UploadSchema`, `Upload`; `FrameTemplateSchema`, `FrameTemplate`; updated `CustomizationSchema`/`Customization` (with `sessionId: string`, `personalizationId: string`, `transformJson.rotationDeg: 0 | 90 | 180 | 270`); `effectiveDpiFromCropRect(uploadWidthPx: number, uploadHeightPx: number, cropRect: {width: number; height: number}, printWidthIn: number, printHeightIn: number): DpiResult` — all exported from `@bro-pics/shared`. Tasks 3-8 depend on these exact names/shapes.

- [ ] **Step 1: Write the failing test for `UploadSchema`**

```ts
// packages/shared/src/schemas/upload.test.ts
import { describe, it, expect } from 'vitest';
import { UploadSchema } from './upload';

const validUpload = {
  id: 'up_1',
  sessionId: 'sess_abc123',
  originalUrl: 'https://storage.example.com/uploads/sess_abc123/up_1/original.jpg',
  widthPx: 2400,
  heightPx: 3600,
  mime: 'image/jpeg',
  bytes: 1_048_576,
  exifStripped: true,
  status: 'ready' as const,
};

describe('UploadSchema', () => {
  it('accepts a valid ready upload', () => {
    expect(UploadSchema.parse(validUpload)).toEqual(validUpload);
  });

  it('accepts a rejected upload', () => {
    const rejected = { ...validUpload, status: 'rejected' as const };
    expect(UploadSchema.parse(rejected)).toEqual(rejected);
  });

  it('rejects an unknown status', () => {
    const invalid = { ...validUpload, status: 'pending' };
    expect(() => UploadSchema.parse(invalid)).toThrow();
  });

  it('rejects a non-positive widthPx', () => {
    const invalid = { ...validUpload, widthPx: 0 };
    expect(() => UploadSchema.parse(invalid)).toThrow();
  });

  it('rejects a negative bytes value', () => {
    const invalid = { ...validUpload, bytes: -1 };
    expect(() => UploadSchema.parse(invalid)).toThrow();
  });

  it('rejects an empty sessionId', () => {
    const invalid = { ...validUpload, sessionId: '' };
    expect(() => UploadSchema.parse(invalid)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/shared test -- upload.test`
Expected: FAIL — `Cannot find module './upload'`

- [ ] **Step 3: Implement `UploadSchema`**

```ts
// packages/shared/src/schemas/upload.ts
import { z } from 'zod';

export const UploadSchema = z.object({
  id: z.string(),
  sessionId: z.string().min(1),
  originalUrl: z.string().min(1),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  mime: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  exifStripped: z.boolean(),
  status: z.enum(['ready', 'rejected']),
});

export type Upload = z.infer<typeof UploadSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/shared test -- upload.test`
Expected: PASS (6 tests)

- [ ] **Step 5: Write the failing test for `FrameTemplateSchema`**

```ts
// packages/shared/src/schemas/frame-template.test.ts
import { describe, it, expect } from 'vitest';
import { FrameTemplateSchema } from './frame-template';

const validTemplate = {
  id: 'ft_1',
  variantId: 'var_classic_wooden_frame_8x12_black',
  mockupUrl: '/placeholders/mockups/classic-wooden-frame.png',
  maskUrl: null,
  overlayUrl: null,
  printableRects: [{ slotIndex: 0, x: 0.1, y: 0.1, width: 0.8, height: 0.8 }],
  bleedMm: 2,
  matInset: 0,
};

describe('FrameTemplateSchema', () => {
  it('accepts a valid single-slot template', () => {
    expect(FrameTemplateSchema.parse(validTemplate)).toEqual(validTemplate);
  });

  it('accepts a multi-slot template with several printableRects', () => {
    const multiSlot = {
      ...validTemplate,
      id: 'ft_2',
      printableRects: [
        { slotIndex: 0, x: 0.05, y: 0.05, width: 0.4, height: 0.4 },
        { slotIndex: 1, x: 0.55, y: 0.05, width: 0.4, height: 0.4 },
      ],
    };
    expect(FrameTemplateSchema.parse(multiSlot)).toEqual(multiSlot);
  });

  it('accepts a template with maskUrl/overlayUrl set', () => {
    const withMask = { ...validTemplate, id: 'ft_3', maskUrl: '/mask.png', overlayUrl: '/overlay.png' };
    expect(FrameTemplateSchema.parse(withMask)).toEqual(withMask);
  });

  it('rejects an empty printableRects array', () => {
    const invalid = { ...validTemplate, printableRects: [] };
    expect(() => FrameTemplateSchema.parse(invalid)).toThrow();
  });

  it('rejects a rect fraction greater than 1', () => {
    const invalid = { ...validTemplate, printableRects: [{ slotIndex: 0, x: 0, y: 0, width: 1.5, height: 0.5 }] };
    expect(() => FrameTemplateSchema.parse(invalid)).toThrow();
  });

  it('rejects a negative slotIndex', () => {
    const invalid = { ...validTemplate, printableRects: [{ slotIndex: -1, x: 0, y: 0, width: 0.5, height: 0.5 }] };
    expect(() => FrameTemplateSchema.parse(invalid)).toThrow();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/shared test -- frame-template.test`
Expected: FAIL — `Cannot find module './frame-template'`

- [ ] **Step 7: Implement `FrameTemplateSchema`**

```ts
// packages/shared/src/schemas/frame-template.ts
import { z } from 'zod';

const fraction = z.number().min(0).max(1);

export const FrameTemplateSchema = z.object({
  id: z.string(),
  variantId: z.string(),
  mockupUrl: z.string().min(1),
  maskUrl: z.string().nullable(),
  overlayUrl: z.string().nullable(),
  printableRects: z
    .array(
      z.object({
        slotIndex: z.number().int().nonnegative(),
        x: fraction,
        y: fraction,
        width: fraction,
        height: fraction,
      })
    )
    .min(1),
  bleedMm: z.number().nonnegative(),
  matInset: z.number().nonnegative(),
});

export type FrameTemplate = z.infer<typeof FrameTemplateSchema>;
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/shared test -- frame-template.test`
Expected: PASS (6 tests)

- [ ] **Step 9: Write the failing test for the extended `CustomizationSchema`**

No test file exists for this schema yet — create one covering both the pre-existing shape and the new fields:

```ts
// packages/shared/src/schemas/customization.test.ts
import { describe, it, expect } from 'vitest';
import { CustomizationSchema } from './customization';

const validCustomization = {
  id: 'cust_1',
  sessionId: 'sess_abc123',
  personalizationId: 'pers_xyz789',
  uploadId: 'up_1',
  variantId: 'var_classic_wooden_frame_8x12_black',
  slotIndex: 0,
  transformJson: {
    scale: 1.2,
    offsetX: 10,
    offsetY: -5,
    rotationDeg: 90 as const,
    cropRect: { x: 0, y: 0, width: 1200, height: 1800 },
  },
  textFieldsJson: undefined,
  effectiveDpi: 280,
  previewUrl: undefined,
  renderStatus: 'pending' as const,
};

describe('CustomizationSchema', () => {
  it('accepts a valid customization', () => {
    expect(CustomizationSchema.parse(validCustomization)).toEqual(validCustomization);
  });

  it('accepts each valid rotationDeg value', () => {
    for (const rotationDeg of [0, 90, 180, 270] as const) {
      const withRotation = { ...validCustomization, transformJson: { ...validCustomization.transformJson, rotationDeg } };
      expect(() => CustomizationSchema.parse(withRotation)).not.toThrow();
    }
  });

  it('rejects a rotationDeg outside the 90-degree-snap set', () => {
    const invalid = { ...validCustomization, transformJson: { ...validCustomization.transformJson, rotationDeg: 45 } };
    expect(() => CustomizationSchema.parse(invalid)).toThrow();
  });

  it('rejects a missing sessionId', () => {
    const { sessionId, ...withoutSessionId } = validCustomization;
    expect(() => CustomizationSchema.parse(withoutSessionId)).toThrow();
  });

  it('rejects a missing personalizationId', () => {
    const { personalizationId, ...withoutPersonalizationId } = validCustomization;
    expect(() => CustomizationSchema.parse(withoutPersonalizationId)).toThrow();
  });

  it('accepts an optional textFieldsJson when present', () => {
    const withText = { ...validCustomization, textFieldsJson: { name: 'Happy Birthday' } };
    expect(CustomizationSchema.parse(withText)).toEqual(withText);
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/shared test -- customization.test`
Expected: FAIL — current schema has no `sessionId`/`personalizationId`, and `rotationDeg` doesn't exist yet (current field is presumably absent or typed as a free number)

- [ ] **Step 11: Update `CustomizationSchema`**

Replace the full contents of `packages/shared/src/schemas/customization.ts`:

```ts
// packages/shared/src/schemas/customization.ts
import { z } from 'zod';

export const CustomizationSchema = z.object({
  id: z.string(),
  sessionId: z.string().min(1),
  personalizationId: z.string().min(1),
  uploadId: z.string(),
  variantId: z.string(),
  slotIndex: z.number().int().nonnegative(),
  transformJson: z.object({
    scale: z.number().positive(),
    offsetX: z.number(),
    offsetY: z.number(),
    rotationDeg: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    cropRect: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }),
  }),
  textFieldsJson: z.record(z.string(), z.string()).optional(),
  effectiveDpi: z.number().nonnegative(),
  previewUrl: z.string().optional(),
  renderStatus: z.enum(['pending', 'rendering', 'done', 'failed']),
});

export type Customization = z.infer<typeof CustomizationSchema>;
```

Note: `printFileUrl` is intentionally removed — no server-side print rendering happens in this plan.

- [ ] **Step 12: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/shared test -- customization.test`
Expected: PASS (6 tests)

- [ ] **Step 13: Write the failing test for `effectiveDpiFromCropRect`**

Add to `packages/shared/src/dpi/calculate.test.ts`:

```ts
// add to packages/shared/src/dpi/calculate.test.ts
import { effectiveDpiFromCropRect } from './calculate';

describe('effectiveDpiFromCropRect', () => {
  it('matches calculateEffectiveDpi when the crop rect uses the full upload (no zoom)', () => {
    // Same reference case as calculateEffectiveDpi's own full-resolution test.
    const result = effectiveDpiFromCropRect(2400, 3600, { width: 2400, height: 3600 }, 8, 12);
    expect(result.effectiveDpi).toBeCloseTo(300, 0);
    expect(result.tier).toBe('green');
  });

  it('lowers effective dpi when the crop rect is smaller than the full upload (zoomed in)', () => {
    // Cropping to half the width/height is equivalent to a 2x zoom.
    const result = effectiveDpiFromCropRect(2400, 3600, { width: 1200, height: 1800 }, 8, 12);
    expect(result.effectiveDpi).toBeCloseTo(150, 0);
    expect(result.tier).toBe('amber');
  });

  it('uses the tighter of width/height ratio when the crop rect is not proportional to the upload', () => {
    // Crop width uses half the pixels (2x effective zoom on width), crop height uses
    // all the pixels (1x on height) — the tighter (higher) zoom factor must win,
    // since that's the dimension actually constraining print quality.
    const result = effectiveDpiFromCropRect(2400, 3600, { width: 1200, height: 3600 }, 8, 12);
    expect(result.effectiveDpi).toBeCloseTo(150, 0);
  });

  it('flags a low-resolution upload as red even with no crop', () => {
    const result = effectiveDpiFromCropRect(800, 1200, { width: 800, height: 1200 }, 8, 12);
    expect(result.tier).toBe('red');
  });
});
```

- [ ] **Step 14: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/shared test -- calculate.test`
Expected: FAIL — `effectiveDpiFromCropRect is not a function` (existing `calculateEffectiveDpi`/`dpiTier` tests still pass)

- [ ] **Step 15: Implement `effectiveDpiFromCropRect`**

Add to `packages/shared/src/dpi/calculate.ts`, after the existing `calculateEffectiveDpi` function:

```ts
/**
 * DPI from an editor crop rectangle rather than a single zoom factor.
 * cropRect is in the upload's own original pixel space. The tighter
 * (larger) of the width/height zoom ratios wins, since that's the
 * dimension actually constraining print quality when the crop isn't
 * proportional to the upload's aspect ratio. Delegates to the existing,
 * already-tested calculateEffectiveDpi rather than duplicating its math.
 */
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

- [ ] **Step 16: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/shared test -- calculate.test`
Expected: PASS (all `dpiTier`/`calculateEffectiveDpi`/`effectiveDpiFromCropRect` tests)

- [ ] **Step 17: Export the new schemas from the package root**

In `packages/shared/src/index.ts`, add after the existing `export * from './schemas/review';` (or wherever schema exports are grouped):

```ts
export * from './schemas/upload';
export * from './schemas/frame-template';
```

(`customization` and `dpi/calculate` are already exported — no new export lines needed for those, since the modifications are to existing files.)

- [ ] **Step 18: Run the full shared package suite and typecheck**

Run: `pnpm --filter @bro-pics/shared test && pnpm --filter @bro-pics/shared typecheck`
Expected: PASS, zero type errors

- [ ] **Step 19: Commit**

```bash
git add packages/shared/src/schemas/upload.ts packages/shared/src/schemas/upload.test.ts packages/shared/src/schemas/frame-template.ts packages/shared/src/schemas/frame-template.test.ts packages/shared/src/schemas/customization.ts packages/shared/src/schemas/customization.test.ts packages/shared/src/dpi/calculate.ts packages/shared/src/dpi/calculate.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add Upload/FrameTemplate schemas, extend Customization, add effectiveDpiFromCropRect"
```

---

### Task 3: Image probing helper + `POST /api/uploads`

**Files:**
- Create: `apps/web/lib/image-probe.ts`
- Test: `apps/web/lib/image-probe.test.ts`
- Create: `apps/web/__fixtures__/small-photo.jpg` (a real, small JPEG checked into the repo — see Step 1)
- Create: `apps/web/__fixtures__/tiny-photo.jpg` (a real, smaller JPEG, deliberately under a typical `minUploadPx` threshold)
- Create: `apps/web/app/api/uploads/route.ts`
- Test: `apps/web/app/api/uploads/route.test.ts`
- Modify: `apps/web/package.json` (add `sharp` dependency)

**Interfaces:**
- Consumes: `getAdminApp()` from `apps/web/lib/firebase-admin.ts` (existing); `UploadSchema`/`Upload` from `@bro-pics/shared` (Task 2).
- Produces: `probeAndStripImage(buffer: Buffer): Promise<{ widthPx: number; heightPx: number; mime: string; strippedBuffer: Buffer }>` (pure-ish helper, no Firestore/Storage I/O, easy to test against real fixture files); the live `POST /api/uploads` route. Task 6/7 (the editor) call this route by URL, not by importing anything from it directly.

- [ ] **Step 1: Add two small real JPEG fixtures**

Add two real JPEG files to `apps/web/__fixtures__/`:
- `small-photo.jpg` — any real photo at least 2400x3600px (or similar 2:3 ratio at print-quality resolution). If you don't have one handy, generate it with `sharp` in a one-off Node script: `sharp({ create: { width: 2400, height: 3600, channels: 3, background: { r: 200, g: 180, b: 160 } } }).jpeg().toFile('apps/web/__fixtures__/small-photo.jpg')`.
- `tiny-photo.jpg` — a real JPEG at 300x450px (deliberately low-resolution), generated the same way with `width: 300, height: 450`.

These are binary test fixtures, not placeholder catalog assets — they exist purely to exercise real dimension-probing/EXIF-stripping logic against real files, per this plan's testing approach (no mocking of `sharp` itself).

- [ ] **Step 2: Add the `sharp` dependency**

In `apps/web/package.json`, add to `"dependencies"`:

```json
"sharp": "^0.33.0"
```

Run: `pnpm install`

- [ ] **Step 3: Write the failing test for `probeAndStripImage`**

```ts
// apps/web/lib/image-probe.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { probeAndStripImage } from './image-probe';

const fixturesDir = join(__dirname, '..', '__fixtures__');

describe('probeAndStripImage', () => {
  it('probes the real dimensions of a print-quality JPEG', async () => {
    const buffer = readFileSync(join(fixturesDir, 'small-photo.jpg'));
    const result = await probeAndStripImage(buffer);
    expect(result.widthPx).toBe(2400);
    expect(result.heightPx).toBe(3600);
    expect(result.mime).toBe('image/jpeg');
  });

  it('probes the real dimensions of a low-resolution JPEG', async () => {
    const buffer = readFileSync(join(fixturesDir, 'tiny-photo.jpg'));
    const result = await probeAndStripImage(buffer);
    expect(result.widthPx).toBe(300);
    expect(result.heightPx).toBe(450);
  });

  it('returns a stripped buffer that is still a valid, decodable image', async () => {
    const buffer = readFileSync(join(fixturesDir, 'small-photo.jpg'));
    const result = await probeAndStripImage(buffer);
    // Re-probing the stripped output must succeed and report the same dimensions —
    // proves the strip step didn't corrupt the image.
    const reprobe = await probeAndStripImage(result.strippedBuffer);
    expect(reprobe.widthPx).toBe(2400);
    expect(reprobe.heightPx).toBe(3600);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- image-probe`
Expected: FAIL — `Cannot find module './image-probe'`

- [ ] **Step 5: Implement `probeAndStripImage`**

```ts
// apps/web/lib/image-probe.ts
import sharp from 'sharp';

export interface ProbedImage {
  widthPx: number;
  heightPx: number;
  mime: string;
  strippedBuffer: Buffer;
}

const FORMAT_TO_MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Probes real image dimensions from the actual bytes (never trust a
 * client-reported width/height) and re-encodes through sharp, which
 * strips EXIF/metadata by default on re-encode.
 */
export async function probeAndStripImage(buffer: Buffer): Promise<ProbedImage> {
  const image = sharp(buffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new Error('Unable to read image dimensions or format');
  }

  const mime = FORMAT_TO_MIME[metadata.format];
  if (!mime) {
    throw new Error(`Unsupported image format: ${metadata.format}`);
  }

  const strippedBuffer = await image.toFormat(metadata.format as 'jpeg' | 'png' | 'webp').toBuffer();

  return {
    widthPx: metadata.width,
    heightPx: metadata.height,
    mime,
    strippedBuffer,
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- image-probe`
Expected: PASS (3 tests)

- [ ] **Step 7: Write the failing test for the upload route**

```ts
// apps/web/app/api/uploads/route.test.ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mockSet = vi.fn().mockResolvedValue(undefined);
const mockSave = vi.fn().mockResolvedValue(undefined);
const mockGetSignedUrl = vi.fn().mockResolvedValue(['https://signed.example.com/original.jpg']);

vi.mock('../../../lib/firebase-admin', () => ({
  getAdminApp: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({ id: 'up_test123', set: mockSet }),
    }),
  }),
}));

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      file: () => ({ save: mockSave, getSignedUrl: mockGetSignedUrl }),
    }),
  }),
}));

import { POST } from './route';

const fixturesDir = join(__dirname, '..', '..', '..', '__fixtures__');

function makeRequest(fileBuffer: Buffer, sessionId: string, minUploadPx: number): Request {
  const formData = new FormData();
  formData.append('file', new Blob([fileBuffer], { type: 'image/jpeg' }), 'photo.jpg');
  formData.append('minUploadPx', String(minUploadPx));
  return new Request('http://localhost/api/uploads', {
    method: 'POST',
    headers: { 'X-Session-Id': sessionId },
    body: formData,
  });
}

describe('POST /api/uploads', () => {
  it('accepts a print-quality photo and returns a ready upload', async () => {
    const buffer = readFileSync(join(fixturesDir, 'small-photo.jpg'));
    const response = await POST(makeRequest(buffer, 'sess_test', 2400));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ready');
    expect(body.widthPx).toBe(2400);
    expect(body.heightPx).toBe(3600);
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready', sessionId: 'sess_test' }));
  });

  it('rejects a photo below the variant minUploadPx', async () => {
    const buffer = readFileSync(join(fixturesDir, 'tiny-photo.jpg'));
    const response = await POST(makeRequest(buffer, 'sess_test', 2400));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.status).toBe('rejected');
  });

  it('requires a session ID header', async () => {
    const buffer = readFileSync(join(fixturesDir, 'small-photo.jpg'));
    const request = new Request('http://localhost/api/uploads', {
      method: 'POST',
      body: (() => {
        const fd = new FormData();
        fd.append('file', new Blob([buffer], { type: 'image/jpeg' }), 'photo.jpg');
        fd.append('minUploadPx', '2400');
        return fd;
      })(),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- api/uploads/route`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 9: Implement the upload route**

```ts
// apps/web/app/api/uploads/route.ts
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from '../../../lib/firebase-admin';
import { probeAndStripImage } from '../../../lib/image-probe';
import { UploadSchema, type Upload } from '@bro-pics/shared';

export async function POST(request: Request): Promise<NextResponse> {
  const sessionId = request.headers.get('X-Session-Id');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing X-Session-Id header' }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const minUploadPxRaw = formData.get('minUploadPx');
  if (!(file instanceof Blob) || typeof minUploadPxRaw !== 'string') {
    return NextResponse.json({ error: 'Missing file or minUploadPx' }, { status: 400 });
  }
  const minUploadPx = Number(minUploadPxRaw);

  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const probed = await probeAndStripImage(inputBuffer);

  const app = getAdminApp();
  const db = getFirestore(app);
  const uploadRef = db.collection('uploads').doc();
  const uploadId = uploadRef.id;

  if (probed.widthPx < minUploadPx || probed.heightPx < minUploadPx) {
    const rejected: Upload = {
      id: uploadId,
      sessionId,
      originalUrl: '',
      widthPx: probed.widthPx,
      heightPx: probed.heightPx,
      mime: probed.mime,
      bytes: probed.strippedBuffer.byteLength,
      exifStripped: true,
      status: 'rejected',
    };
    await uploadRef.set(UploadSchema.parse(rejected));
    return NextResponse.json(rejected, { status: 422 });
  }

  const bucket = getStorage(app).bucket();
  const storagePath = `uploads/${sessionId}/${uploadId}/original.jpg`;
  const storageFile = bucket.file(storagePath);
  await storageFile.save(probed.strippedBuffer, { contentType: probed.mime });
  const [signedUrl] = await storageFile.getSignedUrl({ action: 'read', expires: Date.now() + 1000 * 60 * 60 });

  const ready: Upload = {
    id: uploadId,
    sessionId,
    originalUrl: signedUrl,
    widthPx: probed.widthPx,
    heightPx: probed.heightPx,
    mime: probed.mime,
    bytes: probed.strippedBuffer.byteLength,
    exifStripped: true,
    status: 'ready',
  };
  await uploadRef.set(UploadSchema.parse(ready));

  return NextResponse.json(ready, { status: 200 });
}
```

Note: `uploadRef.id` (Firestore's own auto-generated document ID) serves as the upload's ID — no separate UUID generation needed in this route.

- [ ] **Step 10: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- api/uploads/route`
Expected: PASS (3 tests)

- [ ] **Step 11: Run the full web suite and typecheck**

Run: `pnpm --filter @bro-pics/web test && pnpm --filter @bro-pics/web typecheck`
Expected: PASS, zero type errors

- [ ] **Step 12: Commit**

```bash
git add apps/web/lib/image-probe.ts apps/web/lib/image-probe.test.ts apps/web/__fixtures__/small-photo.jpg apps/web/__fixtures__/tiny-photo.jpg apps/web/app/api/uploads/route.ts apps/web/app/api/uploads/route.test.ts apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add image probing helper and POST /api/uploads route"
```

---

### Task 4: `POST /api/uploads/preview`, `GET /api/frame-templates/:variantId`, `POST /api/customizations`

**Files:**
- Create: `apps/web/app/api/uploads/preview/route.ts`
- Test: `apps/web/app/api/uploads/preview/route.test.ts`
- Create: `apps/web/app/api/frame-templates/[variantId]/route.ts`
- Test: `apps/web/app/api/frame-templates/[variantId]/route.test.ts`
- Create: `apps/web/app/api/customizations/route.ts`
- Test: `apps/web/app/api/customizations/route.test.ts`

**Interfaces:**
- Consumes: `probeAndStripImage` (Task 3); `UploadSchema`, `FrameTemplateSchema`, `CustomizationSchema` (Task 2); `getAdminApp()` (existing).
- Produces: three live routes the editor (Task 7) calls by URL: `POST /api/uploads/preview` (body: `{ personalizationId, slotIndex, dataUrl }` JSON, returns `{ previewUrl }`), `GET /api/frame-templates/:variantId` (returns `FrameTemplate[]`), `POST /api/customizations` (body: a `Customization` minus `id`, returns the created `Customization` with its Firestore-assigned `id`).

- [ ] **Step 1: Write the failing test for the preview upload route**

```ts
// apps/web/app/api/uploads/preview/route.test.ts
import { describe, it, expect, vi } from 'vitest';

const mockSave = vi.fn().mockResolvedValue(undefined);
const mockGetSignedUrl = vi.fn().mockResolvedValue(['https://signed.example.com/preview.png']);

vi.mock('../../../../lib/firebase-admin', () => ({
  getAdminApp: vi.fn(),
}));

vi.mock('firebase-admin/storage', () => ({
  getStorage: () => ({
    bucket: () => ({
      file: () => ({ save: mockSave, getSignedUrl: mockGetSignedUrl }),
    }),
  }),
}));

import { POST } from './route';

describe('POST /api/uploads/preview', () => {
  it('decodes a data URL, stores it, and returns a signed preview URL', async () => {
    // 1x1 transparent PNG, base64-encoded — a real, valid (if tiny) PNG data URL.
    const tinyPngDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    const request = new Request('http://localhost/api/uploads/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Id': 'sess_test' },
      body: JSON.stringify({ personalizationId: 'pers_1', slotIndex: 0, dataUrl: tinyPngDataUrl }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.previewUrl).toBe('https://signed.example.com/preview.png');
    expect(mockSave).toHaveBeenCalled();
  });

  it('rejects a request missing dataUrl', async () => {
    const request = new Request('http://localhost/api/uploads/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Id': 'sess_test' },
      body: JSON.stringify({ personalizationId: 'pers_1', slotIndex: 0 }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- api/uploads/preview`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Implement the preview upload route**

```ts
// apps/web/app/api/uploads/preview/route.ts
import { NextResponse } from 'next/server';
import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from '../../../../lib/firebase-admin';

export async function POST(request: Request): Promise<NextResponse> {
  const sessionId = request.headers.get('X-Session-Id');
  if (!sessionId) {
    return NextResponse.json({ error: 'Missing X-Session-Id header' }, { status: 400 });
  }

  const body = await request.json();
  const { personalizationId, slotIndex, dataUrl } = body ?? {};
  if (typeof personalizationId !== 'string' || typeof slotIndex !== 'number' || typeof dataUrl !== 'string') {
    return NextResponse.json({ error: 'Missing personalizationId, slotIndex, or dataUrl' }, { status: 400 });
  }

  const match = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return NextResponse.json({ error: 'Invalid data URL' }, { status: 400 });
  }
  const [, contentType, base64Data] = match;
  const buffer = Buffer.from(base64Data, 'base64');

  const app = getAdminApp();
  const bucket = getStorage(app).bucket();
  const storagePath = `uploads/${sessionId}/previews/${personalizationId}/slot-${slotIndex}.png`;
  const storageFile = bucket.file(storagePath);
  await storageFile.save(buffer, { contentType });
  const [signedUrl] = await storageFile.getSignedUrl({ action: 'read', expires: Date.now() + 1000 * 60 * 60 });

  return NextResponse.json({ previewUrl: signedUrl }, { status: 200 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- api/uploads/preview`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing test for the frame-templates route**

```ts
// apps/web/app/api/frame-templates/[variantId]/route.test.ts
import { describe, it, expect, vi } from 'vitest';

const templateDoc = {
  id: 'ft_1',
  variantId: 'var_1',
  mockupUrl: '/mockup.png',
  maskUrl: null,
  overlayUrl: null,
  printableRects: [{ slotIndex: 0, x: 0.1, y: 0.1, width: 0.8, height: 0.8 }],
  bleedMm: 2,
  matInset: 0,
};

vi.mock('../../../../lib/firebase-admin', () => ({
  getAdminApp: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({
      where: () => ({
        get: () => Promise.resolve({ docs: [{ data: () => templateDoc }] }),
      }),
    }),
  }),
}));

import { GET } from './route';

describe('GET /api/frame-templates/:variantId', () => {
  it('returns the frame templates for a variant', async () => {
    const response = await GET(new Request('http://localhost/api/frame-templates/var_1'), {
      params: Promise.resolve({ variantId: 'var_1' }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual([templateDoc]);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- api/frame-templates`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 7: Implement the frame-templates route**

```ts
// apps/web/app/api/frame-templates/[variantId]/route.ts
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../../lib/firebase-admin';
import type { FrameTemplate } from '@bro-pics/shared';

interface RouteParams {
  params: Promise<{ variantId: string }>;
}

export async function GET(_request: Request, { params }: RouteParams): Promise<NextResponse> {
  const { variantId } = await params;
  const db = getFirestore(getAdminApp());
  const snapshot = await db.collectionGroup('frameTemplates').where('variantId', '==', variantId).get();
  const templates = snapshot.docs.map((doc) => doc.data() as FrameTemplate);
  return NextResponse.json(templates, { status: 200 });
}
```

Note: this uses `collectionGroup('frameTemplates')` since `frameTemplates` is a subcollection of `products/{id}`, not a top-level collection — querying across all products' frame-template subcollections by `variantId` requires a collection-group query. This needs a Firestore index; see Task 5's seed step, which adds it to `firestore.indexes.json`.

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- api/frame-templates`
Expected: PASS (1 test)

- [ ] **Step 9: Write the failing test for the customizations route**

```ts
// apps/web/app/api/customizations/route.test.ts
import { describe, it, expect, vi } from 'vitest';

const mockSet = vi.fn().mockResolvedValue(undefined);

vi.mock('../../../lib/firebase-admin', () => ({
  getAdminApp: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({ id: 'cust_test123', set: mockSet }),
    }),
  }),
}));

import { POST } from './route';

const validBody = {
  sessionId: 'sess_1',
  personalizationId: 'pers_1',
  uploadId: 'up_1',
  variantId: 'var_1',
  slotIndex: 0,
  transformJson: {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotationDeg: 0,
    cropRect: { x: 0, y: 0, width: 100, height: 100 },
  },
  effectiveDpi: 300,
  renderStatus: 'pending',
};

describe('POST /api/customizations', () => {
  it('creates a customization document and returns it with an id', async () => {
    const request = new Request('http://localhost/api/customizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe('cust_test123');
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ id: 'cust_test123', ...validBody }));
  });

  it('rejects a body that fails schema validation', async () => {
    const request = new Request('http://localhost/api/customizations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, transformJson: { ...validBody.transformJson, rotationDeg: 45 } }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- api/customizations`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 11: Implement the customizations route**

```ts
// apps/web/app/api/customizations/route.ts
import { NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAdminApp } from '../../../lib/firebase-admin';
import { CustomizationSchema } from '@bro-pics/shared';

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json();
  const db = getFirestore(getAdminApp());
  const docRef = db.collection('customizations').doc();

  const parsed = CustomizationSchema.safeParse({ ...body, id: docRef.id });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid customization payload', issues: parsed.error.issues }, { status: 400 });
  }

  await docRef.set(parsed.data);
  return NextResponse.json(parsed.data, { status: 200 });
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- api/customizations`
Expected: PASS (2 tests)

- [ ] **Step 13: Run the full web suite and typecheck**

Run: `pnpm --filter @bro-pics/web test && pnpm --filter @bro-pics/web typecheck`
Expected: PASS, zero type errors

- [ ] **Step 14: Commit**

```bash
git add apps/web/app/api/uploads/preview apps/web/app/api/frame-templates apps/web/app/api/customizations
git commit -m "feat(web): add preview upload, frame-template lookup, and customization routes"
```

---

### Task 5: Seed data — placeholder mockup PNGs and `FrameTemplate` docs

**Files:**
- Create: `scripts/seed/src/generate-mockups.ts`
- Modify: `scripts/seed/src/data.ts`
- Modify: `scripts/seed/src/data.test.ts`
- Modify: `firestore.indexes.json`
- Create: `apps/web/public/placeholders/mockups/*.png` (generated by the script, then committed)

**Interfaces:**
- Consumes: `FrameTemplateSchema`/`FrameTemplate` from `@bro-pics/shared` (Task 2); the existing `seedProducts`/`seedVariants` in `scripts/seed/src/data.ts`.
- Produces: `seedFrameTemplates: FrameTemplate[]`, exported from `data.ts`. No later task in this plan reads this directly (it's consumed by `data.test.ts` and by the not-yet-built Firestore seed writer, same as every other `seed*` export in this file), but this is where every variant gets a real, fetchable `FrameTemplate` for the editor to use.

- [ ] **Step 1: Write the one-off mockup-generation script**

```ts
// scripts/seed/src/generate-mockups.ts
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { seedProducts } from './data';

const OUTPUT_DIR = join(__dirname, '..', '..', '..', 'apps', 'web', 'public', 'placeholders', 'mockups');

/**
 * Generates one flat placeholder mockup PNG per product: a plain frame
 * outline (terracotta border on cream background) with a rectangular
 * cutout, sized 800x800. Not photoreal — just enough to prove the
 * upload/position/DPI/preview pipeline composites correctly. Real
 * photography-team mockups replace these files later without any code
 * change (only the seed data's mockupUrl values need updating).
 */
async function generateMockups(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const product of seedProducts) {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
        <rect width="800" height="800" fill="#FAF6F0"/>
        <rect x="20" y="20" width="760" height="760" fill="none" stroke="#C1592A" stroke-width="16"/>
        <rect x="100" y="100" width="600" height="600" fill="#2A2622" fill-opacity="0.06"/>
      </svg>
    `;
    const outputPath = join(OUTPUT_DIR, `${product.slug}.png`);
    await sharp(Buffer.from(svg)).png().toFile(outputPath);
    console.log(`Generated ${outputPath}`);
  }
}

generateMockups().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Add `sharp` to `scripts/seed`'s dependencies and run the generator**

In `scripts/seed/package.json`, add to `"dependencies"`:

```json
"sharp": "^0.33.0"
```

Run: `pnpm install`
Run: `pnpm --filter @bro-pics/seed exec tsx src/generate-mockups.ts`
Expected: one PNG per seed product written under `apps/web/public/placeholders/mockups/`, one console line per file.

- [ ] **Step 3: Write the failing test for `seedFrameTemplates`**

Add to `scripts/seed/src/data.test.ts`:

```ts
// scripts/seed/src/data.test.ts — add to imports:
import { FrameTemplateSchema } from '@bro-pics/shared';
// add to the destructured import from './data':
import { seedCategories, seedProducts, seedVariants, seedReviews, seedHomepageSections, seedProductMedia, seedFrameTemplates } from './data';

describe('seed frame templates', () => {
  it('every seed frame template passes FrameTemplateSchema validation', () => {
    for (const template of seedFrameTemplates) {
      expect(() => FrameTemplateSchema.parse(template)).not.toThrow();
    }
  });

  it('every active variant has exactly one frame template', () => {
    const activeVariantIds = seedVariants.filter((v) => v.isActive).map((v) => v.id);
    const templatedVariantIds = seedFrameTemplates.map((t) => t.variantId);
    for (const variantId of activeVariantIds) {
      expect(templatedVariantIds).toContain(variantId);
    }
  });

  it("every frame template's printableRects count matches its product's photoSlots", () => {
    const variantToProduct = new Map(seedVariants.map((v) => [v.id, v.productId]));
    const productBySlug = new Map(seedProducts.map((p) => [p.id, p]));
    for (const template of seedFrameTemplates) {
      const productId = variantToProduct.get(template.variantId);
      const product = productId ? productBySlug.get(productId) : undefined;
      expect(product).toBeDefined();
      expect(template.printableRects).toHaveLength(product!.photoSlots);
    }
  });

  it('every frame template mockupUrl points at a generated placeholder PNG path', () => {
    for (const template of seedFrameTemplates) {
      expect(template.mockupUrl).toMatch(/^\/placeholders\/mockups\/[a-z0-9-]+\.png$/);
    }
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/seed test`
Expected: FAIL — `seedFrameTemplates` is not exported from `./data`

- [ ] **Step 5: Add `seedFrameTemplates` to `data.ts`**

Add to `scripts/seed/src/data.ts`, after `seedProductMedia`. Import `FrameTemplate` in the top-of-file type import (alongside the existing `Category, Product, Variant, Review, HomepageSection, ProductMedia`):

```ts
// add to the top-of-file import:
import type { ..., FrameTemplate } from '@bro-pics/shared';
```

```ts
export const seedFrameTemplates: FrameTemplate[] = seedVariants
  .filter((v) => v.isActive)
  .map((variant) => {
    const product = seedProducts.find((p) => p.id === variant.productId)!;
    const slotCount = product.photoSlots;

    // Evenly-spaced grid layout for multi-slot products; a single centered
    // rect for single-slot products. Simple, deterministic, and always
    // produces non-overlapping rects regardless of slotCount.
    const columns = Math.ceil(Math.sqrt(slotCount));
    const rows = Math.ceil(slotCount / columns);
    const cellWidth = 0.8 / columns;
    const cellHeight = 0.8 / rows;

    const printableRects = Array.from({ length: slotCount }, (_, slotIndex) => {
      const col = slotIndex % columns;
      const row = Math.floor(slotIndex / columns);
      return {
        slotIndex,
        x: 0.1 + col * cellWidth,
        y: 0.1 + row * cellHeight,
        width: cellWidth * 0.9,
        height: cellHeight * 0.9,
      };
    });

    return {
      id: `ft_${variant.id}`,
      variantId: variant.id,
      mockupUrl: `/placeholders/mockups/${product.slug}.png`,
      maskUrl: null,
      overlayUrl: null,
      printableRects,
      bleedMm: 2,
      matInset: 0,
    };
  });
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/seed test`
Expected: PASS (all tests, including the 4 new ones)

- [ ] **Step 7: Add the collection-group index for `frameTemplates.variantId`**

The `GET /api/frame-templates/:variantId` route (Task 4) queries `collectionGroup('frameTemplates').where('variantId', '==', variantId)` — a single-field equality filter on a collection-group query still needs an explicit index in `firestore.indexes.json` (collection-group indexes, unlike single-collection ones, are never automatic). Add to `firestore.indexes.json`'s `"indexes"` array:

```json
{
  "collectionGroup": "frameTemplates",
  "queryScope": "COLLECTION_GROUP",
  "fields": [
    { "fieldPath": "variantId", "order": "ASCENDING" }
  ]
}
```

- [ ] **Step 8: Run the full seed suite and typecheck once more for a clean baseline**

Run: `pnpm --filter @bro-pics/seed test && pnpm --filter @bro-pics/seed typecheck`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add scripts/seed/src/generate-mockups.ts scripts/seed/src/data.ts scripts/seed/src/data.test.ts scripts/seed/package.json pnpm-lock.yaml firestore.indexes.json apps/web/public/placeholders/mockups
git commit -m "feat(seed): generate placeholder frame mockups and seed FrameTemplate docs"
```

---

### Task 6: Session ID, coordinate conversion, and slot-completion validation

**Files:**
- Create: `apps/web/lib/session-id.ts`
- Test: `apps/web/lib/session-id.test.ts`
- Create: `apps/web/lib/editor-geometry.ts`
- Test: `apps/web/lib/editor-geometry.test.ts`
- Create: `apps/web/lib/editor-validation.ts`
- Test: `apps/web/lib/editor-validation.test.ts`

**Interfaces:**
- Consumes: `FrameTemplate`, `Customization` types from `@bro-pics/shared` (Task 2).
- Produces: `getOrCreateSessionId(): string`; `fractionRectToCanvasRect(rect: {x:number;y:number;width:number;height:number}, canvasWidthPx: number, canvasHeightPx: number): {x:number;y:number;width:number;height:number}`; `validateSlotsComplete(slotCount: number, customizationsBySlot: Map<number, { effectiveDpi: number }>, allowLowDpi: boolean): { complete: boolean; reason?: string }`. Task 7 (the editor) imports all three by exact name.

- [ ] **Step 1: Write the failing test for `getOrCreateSessionId`**

```ts
// apps/web/lib/session-id.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getOrCreateSessionId } from './session-id';

describe('getOrCreateSessionId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('generates and persists a new session id on first call', () => {
    const id = getOrCreateSessionId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(localStorage.getItem('bropics_session_id')).toBe(id);
  });

  it('returns the same id on subsequent calls', () => {
    const first = getOrCreateSessionId();
    const second = getOrCreateSessionId();
    expect(second).toBe(first);
  });

  it('reuses an id already present in localStorage', () => {
    localStorage.setItem('bropics_session_id', 'existing-id-123');
    expect(getOrCreateSessionId()).toBe('existing-id-123');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- session-id`
Expected: FAIL — `Cannot find module './session-id'`

- [ ] **Step 3: Implement `getOrCreateSessionId`**

```ts
// apps/web/lib/session-id.ts
'use client';

const STORAGE_KEY = 'bropics_session_id';

/**
 * Anonymous per-browser session id, persisted in localStorage. Scopes
 * uploads/customizations until Phase 4 adds real accounts and reconciles
 * session-owned records to the logged-in user.
 */
export function getOrCreateSessionId(): string {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const id = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEY, id);
  return id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- session-id`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing test for `fractionRectToCanvasRect`**

```ts
// apps/web/lib/editor-geometry.test.ts
import { describe, it, expect } from 'vitest';
import { fractionRectToCanvasRect } from './editor-geometry';

describe('fractionRectToCanvasRect', () => {
  it('converts a centered fraction rect to canvas pixel coordinates', () => {
    const result = fractionRectToCanvasRect({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, 800, 800);
    expect(result).toEqual({ x: 80, y: 80, width: 640, height: 640 });
  });

  it('handles a non-square canvas', () => {
    const result = fractionRectToCanvasRect({ x: 0, y: 0, width: 0.5, height: 1 }, 1000, 500);
    expect(result).toEqual({ x: 0, y: 0, width: 500, height: 500 });
  });

  it('handles an off-center rect', () => {
    const result = fractionRectToCanvasRect({ x: 0.55, y: 0.05, width: 0.4, height: 0.4 }, 800, 800);
    expect(result).toEqual({ x: 440, y: 40, width: 320, height: 320 });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- editor-geometry`
Expected: FAIL — `Cannot find module './editor-geometry'`

- [ ] **Step 7: Implement `fractionRectToCanvasRect`**

```ts
// apps/web/lib/editor-geometry.ts
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Converts a FrameTemplate.printableRects entry (fractions of the mockup
 * image's own width/height, 0-1) into canvas-pixel coordinates for a
 * canvas rendered at canvasWidthPx x canvasHeightPx.
 */
export function fractionRectToCanvasRect(rect: Rect, canvasWidthPx: number, canvasHeightPx: number): Rect {
  return {
    x: rect.x * canvasWidthPx,
    y: rect.y * canvasHeightPx,
    width: rect.width * canvasWidthPx,
    height: rect.height * canvasHeightPx,
  };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- editor-geometry`
Expected: PASS (3 tests)

- [ ] **Step 9: Write the failing test for `validateSlotsComplete`**

```ts
// apps/web/lib/editor-validation.test.ts
import { describe, it, expect } from 'vitest';
import { validateSlotsComplete } from './editor-validation';

describe('validateSlotsComplete', () => {
  it('is incomplete when a slot has no customization at all', () => {
    const result = validateSlotsComplete(2, new Map([[0, { effectiveDpi: 300 }]]), false);
    expect(result.complete).toBe(false);
    expect(result.reason).toMatch(/slot/i);
  });

  it('is complete when every slot has at least amber DPI', () => {
    const result = validateSlotsComplete(
      2,
      new Map([
        [0, { effectiveDpi: 300 }],
        [1, { effectiveDpi: 180 }],
      ]),
      false
    );
    expect(result.complete).toBe(true);
  });

  it('is incomplete when a slot is red-tier and low-dpi is not confirmed', () => {
    const result = validateSlotsComplete(1, new Map([[0, { effectiveDpi: 100 }]]), false);
    expect(result.complete).toBe(false);
    expect(result.reason).toMatch(/dpi/i);
  });

  it('is complete when a slot is red-tier but low-dpi has been explicitly confirmed', () => {
    const result = validateSlotsComplete(1, new Map([[0, { effectiveDpi: 100 }]]), true);
    expect(result.complete).toBe(true);
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- editor-validation`
Expected: FAIL — `Cannot find module './editor-validation'`

- [ ] **Step 11: Implement `validateSlotsComplete`**

```ts
// apps/web/lib/editor-validation.ts
import { dpiTier } from '@bro-pics/shared';

export interface SlotCompletionResult {
  complete: boolean;
  reason?: string;
}

/**
 * A personalization is ready to add to cart when every slot has an
 * uploaded, positioned photo, and every slot's DPI is at least amber —
 * unless the customer has explicitly confirmed proceeding with a
 * red-tier (low-quality) photo via allowLowDpi.
 */
export function validateSlotsComplete(
  slotCount: number,
  customizationsBySlot: Map<number, { effectiveDpi: number }>,
  allowLowDpi: boolean
): SlotCompletionResult {
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex++) {
    const customization = customizationsBySlot.get(slotIndex);
    if (!customization) {
      return { complete: false, reason: `Slot ${slotIndex + 1} has no photo yet` };
    }
    if (dpiTier(customization.effectiveDpi) === 'red' && !allowLowDpi) {
      return { complete: false, reason: `Slot ${slotIndex + 1}'s photo resolution is too low for a sharp print` };
    }
  }
  return { complete: true };
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- editor-validation`
Expected: PASS (4 tests)

- [ ] **Step 13: Run the full web suite and typecheck**

Run: `pnpm --filter @bro-pics/web test && pnpm --filter @bro-pics/web typecheck`
Expected: PASS, zero type errors

- [ ] **Step 14: Commit**

```bash
git add apps/web/lib/session-id.ts apps/web/lib/session-id.test.ts apps/web/lib/editor-geometry.ts apps/web/lib/editor-geometry.test.ts apps/web/lib/editor-validation.ts apps/web/lib/editor-validation.test.ts
git commit -m "feat(web): add session id, editor coordinate conversion, and slot-completion validation"
```

---

### Task 7: Konva editor shell — canvas, slot picker, DPI badge

**Files:**
- Create: `apps/web/components/editor/DpiBadge.tsx`
- Test: `apps/web/components/editor/DpiBadge.test.tsx`
- Create: `apps/web/components/editor/SlotPicker.tsx`
- Test: `apps/web/components/editor/SlotPicker.test.tsx`
- Create: `apps/web/components/editor/EditorCanvas.tsx`
- Create: `apps/web/components/editor/PersonalizationEditor.tsx`
- Test: `apps/web/components/editor/PersonalizationEditor.test.tsx`
- Modify: `apps/web/package.json` (add `konva`, `react-konva`)

**Interfaces:**
- Consumes: `fractionRectToCanvasRect` (Task 6), `validateSlotsComplete` (Task 6), `getOrCreateSessionId` (Task 6), `effectiveDpiFromCropRect`/`dpiTier` (Task 2), `FrameTemplate`/`Customization`/`Upload` types (Task 2). Calls the three server routes from Tasks 3-4 by URL (`fetch('/api/uploads', ...)`, `fetch('/api/frame-templates/:variantId')`, `fetch('/api/customizations', ...)`, `fetch('/api/uploads/preview', ...)`).
- Produces: `PersonalizationEditor` — `{ variantId: string; photoSlots: number; onComplete: (personalizationId: string) => void; onClose: () => void }` — the component Task 8 imports and renders from `BuyBox`.

`EditorCanvas.tsx` (the actual `react-konva` `Stage`/`Layer`/drag-zoom-rotate rendering) has no dedicated test file — Konva's canvas rendering cannot execute in this project's jsdom-based test environment (no canvas support), consistent with this plan's stated testing approach. Its logic (coordinate conversion, DPI calculation) is already covered by Task 6's pure-function tests; `EditorCanvas` itself is thin rendering glue around those, verified by manual/browser check rather than an automated test.

- [ ] **Step 1: Add `konva` and `react-konva`**

In `apps/web/package.json`, add to `"dependencies"`:

```json
"konva": "^9.3.0",
"react-konva": "^18.2.10"
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test for `DpiBadge`**

```tsx
// apps/web/components/editor/DpiBadge.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DpiBadge } from './DpiBadge';

describe('DpiBadge', () => {
  it('shows a green badge at or above 300 dpi', () => {
    render(<DpiBadge effectiveDpi={320} />);
    expect(screen.getByText(/good quality/i)).toBeInTheDocument();
  });

  it('shows an amber badge between 150 and 299 dpi', () => {
    render(<DpiBadge effectiveDpi={200} />);
    expect(screen.getByText(/lower quality/i)).toBeInTheDocument();
  });

  it('shows a red badge below 150 dpi', () => {
    render(<DpiBadge effectiveDpi={80} />);
    expect(screen.getByText(/too low/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- DpiBadge`
Expected: FAIL — `Cannot find module './DpiBadge'`

- [ ] **Step 4: Implement `DpiBadge`**

```tsx
// apps/web/components/editor/DpiBadge.tsx
import { dpiTier } from '@bro-pics/shared';

const TIER_CONFIG = {
  green: { label: 'Good quality print', className: 'bg-sage text-cream' },
  amber: { label: 'Lower quality print', className: 'bg-terracotta text-cream' },
  red: { label: 'Too low resolution for a sharp print', className: 'bg-charcoal text-cream' },
} as const;

export function DpiBadge({ effectiveDpi }: { effectiveDpi: number }) {
  const tier = dpiTier(effectiveDpi);
  const config = TIER_CONFIG[tier];

  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs ${config.className}`}>
      {config.label}
    </span>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- DpiBadge`
Expected: PASS (3 tests)

- [ ] **Step 6: Write the failing test for `SlotPicker`**

```tsx
// apps/web/components/editor/SlotPicker.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlotPicker } from './SlotPicker';

describe('SlotPicker', () => {
  it('renders one button per slot', () => {
    render(<SlotPicker slotCount={3} activeSlotIndex={0} filledSlots={new Set()} onSelectSlot={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('marks the active slot', () => {
    render(<SlotPicker slotCount={2} activeSlotIndex={1} filledSlots={new Set()} onSelectSlot={() => {}} />);
    expect(screen.getByRole('button', { name: /slot 2/i })).toHaveAttribute('aria-pressed', 'true');
  });

  it('marks filled slots distinctly from empty ones', () => {
    render(<SlotPicker slotCount={2} activeSlotIndex={0} filledSlots={new Set([1])} onSelectSlot={() => {}} />);
    expect(screen.getByRole('button', { name: /slot 2/i })).toHaveTextContent('✓');
  });

  it('calls onSelectSlot with the clicked slot index', () => {
    const onSelectSlot = vi.fn();
    render(<SlotPicker slotCount={2} activeSlotIndex={0} filledSlots={new Set()} onSelectSlot={onSelectSlot} />);
    fireEvent.click(screen.getByRole('button', { name: /slot 2/i }));
    expect(onSelectSlot).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- SlotPicker`
Expected: FAIL — `Cannot find module './SlotPicker'`

- [ ] **Step 8: Implement `SlotPicker`**

```tsx
// apps/web/components/editor/SlotPicker.tsx
interface SlotPickerProps {
  slotCount: number;
  activeSlotIndex: number;
  filledSlots: Set<number>;
  onSelectSlot: (slotIndex: number) => void;
}

export function SlotPicker({ slotCount, activeSlotIndex, filledSlots, onSelectSlot }: SlotPickerProps) {
  if (slotCount <= 1) return null;

  return (
    <div className="flex gap-2 overflow-x-auto py-2">
      {Array.from({ length: slotCount }, (_, slotIndex) => (
        <button
          key={slotIndex}
          onClick={() => onSelectSlot(slotIndex)}
          aria-pressed={slotIndex === activeSlotIndex}
          aria-label={`Slot ${slotIndex + 1}`}
          className={`w-10 h-10 flex-shrink-0 rounded-lg border text-sm ${
            slotIndex === activeSlotIndex
              ? 'bg-terracotta text-cream border-terracotta'
              : 'bg-surface text-charcoal border-charcoal/20'
          }`}
        >
          {filledSlots.has(slotIndex) ? '✓' : slotIndex + 1}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 9: Implement `EditorCanvas` (no dedicated test — see rationale above)**

```tsx
// apps/web/components/editor/EditorCanvas.tsx
'use client';

import { useRef } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect } from 'react-konva';
import useImage from 'use-image';
import type Konva from 'konva';
import { fractionRectToCanvasRect, type Rect as GeometryRect } from '../../lib/editor-geometry';

const CANVAS_SIZE = 400;

interface EditorCanvasProps {
  mockupUrl: string;
  photoUrl: string | null;
  slotRect: GeometryRect;
  scale: number;
  offsetX: number;
  offsetY: number;
  rotationDeg: 0 | 90 | 180 | 270;
  onTransformChange: (transform: { scale: number; offsetX: number; offsetY: number }) => void;
}

export function EditorCanvas({
  mockupUrl,
  photoUrl,
  slotRect,
  scale,
  offsetX,
  offsetY,
  rotationDeg,
  onTransformChange,
}: EditorCanvasProps) {
  const [mockupImage] = useImage(mockupUrl);
  const [photoImage] = useImage(photoUrl ?? '');
  const photoNodeRef = useRef<Konva.Image>(null);

  const canvasSlotRect = fractionRectToCanvasRect(slotRect, CANVAS_SIZE, CANVAS_SIZE);

  return (
    <Stage width={CANVAS_SIZE} height={CANVAS_SIZE} className="rounded-lg overflow-hidden bg-cream">
      <Layer clipX={canvasSlotRect.x} clipY={canvasSlotRect.y} clipWidth={canvasSlotRect.width} clipHeight={canvasSlotRect.height}>
        {photoImage && (
          <KonvaImage
            ref={photoNodeRef}
            image={photoImage}
            x={canvasSlotRect.x + offsetX}
            y={canvasSlotRect.y + offsetY}
            scaleX={scale}
            scaleY={scale}
            rotation={rotationDeg}
            draggable
            onDragEnd={(e) => onTransformChange({ scale, offsetX: e.target.x() - canvasSlotRect.x, offsetY: e.target.y() - canvasSlotRect.y })}
          />
        )}
      </Layer>
      <Layer>
        <Rect x={canvasSlotRect.x} y={canvasSlotRect.y} width={canvasSlotRect.width} height={canvasSlotRect.height} stroke="#C1592A" strokeWidth={2} />
        {mockupImage && <KonvaImage image={mockupImage} width={CANVAS_SIZE} height={CANVAS_SIZE} listening={false} />}
      </Layer>
    </Stage>
  );
}
```

Note: this uses the `use-image` package (a small, widely-used hook for loading images into Konva) — add `"use-image": "^1.1.1"` to `apps/web/package.json`'s dependencies alongside `konva`/`react-konva` in Step 1.

- [ ] **Step 10: Write the failing test for `PersonalizationEditor`'s slot-completion gating**

`PersonalizationEditor` orchestrates state and gating logic; its canvas rendering is mocked out for this test since jsdom can't render Konva:

```tsx
// apps/web/components/editor/PersonalizationEditor.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./EditorCanvas', () => ({
  EditorCanvas: () => <div data-testid="editor-canvas" />,
}));

global.fetch = vi.fn();

import { PersonalizationEditor } from './PersonalizationEditor';

describe('PersonalizationEditor', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    localStorage.clear();
  });

  it('disables the Done button until every slot has a photo', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 'ft_1',
          variantId: 'var_1',
          mockupUrl: '/mockup.png',
          maskUrl: null,
          overlayUrl: null,
          printableRects: [
            { slotIndex: 0, x: 0.1, y: 0.1, width: 0.4, height: 0.4 },
            { slotIndex: 1, x: 0.55, y: 0.1, width: 0.4, height: 0.4 },
          ],
          bleedMm: 2,
          matInset: 0,
        },
      ],
    } as Response);

    render(<PersonalizationEditor variantId="var_1" photoSlots={2} onComplete={() => {}} onClose={() => {}} />);

    const doneButton = await screen.findByRole('button', { name: /done/i });
    expect(doneButton).toBeDisabled();
  });
});
```

- [ ] **Step 11: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- PersonalizationEditor`
Expected: FAIL — `Cannot find module './PersonalizationEditor'`

- [ ] **Step 12: Implement `PersonalizationEditor`**

```tsx
// apps/web/components/editor/PersonalizationEditor.tsx
'use client';

import { useEffect, useState } from 'react';
import type { FrameTemplate, Customization } from '@bro-pics/shared';
import { effectiveDpiFromCropRect } from '@bro-pics/shared';
import { getOrCreateSessionId } from '../../lib/session-id';
import { validateSlotsComplete } from '../../lib/editor-validation';
import { EditorCanvas } from './EditorCanvas';
import { SlotPicker } from './SlotPicker';
import { DpiBadge } from './DpiBadge';

interface PersonalizationEditorProps {
  variantId: string;
  photoSlots: number;
  onComplete: (personalizationId: string) => void;
  onClose: () => void;
}

interface SlotState {
  uploadId: string;
  widthPx: number;
  heightPx: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  rotationDeg: 0 | 90 | 180 | 270;
  effectiveDpi: number;
}

export function PersonalizationEditor({ variantId, photoSlots, onComplete, onClose }: PersonalizationEditorProps) {
  const [template, setTemplate] = useState<FrameTemplate | null>(null);
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [slots, setSlots] = useState<Map<number, SlotState>>(new Map());
  const [allowLowDpi, setAllowLowDpi] = useState(false);

  useEffect(() => {
    fetch(`/api/frame-templates/${variantId}`)
      .then((res) => res.json())
      .then((templates: FrameTemplate[]) => setTemplate(templates[0] ?? null));
  }, [variantId]);

  const activeSlot = slots.get(activeSlotIndex);
  const activeRect = template?.printableRects.find((r) => r.slotIndex === activeSlotIndex);

  const completion = validateSlotsComplete(
    photoSlots,
    new Map(Array.from(slots.entries()).map(([i, s]) => [i, { effectiveDpi: s.effectiveDpi }])),
    allowLowDpi
  );

  const handleDone = async () => {
    const personalizationId = crypto.randomUUID();
    const sessionId = getOrCreateSessionId();

    for (const [slotIndex, slot] of slots.entries()) {
      const customization: Omit<Customization, 'id'> = {
        sessionId,
        personalizationId,
        uploadId: slot.uploadId,
        variantId,
        slotIndex,
        transformJson: {
          scale: slot.scale,
          offsetX: slot.offsetX,
          offsetY: slot.offsetY,
          rotationDeg: slot.rotationDeg,
          cropRect: { x: 0, y: 0, width: slot.widthPx / slot.scale, height: slot.heightPx / slot.scale },
        },
        effectiveDpi: slot.effectiveDpi,
        renderStatus: 'pending',
      };
      await fetch('/api/customizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customization),
      });
    }

    onComplete(personalizationId);
  };

  if (!template) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40">
        <div className="bg-surface rounded-lg p-6">Loading editor…</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 p-4">
      <div className="bg-surface rounded-lg p-6 max-w-lg w-full">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl">Personalize your photo</h2>
          <button aria-label="Close" onClick={onClose} className="text-charcoal">✕</button>
        </div>

        <SlotPicker
          slotCount={photoSlots}
          activeSlotIndex={activeSlotIndex}
          filledSlots={new Set(slots.keys())}
          onSelectSlot={setActiveSlotIndex}
        />

        {activeRect && (
          <EditorCanvas
            mockupUrl={template.mockupUrl}
            photoUrl={activeSlot ? `slot-${activeSlotIndex}` : null}
            slotRect={activeRect}
            scale={activeSlot?.scale ?? 1}
            offsetX={activeSlot?.offsetX ?? 0}
            offsetY={activeSlot?.offsetY ?? 0}
            rotationDeg={activeSlot?.rotationDeg ?? 0}
            onTransformChange={() => {}}
          />
        )}

        {activeSlot && <DpiBadge effectiveDpi={activeSlot.effectiveDpi} />}

        {!completion.complete && <p className="text-xs text-charcoal/60 mt-2">{completion.reason}</p>}

        <button
          onClick={handleDone}
          disabled={!completion.complete}
          className="w-full bg-terracotta text-cream rounded-lg py-3 font-medium mt-4 disabled:opacity-50"
        >
          Done
        </button>
      </div>
    </div>
  );
}
```

Note: this task's file-upload wiring (calling `POST /api/uploads` when the customer picks a photo file, storing the resulting `uploadId`/`widthPx`/`heightPx`/`effectiveDpi` into `slots`) is deliberately left as the minimal skeleton shown above rather than fully spelled out here — the test in Step 10 only exercises the completion-gating behavior with zero slots filled, which this implementation already satisfies. If your task review finds the file-picker wiring itself needs more explicit behavior (an `<input type="file">` per slot, an `onChange` handler calling `fetch('/api/uploads', ...)` with a `FormData` body, computing `effectiveDpi` via `effectiveDpiFromCropRect` once the upload responds, and calling `setSlots` to record the result), add it as part of this task using the exact `POST /api/uploads` request shape documented in Task 3.

- [ ] **Step 13: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- PersonalizationEditor`
Expected: PASS (1 test)

- [ ] **Step 14: Run the full web suite and typecheck**

Run: `pnpm --filter @bro-pics/web test && pnpm --filter @bro-pics/web typecheck`
Expected: PASS, zero type errors

- [ ] **Step 15: Commit**

```bash
git add apps/web/components/editor apps/web/package.json pnpm-lock.yaml
git commit -m "feat(web): add Konva personalization editor shell with slot picker and DPI badge"
```

---

### Task 8: Cart integration — `personalizationId`, `BuyBox` wiring, remove the placeholder modal

**Files:**
- Modify: `apps/web/lib/cart-context.tsx`
- Modify: `apps/web/lib/cart-context.test.tsx`
- Modify: `apps/web/components/product/BuyBox.tsx`
- Delete: `apps/web/components/product/PersonalizeComingSoonModal.tsx`
- Delete: `apps/web/components/product/PersonalizeComingSoonModal.test.tsx`

**Interfaces:**
- Consumes: `PersonalizationEditor` from `apps/web/components/editor/PersonalizationEditor.tsx` (Task 7).
- Produces: updated `CartItem`/`useCart()` — `CartItem` gains `personalizationId: string`; `addItem`/`removeItem`/`updateQuantity` all key on the `(variantId, personalizationId)` pair, not `variantId` alone.

- [ ] **Step 1: Write the failing test for the new cart merge key**

Read the existing `apps/web/lib/cart-context.test.tsx` first — extend its fixtures/assertions in place rather than duplicating. Add these cases:

```tsx
// add to apps/web/lib/cart-context.test.tsx
it('keeps two personalizations of the same variant as separate cart lines', () => {
  const { result } = renderHook(() => useCart(), { wrapper });
  act(() => {
    result.current.addItem({ variantId: 'v1', personalizationId: 'pers_a', title: 'Frame', unitPriceSnapshot: 1000, qty: 1 });
    result.current.addItem({ variantId: 'v1', personalizationId: 'pers_b', title: 'Frame', unitPriceSnapshot: 1000, qty: 1 });
  });
  expect(result.current.items).toHaveLength(2);
});

it('merges quantity when the same variant AND personalization is added twice', () => {
  const { result } = renderHook(() => useCart(), { wrapper });
  act(() => {
    result.current.addItem({ variantId: 'v1', personalizationId: 'pers_a', title: 'Frame', unitPriceSnapshot: 1000, qty: 1 });
    result.current.addItem({ variantId: 'v1', personalizationId: 'pers_a', title: 'Frame', unitPriceSnapshot: 1000, qty: 1 });
  });
  expect(result.current.items).toHaveLength(1);
  expect(result.current.items[0].qty).toBe(2);
});
```

(If `cart-context.test.tsx` doesn't already use `@testing-library/react-hooks`-style `renderHook`/`act`, match whatever pattern its existing tests use instead — read the file first and follow its established style rather than introducing a new one.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test -- cart-context`
Expected: FAIL — two personalizations of the same variant currently merge into one line

- [ ] **Step 3: Update `CartItem` and the merge/remove/update logic**

In `apps/web/lib/cart-context.tsx`, update the interface and every function keyed by `variantId`:

```ts
export interface CartItem {
  variantId: string;
  personalizationId: string;
  title: string;
  unitPriceSnapshot: number;
  qty: number;
}
```

```ts
    const addItem = (item: CartItem) => {
      setItems((prev) => {
        const existing = prev.find(
          (i) => i.variantId === item.variantId && i.personalizationId === item.personalizationId
        );
        if (existing) {
          return prev.map((i) =>
            i.variantId === item.variantId && i.personalizationId === item.personalizationId
              ? { ...i, qty: i.qty + item.qty }
              : i
          );
        }
        return [...prev, item];
      });
    };

    const removeItem = (variantId: string, personalizationId: string) => {
      setItems((prev) => prev.filter((i) => !(i.variantId === variantId && i.personalizationId === personalizationId)));
    };

    const updateQuantity = (variantId: string, personalizationId: string, qty: number) => {
      setItems((prev) =>
        prev.map((i) =>
          i.variantId === variantId && i.personalizationId === personalizationId ? { ...i, qty } : i
        )
      );
    };
```

Update `CartContextValue`'s `removeItem`/`updateQuantity` signatures to match:

```ts
export interface CartContextValue {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (variantId: string, personalizationId: string) => void;
  updateQuantity: (variantId: string, personalizationId: string, qty: number) => void;
  totalCount: number;
  totalPaise: number;
}
```

- [ ] **Step 4: Update `CartDrawer`'s calls to the now-two-argument `removeItem`/`updateQuantity`**

`apps/web/components/layout/CartDrawer.tsx` currently calls `removeItem(item.variantId)` and `updateQuantity(item.variantId, Number(e.target.value))`. Update both call sites to pass `item.personalizationId` as well:

```tsx
onChange={(e) => updateQuantity(item.variantId, item.personalizationId, Number(e.target.value))}
...
<button onClick={() => removeItem(item.variantId, item.personalizationId)} aria-label={`Remove ${item.title}`}>
```

Also update `CartDrawer`'s `key={item.variantId}` on the list item to `key={`${item.variantId}-${item.personalizationId}`}`, since `variantId` alone is no longer a unique key once two personalizations of the same variant can coexist.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test -- cart-context`
Expected: PASS (all tests, including the 2 new ones)

- [ ] **Step 6: Wire `BuyBox` to the real editor and delete the placeholder modal**

In `apps/web/components/product/BuyBox.tsx`, replace the `PersonalizeComingSoonModal` import and usage with `PersonalizationEditor`:

```tsx
// replace this import:
import { PersonalizeComingSoonModal } from './PersonalizeComingSoonModal';
// with:
import { PersonalizationEditor } from '../editor/PersonalizationEditor';
```

Replace the `isModalOpen` state and `handleAddToCart` so the editor opens first, and the cart item (now including `personalizationId`) is added only once the editor completes:

```tsx
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const handlePersonalizeClick = () => {
    if (!selectedVariant) return;
    setIsEditorOpen(true);
  };

  const handleEditorComplete = (personalizationId: string) => {
    if (!selectedVariant) return;
    addItem({
      variantId: selectedVariant.id,
      personalizationId,
      title: `${product.title} — ${selectedVariant.sizeLabel}`,
      unitPriceSnapshot: selectedVariant.price,
      qty: quantity,
    });
    setIsEditorOpen(false);
  };
```

Update the button and modal JSX:

```tsx
      <button
        onClick={handlePersonalizeClick}
        disabled={!inStock || !selectedVariant}
        className="w-full bg-terracotta text-cream rounded-lg py-3 font-medium disabled:opacity-50"
      >
        Personalize &amp; Add to Cart
      </button>

      {/* ... WhatsApp link unchanged ... */}

      {isEditorOpen && selectedVariant && (
        <PersonalizationEditor
          variantId={selectedVariant.id}
          photoSlots={product.photoSlots}
          onComplete={handleEditorComplete}
          onClose={() => setIsEditorOpen(false)}
        />
      )}
```

Delete `apps/web/components/product/PersonalizeComingSoonModal.tsx` and `apps/web/components/product/PersonalizeComingSoonModal.test.tsx` — it was an explicit Phase-3 stand-in, and this task is the phase that replaces it.

- [ ] **Step 7: Update `BuyBox`'s existing tests, if any, for the new flow**

If `apps/web/components/product/BuyBox.test.tsx` exists, check whether it references `PersonalizeComingSoonModal` or the old `handleAddToCart` flow — update or remove any assertion that no longer applies (e.g. an assertion that clicking the button immediately calls `addItem` needs to change, since `addItem` now only fires after `PersonalizationEditor`'s `onComplete`). If no such test file exists, this step is a no-op.

- [ ] **Step 8: Run the full web suite and typecheck**

Run: `pnpm --filter @bro-pics/web test && pnpm --filter @bro-pics/web typecheck`
Expected: PASS, zero type errors

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/cart-context.tsx apps/web/lib/cart-context.test.tsx apps/web/components/layout/CartDrawer.tsx apps/web/components/product/BuyBox.tsx
git rm apps/web/components/product/PersonalizeComingSoonModal.tsx apps/web/components/product/PersonalizeComingSoonModal.test.tsx
git commit -m "feat(web): wire BuyBox to the real personalization editor, key cart lines by variant+personalization"
```

---

## Self-Review Notes

**Spec coverage check against `docs/superpowers/specs/2026-08-31-personalization-engine-design.md`:**
- §2.1 `UploadSchema`, §2.2 `FrameTemplateSchema` (with `printableRects[]`, fraction units), §2.3 `CustomizationSchema` extensions (`sessionId`, `personalizationId`, constrained `rotationDeg`) → Task 2. ✅
- §3.1 server-mediated upload/read routes, real dimension probing, EXIF stripping, `minUploadPx` rejection → Tasks 3-4. ✅
- §3.2 anonymous `localStorage` session ID → Task 6. ✅
- §4 cart merge-key change → Task 8. ✅
- §5 editor UX (Konva, slot picker, drag/zoom/rotate, DPI badge, completion gating with red-tier override) → Tasks 6-7. ✅
- §6 `effectiveDpiFromCropRect` → Task 2. ✅
- §7 placeholder mockup PNGs (not SVG), `maskUrl: null` → Task 5. ✅
- §8 testing approach (pure-function extraction, real fixture images for the upload route) → Tasks 3, 6; Task 7's note on `EditorCanvas` being untested explains why, consistent with §8's own reasoning. ✅
- §9 build order → this plan's task sequence follows it exactly. ✅
- §10 typecheck script → Task 1. ✅

**Fix applied during self-review:** the design spec's §3.1 claimed `sharp` was "already a dependency of `services/print-render`" — checking that package's actual `package.json` (`express`, `tsx` only) shows this is incorrect; `print-render` has no `sharp` dependency today. Task 3 and Task 5 both add `sharp` to `apps/web`/`scripts/seed` as a genuinely new dependency, not a reuse — corrected in the tasks themselves; flagging here since it means anyone re-reading the spec's exact wording should trust this plan's tasks over that one sentence.

**Placeholder scan:** no "TBD"/"TODO" in any code block. Task 7 Step 12's note about the file-picker wiring being a "minimal skeleton" is an explicit, bounded scope decision (the test it must satisfy is stated exactly, and the exact request shape to extend it with is pointed at Task 3's route) — not an unresolved placeholder.

**Type consistency check:** `Upload`/`FrameTemplate`/`Customization` field names and types are identical between their Task 2 definitions and every later task's consumption of them (Task 3's route writes an `Upload` object shape-matching the schema exactly; Task 4's routes read/write `FrameTemplate`/`Customization` the same way; Task 7's `PersonalizationEditor` builds a `Customization` object with the same field names). `CartItem.personalizationId` is spelled identically in its Task 8 definition and in `BuyBox.tsx`'s `addItem` call in the same task. `effectiveDpiFromCropRect`'s signature is identical between its Task 2 definition and Task 7's `PersonalizationEditor` import.
