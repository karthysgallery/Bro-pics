'use client';

import { useEffect, useState } from 'react';
import type { FrameTemplate, Customization, Upload, Variant } from '@bro-pics/shared';
import { effectiveDpiFromCropRect, dpiTier } from '@bro-pics/shared';
import { getOrCreateSessionId } from '../../lib/session-id';
import { validateSlotsComplete } from '../../lib/editor-validation';
import { EditorCanvas } from './EditorCanvas';
import { SlotPicker } from './SlotPicker';
import { DpiBadge } from './DpiBadge';

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
}

export function PersonalizationEditor({ variant, photoSlots, onComplete, onClose }: PersonalizationEditorProps) {
  const [template, setTemplate] = useState<FrameTemplate | null>(null);
  const [activeSlotIndex, setActiveSlotIndex] = useState(0);
  const [slots, setSlots] = useState<Map<number, SlotState>>(new Map());
  const [allowLowDpi, setAllowLowDpi] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/frame-templates/${variant.id}`)
      .then((res) => res.json())
      .then((templates: FrameTemplate[]) => setTemplate(templates[0] ?? null));
  }, [variant.id]);

  const activeSlot = slots.get(activeSlotIndex);
  const activeRect = template?.printableRects.find((r) => r.slotIndex === activeSlotIndex);

  const completion = validateSlotsComplete(
    photoSlots,
    new Map(Array.from(slots.entries()).map(([i, s]) => [i, { effectiveDpi: s.effectiveDpi }])),
    allowLowDpi
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
        setUploadError(`This photo is too small — it needs to be at least ${variant.minUploadPx}px on each side.`);
        return;
      }

      const { effectiveDpi } = effectiveDpiFromCropRect(
        upload.widthPx,
        upload.heightPx,
        { width: upload.widthPx, height: upload.heightPx },
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
          scale: 1,
          offsetX: 0,
          offsetY: 0,
          rotationDeg: 0,
          effectiveDpi,
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
    const personalizationId = crypto.randomUUID();
    const sessionId = getOrCreateSessionId();

    for (const [slotIndex, slot] of slots.entries()) {
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
                  checked={allowLowDpi}
                  onChange={(event) => setAllowLowDpi(event.target.checked)}
                />
                Use this photo anyway
              </label>
            )}
          </div>
        )}

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
