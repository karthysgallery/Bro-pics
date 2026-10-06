'use client';

import { useEffect, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { FrameTemplate, ProductMedia, RotationDeg, Variant } from '@bro-pics/shared';
import { fractionRectToCanvasRect, EDITOR_CANVAS_SIZE } from '@bro-pics/shared';
import { EditorCanvasErrorBoundary } from './EditorCanvasErrorBoundary';
import { TextFieldEditor, type TextFieldValue } from './TextFieldEditor';
import { ClipartPicker } from './ClipartPicker';
import { PhotoSlotCard } from './PhotoSlotCard';
import { PhotoCropModal } from './PhotoCropModal';
import type { CanvasTextField, SlotDrawState } from './EditorCanvas';
import { resolveFontFamilyForCanvas, DEFAULT_TEXT_FONT_KEY } from '../../lib/text-personalization-options';
import { GalleryStrip } from '../product/GalleryStrip';
import { Lightbox } from '../ui/Lightbox';
import { LifestylePreview } from './LifestylePreview';

// EditorCanvas draws into a native <canvas> and loads images via `new Image()`,
// both of which need `window`/`document` — ssr: false keeps it off the server entirely.
const EditorCanvas = dynamic(() => import('./EditorCanvas').then((mod) => mod.EditorCanvas), { ssr: false });

export interface SlotState {
  uploadId: string;
  originalUrl: string;
  localPreviewUrl?: string;
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

export interface PersonalizationEditorProps {
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
  variant?: Variant | null;
  onSelectSlot: (slotIndex: number) => void;
  onFileChange: (file: File, slotIndex: number) => void;
  onRemoveSlot?: (slotIndex: number) => void;
  onZoomStep: (factor: number) => void;
  onZoomTo: (scale: number) => void;
  onRotate: () => void;
  onReset: () => void;
  onTransformChange: (slotIndex: number, transform: { scale: number; offsetX: number; offsetY: number }) => void;
  onCanvasUpdate: (dataUrl: string | null) => void;
  onConfirmLowDpi: (checked: boolean) => void;
  onTextFieldChange: (fieldKey: string, value: TextFieldValue) => void;
  onSelectClipart: (id: string | null) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const ZOOM_STEP_FACTOR = 1.25;
const TEXT_DEBOUNCE_MS = 120;

/**
 * PersonalizationPreview
 * 
 * Renders the left side of the PDP:
 * - Design Preview / View in Room mode toggle
 * - Large live composite frame preview (EditorCanvas or Room mockup)
 * - Quick adjustments toolbar for the active slot (zoom, rotate, reset, undo, redo)
 * - Preview expand lightbox
 * - GalleryStrip thumbnails underneath
 */
export function PersonalizationPreview({
  template,
  media,
  productTitle,
  previewDataUrl,
  activeSlotIndex,
  slots,
  textFields,
  selectedClipartId,
  zoomBounds,
  onSelectSlot,
  onZoomStep,
  onZoomTo,
  onRotate,
  onReset,
  onTransformChange,
  onCanvasUpdate,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  allowsTextPersonalization,
  variant,
}: {
  template: FrameTemplate;
  media: ProductMedia[];
  productTitle: string;
  previewDataUrl: string | null;
  activeSlotIndex: number;
  slots: Map<number, SlotState>;
  textFields: TextFieldValueMap;
  selectedClipartId: string | null;
  zoomBounds: { min: number; max: number } | null;
  onSelectSlot: (slotIndex: number) => void;
  onZoomStep: (factor: number) => void;
  onZoomTo: (scale: number) => void;
  onRotate: () => void;
  onReset: () => void;
  onTransformChange: (slotIndex: number, transform: { scale: number; offsetX: number; offsetY: number }) => void;
  onCanvasUpdate: (dataUrl: string | null) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  allowsTextPersonalization: boolean;
  variant?: Variant | null;
}) {
  const [previewMode, setPreviewMode] = useState<'design' | 'room'>('design');
  const [showLightbox, setShowLightbox] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [debouncedTextFields, setDebouncedTextFields] = useState(textFields);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedTextFields(textFields), TEXT_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [textFields]);

  const activeSlot = slots.get(activeSlotIndex);

  const canvasSlots: SlotDrawState[] = useMemo(() => {
    return template.printableRects.map((rect) => {
      const slot = slots.get(rect.slotIndex);
      return {
        slotIndex: rect.slotIndex,
        rect,
        maskUrl: template.maskUrl,
        photoUrl: slot?.localPreviewUrl || slot?.originalUrl || null,
        scale: slot?.scale ?? 1,
        offsetX: slot?.offsetX ?? 0,
        offsetY: slot?.offsetY ?? 0,
        rotationDeg: slot?.rotationDeg ?? 0,
        widthPx: slot?.widthPx,
        heightPx: slot?.heightPx,
      };
    });
  }, [template.printableRects, template.maskUrl, slots]);

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

  // Lifestyle scenes (wall / room / table) are drawn from configuration in
  // lib/preview-scenes.ts, so every customizable frame has them.
  const frameInches =
    variant && variant.widthIn > 0 && variant.heightIn > 0 ? { widthIn: variant.widthIn, heightIn: variant.heightIn } : null;

  return (
    <div data-testid="personalization-preview" className="flex flex-col gap-3.5">
      {/* Top Preview Controls: Mode switch + Undo/Redo + Developer Debug Mode */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {true ? (
            <div aria-label="Preview Modes" className="inline-flex items-center p-1 rounded-full bg-paper border border-line shadow-xs">
              <button
                type="button"
                aria-pressed={previewMode === 'design'}
                onClick={() => setPreviewMode('design')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  previewMode === 'design'
                    ? 'bg-ink text-paper shadow-xs'
                    : 'text-ink/70 hover:text-ink'
                }`}
              >
                Design Preview
              </button>
              <button
                type="button"
                aria-pressed={previewMode === 'room'}
                onClick={() => setPreviewMode('room')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  previewMode === 'room'
                    ? 'bg-ink text-paper shadow-xs'
                    : 'text-ink/70 hover:text-ink'
                }`}
              >
                View in Room
              </button>
            </div>
          ) : (
            <span className="text-xs font-semibold text-ink/70 uppercase tracking-wider">
              Live Preview
            </span>
          )}

          {/* Development Debug Mode Toggle (Requirement #28 - Not visible in production) */}
          {process.env.NODE_ENV !== 'production' && (
            <button
              type="button"
              onClick={() => setDebugMode((d) => !d)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold tracking-wider transition-all border ${
                debugMode
                  ? 'bg-rose-600 text-white border-rose-700 shadow-2xs'
                  : 'bg-paper text-ink/60 border-line hover:text-ink hover:border-ink/40'
              }`}
              title="Toggle Template Engine Developer Debug Overlay"
            >
              DEBUG {debugMode ? 'ON' : 'OFF'}
            </button>
          )}
        </div>

        {/* Undo / Redo controls */}
        {(canUndo || canRedo) && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Undo"
              onClick={onUndo}
              disabled={!canUndo}
              className="w-8 h-8 rounded-lg border border-line bg-paper text-ink flex items-center justify-center hover:border-accent transition-colors disabled:opacity-40 shadow-2xs"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Redo"
              onClick={onRedo}
              disabled={!canRedo}
              className="w-8 h-8 rounded-lg border border-line bg-paper text-ink flex items-center justify-center hover:border-accent transition-colors disabled:opacity-40 shadow-2xs"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Main Preview Container */}
      <div className="rounded-3xl bg-field border border-line/90 p-2 sm:p-4 relative overflow-hidden flex flex-col items-center justify-center shadow-xs w-full aspect-square max-w-[560px] mx-auto min-h-[300px]">
        {/* DESIGN PREVIEW MODE (Always mounted to keep canvas render active) */}
        <div className={`w-full h-full flex items-center justify-center ${previewMode === 'room' ? 'hidden' : 'block'}`}>
          <EditorCanvasErrorBoundary>
            <EditorCanvas
              mockupUrl={template.mockupUrl}
              overlayUrl={template.overlayUrl}
              slots={canvasSlots}
              activeSlotIndex={activeSlotIndex}
              textFields={canvasTextFields}
              clipart={
                selectedClipart
                  ? {
                      assetUrl: selectedClipart.assetUrl,
                      x: selectedClipart.x,
                      y: selectedClipart.y,
                      width: selectedClipart.width,
                      height: selectedClipart.height,
                    }
                  : null
              }
              debugMode={debugMode}
              onTransformChange={onTransformChange}
              onCanvasUpdate={onCanvasUpdate}
              onPinchZoom={onZoomStep}
              onPinchRotate={onRotate}
              onSelectSlot={onSelectSlot}
            />
          </EditorCanvasErrorBoundary>
        </div>

        {/* LIFESTYLE PREVIEW: wall / living room / table */}
        {previewMode === 'room' && (
          <div className="w-full">
            <LifestylePreview imageUrl={previewDataUrl} frameInches={frameInches} />
          </div>
        )}

        {/* Lightbox / Zoom Expand Button */}
        {previewDataUrl && slots.size > 0 && (
          <button
            type="button"
            onClick={() => setShowLightbox(true)}
            aria-label="Preview"
            className="absolute bottom-4 right-4 w-9 h-9 rounded-full bg-paper/95 backdrop-blur-xs border border-line/70 text-ink shadow-sm flex items-center justify-center hover:bg-paper hover:scale-105 transition-all"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Quick Adjustments Toolbar for the active slot */}
      {activeSlot && zoomBounds && (
        <div className="flex flex-wrap items-center gap-2 p-2.5 sm:p-3 bg-paper rounded-2xl border border-line shadow-xs">
          <div className="flex items-center gap-2 flex-1 min-w-[140px]">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => onZoomStep(1 / ZOOM_STEP_FACTOR)}
              className="w-10 h-10 min-w-[44px] min-h-[44px] sm:w-8 sm:h-8 sm:min-w-0 sm:min-h-0 rounded-xl border border-line text-ink shrink-0 hover:border-accent transition-colors flex items-center justify-center font-bold text-base"
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
              className="flex-1 min-w-[50px] accent-accent cursor-pointer"
            />
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => onZoomStep(ZOOM_STEP_FACTOR)}
              className="w-10 h-10 min-w-[44px] min-h-[44px] sm:w-8 sm:h-8 sm:min-w-0 sm:min-h-0 rounded-xl border border-line text-ink shrink-0 hover:border-accent transition-colors flex items-center justify-center font-bold text-base"
            >
              +
            </button>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              aria-label="Rotate 90 degrees"
              onClick={onRotate}
              className="px-3 h-10 min-h-[44px] sm:min-h-0 sm:h-8 rounded-xl border border-line text-ink text-xs sm:text-sm font-semibold shrink-0 hover:border-accent transition-colors flex items-center gap-1.5"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              Rotate
            </button>
            <button
              type="button"
              aria-label="Reset position"
              onClick={onReset}
              className="px-3 h-10 min-h-[44px] sm:min-h-0 sm:h-8 rounded-xl border border-line text-ink text-xs sm:text-sm font-semibold shrink-0 hover:border-accent transition-colors flex items-center justify-center"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Developer Template Debug HUD (Requirement #28 - Excluded in production) */}
      {process.env.NODE_ENV !== 'production' && debugMode && (
        <div className="bg-[#121214] text-[#E0E0E0] rounded-2xl p-3.5 border border-[#333] font-mono text-xs shadow-md space-y-2.5">
          <div className="flex items-center justify-between border-b border-[#2A2A30] pb-2">
            <span className="text-[#00E5FF] font-bold tracking-wider">TEMPLATE ENGINE DEBUG HUD</span>
            <span className="text-[#888] text-[10px]">ID: {template.id} · v{template.version}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
            <div>
              <span className="text-[#888]">Canvas Size: </span>
              <span className="text-[#00E5FF] font-semibold">{EDITOR_CANVAS_SIZE}×{EDITOR_CANVAS_SIZE}</span>
            </div>
            <div>
              <span className="text-[#888]">Target DPI: </span>
              <span className="text-[#00E5FF] font-semibold">300 DPI</span>
            </div>
            <div>
              <span className="text-[#888]">Total Slots: </span>
              <span className="text-white font-semibold">{template.printableRects.length}</span>
            </div>
            <div>
              <span className="text-[#888]">Active Slot: </span>
              <span className="text-gold font-semibold">#{activeSlotIndex + 1}</span>
            </div>
          </div>
          <div className="space-y-1.5 pt-1">
            {template.printableRects.map((r) => {
              const slot = slots.get(r.slotIndex);
              const isSlotActive = r.slotIndex === activeSlotIndex;
              return (
                <div
                  key={r.slotIndex}
                  className={`rounded-lg p-2 border text-[11px] space-y-1 ${
                    isSlotActive ? 'bg-[#1C1C24] border-gold/40' : 'bg-[#18181C] border-[#2A2A30]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[#FFD600] font-bold">
                      Slot #{r.slotIndex + 1} {isSlotActive ? '(Active)' : ''}
                    </span>
                    <span className={slot?.originalUrl || slot?.localPreviewUrl ? 'text-[#A3E635]' : 'text-[#888]'}>
                      {slot?.originalUrl || slot?.localPreviewUrl ? '● Photo Loaded' : '○ Empty'}
                    </span>
                  </div>
                  <div className="text-[#AAA] text-[10px]">
                    Aperture Geometry: x={r.x.toFixed(3)}, y={r.y.toFixed(3)}, w={r.width.toFixed(3)}, h={r.height.toFixed(3)}
                    {' · '}{Math.round(r.width * EDITOR_CANVAS_SIZE)}×{Math.round(r.height * EDITOR_CANVAS_SIZE)}px
                  </div>
                  {slot && (
                    <div className="text-[#A3E635] text-[10px] space-y-0.5 pt-0.5">
                      <div>
                        Src Dimensions: {slot.widthPx ?? '?'}×{slot.heightPx ?? '?'}px | Scale: {slot.scale.toFixed(3)} | Rot: {slot.rotationDeg}°
                      </div>
                      <div>
                        Offset: X={Math.round(slot.offsetX)}px, Y={Math.round(slot.offsetY)}px | Effective DPI: <span className="font-bold underline">{Math.round(slot.effectiveDpi)} DPI</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Gallery thumbnail strip */}
      <GalleryStrip media={media} productTitle={productTitle} />

      {/* Lightbox full-size preview modal */}
      {showLightbox && previewDataUrl && (
        <Lightbox src={previewDataUrl} alt="Your personalized preview" onClose={() => setShowLightbox(false)} />
      )}
    </div>
  );
}

/**
 * PersonalizationControls
 * 
 * Renders the personalization options section inside the BuyBox column:
 * - "Personalize Your Frame" Header
 * - Step indicator (Upload -> Adjust -> Preview -> Add to Cart)
 * - "YOUR PHOTOS" Photo Slot Grid (PhotoSlotCard for each slot)
 * - PhotoCropModal for focused crop/pan/zoom/rotate
 * - Text fields (if allowed)
 * - Clipart options (if available)
 */
export function PersonalizationControls({
  template,
  photoSlots,
  allowsTextPersonalization,
  activeSlotIndex,
  slots,
  textFields,
  selectedClipartId,
  uploadingSlot,
  uploadError,
  activeSlotIsRed,
  variant,
  onSelectSlot,
  onFileChange,
  onRemoveSlot,
  onConfirmLowDpi,
  onTextFieldChange,
  onSelectClipart,
  onTransformChange,
  onRotate,
}: {
  template: FrameTemplate;
  photoSlots: number;
  allowsTextPersonalization: boolean;
  activeSlotIndex: number;
  slots: Map<number, SlotState>;
  textFields: TextFieldValueMap;
  selectedClipartId: string | null;
  uploadingSlot: number | null;
  uploadError: string | null;
  activeSlotIsRed: boolean;
  variant?: Variant | null;
  onSelectSlot: (slotIndex: number) => void;
  onFileChange: (file: File, slotIndex: number) => void;
  onRemoveSlot?: (slotIndex: number) => void;
  onConfirmLowDpi: (checked: boolean) => void;
  onTextFieldChange: (fieldKey: string, value: TextFieldValue) => void;
  onSelectClipart: (id: string | null) => void;
  onTransformChange: (slotIndex: number, transform: { scale: number; offsetX: number; offsetY: number }) => void;
  onRotate: () => void;
}) {
  const [editingSlotIndex, setEditingSlotIndex] = useState<number | null>(null);

  const activeSlot = slots.get(activeSlotIndex);
  const editingSlot = editingSlotIndex !== null ? slots.get(editingSlotIndex) : null;
  const editingSlotRect = editingSlotIndex !== null
    ? template.printableRects.find((r) => r.slotIndex === editingSlotIndex)
    : null;

  return (
    <div className="flex flex-col gap-4 my-3.5 pt-3.5 border-t border-line/70">
      {/* Personalization Section Header & 4-Step Indicator */}
      <div className="bg-paper rounded-2xl border border-line/80 p-4 shadow-xs">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-gold" aria-hidden="true" />
          <h2 className="text-sm font-bold text-ink uppercase tracking-wide">
            Personalize Your Frame
          </h2>
        </div>
        <p className="text-xs text-ink/65 mt-1 leading-relaxed">
          Upload your photos and see your frame come to life.
        </p>

        <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-line/50 text-center">
          <div className={`flex flex-col items-center pb-1 border-b-2 ${slots.size > 0 ? 'border-ink text-ink font-semibold' : 'border-gold text-ink font-semibold'}`}>
            <span className="text-[10px] text-ink/40 uppercase font-mono">Step 1</span>
            <span className="text-2xs sm:text-xs truncate w-full">Upload</span>
          </div>
          <div className={`flex flex-col items-center pb-1 border-b-2 ${activeSlot ? 'border-gold text-ink font-semibold' : 'border-line/40 text-ink/40'}`}>
            <span className="text-[10px] text-ink/40 uppercase font-mono">Step 2</span>
            <span className="text-2xs sm:text-xs truncate w-full">Adjust</span>
          </div>
          <div className={`flex flex-col items-center pb-1 border-b-2 ${slots.size === photoSlots ? 'border-gold text-ink font-semibold' : 'border-line/40 text-ink/40'}`}>
            <span className="text-[10px] text-ink/40 uppercase font-mono">Step 3</span>
            <span className="text-2xs sm:text-xs truncate w-full">Preview</span>
          </div>
          <div className="flex flex-col items-center pb-1 border-b-2 border-line/40 text-ink/40">
            <span className="text-[10px] text-ink/40 uppercase font-mono">Step 4</span>
            <span className="text-2xs sm:text-xs truncate w-full">Cart</span>
          </div>
        </div>
      </div>

      {uploadError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center flex flex-col items-center gap-1.5 shadow-2xs">
          <p className="text-xs text-alert font-medium">{uploadError}</p>
          <label
            htmlFor="photo-upload-input"
            className="cursor-pointer text-xs font-semibold text-accent hover:text-accent-dark underline"
          >
            Try again
          </label>
        </div>
      )}

      {/* YOUR PHOTOS Slot Grid */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
            Your Photos ({slots.size}/{photoSlots} added)
          </h3>
          <span className="text-2xs text-ink/50">
            {slots.size === photoSlots ? 'All slots filled' : 'Click a slot to add photo'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {Array.from({ length: photoSlots }, (_, index) => {
            const slot = slots.get(index);
            const slotRect = template.printableRects.find((r) => r.slotIndex === index) ?? {
              slotIndex: index,
              x: 0.1,
              y: 0.1,
              width: 0.8,
              height: 0.8,
            };

            return (
              <PhotoSlotCard
                key={index}
                slotIndex={index}
                totalSlots={photoSlots}
                slot={slot}
                slotRect={slotRect}
                isActive={activeSlotIndex === index}
                isUploading={uploadingSlot === index}
                uploadError={uploadingSlot === index ? uploadError : null}
                onSelect={() => onSelectSlot(index)}
                onFileChange={(file) => onFileChange(file, index)}
                onEdit={() => setEditingSlotIndex(index)}
                onRemove={() => onRemoveSlot?.(index)}
                onConfirmLowDpi={onConfirmLowDpi}
              />
            );
          })}
        </div>
      </div>

      {/* Text Personalization Zones */}
      {allowsTextPersonalization && template.textZones.length > 0 && (
        <div className="rounded-2xl bg-paper border border-line p-4 space-y-3 shadow-xs">
          <h3 className="text-xs font-bold text-ink uppercase tracking-wider">
            Custom Text
          </h3>
          {template.textZones.map((zone) => {
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
        </div>
      )}

      {/* Clipart / Decorative Options */}
      {template.clipartOptions && template.clipartOptions.length > 0 && (
        <div className="rounded-2xl bg-paper border border-line p-4 shadow-xs">
          <h3 className="text-xs font-bold text-ink uppercase tracking-wider mb-2">
            Decorative Element
          </h3>
          <ClipartPicker
            options={template.clipartOptions}
            selectedId={selectedClipartId}
            onSelect={onSelectClipart}
          />
        </div>
      )}

      {/* Focused Photo Crop Modal */}
      {editingSlot && editingSlotRect && (
        <PhotoCropModal
          isOpen={editingSlotIndex !== null}
          onClose={() => setEditingSlotIndex(null)}
          slotIndex={editingSlotIndex!}
          slot={editingSlot}
          slotRect={editingSlotRect}
          variant={variant ?? null}
          onApply={(transform) => {
            onTransformChange(editingSlotIndex!, {
              scale: transform.scale,
              offsetX: transform.offsetX,
              offsetY: transform.offsetY,
            });
            if (transform.rotationDeg !== editingSlot.rotationDeg) {
              onRotate();
            }
          }}
          onLiveTransformChange={(slotIdx, transform) => {
            onTransformChange(slotIdx, {
              scale: transform.scale,
              offsetX: transform.offsetX,
              offsetY: transform.offsetY,
            });
          }}
        />
      )}
    </div>
  );
}

/**
 * PersonalizationEditor
 * 
 * Top-level wrapper rendering both PersonalizationPreview and PersonalizationControls,
 * used when PersonalizationEditor is mounted directly.
 */
export function PersonalizationEditor(props: PersonalizationEditorProps) {
  return (
    <>
      <PersonalizationPreview
        template={props.template}
        media={props.media}
        productTitle={props.productTitle}
        previewDataUrl={props.previewDataUrl}
        activeSlotIndex={props.activeSlotIndex}
        slots={props.slots}
        textFields={props.textFields}
        selectedClipartId={props.selectedClipartId}
        zoomBounds={props.zoomBounds}
        onSelectSlot={props.onSelectSlot}
        onZoomStep={props.onZoomStep}
        onZoomTo={props.onZoomTo}
        onRotate={props.onRotate}
        onReset={props.onReset}
        onTransformChange={props.onTransformChange}
        onCanvasUpdate={props.onCanvasUpdate}
        onUndo={props.onUndo}
        onRedo={props.onRedo}
        canUndo={props.canUndo}
        canRedo={props.canRedo}
        allowsTextPersonalization={props.allowsTextPersonalization}
      />
      <PersonalizationControls
        template={props.template}
        photoSlots={props.photoSlots}
        allowsTextPersonalization={props.allowsTextPersonalization}
        activeSlotIndex={props.activeSlotIndex}
        slots={props.slots}
        textFields={props.textFields}
        selectedClipartId={props.selectedClipartId}
        uploadingSlot={props.uploadingSlot}
        uploadError={props.uploadError}
        activeSlotIsRed={props.activeSlotIsRed}
        variant={props.variant}
        onSelectSlot={props.onSelectSlot}
        onFileChange={props.onFileChange}
        onRemoveSlot={props.onRemoveSlot}
        onConfirmLowDpi={props.onConfirmLowDpi}
        onTextFieldChange={props.onTextFieldChange}
        onSelectClipart={props.onSelectClipart}
        onTransformChange={props.onTransformChange}
        onRotate={props.onRotate}
      />
    </>
  );
}
