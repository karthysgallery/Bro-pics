'use client';

import { useEffect, useState } from 'react';
import { canvasPrintWidthIn, MAX_SCALE, type Variant } from '@bro-pics/shared';
import { PreviewGallery, type GalleryPhoto, type GalleryViewId } from '../editor/PreviewGallery';
import { TemplateCanvas } from './TemplateCanvas';
import { frameDesign, STOCK_FRAME, type FrameLook } from './frame-moulding';
import { Icon, type IconName } from './icons';
import type { TemplateCustomizer } from './use-template-customizer';

interface CustomizerPreviewProps {
  customizer: TemplateCustomizer;
  variant: Variant;
  onRequestPhoto: (slotId: string) => void;
  /** The product's own picture: shown, in every view, until the first photo is added. */
  defaultImageUrl?: string | null;
  productTitle?: string;
  /** The chosen frame model's look (the stock frame when absent). */
  frameLook?: FrameLook | null;
  /** The product's photos (sizes, frame close-up, room…), browsed in the same gallery after the views. */
  photos?: GalleryPhoto[];
  /** Show the print with the glitter finish (an illustration: a real glitter print sparkles with the light). */
  glitter?: boolean;
  /** Example pictures for the empty photo spaces (the product's sample photos). */
  samples?: string[];
}

function ToolButton({ icon, label, onClick, disabled }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink/80 transition-colors hover:bg-tint hover:text-ink disabled:pointer-events-none disabled:opacity-35"
    >
      <Icon name={icon} />
    </button>
  );
}

/**
 * Left column of a template product page: one gallery with the design itself
 * (editable) and the same design framed in a bedroom, a hall and on a table.
 * Until the first photo is added every view shows the product's own picture.
 */
export function CustomizerPreview({ customizer, variant, onRequestPhoto, defaultImageUrl = null, productTitle = 'Your design', frameLook = null, photos = [], glitter = false, samples = [] }: CustomizerPreviewProps) {
  const { template, state, activeSlotId } = customizer;
  const [view, setView] = useState<GalleryViewId>('plain');
  const [roomImage, setRoomImage] = useState<string | null>(null);

  const printWidthIn = canvasPrintWidthIn(template.canvas, { width: variant.widthIn, height: variant.heightIn });
  const printHeightIn = printWidthIn * (template.canvas.height / template.canvas.width);
  const look = frameLook ?? STOCK_FRAME;
  const frameInches = { widthIn: printWidthIn + look.mouldingWidthIn * 2, heightIn: printHeightIn + look.mouldingWidthIn * 2 };
  const photoCount = Object.keys(state.slots).length;
  // A ready-made frame: nothing to add, the design is complete as it is and is shown framed straight away.
  const fixedDesign = template.photoSlots.length === 0 && template.textSlots.length === 0 && !(template.calendarSlots?.length);

  // The rooms (and their thumbnails) show the finished design, framed, rebuilt as the design changes.
  useEffect(() => {
    if (photoCount === 0 && !fixedDesign) {
      setRoomImage(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      const design = customizer.exportDesign(1000, true);
      if (!design) return; // a photo is still loading; this runs again once it has
      const framed = await frameDesign(design, printWidthIn, look, { glitter });
      if (alive) setRoomImage(framed ?? design);
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, customizer.render.version, printWidthIn, photoCount, fixedDesign, look.src, look.borderPx, look.mouldingWidthIn, glitter]);

  const activeSlot = template.photoSlots.find((s) => s.id === activeSlotId) ?? null;
  const activePhoto = activeSlotId ? state.slots[activeSlotId] : undefined;

  const editing = view === 'plain' && photoCount > 0;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper p-3 md:p-4 lg:sticky lg:top-24 lg:z-20">
      {editing && (
        <div className="flex items-center justify-end">
          <div className="flex items-center">
            <ToolButton icon="undo" label="Undo" onClick={customizer.undo} disabled={!customizer.canUndo} />
            <ToolButton icon="redo" label="Redo" onClick={customizer.redo} disabled={!customizer.canRedo} />
          </div>
        </div>
      )}

      <PreviewGallery
        defaultImageUrl={defaultImageUrl}
        personalizedImageUrl={roomImage}
        hasPersonalization={photoCount > 0 || (fixedDesign && roomImage !== null)}
        frameInches={frameInches}
        cutOut={false}
        alt={productTitle}
        view={view}
        onViewChange={setView}
        showEditor={!fixedDesign}
        photos={photos}
      >
        <div className="flex h-full max-h-full w-full items-center justify-center rounded-xl bg-tint/60 p-1 md:p-2">
          <TemplateCanvas customizer={customizer} onRequestPhoto={onRequestPhoto} samples={samples} fitParentHeight frame={{ look, printWidthIn }} />
        </div>
      </PreviewGallery>

      {samples.length > 0 && !fixedDesign && photoCount < template.photoSlots.length && (
        <p className="px-1 text-center text-2xs text-ink/55">Example photos. Tap a space to add your own.</p>
      )}

      {glitter && roomImage && (
        <p className="px-1 text-center text-2xs text-ink/55">Glitter finish preview. It is an illustration: a real glitter print sparkles as it catches the light.</p>
      )}

      {editing && activeSlot && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line/80 px-2 py-1.5">
          <span className="min-w-0 truncate pl-2 text-[13px] font-semibold text-ink">{activeSlot.label}</span>
          {activePhoto ? (
            <div className="flex flex-wrap items-center">
              <ToolButton icon="zoomOut" label="Zoom out" onClick={() => customizer.zoomPhoto(activeSlot.id, 1 / 1.2)} disabled={activePhoto.transform.scale <= 1.001} />
              <input
                type="range"
                min={1}
                max={4}
                step={0.01}
                value={Math.min(4, activePhoto.transform.scale)}
                onChange={(e) => customizer.setZoom(activeSlot.id, Number(e.target.value))}
                aria-label={`Zoom ${activeSlot.label}`}
                className="mx-1 w-24 accent-[#c9861a] sm:w-32"
              />
              <ToolButton icon="zoomIn" label="Zoom in" onClick={() => customizer.zoomPhoto(activeSlot.id, 1.2)} disabled={activePhoto.transform.scale >= MAX_SCALE - 0.001} />
              <ToolButton icon="rotate" label="Rotate 90°" onClick={() => customizer.rotatePhoto(activeSlot.id)} />
              <ToolButton icon="fit" label="Fit to space" onClick={() => customizer.resetPhoto(activeSlot.id)} />
              <ToolButton icon="replace" label="Replace photo" onClick={() => onRequestPhoto(activeSlot.id)} />
              <ToolButton icon="remove" label="Remove photo" onClick={() => customizer.removePhoto(activeSlot.id)} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onRequestPhoto(activeSlot.id)}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-[13px] font-semibold text-paper transition-colors hover:bg-ink/85"
            >
              <Icon name="plus" className="h-4 w-4" />
              Add photo
            </button>
          )}
        </div>
      )}
      {editing && <p className="text-center text-xs text-ink/55">Tap a space to add a photo · drag to move it · pinch or Ctrl + scroll to zoom</p>}
    </div>
  );
}
