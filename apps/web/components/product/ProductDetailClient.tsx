'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import type { FrameTemplate, Product, ProductMedia, Upload, Variant } from '@bro-pics/shared';
import {
  coverScale,
  coverScaleForRotation,
  centeredOffset,
  centeredOffsetForRotation,
  offsetAfterScaleChange,
  fractionRectToCanvasRect,
  slotCropRectInOriginalPx,
  EDITOR_CANVAS_SIZE,
  effectiveDpiFromCropRect,
  dpiTier,
  printDimensionsForRotation,
  type RotationDeg,
} from '@bro-pics/shared';
import { selectGalleryMedia } from '../../lib/gallery-media';
import { orientationFromDimensions, type Orientation } from '../../lib/orientation';
import { recordProductView } from '../../lib/recently-viewed';
import { getOrCreateSessionId } from '../../lib/session-id';
import { validateSlotsComplete, validateTextFieldsComplete } from '../../lib/editor-validation';
import { fontFamilyForKey, fontKeyForFamily } from '../../lib/text-personalization-options';
import { saveDraft, loadDraft, clearDraft, type PersonalizationDraft } from '../../lib/personalization-draft';
import { useToast } from '../ui/Toast';
import { Gallery } from './Gallery';
import { BuyBox } from './BuyBox';
import { PersonalizationEditor, type SlotState, type TextFieldValueMap } from '../editor/PersonalizationEditor';
import type { TextFieldValue } from '../editor/TextFieldEditor';

interface ProductDetailClientProps {
  product: Product;
  variants: Variant[];
  media: ProductMedia[];
  // Fetched server-side (one query against the product's own frameTemplates
  // subcollection) and passed down so the personalization editor is present
  // on the very first paint — a client-side fetch here previously left the
  // page showing the plain Gallery for ~1s before swapping to the editor
  // once the fetch resolved.
  initialTemplatesByVariant: Record<string, FrameTemplate>;
  // [FE-16] Set from the cart drawer's Edit link (?edit=). Rehydrates the
  // editor from the existing personalization instead of starting blank,
  // and switches Add to Cart's save path to update the SAME
  // personalizationId/cart line rather than creating a new one.
  editPersonalizationId?: string;
}

function orientationOf(v: Variant): Orientation {
  return orientationFromDimensions(v.widthIn, v.heightIn);
}

/**
 * Recomputes effectiveDpi for a slot from its current transform against the
 * slot's own printable rect. Called after every transform change (zoom,
 * rotate, drag, variant switch) so the DPI badge and the red-tier
 * confirmation gate always reflect where the photo is CURRENTLY positioned.
 * At 90°/270° rotation, variant.widthIn/heightIn must be axis-swapped
 * before being passed in — see printDimensionsForRotation's doc comment —
 * mirroring the identical swap /api/customizations applies server-side.
 */
function computeEffectiveDpi(
  slotRect: { x: number; y: number; width: number; height: number },
  widthPx: number,
  heightPx: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  rotationDeg: RotationDeg,
  variant: Variant
): number {
  const canvasRect = fractionRectToCanvasRect(slotRect, EDITOR_CANVAS_SIZE, EDITOR_CANVAS_SIZE);
  const cropRect = slotCropRectInOriginalPx(canvasRect.width, canvasRect.height, scale, offsetX, offsetY, rotationDeg);
  const { printWidthIn, printHeightIn } = printDimensionsForRotation(variant, rotationDeg);
  const { effectiveDpi } = effectiveDpiFromCropRect(widthPx, heightPx, cropRect, printWidthIn, printHeightIn);
  return effectiveDpi;
}

const MAX_ZOOM_MULTIPLE = 4;
const ZOOM_STEP_FACTOR = 1.25;

// [FE-06] Keyed by the `code` field POST /api/uploads returns (route.ts's
// own errorResponse) — a decode timeout and an oversized file need
// different customer-facing advice, not one generic "try again" line.
const UPLOAD_ERROR_MESSAGES: Record<string, string> = {
  file_too_large: 'This photo is too large — please use a file under 25 MB.',
  decode_timeout: 'This photo took too long to process — please try a smaller file.',
  decode_failed: "We couldn't read this photo — it may be corrupted or in an unsupported format.",
  rate_limited: 'Too many uploads in a row — please wait a moment and try again.',
  unknown_variant: "We couldn't set up this photo slot — please close and reopen the editor.",
};

export function ProductDetailClient({ product, variants, media, initialTemplatesByVariant, editPersonalizationId }: ProductDetailClientProps) {
  const { showToast } = useToast();
  const firstInStock = variants.find((v) => v.stockStatus === 'in_stock') ?? variants[0] ?? null;
  const [selectedSize, setSelectedSize] = useState(firstInStock?.sizeLabel ?? '');
  const [selectedColour, setSelectedColour] = useState(firstInStock?.frameColour ?? '');
  const [selectedOrientation, setSelectedOrientation] = useState<Orientation | ''>(
    firstInStock ? orientationOf(firstInStock) : ''
  );

  // Only the initial-load fallback (before the user has clicked anything).
  // Once the user interacts, the handlers below keep selectedSize/
  // selectedColour/selectedOrientation pinned to a combination that
  // actually has a matching variant, so this exact find() should always
  // succeed post-interaction.
  const selectedVariant = useMemo(
    () => variants.find((v) => v.sizeLabel === selectedSize && v.frameColour === selectedColour) ?? firstInStock,
    [variants, selectedSize, selectedColour, firstInStock]
  );

  const handleSelectSize = (size: string) => {
    const matching = variants.find((v) => v.sizeLabel === size && v.frameColour === selectedColour);
    if (matching) {
      setSelectedSize(size);
      return;
    }
    const fallback = variants.find((v) => v.sizeLabel === size);
    if (fallback) {
      setSelectedSize(fallback.sizeLabel);
      setSelectedColour(fallback.frameColour);
      setSelectedOrientation(orientationOf(fallback));
    }
  };

  const handleSelectColour = (colour: string) => {
    const matching = variants.find((v) => v.frameColour === colour && v.sizeLabel === selectedSize);
    if (matching) {
      setSelectedColour(colour);
      return;
    }
    const sameOrientation = variants.find((v) => v.frameColour === colour && orientationOf(v) === selectedOrientation);
    const fallback = sameOrientation ?? variants.find((v) => v.frameColour === colour);
    if (fallback) {
      setSelectedColour(fallback.frameColour);
      setSelectedSize(fallback.sizeLabel);
      setSelectedOrientation(orientationOf(fallback));
    }
  };

  const handleSelectOrientation = (orientation: Orientation) => {
    const sameColour = variants.find((v) => orientationOf(v) === orientation && v.frameColour === selectedColour);
    const fallback = sameColour ?? variants.find((v) => orientationOf(v) === orientation);
    if (fallback) {
      setSelectedOrientation(orientation);
      setSelectedSize(fallback.sizeLabel);
      setSelectedColour(fallback.frameColour);
    }
  };

  const galleryMedia = useMemo(
    () => selectGalleryMedia(media, selectedVariant?.id ?? null),
    [media, selectedVariant]
  );

  useEffect(() => {
    recordProductView(product.id);
  }, [product.id]);

  // --- Personalization state, lifted up from the old modal editor so both
  // the inline canvas panel (left column) and BuyBox's Add-to-Cart button
  // (right column) can read/drive the same state. ---

  // Seeded from the server-fetched prop — every variant's template is
  // already known on first render, so switching Size/Colour swaps the
  // canvas in place instantly with no blank/loading flash, and the editor
  // (rather than a placeholder Gallery) is what the very first paint shows.
  const templatesByVariant = useMemo(
    () => new Map(Object.entries(initialTemplatesByVariant)),
    [initialTemplatesByVariant]
  );

  const template = selectedVariant ? (templatesByVariant.get(selectedVariant.id) ?? null) : null;
  const templateStatus: 'loaded' | 'empty' = template ? 'loaded' : 'empty';

  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [slots, setSlots] = useState<Map<number, SlotState>>(new Map());
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [textFields, setTextFields] = useState<TextFieldValueMap>(new Map());
  const [selectedClipartId, setSelectedClipartId] = useState<string | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);

  // [FE-09] Undo/redo — snapshot-based, not a per-action command pattern:
  // capturing {slots, textFields, selectedClipartId} as a whole is much
  // simpler and safer than modeling a reverse operation for every action
  // type, and every SlotState/TextFieldValue object is already replaced
  // (never mutated in place) by every setSlots/setTextFields call in this
  // file, so a shallow Map clone is a genuine, independent snapshot. The
  // debounced watcher below coalesces a whole drag/zoom-slider/typing
  // gesture into ONE history entry (an undo step per keystroke or per
  // pixel dragged would be useless), without needing a "gesture end"
  // callback threaded through EditorCanvas/PersonalizationEditor.
  const HISTORY_LIMIT = 50;
  const HISTORY_DEBOUNCE_MS = 400;
  const historyRef = useRef<Array<{ slots: Map<number, SlotState>; textFields: TextFieldValueMap; selectedClipartId: string | null }>>([]);
  const historyIndexRef = useRef(-1);
  const isRestoringHistoryRef = useRef(false);
  const historyDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    if (isRestoringHistoryRef.current) {
      isRestoringHistoryRef.current = false;
      return;
    }
    if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current);
    historyDebounceRef.current = setTimeout(() => {
      const snapshot = { slots: new Map(slots), textFields: new Map(textFields), selectedClipartId };
      const truncated = historyRef.current.slice(0, historyIndexRef.current + 1);
      truncated.push(snapshot);
      historyRef.current = truncated.length > HISTORY_LIMIT ? truncated.slice(truncated.length - HISTORY_LIMIT) : truncated;
      historyIndexRef.current = historyRef.current.length - 1;
      setCanUndo(historyIndexRef.current > 0);
      setCanRedo(false);
    }, HISTORY_DEBOUNCE_MS);
    return () => {
      if (historyDebounceRef.current) clearTimeout(historyDebounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, textFields, selectedClipartId]);

  const restoreHistorySnapshot = (index: number) => {
    const snapshot = historyRef.current[index];
    if (!snapshot) return;
    historyIndexRef.current = index;
    isRestoringHistoryRef.current = true;
    setSlots(new Map(snapshot.slots));
    setTextFields(new Map(snapshot.textFields));
    setSelectedClipartId(snapshot.selectedClipartId);
    setCanUndo(index > 0);
    setCanRedo(index < historyRef.current.length - 1);
  };

  const handleUndo = () => {
    if (historyIndexRef.current <= 0) return;
    restoreHistorySnapshot(historyIndexRef.current - 1);
  };

  const handleRedo = () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    restoreHistorySnapshot(historyIndexRef.current + 1);
  };

  // Desktop keyboard shortcuts only (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or
  // Ctrl+Y) — skipped while focus is inside a text input/textarea (the
  // Name/Date personalization fields) so this never hijacks a browser's
  // own native text-undo inside those fields.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.key.toLowerCase() === 'z' && event.shiftKey) {
        event.preventDefault();
        handleRedo();
      } else if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        handleUndo();
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // [FE-11] Draft autosave — localStorage only (BE-12's server-side
  // PUT /api/customizations/{id} draft endpoint exists, but a real
  // Customization doc is only ever created at Add-to-Cart time in this
  // file today; wiring an early draft doc into that lifecycle is a bigger
  // restructuring than autosave itself, deliberately deferred, not
  // silently skipped — see PROJECT_STATUS.md). Debounced the same way
  // the undo/redo history watcher above is, coalescing a whole
  // drag/typing burst into one save rather than one per keystroke/pixel.
  const [pendingDraft, setPendingDraft] = useState<PersonalizationDraft | null>(null);
  const [restoringDraft, setRestoringDraft] = useState(false);
  const draftCheckedRef = useRef(false);
  const draftSaveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (draftCheckedRef.current || !selectedVariant || slots.size > 0) return;
    draftCheckedRef.current = true;
    const draft = loadDraft(product.id, selectedVariant.id);
    if (draft) setPendingDraft(draft);
  }, [selectedVariant, product.id, slots.size]);

  useEffect(() => {
    if (!selectedVariant || slots.size === 0) return;
    if (draftSaveDebounceRef.current) clearTimeout(draftSaveDebounceRef.current);
    draftSaveDebounceRef.current = setTimeout(() => {
      saveDraft(product.id, selectedVariant.id, {
        activeSlotIndex,
        selectedClipartId,
        slots: [...slots.entries()].map(([slotIndex, s]) => ({
          slotIndex,
          uploadId: s.uploadId,
          scale: s.scale,
          offsetX: s.offsetX,
          offsetY: s.offsetY,
          rotationDeg: s.rotationDeg,
          confirmedLowDpi: s.confirmedLowDpi,
        })),
        textFields: [...textFields.entries()].map(([key, value]) => ({ key, value })),
      });
    }, 400);
    return () => {
      if (draftSaveDebounceRef.current) clearTimeout(draftSaveDebounceRef.current);
    };
  }, [slots, textFields, selectedClipartId, activeSlotIndex, selectedVariant, product.id]);

  const handleRestoreDraft = async () => {
    if (!pendingDraft || !selectedVariant || !template) return;
    setRestoringDraft(true);
    try {
      const sessionId = ensureSessionId();
      const restoredEntries = await Promise.all(
        pendingDraft.slots.map(async (draftSlot) => {
          try {
            const res = await fetch(`/api/uploads/${draftSlot.uploadId}`, { headers: { 'X-Session-Id': sessionId } });
            if (!res.ok) return null;
            const upload = await res.json();
            if (upload.status !== 'ready' || !upload.previewUrl) return null;
            const slotRect = template.printableRects.find((r) => r.slotIndex === draftSlot.slotIndex);
            if (!slotRect) return null;
            const effectiveDpi = computeEffectiveDpi(
              slotRect,
              upload.widthPx,
              upload.heightPx,
              draftSlot.scale,
              draftSlot.offsetX,
              draftSlot.offsetY,
              draftSlot.rotationDeg,
              selectedVariant
            );
            const restored: SlotState = {
              uploadId: draftSlot.uploadId,
              originalUrl: upload.previewUrl,
              widthPx: upload.widthPx,
              heightPx: upload.heightPx,
              scale: draftSlot.scale,
              offsetX: draftSlot.offsetX,
              offsetY: draftSlot.offsetY,
              rotationDeg: draftSlot.rotationDeg,
              effectiveDpi,
              confirmedLowDpi: draftSlot.confirmedLowDpi,
            };
            return [draftSlot.slotIndex, restored] as const;
          } catch {
            return null;
          }
        })
      );
      const restoredSlots = new Map(restoredEntries.filter((e): e is readonly [number, SlotState] => e !== null));
      if (restoredSlots.size === 0) {
        setUploadError("We couldn't restore your saved design — the photo may have expired. Please start again.");
        clearDraft(product.id, selectedVariant.id);
        setPendingDraft(null);
        return;
      }
      setSlots(restoredSlots);
      setActiveSlotIndex(pendingDraft.activeSlotIndex);
      setSelectedClipartId(pendingDraft.selectedClipartId);
      setTextFields(new Map(pendingDraft.textFields.map((f) => [f.key, f.value as TextFieldValue])));
      setPendingDraft(null);
    } finally {
      setRestoringDraft(false);
    }
  };

  const handleDiscardDraft = () => {
    if (selectedVariant) clearDraft(product.id, selectedVariant.id);
    setPendingDraft(null);
  };

  // [FE-16] Re-edit from cart — rehydrates the editor from an existing
  // personalization's Customization docs (?edit={personalizationId}) via
  // GET /api/customizations (FE-16/FE-24's shared read endpoint), re-
  // resolving each slot's photo to a fresh URL via GET /api/uploads/{id}
  // (BE-08) rather than trusting any stored one. `editingDocIdsRef` maps
  // slotIndex -> the EXISTING customization doc id, so the save path
  // below can PUT-update those in place instead of creating new ones —
  // a slot with no entry here (added during this edit) still POSTs, same
  // as a first-time personalization.
  const [isEditingCartLine, setIsEditingCartLine] = useState(false);
  const editingDocIdsRef = useRef<Map<number, string>>(new Map());
  const editCheckedRef = useRef(false);

  useEffect(() => {
    if (editCheckedRef.current || !editPersonalizationId || !selectedVariant || !template) return;
    editCheckedRef.current = true;
    (async () => {
      try {
        const sessionId = ensureSessionId();
        const res = await fetch(`/api/customizations?personalizationId=${encodeURIComponent(editPersonalizationId)}`, {
          headers: { 'X-Session-Id': sessionId },
        });
        if (!res.ok) return;
        const body = await res.json();
        const customizations: Array<{
          id: string;
          slotIndex: number;
          uploadId: string;
          transformJson: { scale: number; offsetX: number; offsetY: number; rotationDeg: RotationDeg };
          effectiveDpi: number;
          redConfirmedAt?: unknown;
          clipartId?: string;
          textFieldsJson?: Record<string, { value: string; fontFamily: string; color: string }>;
        }> = body.customizations ?? [];
        if (customizations.length === 0) return;

        const restoredEntries = await Promise.all(
          customizations.map(async (c) => {
            try {
              const uploadRes = await fetch(`/api/uploads/${c.uploadId}`, { headers: { 'X-Session-Id': sessionId } });
              if (!uploadRes.ok) return null;
              const upload = await uploadRes.json();
              if (upload.status !== 'ready' || !upload.previewUrl) return null;
              const restored: SlotState = {
                uploadId: c.uploadId,
                originalUrl: upload.previewUrl,
                widthPx: upload.widthPx,
                heightPx: upload.heightPx,
                scale: c.transformJson.scale,
                offsetX: c.transformJson.offsetX,
                offsetY: c.transformJson.offsetY,
                rotationDeg: c.transformJson.rotationDeg,
                effectiveDpi: c.effectiveDpi,
                confirmedLowDpi: !!c.redConfirmedAt,
              };
              return { slotIndex: c.slotIndex, slot: restored, docId: c.id };
            } catch {
              return null;
            }
          })
        );
        const restored = restoredEntries.filter((e): e is NonNullable<typeof e> => e !== null);
        if (restored.length === 0) return;

        setSlots(new Map(restored.map((r) => [r.slotIndex, r.slot])));
        editingDocIdsRef.current = new Map(restored.map((r) => [r.slotIndex, r.docId]));

        const withText = customizations.find((c) => c.textFieldsJson);
        if (withText?.textFieldsJson) {
          setTextFields(
            new Map(
              Object.entries(withText.textFieldsJson).map(([key, v]) => [
                key,
                { value: v.value, fontKey: fontKeyForFamily(v.fontFamily), color: v.color },
              ])
            )
          );
        }
        const withClipart = customizations.find((c) => c.clipartId);
        setSelectedClipartId(withClipart?.clipartId ?? null);
        setIsEditingCartLine(true);
      } catch {
        // Best-effort — a failed rehydrate just leaves the editor blank,
        // same as a customer visiting this product fresh.
      }
    })();
  }, [editPersonalizationId, selectedVariant, template]);

  // Lazily resolved on first actual use (upload or add-to-cart), not on
  // every mount — a product page that's never personalized shouldn't touch
  // localStorage at all. Once resolved it's stable for the lifetime of this
  // page's editing flow — see the original PersonalizationEditor's
  // identical comment for why this must not be re-read per call (sign-in
  // mid-flow rotates the stored id).
  const sessionIdRef = useRef<string | null>(null);
  const ensureSessionId = (): string => {
    if (sessionIdRef.current === null) {
      sessionIdRef.current = getOrCreateSessionId();
    }
    return sessionIdRef.current;
  };

  // When the resolved template for the selected variant changes (a
  // Size/Colour switch that lands on a different FrameTemplate), re-fit
  // already-filled slots ONLY if the printable rect geometry actually changed
  // (e.g. aspect ratio/size change). Switching frame colour preserves the
  // customer's exact photo zoom, pan, and rotation.
  const templateIdRef = useRef<string | null>(null);
  const prevRectsRef = useRef<Map<number, { x: number; y: number; width: number; height: number }>>(new Map());

  useEffect(() => {
    if (!template || templateIdRef.current === template.id) return;
    templateIdRef.current = template.id;

    if (slots.size === 0) {
      const currentRects = new Map<number, { x: number; y: number; width: number; height: number }>();
      for (const r of template.printableRects) {
        currentRects.set(r.slotIndex, { x: r.x, y: r.y, width: r.width, height: r.height });
      }
      prevRectsRef.current = currentRects;
      return;
    }

    const worsenedSlots: number[] = [];
    const next = new Map<number, SlotState>();

    for (const [slotIndex, slot] of slots.entries()) {
      const rect = template.printableRects.find((r) => r.slotIndex === slotIndex);
      if (!rect) {
        next.set(slotIndex, slot);
        continue;
      }

      const prevRect = prevRectsRef.current.get(slotIndex);
      const isSameRect =
        prevRect &&
        Math.abs(prevRect.x - rect.x) < 0.0001 &&
        Math.abs(prevRect.y - rect.y) < 0.0001 &&
        Math.abs(prevRect.width - rect.width) < 0.0001 &&
        Math.abs(prevRect.height - rect.height) < 0.0001;

      const tierOrder = { green: 0, amber: 1, red: 2 } as const;
      if (isSameRect) {
        // Frame geometry did not change (e.g. only frame colour changed) -> PRESERVE user transform!
        const effectiveDpi = selectedVariant
          ? computeEffectiveDpi(rect, slot.widthPx, slot.heightPx, slot.scale, slot.offsetX, slot.offsetY, slot.rotationDeg, selectedVariant)
          : slot.effectiveDpi;
        if (tierOrder[dpiTier(effectiveDpi)] > tierOrder[dpiTier(slot.effectiveDpi)]) {
          worsenedSlots.push(slotIndex);
        }
        next.set(slotIndex, { ...slot, effectiveDpi });
      } else {
        // Geometry changed -> re-fit to new slot rect
        const canvasRect = fractionRectToCanvasRect(rect, EDITOR_CANVAS_SIZE, EDITOR_CANVAS_SIZE);
        const scale = coverScaleForRotation(canvasRect.width, canvasRect.height, slot.widthPx, slot.heightPx, slot.rotationDeg);
        const { offsetX, offsetY } = centeredOffsetForRotation(
          canvasRect.width,
          canvasRect.height,
          slot.widthPx,
          slot.heightPx,
          scale,
          slot.rotationDeg
        );
        const effectiveDpi = selectedVariant
          ? computeEffectiveDpi(rect, slot.widthPx, slot.heightPx, scale, offsetX, offsetY, slot.rotationDeg, selectedVariant)
          : slot.effectiveDpi;
        const tierOrder = { green: 0, amber: 1, red: 2 } as const;
        if (tierOrder[dpiTier(effectiveDpi)] > tierOrder[dpiTier(slot.effectiveDpi)]) {
          worsenedSlots.push(slotIndex);
        }
        next.set(slotIndex, { ...slot, scale, offsetX, offsetY, effectiveDpi, confirmedLowDpi: false });
      }
    }

    const currentRects = new Map<number, { x: number; y: number; width: number; height: number }>();
    for (const r of template.printableRects) {
      currentRects.set(r.slotIndex, { x: r.x, y: r.y, width: r.width, height: r.height });
    }
    prevRectsRef.current = currentRects;

    setSlots(next);
    if (worsenedSlots.length > 0) {
      showToast(
        worsenedSlots.length === 1
          ? `Photo quality for slot ${worsenedSlots[0] + 1} is lower on this size/colour — check before adding to cart.`
          : `Photo quality for ${worsenedSlots.length} slots is lower on this size/colour — check before adding to cart.`,
        'info'
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.id]);

  const activeSlot = slots.get(activeSlotIndex);
  const activeRect = template?.printableRects.find((r) => r.slotIndex === activeSlotIndex);
  const activeSlotIsRed = activeSlot !== undefined && dpiTier(activeSlot.effectiveDpi) === 'red';

  const photoCompletion = validateSlotsComplete(
    product.photoSlots,
    new Map(Array.from(slots.entries()).map(([i, s]) => [i, { effectiveDpi: s.effectiveDpi, confirmedLowDpi: s.confirmedLowDpi }]))
  );
  // [FE-12] A required text zone blocks Add to Cart the same way an
  // empty photo slot already does — checked after photo completion so
  // the more fundamental "no photo yet" reason still wins when both are
  // true.
  const completion = !photoCompletion.complete
    ? photoCompletion
    : validateTextFieldsComplete(template?.textZones ?? [], textFields);

  const handleFileChange = async (file: File, slotIndex: number) => {
    if (!selectedVariant || !template) return;
    const slotRect = template.printableRects.find((r) => r.slotIndex === slotIndex);
    if (!slotRect) {
      setUploadError("We couldn't set up this photo slot — please close and reopen the editor.");
      return;
    }

    setUploadError(null);

    const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError('This photo is too large — please use a file under 25 MB.');
      return;
    }

    setUploadingSlot(slotIndex);
    try {
      const sessionId = ensureSessionId();
      const formData = new FormData();
      formData.append('file', file);
      // The server looks up minUploadPx from this variantId itself — a
      // client-supplied minUploadPx would be trivially bypassable.
      formData.append('variantId', selectedVariant.id);

      const res = await fetch('/api/uploads', {
        method: 'POST',
        headers: { 'X-Session-Id': sessionId },
        body: formData,
      });
      // POST /api/uploads returns the persisted Upload doc (originalPath)
      // plus a freshly-signed, never-persisted originalUrl for immediate
      // canvas display — see that route for why the two are kept separate.
      const body = await res.json();

      if (!res.ok) {
        // [FE-06] Map the server's own error `code` (route.ts's
        // errorResponse) to a message specific enough to act on, instead
        // of one generic "try a different file" line for every failure —
        // a decode timeout and a 25MB-over file need different advice.
        setUploadError(UPLOAD_ERROR_MESSAGES[body.code] ?? "We couldn't process this photo — please try a different file.");
        return;
      }
      const upload: Upload & { originalUrl: string } = body;
      if (upload.status === 'rejected') {
        setUploadError("We couldn't process this photo — please try a different file.");
        return;
      }

      const canvasRect = fractionRectToCanvasRect(slotRect, EDITOR_CANVAS_SIZE, EDITOR_CANVAS_SIZE);
      const scale = coverScale(canvasRect.width, canvasRect.height, upload.widthPx, upload.heightPx);
      const { offsetX, offsetY } = centeredOffset(canvasRect.width, canvasRect.height, upload.widthPx, upload.heightPx, scale);
      const effectiveDpi = computeEffectiveDpi(slotRect, upload.widthPx, upload.heightPx, scale, offsetX, offsetY, 0, selectedVariant);

      setSlots((prev) => {
        const next = new Map(prev);
        next.set(slotIndex, {
          uploadId: upload.id,
          originalUrl: upload.originalUrl,
          widthPx: upload.widthPx,
          heightPx: upload.heightPx,
          scale,
          offsetX,
          offsetY,
          rotationDeg: 0,
          effectiveDpi,
          // A fresh photo always needs a fresh confirmation if it's still
          // red-tier — never inherit a previous photo's confirmation.
          confirmedLowDpi: false,
        });
        return next;
      });
    } catch {
      setUploadError('Upload failed. Please check your connection and try again.');
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleZoomTo = (newScale: number) => {
    setSlots((prev) => {
      const current = prev.get(activeSlotIndex);
      if (!current || !activeRect || !selectedVariant) return prev;
      const canvasRect = fractionRectToCanvasRect(activeRect, EDITOR_CANVAS_SIZE, EDITOR_CANVAS_SIZE);
      const minScale = coverScaleForRotation(canvasRect.width, canvasRect.height, current.widthPx, current.heightPx, current.rotationDeg);
      const maxScale = minScale * MAX_ZOOM_MULTIPLE;
      const clamped = Math.min(maxScale, Math.max(minScale, newScale));
      if (clamped === current.scale) return prev;
      const { offsetX, offsetY } = offsetAfterScaleChange(current.offsetX, current.offsetY, current.scale, clamped, canvasRect.width, canvasRect.height);
      const effectiveDpi = computeEffectiveDpi(activeRect, current.widthPx, current.heightPx, clamped, offsetX, offsetY, current.rotationDeg, selectedVariant);
      const next = new Map(prev);
      next.set(activeSlotIndex, { ...current, scale: clamped, offsetX, offsetY, effectiveDpi });
      return next;
    });
  };

  const handleZoom = (factor: number) => {
    const current = slots.get(activeSlotIndex);
    if (!current) return;
    handleZoomTo(current.scale * factor);
  };

  const handleRotate = () => {
    setSlots((prev) => {
      const current = prev.get(activeSlotIndex);
      if (!current || !activeRect || !selectedVariant) return prev;
      const canvasRect = fractionRectToCanvasRect(activeRect, EDITOR_CANVAS_SIZE, EDITOR_CANVAS_SIZE);
      const newRotation = ((current.rotationDeg + 90) % 360) as RotationDeg;
      const minScale = coverScaleForRotation(canvasRect.width, canvasRect.height, current.widthPx, current.heightPx, newRotation);
      const newScale = Math.max(current.scale, minScale);
      const { offsetX, offsetY } = centeredOffsetForRotation(canvasRect.width, canvasRect.height, current.widthPx, current.heightPx, newScale, newRotation);
      const effectiveDpi = computeEffectiveDpi(activeRect, current.widthPx, current.heightPx, newScale, offsetX, offsetY, newRotation, selectedVariant);
      const next = new Map(prev);
      next.set(activeSlotIndex, { ...current, rotationDeg: newRotation, scale: newScale, offsetX, offsetY, effectiveDpi });
      return next;
    });
  };

  const handleReset = () => {
    setSlots((prev) => {
      const current = prev.get(activeSlotIndex);
      if (!current || !activeRect || !selectedVariant) return prev;
      const canvasRect = fractionRectToCanvasRect(activeRect, EDITOR_CANVAS_SIZE, EDITOR_CANVAS_SIZE);
      const scale = coverScale(canvasRect.width, canvasRect.height, current.widthPx, current.heightPx);
      const { offsetX, offsetY } = centeredOffset(canvasRect.width, canvasRect.height, current.widthPx, current.heightPx, scale);
      const effectiveDpi = computeEffectiveDpi(activeRect, current.widthPx, current.heightPx, scale, offsetX, offsetY, 0, selectedVariant);
      const next = new Map(prev);
      next.set(activeSlotIndex, { ...current, scale, offsetX, offsetY, rotationDeg: 0, effectiveDpi });
      return next;
    });
  };

  const handleTransformChange = (slotIndex: number, transform: { scale: number; offsetX: number; offsetY: number }) => {
    setSlots((prev) => {
      const current = prev.get(slotIndex);
      const rect = template?.printableRects.find((r) => r.slotIndex === slotIndex);
      if (!current || !rect || !selectedVariant) return prev;
      const effectiveDpi = computeEffectiveDpi(rect, current.widthPx, current.heightPx, transform.scale, transform.offsetX, transform.offsetY, current.rotationDeg, selectedVariant);
      const next = new Map(prev);
      next.set(slotIndex, { ...current, ...transform, effectiveDpi });
      return next;
    });
  };

  const handleConfirmLowDpi = (checked: boolean) => {
    setSlots((prev) => {
      const current = prev.get(activeSlotIndex);
      if (!current) return prev;
      const next = new Map(prev);
      next.set(activeSlotIndex, { ...current, confirmedLowDpi: checked });
      return next;
    });
  };

  const handleTextFieldChange = (fieldKey: string, value: { value: string; fontKey: string; color: string }) => {
    setTextFields((prev) => {
      const next = new Map(prev);
      next.set(fieldKey, value);
      return next;
    });
  };

  const handleAddToCart = async (quantity: number, onDone: (personalizationId: string, previewPath?: string) => void) => {
    if (submitting || !selectedVariant || !template) return;
    setSubmitting(true);
    setSubmitError(null);

    const personalizationId = isEditingCartLine && editPersonalizationId ? editPersonalizationId : crypto.randomUUID();
    const sessionId = ensureSessionId();

    // One shared preview for the whole personalization (every slot now
    // renders onto the same persistent canvas) rather than one capture
    // per slot — uploaded once and reused as every slot's Customization
    // doc's previewPath, and as the cart line's own thumbnail (resolved to
    // a display URL on demand — see lib/resolve-media-url.ts — never
    // persisted as a URL, which would expire in an hour).
    let sharedPreviewPath: string | undefined;
    if (previewDataUrl) {
      try {
        const previewRes = await fetch('/api/uploads/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
          body: JSON.stringify({ personalizationId, slotIndex: 0, dataUrl: previewDataUrl }),
        });
        if (previewRes.ok) {
          const previewBody = await previewRes.json();
          if (typeof previewBody.previewPath === 'string') sharedPreviewPath = previewBody.previewPath;
        }
      } catch {
        // Non-fatal — a failed preview export/upload must never block
        // checkout completion.
      }
    }

    const textFieldsJson: Record<string, { value: string; fontFamily: string; color: string }> | undefined =
      product.allowsTextPersonalization
        ? Object.fromEntries(
            Array.from(textFields.entries())
              .filter(([, field]) => field.value.trim().length > 0)
              .map(([key, field]) => [key, { value: field.value, fontFamily: fontFamilyForKey(field.fontKey), color: field.color }])
          )
        : undefined;

    try {
      for (const [slotIndex, slot] of slots.entries()) {
        const slotRect = template.printableRects.find((r) => r.slotIndex === slotIndex);
        const cropRect = slotRect
          ? (() => {
              const canvasRect = fractionRectToCanvasRect(slotRect, EDITOR_CANVAS_SIZE, EDITOR_CANVAS_SIZE);
              return slotCropRectInOriginalPx(canvasRect.width, canvasRect.height, slot.scale, slot.offsetX, slot.offsetY, slot.rotationDeg);
            })()
          : { x: 0, y: 0, width: slot.widthPx / slot.scale, height: slot.heightPx / slot.scale };

        // [FE-16] An existing doc for this slot (from rehydration) gets
        // PUT-updated in place — same personalizationId, same doc, so the
        // order this personalization eventually becomes part of still
        // points at one stable set of docs. A slot with no existing doc
        // (added during this edit, on a multi-slot template) still POSTs
        // a new one, exactly like a first-time personalization.
        const existingDocId = isEditingCartLine ? editingDocIdsRef.current.get(slotIndex) : undefined;
        const transformJson = { scale: slot.scale, offsetX: slot.offsetX, offsetY: slot.offsetY, rotationDeg: slot.rotationDeg, cropRect };
        const res = existingDocId
          ? await fetch(`/api/customizations/${existingDocId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
              body: JSON.stringify({
                transformJson,
                previewPath: sharedPreviewPath,
                renderStatus: 'pending',
                ...(selectedClipartId && { clipartId: selectedClipartId }),
                ...(textFieldsJson && Object.keys(textFieldsJson).length > 0 && { textFieldsJson }),
              }),
            })
          : await fetch('/api/customizations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
              body: JSON.stringify({
                sessionId,
                personalizationId,
                uploadId: slot.uploadId,
                variantId: selectedVariant.id,
                slotIndex,
                transformJson,
                templateVersion: template.version,
                ...(selectedClipartId && { clipartId: selectedClipartId }),
                previewPath: sharedPreviewPath,
                renderStatus: 'pending',
                ...(textFieldsJson && Object.keys(textFieldsJson).length > 0 && { textFieldsJson }),
              }),
            });
        if (!res.ok) throw new Error(`Failed to save slot ${slotIndex + 1}`);
      }

      onDone(personalizationId, sharedPreviewPath);
      // [FE-11] Cart now owns this personalization — the draft would
      // otherwise dangle and, worse, offer to "restore" a design the
      // customer already added, on a return visit before checkout.
      if (selectedVariant) clearDraft(product.id, selectedVariant.id);
      setSlots(new Map());
      setTextFields(new Map());
      setSelectedClipartId(null);
      setPreviewDataUrl(null);
      // A continued session on this same page load (a fresh upload right
      // after saving an edit) starts a genuinely new personalization, not
      // another edit of the one just saved.
      setIsEditingCartLine(false);
      editingDocIdsRef.current = new Map();
    } catch {
      setSubmitError("We couldn't save your personalization — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const showInlineEditor = templateStatus === 'loaded' && template !== null;

  // The frame column is the widest of the three: its canvas is square, so
  // width is what gives it height, and at equal widths it finished well
  // short of the other two cards and left a gap under the upload box.
  //
  // When the inline editor is showing, PersonalizationEditor returns TWO
  // top-level blocks (canvas+its controls, then text/clipart controls) —
  // see its own comment — so this becomes a 3-column layout on large
  // screens (frame | customization controls | buy box) instead of
  // stacking the controls under a tall canvas column. The Gallery
  // fallback (no template yet) stays a plain 2-column layout.
  return (
    <div className="flex flex-col gap-3">
      {showInlineEditor && pendingDraft && (
        <div className="rounded-2xl border border-line bg-tint px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-ink">Continue where you left off? We saved your last design for this product.</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDiscardDraft}
              disabled={restoringDraft}
              className="px-3 h-8 rounded-full border border-line text-ink text-sm hover:border-accent transition-colors disabled:opacity-50"
            >
              Start fresh
            </button>
            <button
              type="button"
              onClick={handleRestoreDraft}
              disabled={restoringDraft}
              className="px-4 h-8 rounded-full bg-gold text-ink text-sm font-semibold hover:bg-gold-deep transition-colors disabled:opacity-50"
            >
              {restoringDraft ? 'Restoring…' : 'Restore my design'}
            </button>
          </div>
        </div>
      )}
    <div className={showInlineEditor ? 'grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.95fr)_minmax(0,1fr)] gap-5 lg:gap-6 items-start' : 'grid md:grid-cols-2 gap-4 md:gap-5'}>
      {showInlineEditor && selectedVariant ? (
        <PersonalizationEditor
          template={template}
          photoSlots={product.photoSlots}
          allowsTextPersonalization={product.allowsTextPersonalization}
          media={galleryMedia}
          productTitle={product.title}
          previewDataUrl={previewDataUrl}
          activeSlotIndex={activeSlotIndex}
          slots={slots}
          textFields={textFields}
          selectedClipartId={selectedClipartId}
          uploadingSlot={uploadingSlot}
          uploadError={uploadError}
          zoomBounds={
            activeSlot
              ? (() => {
                  const canvasRect = activeRect ? fractionRectToCanvasRect(activeRect, EDITOR_CANVAS_SIZE, EDITOR_CANVAS_SIZE) : null;
                  const min = canvasRect
                    ? coverScaleForRotation(canvasRect.width, canvasRect.height, activeSlot.widthPx, activeSlot.heightPx, activeSlot.rotationDeg)
                    : activeSlot.scale;
                  return { min, max: min * MAX_ZOOM_MULTIPLE };
                })()
              : null
          }
          activeSlotIsRed={activeSlotIsRed}
          onSelectSlot={setActiveSlotIndex}
          onFileChange={handleFileChange}
          onZoomStep={handleZoom}
          onZoomTo={handleZoomTo}
          onRotate={handleRotate}
          onReset={handleReset}
          onTransformChange={handleTransformChange}
          onCanvasUpdate={setPreviewDataUrl}
          onConfirmLowDpi={handleConfirmLowDpi}
          onTextFieldChange={handleTextFieldChange}
          onSelectClipart={setSelectedClipartId}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
        />
      ) : (
        <div className="rounded-2xl bg-paper border border-line p-4 md:p-5">
          <Gallery media={galleryMedia} productTitle={product.title} />
        </div>
      )}
      <BuyBox
        product={product}
        variants={variants}
        selectedVariant={selectedVariant}
        selectedSize={selectedSize}
        selectedColour={selectedColour}
        selectedOrientation={selectedOrientation}
        onSelectSize={handleSelectSize}
        onSelectColour={handleSelectColour}
        onSelectOrientation={handleSelectOrientation}
        personalizationReady={showInlineEditor ? completion.complete : true}
        personalizationReason={showInlineEditor ? completion.reason : undefined}
        submitting={submitting}
        submitError={submitError}
        onAddToCart={showInlineEditor ? handleAddToCart : undefined}
        isEditingCartLine={isEditingCartLine}
      />
    </div>
    </div>
  );
}
