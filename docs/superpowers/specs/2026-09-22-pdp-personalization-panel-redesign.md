# PDP personalization panel — visual & structural redesign (Ritwika's-inspired)

**Frontend-only.** No schema, Firestore, Cloud Function, or API changes.
Touches `apps/web/components/product/`, `apps/web/components/editor/`, and
`apps/web/components/ui/` only.

## 1. Motivation

The client asked for our product-page personalization experience to match
the overall structure of a reference competitor site (Ritwika's — "Heart
Shaped 5 Pictures Collage" product page): a clear photo-upload/customization
panel, product preview, personalization fields, clipart selection, a
Preview step, Add to Cart, a delivery timeline, and a support/help callout.
The explicit ask was **experience and layout**, adapted to our own
cream/ink/gold visual identity — not a copy of Ritwika's styling.

Investigation found our existing PDP (`ProductDetailClient.tsx` +
`PersonalizationEditor.tsx`) already implements most of this, and in one
respect more capably than the reference: it renders a **live composited
canvas preview** (photo visibly sitting inside the frame, updating in real
time as the shopper uploads/crops/zooms/rotates/drags, with a live DPI
quality badge) rather than Ritwika's flow of separate static upload
placeholders plus a manual "Preview" click to see the result for the first
time. This redesign explicitly preserves the live-canvas approach — see §2,
decision confirmed with the client during brainstorming — and closes the
remaining real gaps instead: no product photography stays visible during
personalization, no full-size preview view exists, and the support contact
is a single bare text link rather than a designed callout.

## 2. Decisions locked in during brainstorming

| Area | Decision | Why |
|---|---|---|
| Live preview vs. click-to-preview | **Keep the live canvas preview** | Strictly better UX than the reference's static-boxes-then-click-Preview flow; switching would be a regression the client did not ask for. |
| Multi-slot picker | **Keep the compact numbered-tab row, restyle only** | Already space-efficient and consistent with the rest of the page's compact selectors (size/colour); a full grid of named boxes (Ritwika's approach) would cost significant vertical space for no functional gain. |
| "Preview" button | **Add one — opens a full-size lightbox of the current canvas composite** | Additive, zero new state (canvas already exposes `previewDataUrl`), useful on small screens where the inline canvas is compact. |
| "Need Help?" support | **Add a boxed callout** (WhatsApp + `support@bropics.in`), replacing the current single inline WhatsApp link | Matches the reference's visual weight for support; email address already exists in the codebase (`support@bropics.in`, used on `/contact` and `/privacy`). |
| Delivery timeline dates | **Keep day-count ranges, do not switch to literal calendar dates** | The PDP uses 60-second ISR; a literal date computed at revalidation time would drift from "today" for whoever actually loads the cached page. Day-count ranges are always accurate regardless of render time. |
| Product photography during personalization | **Add a compact gallery strip above the editor** | Currently product photos vanish entirely once a personalization template exists for the selected variant — a real gap versus the reference, which keeps its photo thumbnail rail visible throughout. |

## 3. New components

### 3.1 `components/ui/Lightbox.tsx` (new)

Extracted from the full-screen zoom-modal pattern that already exists
inline inside `Gallery.tsx` (`fixed inset-0 z-50 bg-ink/90`, click-to-close,
`next/image` with `fill`/`object-contain`). Becomes a small reusable
component:

```ts
interface LightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}
```

Two call sites after this change:
- `Gallery.tsx`'s existing zoom-on-click behavior — swapped to use
  `<Lightbox>` instead of its inline JSX. No visible or behavioral change
  for `Gallery`'s existing callers/tests beyond the internal refactor.
- `PersonalizationEditor.tsx`'s new "Preview" button (§3.3).

### 3.2 `components/product/GalleryStrip.tsx` (new)

A compact, thumbnails-only companion to the full `Gallery` component, shown
above the live canvas whenever the inline editor is active (i.e. exactly
when `Gallery` itself would otherwise be hidden). No large hero image — the
canvas is already the page's visual focus — just a horizontally-scrolling
row of small square thumbnails (same `rail flex gap-2 overflow-x-auto`
pattern `Gallery`'s existing thumbnail rail and `SlotPicker` both already
use, for visual consistency). Clicking a thumbnail opens it in `Lightbox`.

```ts
interface GalleryStripProps {
  media: ProductMedia[];
  productTitle: string;
}
```

Reuses `ProductDetailClient`'s existing `galleryMedia` (already computed via
`selectGalleryMedia`) — no new data fetching. `ProductDetailClient` passes
it to `PersonalizationEditor` as a new prop rather than only using it in the
`Gallery` fallback branch.

If `media` is empty, renders nothing (same convention as `Gallery` and
`ClipartPicker`).

### 3.3 Preview button (in `PersonalizationEditor.tsx`)

Added to the existing zoom/rotate/reset controls row (same row, reads as
part of the same toolbar), rightmost position. Disabled (matching the
existing disabled-button visual treatment used elsewhere, e.g. `Button`'s
`disabled:opacity-40`) until `slots.size > 0` — no point previewing an empty
frame. On click, opens `<Lightbox src={previewDataUrl} ...>` using the
`previewDataUrl` state `ProductDetailClient` already tracks via
`onCanvasUpdate` — zero new prop plumbing beyond passing the existing value
and an `onPreview`/open-state callback down.

### 3.4 `components/product/HelpCallout.tsx` (new)

Small bordered card, visually matching the weight of `BuyBox`'s existing
trust-points strip (`bg-tint`, `rounded-2xl`, `border-line` or borderless —
final call made during implementation to whichever reads better against the
trust strip immediately below it). Contents:

- A one-line reassurance ("Need help uploading or personalizing? We're happy to help.")
- WhatsApp link, reusing `BuyBox`'s existing `whatsappMessage` construction
  (product title + current URL, hydration-safe two-pass render already
  established there)
- `mailto:support@bropics.in` link (existing address, already used as a
  literal string on `/contact` and `/privacy` — no shared constant exists
  yet, confirmed by search; add one, e.g. `lib/support-contact.ts`
  exporting `SUPPORT_EMAIL`, and have all three usages read from it instead
  of each restating the literal)

Side-by-side on `sm:` and wider, stacked on mobile. Replaces the current
bare `<a>Need help? Chat with us on WhatsApp</a>` line in `BuyBox.tsx`.

```ts
interface HelpCalloutProps {
  productTitle: string;
}
```

## 4. Visual polish (no structural/behavioral change)

Applied directly to the existing components — same props, same logic, same
tests' assertions about behavior, only className/markup changes:

- **`SlotPicker.tsx`**: tabs grow from `w-10 h-10` to `w-11 h-11` (44px,
  matching other tap targets on the page e.g. `ClipartPicker`'s current
  buttons). Active-tab styling switches from `bg-accent text-paper
  border-accent` to `bg-gold text-ink border-gold`, matching the page's
  primary-action color (gold) rather than the secondary/link color (accent
  blue) — the slot picker is a primary editing control, not a link.
- **`ClipartPicker.tsx`**: swatch buttons grow from `w-11 h-11` to `w-14
  h-14`. Each button gets an optional caption (`option.label`) rendered
  below it in `text-2xs text-ink/60`, only when present — clipart choices
  currently rely on the icon alone.
- **`TextFieldEditor.tsx`**: spacing/typography tightened to match
  `VariantSelector`'s label conventions (`text-sm font-medium text-ink`
  labels, consistent `mb-1`/`gap` rhythm) so the text-field block reads as
  part of the same design system as the rest of the buy flow, not a
  visually separate block.

## 5. `ProductDetailClient.tsx` changes

- Pass `galleryMedia` to `PersonalizationEditor` as a new prop (already
  computed, currently only used in the `Gallery` fallback branch).
- Thread through the new preview-lightbox open/close state (or keep it
  local to `PersonalizationEditor` if the lightbox's open state has no
  reason to live in the parent — final call during implementation; nothing
  else needs to observe it).
- No changes to any of the existing DPI/transform/upload/add-to-cart logic.

## 6. What is explicitly NOT changing

- The live canvas rendering pipeline (`EditorCanvas.tsx`), DPI math, crop
  geometry — untouched.
- `DeliveryTimeline.tsx` — untouched (day-count ranges confirmed correct,
  see §2).
- Any backend route, Firestore schema, security rule, or Cloud Function.
- `Gallery`'s own visible behavior for products with no personalization
  template (its fallback usage is unaffected beyond the internal `Lightbox`
  refactor).
- Ritwika's "Availability: In Stock" / category tag list / social icons
  footer block on the PDP — not requested explicitly in scope, and adding
  it would need new data plumbing (categories aren't currently rendered on
  PDP) for a small cosmetic gain; flagged here as a possible small
  follow-up, not built now (YAGNI).

## 7. Testing

- New: `Lightbox.test.tsx` — renders with a given `src`, closes on
  backdrop click and on an explicit close control.
- New: `GalleryStrip.test.tsx` — renders thumbnails from `media`, renders
  nothing when `media` is empty, clicking a thumbnail opens the lightbox
  with that item's `src`.
- New: `HelpCallout.test.tsx` — WhatsApp href includes the product title
  and (post-hydration) the current URL matching `BuyBox`'s existing
  hydration-safe pattern; mailto href is exactly `mailto:support@bropics.in`.
- Updated: `Gallery.test.tsx` — same assertions, now exercised through the
  `Lightbox` component instead of inline JSX; confirms no behavior
  regression from the extraction.
- Updated: `PersonalizationEditor.test.tsx` — Preview button disabled with
  no photos in any slot, enabled and opens the lightbox with the correct
  `previewDataUrl` once at least one slot is filled; gallery strip renders
  when `media` is non-empty.
- No backend/API test changes — nothing server-side is touched.
- Manual browser verification pass on desktop and mobile viewports once
  built (mobile matters most here, given this project's prior history of
  fixed-WhatsApp-button overlap regressions on newly-added mobile layouts —
  see `PROJECT_STATUS.md` §5).

## 8. Out of scope / explicitly deferred

- Literal calendar-date delivery timeline (§2, rejected — ISR staleness risk).
- Full grid-of-named-boxes multi-slot picker (§2, rejected — space cost).
- Click-to-preview replacing the live canvas (§2, rejected — regression).
- Availability/category/social-icons footer block (§6, deferred as a
  possible small follow-up).
