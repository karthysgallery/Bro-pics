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
  // [FE-09]
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
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
  onUndo,
  onRedo,
  canUndo,
  canRedo,
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
      widthPx: slot?.widthPx,
      heightPx: slot?.heightPx,
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
          minFontSizePx: zone.minFontSizePx,
          maxFontSizePx: zone.maxFontSizePx,
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
      <div className="flex flex-col gap-4">
        <GalleryStrip media={media} productTitle={productTitle} />
        <SlotPicker
          slotCount={photoSlots}
          activeSlotIndex={activeSlotIndex}
          filledSlots={new Set(slots.keys())}
          onSelectSlot={onSelectSlot}
        />

        <div className="rounded-2xl bg-[#FAF7F2] border border-line p-2 sm:p-3 relative overflow-hidden flex flex-col items-center justify-center shadow-xs">
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
              onPinchZoom={onZoomStep}
              onPinchRotate={onRotate}
            />
          </EditorCanvasErrorBoundary>

          {previewDataUrl && slots.size > 0 && (
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              aria-label="Preview"
              className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-paper/95 backdrop-blur-xs border border-line/60 text-ink shadow-sm flex items-center justify-center hover:bg-paper hover:scale-105 transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
              </svg>
            </button>
          )}
        </div>

        {activeSlot && zoomBounds && (
          <div className="flex flex-wrap items-center gap-2 p-2.5 sm:p-3 bg-paper rounded-xl border border-line">
            <div className="flex items-center gap-2 flex-1 min-w-[140px]">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => onZoomStep(1 / ZOOM_STEP_FACTOR)}
                className="w-8 h-8 rounded-md border border-line text-ink shrink-0 hover:border-accent transition-colors flex items-center justify-center font-bold"
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
                className="flex-1 min-w-[50px]"
              />
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => onZoomStep(ZOOM_STEP_FACTOR)}
                className="w-8 h-8 rounded-md border border-line text-ink shrink-0 hover:border-accent transition-colors flex items-center justify-center font-bold"
              >
                +
              </button>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                aria-label="Rotate 90 degrees"
                onClick={onRotate}
                className="px-2.5 sm:px-3 h-8 rounded-md border border-line text-ink text-xs sm:text-sm shrink-0 hover:border-accent transition-colors"
              >
                Rotate ⟳
              </button>
              <button
                type="button"
                aria-label="Reset position"
                onClick={onReset}
                className="px-2.5 sm:px-3 h-8 rounded-md border border-line text-ink text-xs sm:text-sm shrink-0 hover:border-accent transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        )}

        {(canUndo || canRedo) && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Undo"
              onClick={onUndo}
              disabled={!canUndo}
              className="w-8 h-8 rounded-md border border-line text-ink shrink-0 hover:border-accent transition-colors disabled:opacity-40 disabled:hover:border-line"
            >
              ↶
            </button>
            <button
              type="button"
              aria-label="Redo"
              onClick={onRedo}
              disabled={!canRedo}
              className="w-8 h-8 rounded-md border border-line text-ink shrink-0 hover:border-accent transition-colors disabled:opacity-40 disabled:hover:border-line"
            >
              ↷
            </button>
          </div>
        )}

        <div
          className={`rounded-2xl border border-line bg-paper p-6 text-center flex flex-col items-center justify-center gap-2.5 transition-colors shadow-xs ${
            isDraggingOver ? 'border-accent bg-tint' : 'hover:border-gold'
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
          <span
            className="grid place-items-center w-12 h-12 rounded-full bg-tint text-accent mb-1"
            aria-hidden="true"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3" />
              <path d="M12 3v12M8 7l4-4 4 4" />
            </svg>
          </span>

          <p className="text-sm font-semibold text-ink">
            {activeSlot ? 'Replace photo' : 'Upload a photo'} for slot {activeSlotIndex + 1}
          </p>

          <label
            htmlFor="photo-upload-input"
            className="cursor-pointer rounded-full bg-gold hover:bg-gold-deep text-ink px-6 py-2.5 text-sm font-semibold transition-colors shadow-xs"
          >
            Choose a photo
          </label>
          <input
            id="photo-upload-input"
            type="file"
            accept="image/*,.heic,.heif"
            aria-label={`${activeSlot ? 'Replace' : 'Upload'} a photo for slot ${activeSlotIndex + 1}`}
            capture="environment"
            disabled={uploadingSlot !== null}
            className="sr-only"
            onChange={(event) => {
              handleFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />

          <p className="text-2xs text-ink/50">or drag and drop it here &middot; JPG, PNG or iPhone HEIC, max 25 MB</p>
          {uploadingSlot === activeSlotIndex && <p className="text-xs text-accent font-medium">Uploading&hellip;</p>}
          {uploadError && (
            <div className="flex flex-col items-center gap-1.5 mt-1">
              <p className="text-xs text-alert">{uploadError}</p>
              <label
                htmlFor="photo-upload-input"
                className="cursor-pointer text-xs font-semibold text-accent hover:text-accent-dark underline"
              >
                Try again
              </label>
            </div>
          )}
        </div>

        {activeSlot && (
          <div className="flex items-center gap-2">
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

      <div className="rounded-2xl bg-paper border border-line p-5 md:p-6 shadow-xs flex flex-col justify-start">
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
                required={zone.required}
                allowedFontKeys={zone.allowedFonts}
                allowedColorValues={zone.allowedColors}
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
