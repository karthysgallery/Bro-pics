# Backend Changes Required for the Frames-Only Scope — Requirements Doc

**Status:** Not implemented. This is a requirements list for whoever picks up backend work next, written alongside the frontend redesign (see [2026-09-14-storefront-redesign-frames-only.md](2026-09-14-storefront-redesign-frames-only.md)) but deliberately not acted on in that phase — that phase was frontend-only (`apps/web`), no backend/schema/Firestore/seed files were touched.

**Context:** the business is narrowing the catalog to sell only photo frames — no canvas prints, mugs, gift items, or multi-photo collage sets. The frontend has already been restyled and simplified to assume this (single-category browsing, a 3-axis purchase flow: Size / Frame Design / Orientation), while the live Firestore data and seed script still contain the full multi-category catalog underneath. The items below close that gap.

---

## 1. Prune non-frame products and categories

- Remove products (and their `variants`/`frameTemplates`/`media` subcollections) belonging to `cat_canvas`, `cat_collage`, `cat_gifts` from both `scripts/seed/src/data.ts` and the live `bropics-app` Firestore project.
- Decide: hard-delete the `cat_canvas`/`cat_collage`/`cat_gifts` `Category` documents, or keep-but-hide (`isActive: false`) in case any are needed again later. Hard-delete is simpler if this is a permanent decision; keep-but-hide is safer if it might not be.
- `cat_frames` stays as the one real category. The frontend's "Shop" nav link and "Shop by Size" tiles currently hardcode its slug (`frames-wall-decor`) — update if the slug changes.

## 2. `Variant.material`

The frontend no longer surfaces `material` as a customer-facing filter or selector (frames-only, single implied material per product). The schema field itself is untouched. Decide one of:
- Remove `material` from `VariantSchema` entirely (needs a data migration across all remaining frame variants, plus removing `Product.availableMaterials` and its denormalization trigger in `functions/src/products/denormalize.ts`).
- Keep it as internal/admin-only data (e.g. for the admin panel's product-editing UI, or internal SKU management) without exposing it to customers. No migration needed, just leave as-is.

## 3. `categoryId`-based Firestore indexes

`packages/shared/src/search/build-query-plan.ts` treats `categoryId` as a first-class query constraint, and `firestore.indexes.json` has composite indexes built around it. Once the catalog is genuinely single-category, evaluate whether these indexes (and the `categoryId` constraint path in `build-query-plan.ts`) can be simplified or dropped — a cost/complexity reduction, not a correctness requirement (queries still work fine with a single category value).

## 4. Orientation

Currently **frontend-only-derived** (`apps/web/lib/orientation.ts`, computed from each variant's existing `widthIn`/`heightIn` — no schema change, no new field). This is sufficient for display and for the category-listing filter (implemented as a client-side post-filter, not a Firestore query constraint — see the design spec's §5 "Known deviations").

Only add a real `orientation` field to `VariantSchema` if the business decides orientation should become an **independently priced/stocked SKU dimension** — e.g. a "12×18 Portrait" and "12×18 Landscape" become genuinely different variants with their own price/stock, not just the same physical dimensions viewed differently. If that's never needed, the frontend-derived approach can stay permanently and this item can be closed as "not needed."

## 5. `Product.occasionTags`

Gift-occasion tagging (`ProductSchema.occasionTags`) is vestigial now that gift items are cut. Candidate for removal, low priority — inert data doesn't hurt anything on its own.

## 6. `FrameTemplate` multi-slot support

`FrameTemplateSchema.printableRects[]` supports multiple photo slots per frame (`slotIndex`), which existed to support the multi-photo collage-set products now being cut. If every remaining frame product is single-photo, this multi-slot support becomes unused complexity in both the schema and the personalization editor (`EditorCanvas.tsx`, `SlotPicker.tsx`, `PersonalizationEditor.tsx`). Needs a business decision, not an automatic removal:
- If the business ever wants a multi-opening *frame* (as opposed to a collage *set* of separate frames — e.g. one physical frame with 3 photo windows, a real frame product, not a gift-set), keep the multi-slot support.
- If not, it can be simplified to always-single-slot, removing `slotIndex`/multi-rect handling from the editor.

## 7. What was explicitly decided *not* to change

Recorded here so it isn't re-litigated as a surprise later: "Frame Design" (the customer-facing selector) was mapped onto the *existing* `frameColour` field rather than becoming a new decorative-moulding-pattern field. There is currently no schema representation for "moulding style" (plain vs. ornate vs. vintage-carved) as distinct from colour/finish — if the business later wants that as a genuinely separate axis, it needs new schema work; it was a considered option this round and deliberately not chosen (see the design spec's §2).
