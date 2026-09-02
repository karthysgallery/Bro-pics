'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { FrameTemplate, Customization, Upload, Variant } from '@bro-pics/shared';
import { effectiveDpiFromCropRect, dpiTier, printDimensionsForRotation } from '@bro-pics/shared';
import { getOrCreateSessionId } from '../../lib/session-id';
import { validateSlotsComplete } from '../../lib/editor-validation';
import {
  fractionRectToCanvasRect,
  coverScale,
  coverScaleForRotation,
  centeredOffset,
  centeredOffsetForRotation,
  offsetAfterScaleChange,
  slotCropRectInOriginalPx,
  EDITOR_CANVAS_SIZE,
  type RotationDeg,
} from '../../lib/editor-geometry';
import { SlotPicker } from './SlotPicker';
import { DpiBadge } from './DpiBadge';

// react-konva touches `window` at import time, so it can never be part of
// the server-rendered bundle — 'use client' only defers hydration, it does
// NOT skip the server pre-render pass. next/dynamic with ssr:false is the
// only way to keep it off the server entirely.
const EditorCanvas = dynamic(() => import('./EditorCanvas').then((mod) => mod.EditorCanvas), { ssr: false });

interface PersonalizationEditorProps {
  variant: Variant;
  photoSlots: number;
  onComplete: (personalizationId: string) => void;
  onClose: () => void;
}

interface SlotState {
  uploadId: string;
  originalUrl: string;
  widthPx: number;
  heightPx: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  rotationDeg: RotationDeg;
  effectiveDpi: number;
  confirmedLowDpi: boolean;
  // Captured from the live Konva stage whenever this slot's canvas is
  // rendered/transformed (see EditorCanvas's onCanvasUpdate) — Done just
  // uploads whatever was last captured, rather than trying to re-render
  // every slot's stage at submit time (only the ACTIVE slot's stage
  // actually exists in the DOM). null if never captured (e.g. a
  // cross-origin canvas-taint SecurityError) or not yet rendered.
  previewDataUrl: string | null;
}

// Zoom-in/out buttons are capped relative to the slot's own cover-fit
// scale (never let the customer zoom below what keeps the slot fully
// covered) up to a fixed multiple of it, so "zoom in" always has visible
// headroom without ever letting the photo become absurdly pixelated.
const MAX_ZOOM_MULTIPLE = 4;
const ZOOM_STEP_FACTOR = 1.25;

/**
 * Recomputes effectiveDpi for a slot from its current transform (scale,
 * offset, rotation) against the slot's own printable rect — the same
 * crop-rect-from-transform math used at upload time. Called after every
 * transform change (zoom, rotate, drag) so the DPI badge and the red-tier
 * confirmation gate always reflect where the photo is CURRENTLY positioned,
 * not just where it started. See Finding 2 in the second-round review.
 *
 * At 90°/270° rotation, variant.widthIn/heightIn must be axis-swapped
 * before being passed to effectiveDpiFromCropRect — see
 * printDimensionsForRotation's doc comment. This mirrors the identical
 * swap /api/customizations applies server-side when persisting effectiveDpi,
 * via the shared helper, so the badge the customer sees can never diverge
 * from what the server computes and stores. See Finding 4 (client-side gap)
 * in the second-round review.
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

type TemplateState =
  | { status: 'loading' }
  | { status: 'loaded'; template: FrameTemplate }
  | { status: 'empty' }
  | { status: 'error' };

export function PersonalizationEditor({ variant, photoSlots, onComplete, onClose }: PersonalizationEditorProps) {
  const [templateState, setTemplateState] = useState<TemplateState>({ status: 'loading' });
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [slots, setSlots] = useState<Map<number, SlotState>>(new Map());
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/frame-templates/${variant.id}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Frame template fetch failed with status ${res.status}`);
        }
        const data: unknown = await res.json();
        if (cancelled) return;

        // An empty array (no template seeded for this variant) and a
        // malformed shape are both real, expected states in a fresh
        // environment — not the same as "still loading" — so each gets
        // its own explicit terminal state rather than falling through to
        // an indefinite spinner. See Finding 5 in review.
        if (!Array.isArray(data) || data.length === 0) {
          setTemplateState({ status: 'empty' });
          return;
        }
        const template = data[0] as FrameTemplate | undefined;
        if (!template || !Array.isArray(template.printableRects) || template.printableRects.length === 0) {
          setTemplateState({ status: 'empty' });
          return;
        }
        setTemplateState({ status: 'loaded', template });
      })
      .catch(() => {
        if (!cancelled) setTemplateState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [variant.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const template = templateState.status === 'loaded' ? templateState.template : null;
  const activeSlot = slots.get(activeSlotIndex);
  const activeRect = template?.printableRects.find((r) => r.slotIndex === activeSlotIndex);

  const completion = validateSlotsComplete(
    photoSlots,
    new Map(
      Array.from(slots.entries()).map(([i, s]) => [i, { effectiveDpi: s.effectiveDpi, confirmedLowDpi: s.confirmedLowDpi }])
    )
  );

  const activeSlotIsRed = activeSlot !== undefined && dpiTier(activeSlot.effectiveDpi) === 'red';

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>, slotIndex: number) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploadError(null);
    setUploadingSlot(slotIndex);

    try {
      const sessionId = getOrCreateSessionId();
      const formData = new FormData();
      formData.append('file', file);
      // The server looks up minUploadPx from this variantId itself — a
      // client-supplied minUploadPx would be trivially bypassable. See
      // Finding 7 in review.
      formData.append('variantId', variant.id);

      const res = await fetch('/api/uploads', {
        method: 'POST',
        headers: { 'X-Session-Id': sessionId },
        body: formData,
      });
      const upload: Upload = await res.json();

      if (!res.ok || upload.status === 'rejected') {
        if (res.status === 422) {
          setUploadError(`This photo is too small — it needs to be at least ${variant.minUploadPx}px on each side.`);
        } else {
          setUploadError("We couldn't process this photo — please try a different file.");
        }
        return;
      }

      // Fit the photo to its slot (cover: scale so the image fully fills
      // the slot window, centered, cropping any overflow) rather than
      // leaving it at natural pixel size — see Finding 1 in review.
      const slotRect = template?.printableRects.find((r) => r.slotIndex === slotIndex);
      if (!slotRect) {
        // No printableRects entry for this slot — we cannot compute a fit
        // scale, and falling back to scale=1 would silently reintroduce
        // the exact "tiny zoomed-in corner + wrong green badge" bug this
        // fix addresses. Surface an error instead of guessing.
        setUploadError("We couldn't set up this photo slot — please close and reopen the editor.");
        return;
      }

      const canvasRect = fractionRectToCanvasRect(slotRect, EDITOR_CANVAS_SIZE, EDITOR_CANVAS_SIZE);
      const scale = coverScale(canvasRect.width, canvasRect.height, upload.widthPx, upload.heightPx);
      const { offsetX, offsetY } = centeredOffset(canvasRect.width, canvasRect.height, upload.widthPx, upload.heightPx, scale);
      // Same crop-rect-from-transform + DPI math used after every
      // subsequent zoom/rotate/drag (see computeEffectiveDpi) — one code
      // path for "effectiveDpi from a slot's current transform", not a
      // duplicated inline computation that could drift from it.
      const effectiveDpi = computeEffectiveDpi(slotRect, upload.widthPx, upload.heightPx, scale, offsetX, offsetY, 0, variant);

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
          previewDataUrl: null,
        });
        return next;
      });
    } catch {
      setUploadError('Upload failed. Please check your connection and try again.');
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleZoom = (factor: number) => {
    setSlots((prev) => {
      const current = prev.get(activeSlotIndex);
      if (!current || !activeRect) return prev;
      const canvasRect = fractionRectToCanvasRect(activeRect, EDITOR_CANVAS_SIZE, EDITOR_CANVAS_SIZE);
      const minScale = coverScaleForRotation(
        canvasRect.width,
        canvasRect.height,
        current.widthPx,
        current.heightPx,
        current.rotationDeg
      );
      const maxScale = minScale * MAX_ZOOM_MULTIPLE;
      const newScale = Math.min(maxScale, Math.max(minScale, current.scale * factor));
      if (newScale === current.scale) return prev;
      const { offsetX, offsetY } = offsetAfterScaleChange(
        current.offsetX,
        current.offsetY,
        current.scale,
        newScale,
        canvasRect.width,
        canvasRect.height
      );
      const effectiveDpi = computeEffectiveDpi(
        activeRect,
        current.widthPx,
        current.heightPx,
        newScale,
        offsetX,
        offsetY,
        current.rotationDeg,
        variant
      );
      const next = new Map(prev);
      next.set(activeSlotIndex, { ...current, scale: newScale, offsetX, offsetY, effectiveDpi });
      return next;
    });
  };

  const handleRotate = () => {
    setSlots((prev) => {
      const current = prev.get(activeSlotIndex);
      if (!current || !activeRect) return prev;
      const canvasRect = fractionRectToCanvasRect(activeRect, EDITOR_CANVAS_SIZE, EDITOR_CANVAS_SIZE);
      const newRotation = (((current.rotationDeg + 90) % 360) as RotationDeg);
      const minScale = coverScaleForRotation(
        canvasRect.width,
        canvasRect.height,
        current.widthPx,
        current.heightPx,
        newRotation
      );
      // Re-center on every rotation (rather than trying to preserve the
      // previous pan position through a rotation about a corner anchor) —
      // simple, predictable, and guarantees the slot stays fully covered.
      const newScale = Math.max(current.scale, minScale);
      const { offsetX, offsetY } = centeredOffsetForRotation(
        canvasRect.width,
        canvasRect.height,
        current.widthPx,
        current.heightPx,
        newScale,
        newRotation
      );
      const effectiveDpi = computeEffectiveDpi(
        activeRect,
        current.widthPx,
        current.heightPx,
        newScale,
        offsetX,
        offsetY,
        newRotation,
        variant
      );
      const next = new Map(prev);
      next.set(activeSlotIndex, { ...current, rotationDeg: newRotation, scale: newScale, offsetX, offsetY, effectiveDpi });
      return next;
    });
  };

  const handleDone = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    const personalizationId = crypto.randomUUID();
    const sessionId = getOrCreateSessionId();

    try {
      for (const [slotIndex, slot] of slots.entries()) {
        const slotRect = template?.printableRects.find((r) => r.slotIndex === slotIndex);
        // cropRect must reflect where the customer actually positioned the
        // photo (scale + drag offset + rotation), not just the initial fit
        // — see Finding 7 and Finding 8 in review.
        const cropRect = slotRect
          ? (() => {
              const canvasRect = fractionRectToCanvasRect(slotRect, EDITOR_CANVAS_SIZE, EDITOR_CANVAS_SIZE);
              return slotCropRectInOriginalPx(
                canvasRect.width,
                canvasRect.height,
                slot.scale,
                slot.offsetX,
                slot.offsetY,
                slot.rotationDeg
              );
            })()
          : { x: 0, y: 0, width: slot.widthPx / slot.scale, height: slot.heightPx / slot.scale };

        // Export each slot's canvas to a PNG and upload it as the
        // customer-facing preview (spec §5 / Task 7) — see Finding 3 in
        // review. previewUrl is optional on Customization, and a failure
        // here (no captured frame yet, a network error, or a canvas-taint
        // SecurityError from an uncooperative Storage CORS config) must
        // never block the customer from completing checkout, so it's
        // caught and simply omitted rather than re-thrown.
        let previewUrl: string | undefined;
        if (slot.previewDataUrl) {
          try {
            const previewRes = await fetch('/api/uploads/preview', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
              body: JSON.stringify({ personalizationId, slotIndex, dataUrl: slot.previewDataUrl }),
            });
            if (previewRes.ok) {
              const previewBody = await previewRes.json();
              if (typeof previewBody.previewUrl === 'string') {
                previewUrl = previewBody.previewUrl;
              }
            }
          } catch {
            // See comment above — non-fatal.
          }
        }

        const customization: Omit<Customization, 'id'> = {
          sessionId,
          personalizationId,
          uploadId: slot.uploadId,
          variantId: variant.id,
          slotIndex,
          transformJson: {
            scale: slot.scale,
            offsetX: slot.offsetX,
            offsetY: slot.offsetY,
            rotationDeg: slot.rotationDeg,
            cropRect,
          },
          effectiveDpi: slot.effectiveDpi,
          previewUrl,
          renderStatus: 'pending',
        };
        const res = await fetch('/api/customizations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
          body: JSON.stringify(customization),
        });
        if (!res.ok) {
          throw new Error(`Failed to save slot ${slotIndex + 1}`);
        }
      }

      onComplete(personalizationId);
    } catch {
      setSubmitError("We couldn't save your personalization — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (templateState.status !== 'loaded') {
    const message =
      templateState.status === 'error'
        ? "We couldn't load the editor. Please try again."
        : templateState.status === 'empty'
          ? "This product isn't available for personalization yet."
          : 'Loading editor…';
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40" onClick={onClose}>
        <div className="bg-surface rounded-lg p-6 flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
          <span>{message}</span>
          <button aria-label="Close" onClick={onClose} className="text-charcoal">✕</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 p-4" onClick={onClose}>
      <div className="bg-surface rounded-lg p-6 max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
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
            mockupUrl={templateState.template.mockupUrl}
            photoUrl={activeSlot?.originalUrl ?? null}
            slotRect={activeRect}
            scale={activeSlot?.scale ?? 1}
            offsetX={activeSlot?.offsetX ?? 0}
            offsetY={activeSlot?.offsetY ?? 0}
            rotationDeg={activeSlot?.rotationDeg ?? 0}
            onTransformChange={(transform) => {
              setSlots((prev) => {
                const current = prev.get(activeSlotIndex);
                if (!current || !activeRect) return prev;
                const effectiveDpi = computeEffectiveDpi(
                  activeRect,
                  current.widthPx,
                  current.heightPx,
                  transform.scale,
                  transform.offsetX,
                  transform.offsetY,
                  current.rotationDeg,
                  variant
                );
                const next = new Map(prev);
                next.set(activeSlotIndex, { ...current, ...transform, effectiveDpi });
                return next;
              });
            }}
            onCanvasUpdate={(dataUrl: string | null) => {
              setSlots((prev) => {
                const current = prev.get(activeSlotIndex);
                if (!current || current.previewDataUrl === dataUrl) return prev;
                const next = new Map(prev);
                next.set(activeSlotIndex, { ...current, previewDataUrl: dataUrl });
                return next;
              });
            }}
          />
        )}

        {activeSlot && (
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => handleZoom(1 / ZOOM_STEP_FACTOR)}
              className="w-8 h-8 rounded-full border border-charcoal/20 text-charcoal"
            >
              −
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => handleZoom(ZOOM_STEP_FACTOR)}
              className="w-8 h-8 rounded-full border border-charcoal/20 text-charcoal"
            >
              +
            </button>
            <button
              type="button"
              aria-label="Rotate 90 degrees"
              onClick={handleRotate}
              className="px-3 h-8 rounded-full border border-charcoal/20 text-charcoal text-sm"
            >
              Rotate ⟳
            </button>
          </div>
        )}

        <div className="mt-3">
          <label className="block text-sm font-medium mb-1" htmlFor="photo-upload-input">
            {activeSlot ? 'Replace photo' : 'Upload a photo'} for slot {activeSlotIndex + 1}
          </label>
          <input
            id="photo-upload-input"
            type="file"
            accept="image/*"
            disabled={uploadingSlot !== null}
            onChange={(event) => handleFileChange(event, activeSlotIndex)}
          />
          {uploadingSlot === activeSlotIndex && <p className="text-xs text-charcoal/60 mt-1">Uploading…</p>}
          {uploadError && <p className="text-xs text-terracotta mt-1">{uploadError}</p>}
        </div>

        {activeSlot && (
          <div className="mt-2 flex items-center gap-2">
            <DpiBadge effectiveDpi={activeSlot.effectiveDpi} />
            {activeSlotIsRed && (
              <label className="flex items-center gap-1 text-xs text-charcoal/60">
                <input
                  type="checkbox"
                  checked={activeSlot.confirmedLowDpi}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSlots((prev) => {
                      const current = prev.get(activeSlotIndex);
                      if (!current) return prev;
                      const next = new Map(prev);
                      next.set(activeSlotIndex, { ...current, confirmedLowDpi: checked });
                      return next;
                    });
                  }}
                />
                Use this photo anyway
              </label>
            )}
          </div>
        )}

        {!completion.complete && <p className="text-xs text-charcoal/60 mt-2">{completion.reason}</p>}
        {submitError && <p className="text-xs text-terracotta mt-2">{submitError}</p>}

        <button
          onClick={handleDone}
          disabled={!completion.complete || submitting}
          className="w-full bg-terracotta text-cream rounded-lg py-3 font-medium mt-4 disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Done'}
        </button>
      </div>
    </div>
  );
}
