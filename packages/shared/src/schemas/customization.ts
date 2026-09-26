import { z } from 'zod';

// CURRENT_SCHEMA_VERSION is the source of truth this project's writers use
// (e.g. /api/customizations sets schemaVersion: CURRENT_SCHEMA_VERSION on
// every new draft) — CustomizationSchema itself stays permissive
// (schemaVersion optional, defaulting to 1) so a v1 doc (written before
// this field existed) still parses. Readers that need to branch on shape
// should check `schemaVersion ?? 1` explicitly rather than assuming it's
// always present.
export const CURRENT_SCHEMA_VERSION = 2;

export const CustomizationSchema = z.object({
  id: z.string(),
  schemaVersion: z.number().int().positive().default(1),
  sessionId: z.string().min(1),
  userId: z.string().min(1).optional(),
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
  // Value + the font/colour the customer actually picked for it — was
  // previously just the raw string, which silently discarded styling on
  // reload/re-render (editor-confirm always re-applied the DEFAULT font).
  textFieldsJson: z
    .record(z.string(), z.object({ value: z.string(), fontFamily: z.string(), color: z.string() }))
    .optional(),
  clipartId: z.string().optional(),
  effectiveDpi: z.number().nonnegative(),
  // Server-computed from effectiveDpi via dpiTier() at write time — never
  // derived client-side, so fulfillment/admin can trust it without
  // recomputing. Optional for v1 docs written before this field existed.
  dpiBand: z.enum(['green', 'amber', 'red']).optional(),
  // Set only when dpiBand is 'red' AND the customer explicitly clicked
  // "use this photo anyway" (previously that confirmation was pure client
  // state — SlotState.confirmedLowDpi — and never reached the server at
  // all, so fulfillment had no record a low-quality photo was a deliberate
  // customer choice vs. some other bug).
  redConfirmedAt: z.date().optional(),
  // draft: still being edited. ordered: copied into a placed (but not yet
  // paid) order's items. locked: payment confirmed — immutable from here,
  // a reorder/edit attempt must fork a new draft rather than mutate this
  // doc (see PUT /api/customizations/{id}). Optional + defaults to
  // 'draft' for v1 docs written before this field existed — the safest
  // default, since an old doc predates any lock/order wiring anyway.
  status: z.enum(['draft', 'ordered', 'locked']).default('draft'),
  lockedAt: z.date().optional(),
  // Storage object paths, never signed URLs — see Upload.originalPath.
  previewPath: z.string().optional(),
  // Pins the exact FrameTemplate.version this customization was built
  // against — never the "current" template — so a later template edit
  // (which creates a new version doc rather than mutating this one) can
  // never change what an already-placed order re-renders to.
  templateVersion: z.number().int().positive(),
  // Populated by the print-render pipeline once the final, authoritative
  // 300 DPI print file has been produced server-side (see the backend
  // requirements doc) — undefined until renderStatus reaches 'done'.
  renderedFilePath: z.string().optional(),
  renderStatus: z.enum(['pending', 'rendering', 'done', 'failed']),
  // [BE-35] Same TTL-cleanup reasoning as Upload.createdAt — optional for
  // the same pre-existing-doc reason.
  createdAt: z.date().optional(),
});

export type Customization = z.infer<typeof CustomizationSchema>;
