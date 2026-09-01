'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { FrameTemplate, Customization, Upload, Variant } from '@bro-pics/shared';
import { effectiveDpiFromCropRect, dpiTier } from '@bro-pics/shared';
import { getOrCreateSessionId } from '../../lib/session-id';
import { validateSlotsComplete } from '../../lib/editor-validation';
import {
  fractionRectToCanvasRect,
  coverScale,
  centeredOffset,
  slotCropRectInOriginalPx,
  EDITOR_CANVAS_SIZE,
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
  rotationDeg: 0 | 90 | 180 | 270;
  effectiveDpi: number;
  confirmedLowDpi: boolean;
}

export function PersonalizationEditor({ variant, photoSlots, onComplete, onClose }: PersonalizationEditorProps) {
  const [template, setTemplate] = useState<FrameTemplate | null>(null);
  const [templateError, setTemplateError] = useState(false);
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [slots, setSlots] = useState<Map<number, SlotState>>(new Map());
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/frame-templates/${variant.id}`)
      .then((res) => res.json())
      .then((templates: FrameTemplate[]) => setTemplate(templates[0] ?? null))
      .catch(() => setTemplateError(true));
  }, [variant.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
      formData.append('minUploadPx', String(variant.minUploadPx));

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
      const { width: cropWidthPx, height: cropHeightPx } = slotCropRectInOriginalPx(
        canvasRect.width,
        canvasRect.height,
        scale,
        offsetX,
        offsetY
      );

      const { effectiveDpi } = effectiveDpiFromCropRect(
        upload.widthPx,
        upload.heightPx,
        { width: cropWidthPx, height: cropHeightPx },
        variant.widthIn,
        variant.heightIn
      );

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
        // photo (scale + drag offset), not just the initial fit — see
        // Finding 7 in review.
        const cropRect = slotRect
          ? (() => {
              const canvasRect = fractionRectToCanvasRect(slotRect, EDITOR_CANVAS_SIZE, EDITOR_CANVAS_SIZE);
              return slotCropRectInOriginalPx(canvasRect.width, canvasRect.height, slot.scale, slot.offsetX, slot.offsetY);
            })()
          : { x: 0, y: 0, width: slot.widthPx / slot.scale, height: slot.heightPx / slot.scale };

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
          renderStatus: 'pending',
        };
        const res = await fetch('/api/customizations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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

  if (!template) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40" onClick={onClose}>
        <div className="bg-surface rounded-lg p-6 flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
          <span>{templateError ? "We couldn't load the editor. Please try again." : 'Loading editor…'}</span>
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
            mockupUrl={template.mockupUrl}
            photoUrl={activeSlot?.originalUrl ?? null}
            slotRect={activeRect}
            scale={activeSlot?.scale ?? 1}
            offsetX={activeSlot?.offsetX ?? 0}
            offsetY={activeSlot?.offsetY ?? 0}
            rotationDeg={activeSlot?.rotationDeg ?? 0}
            onTransformChange={(transform) => {
              setSlots((prev) => {
                const current = prev.get(activeSlotIndex);
                if (!current) return prev;
                const next = new Map(prev);
                next.set(activeSlotIndex, { ...current, ...transform });
                return next;
              });
            }}
          />
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
