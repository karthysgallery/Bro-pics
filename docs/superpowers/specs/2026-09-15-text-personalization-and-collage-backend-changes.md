# Backend requirements: text personalization + multi-photo collage frames

**Status: superseded 2026-09-18 — items #1, #2, and #4 below are now DONE.**
The "Live Inline Personalization + Print-Render Pipeline" plan
(`docs/superpowers/plans/2026-09-18-live-inline-personalization-and-print-render.md`)
implemented `FrameTemplate.textZones`, `Customization.textFieldsJson`'s
styled shape, and `Product.allowsTextPersonalization` for real on 4 products
— see `2026-09-18-live-inline-personalization-backend-changes.md` for what's
still actually outstanding (the admin write path for templates, and the
print-render service itself, item #5 below). #3 (multi-photo collage seed
data) was never picked up and is still a real, standalone gap — kept below.

Companion to the frontend-only implementation in this branch (Name/Date text
fields with font + colour pickers, live-rendered on the Konva editor canvas).
None of the items below have been implemented — `packages/shared`, Cloud
Functions, seed scripts, and Firestore rules are out of scope for this
frontend-only work. This documents what's needed to finish the feature for
real.

## 1. Per-template text zone positions

`FrameTemplate` (`packages/shared/src/schemas/frame-template.ts`) needs a new
field, following the exact fractional-rect convention `printableRects`
already uses:

```ts
textZones: z.array(z.object({
  fieldKey: z.string(),       // e.g. "name", "date"
  label: z.string(),          // e.g. "Name", "Date"
  x: z.number(), y: z.number(), width: z.number(), height: z.number(),
  maxLength: z.number().int().positive(),
  defaultFontFamily: z.string().optional(),
  defaultColor: z.string().optional(),
})).optional(),
```

Until this exists, the frontend editor renders text at one hardcoded default
bottom-strip position for every template (`apps/web/lib/text-personalization-options.ts`,
`defaultTextZoneRect`) — a visible placeholder, not a per-design choice.

## 2. Styled text field values

`Customization.textFieldsJson` (`packages/shared/src/schemas/customization.ts`)
is currently `z.record(z.string(), z.string()).optional()` — plain text only.
Needs to carry the font/colour the customer picked:

```ts
textFieldsJson: z.record(z.string(), z.object({
  value: z.string(),
  fontFamily: z.string(),
  color: z.string(),
})).optional(),
```

(or a new sibling `textStylesJson` field, if keeping `textFieldsJson` as
plain strings elsewhere is preferable). Until this lands, the frontend only
persists the raw text value per field key — font/colour choices are visible
live on the editor canvas but not saved with the order.

## 3. Multi-photo collage seed data

No frontend code changes are needed for multi-photo collage frames —
`PersonalizationEditor`, `SlotPicker`, and `EditorCanvas` already fully
support N-slot templates via `FrameTemplate.printableRects[]` (array,
already `slotIndex`-keyed). This is purely a seed-data gap left over from
the earlier frames-only catalog narrowing: bring back real `FrameTemplate`
docs with multiple `printableRects` entries, and `Product.photoSlots` set
to match, for whichever collage products should return.

## 4. Enable text personalization per product

Set `Product.allowsTextPersonalization: true` (and the matching
`textZones` from #1) on whichever real products should offer Name/Date
fields — currently no seeded product has this flag set, so the new
frontend UI has been verified with a manually-patched local record only.

## 5. Print-render pipeline (pre-existing gap, not introduced by this work)

The deferred server-side print-render pipeline (tracked separately in
`PROJECT_STATUS.md`, not built at all yet) will eventually need to
composite the styled text onto the final print file the same way it needs
to composite the photo slots.
