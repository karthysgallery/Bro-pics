'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { FrameTemplate, ProductMedia } from '@bro-pics/shared';
import type { RotationDeg } from '@bro-pics/shared';
import { SlotPicker } from './SlotPicker';
import { DpiBadge } from './DpiBadge';
import { EditorCanvasErrorBoundary } from './EditorCanvasErrorBoundary';
import { TextFieldEditor, type TextFieldValue } from './TextFieldEditor';
import { ClipartPicker } from './ClipartPicker';
import type { CanvasTextField, SlotDrawState } from './EditorCanvas';
import { resolveFontFamilyForCanvas, DEFAULT_TEXT_FONT_KEY } from '../../lib/text-personalization-options';
import { GalleryStrip } from '../product/GalleryStrip';
import { Lightbox } from '../ui/Lightbox';

// EditorCanvas draws into a native <canvas> and loads images via `new
// Image()`, both of which need `window`/`document` — 'use client' only
// defers hydration, it does NOT skip the server pre-render pass.
// next/dynamic with ssr:false is the only way to keep it off the server
// entirely.
const EditorCanvas = dynamic(() => import('./EditorCanvas').then((mod) => mod.EditorCanvas), { ssr: false });

export interface SlotState {
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
}

export type TextFieldValueMap = Map<string, TextFieldValue>;

interface PersonalizationEditorProps {
  template: FrameTemplate;
  photoSlots: number;
  allowsTextPersonalization: boolean;
  media: ProductMedia[];
  productTitle: string;
  previewDataUrl: string | null;
  activeSlotIndex: number;
  slots: Map<number, SlotState>;
  textFields: TextFieldValueMap;
  selectedClipartId: string | null;
  uploadingSlot: number | null;
  uploadError: string | null;
  zoomBounds: { min: number; max: number } | null;
  activeSlotIsRed: boolean;
  onSelectSlot: (slotIndex: number) => void;
  onFileChange: (file: File, slotIndex: number) => void;
  onZoomStep: (factor: number) => void;
  onZoomTo: (scale: number) => void;
  onRotate: () => void;
  onReset: () => void;
  onTransformChange: (slotIndex: number, transform: { scale: number; offsetX: number; offsetY: number }) => void;
  onCanvasUpdate: (dataUrl: string | null) => void;
  onConfirmLowDpi: (checked: boolean) => void;
  onTextFieldChange: (fieldKey: string, value: TextFieldValue) => void;
  onSelectClipart: (id: string | null) => void;
}

const ZOOM_STEP_FACTOR = 1.25;
// A short debounce between typing and the canvas redraw it feeds — fast
// typing shouldn't thrash the (now slightly more expensive, auto-shrink-
// measuring) canvas redraw on every keystroke.
const TEXT_DEBOUNCE_MS = 120;

// Inline personalization panel — replaces the old `fixed inset-0 z-50`
// modal entirely. Renders directly in the product page (swapped in for
// Gallery once a template exists for the selected variant, per
// ProductDetailClient), not as an overlay. All state lives in the parent
// (ProductDetailClient) since BuyBox's Add-to-Cart button, a sibling
// component, needs to react to the same completion state; this component
// is presentational plus purely-local UI concerns (the upload drop-zone,
// the debounce timer).
//
// Returns a Fragment with two top-level blocks — the canvas (+ its
// immediate zoom/rotate/upload/DPI controls) and the secondary
// customization controls (text fields, clipart) — rather than one wrapping
// div, so ProductDetailClient's grid can place them in separate columns
// (canvas | controls | buy box) instead of stacking the controls below a
// tall canvas column.
export function PersonalizationEditor({
  template,
  photoSlots,
  allowsTextPersonalization,
  media,
  productTitle,
  previewDataUrl,
  activeSlotIndex,
  slots,
  textFields,
  selectedClipartId,
  uploadingSlot,
  uploadError,
  zoomBounds,
  activeSlotIsRed,
  onSelectSlot,
  onFileChange,
  onZoomStep,
  onZoomTo,
  onRotate,
  onReset,
  onTransformChange,
  onCanvasUpdate,
  onConfirmLowDpi,
  onTextFieldChange,
  onSelectClipart,
}: PersonalizationEditorProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [debouncedTextFields, setDebouncedTextFields] = useState(textFields);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedTextFields(textFields), TEXT_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [textFields]);

  const activeSlot = slots.get(activeSlotIndex);
  const activeRect = template.printableRects.find((r) => r.slotIndex === activeSlotIndex);

  const canvasSlots: SlotDrawState[] = template.printableRects.map((rect) => {
    const slot = slots.get(rect.slotIndex);
    return {
      slotIndex: rect.slotIndex,
      rect,
      maskUrl: template.maskUrl,
      photoUrl: slot?.originalUrl ?? null,
      scale: slot?.scale ?? 1,
      offsetX: slot?.offsetX ?? 0,
      offsetY: slot?.offsetY ?? 0,
      rotationDeg: slot?.rotationDeg ?? 0,
    };
  });

  const canvasTextFields: CanvasTextField[] | undefined = allowsTextPersonalization
    ? template.textZones.map((zone) => {
        const field = debouncedTextFields.get(zone.fieldKey);
        return {
          key: zone.fieldKey,
          value: field?.value ?? '',
          color: field?.color ?? zone.defaultColor ?? '#2b2420',
          fontFamily: field?.fontKey ? resolveFontFamilyForCanvas(field.fontKey) : 'serif',
          zoneRect: zone,
          align: zone.align,
        };
      })
    : undefined;

  const selectedClipart = selectedClipartId ? template.clipartOptions.find((c) => c.id === selectedClipartId) : null;

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    onFileChange(file, activeSlotIndex);
  };

  return (
    <>
      <div className="rounded-2xl bg-paper border border-line p-4 md:p-5 flex flex-col">
        <GalleryStrip media={media} productTitle={productTitle} />
        <SlotPicker
          slotCount={photoSlots}
          activeSlotIndex={activeSlotIndex}
          filledSlots={new Set(slots.keys())}
          onSelectSlot={onSelectSlot}
        />

        <EditorCanvasErrorBoundary>
          <EditorCanvas
            mockupUrl={template.mockupUrl}
            overlayUrl={template.overlayUrl}
            slots={canvasSlots}
            activeSlotIndex={activeSlotIndex}
            textFields={canvasTextFields}
            clipart={
              selectedClipart
                ? { assetUrl: selectedClipart.assetUrl, x: selectedClipart.x, y: selectedClipart.y, width: selectedClipart.width, height: selectedClipart.height }
                : null
            }
            onTransformChange={onTransformChange}
            onCanvasUpdate={onCanvasUpdate}
          />
        </EditorCanvasErrorBoundary>

        {activeSlot && zoomBounds && (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => onZoomStep(1 / ZOOM_STEP_FACTOR)}
              className="w-8 h-8 rounded-md border border-line text-ink shrink-0 hover:border-accent transition-colors"
            >
              −
            </button>
            <input
              type="range"
              aria-label="Zoom"
              min={zoomBounds.min}
              max={zoomBounds.max}
              step={(zoomBounds.max - zoomBounds.min) / 100 || 0.001}
              value={activeSlot.scale}
              onChange={(event) => onZoomTo(Number(event.target.value))}
              className="flex-1"
            />
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => onZoomStep(ZOOM_STEP_FACTOR)}
              className="w-8 h-8 rounded-md border border-line text-ink shrink-0 hover:border-accent transition-colors"
            >
              +
            </button>
            <button
              type="button"
              aria-label="Rotate 90 degrees"
              onClick={onRotate}
              className="px-3 h-8 rounded-md border border-line text-ink text-sm shrink-0 hover:border-accent transition-colors"
            >
              Rotate ⟳
            </button>
            <button
              type="button"
              aria-label="Reset position"
              onClick={onReset}
              className="px-3 h-8 rounded-md border border-line text-ink text-sm shrink-0 hover:border-accent transition-colors"
            >
              Reset
            </button>
          </div>
        )}

        {slots.size > 0 && previewDataUrl && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="px-4 h-9 rounded-full bg-gold text-ink text-sm font-semibold hover:bg-gold-deep transition-colors"
            >
              Preview
            </button>
          </div>
        )}

        <div
          className={`mt-3 flex-1 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition-colors ${
            isDraggingOver ? 'border-accent bg-tint' : 'border-line hover:border-gold'
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDraggingOver(true);
          }}
          onDragLeave={() => setIsDraggingOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDraggingOver(false);
            handleFile(event.dataTransfer.files?.[0]);
          }}
        >
          {/* The native file input is visually hidden rather than removed:
              its label is the styled button, so clicking, tabbing and
              screen-reader labelling all keep working, and the browser's
              "Choose File / No file chosen" chrome — which cannot be
              styled and always lied about state here, since the chosen
              file is cleared on every change — stops showing. */}
          <span
            className="grid place-items-center w-11 h-11 rounded-full bg-tint text-accent"
            aria-hidden="true"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" />
              <path d="M12 3v12M8 7l4-4 4 4" />
            </svg>
          </span>

          <p className="text-sm font-semibold text-ink">
            {activeSlot ? 'Replace photo' : 'Upload a photo'} for slot {activeSlotIndex + 1}
          </p>

          <label
            htmlFor="photo-upload-input"
            className="cursor-pointer rounded-full bg-gold text-ink px-5 py-2 text-sm font-semibold hover:bg-gold-deep transition-colors"
          >
            Choose a photo
          </label>
          <input
            id="photo-upload-input"
            type="file"
            accept="image/*"
            /* The visible trigger reads "Choose a photo", which is the right
               words on a button but too vague as the control's name once a
               frame has several slots — so the accessible name says which. */
            aria-label={`${activeSlot ? 'Replace' : 'Upload'} a photo for slot ${activeSlotIndex + 1}`}
            capture="environment"
            disabled={uploadingSlot !== null}
            className="sr-only"
            onChange={(event) => {
              handleFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />

          <p className="text-2xs text-ink/50">or drag and drop it here &middot; JPG or PNG, max 25 MB</p>
          {uploadingSlot === activeSlotIndex && <p className="text-xs text-accent font-medium">Uploading&hellip;</p>}
          {uploadError && <p className="text-xs text-alert mt-1">{uploadError}</p>}
        </div>

        {activeSlot && (
          <div className="mt-2 flex items-center gap-2">
            <DpiBadge effectiveDpi={activeSlot.effectiveDpi} />
            {activeSlotIsRed && (
              <label className="flex items-center gap-1 text-xs text-ink/60">
                <input
                  type="checkbox"
                  checked={activeSlot.confirmedLowDpi}
                  onChange={(event) => onConfirmLowDpi(event.target.checked)}
                />
                Use this photo anyway
              </label>
            )}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-paper border border-line p-4 md:p-5">
        {allowsTextPersonalization &&
          template.textZones.map((zone) => {
            const field = textFields.get(zone.fieldKey) ?? {
              value: '',
              fontKey: DEFAULT_TEXT_FONT_KEY,
              color: zone.defaultColor ?? '#2b2420',
            };
            return (
              <TextFieldEditor
                key={zone.fieldKey}
                fieldKey={zone.fieldKey}
                label={zone.label}
                field={field}
                maxLength={zone.maxLength}
                onChange={(next) => onTextFieldChange(zone.fieldKey, next)}
              />
            );
          })}

        <ClipartPicker options={template.clipartOptions} selectedId={selectedClipartId} onSelect={onSelectClipart} />
      </div>

      {showPreview && previewDataUrl && (
        <Lightbox src={previewDataUrl} alt="Your personalized preview" onClose={() => setShowPreview(false)} />
      )}
    </>
  );
}
