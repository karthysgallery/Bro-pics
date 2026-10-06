'use client';

import { useEffect, useState } from 'react';
import { canvasPrintWidthIn, MAX_SCALE, type Variant } from '@bro-pics/shared';
import { LifestylePreview } from '../editor/LifestylePreview';
import { TemplateCanvas } from './TemplateCanvas';
import { frameDesign, MOULDING_IN } from './frame-moulding';
import { Icon, type IconName } from './icons';
import type { TemplateCustomizer } from './use-template-customizer';

interface CustomizerPreviewProps {
  customizer: TemplateCustomizer;
  variant: Variant;
  onRequestPhoto: (slotId: string) => void;
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
 * Left column of a template product page: the design itself (editable) or the
 * same design framed in a real room.
 */
export function CustomizerPreview({ customizer, variant, onRequestPhoto }: CustomizerPreviewProps) {
  const { template, state, activeSlotId } = customizer;
  const [view, setView] = useState<'design' | 'room'>('design');
  const [roomImage, setRoomImage] = useState<string | null>(null);

  const printWidthIn = canvasPrintWidthIn(template.canvas, { width: variant.widthIn, height: variant.heightIn });
  const printHeightIn = printWidthIn * (template.canvas.height / template.canvas.width);
  const frameInches = { widthIn: printWidthIn + MOULDING_IN * 2, heightIn: printHeightIn + MOULDING_IN * 2 };
  const photoCount = Object.keys(state.slots).length;

  // The room view shows the finished design, framed, rebuilt as the design changes.
  useEffect(() => {
    if (view !== 'room') return;
    if (photoCount === 0) {
      setRoomImage(null);
      return;
    }
    let alive = true;
    const timer = setTimeout(async () => {
      const design = customizer.exportDesign(1400, true);
      if (!design) return; // a photo is still loading; this runs again once it has
      const framed = await frameDesign(design, printWidthIn);
      if (alive) setRoomImage(framed ?? design);
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, state, customizer.render.version, printWidthIn, photoCount]);

  const activeSlot = template.photoSlots.find((s) => s.id === activeSlotId) ?? null;
  const activePhoto = activeSlotId ? state.slots[activeSlotId] : undefined;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-paper p-3 md:p-4 lg:sticky lg:top-24">
      <div className="flex items-center justify-between gap-2">
        <div role="tablist" aria-label="Preview" className="inline-flex rounded-full border border-line bg-tint p-1">
          {(
            [
              ['design', 'Your design'],
              ['room', 'In a room'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
              className={`h-9 rounded-full px-4 text-[13px] font-semibold transition-colors ${view === id ? 'bg-ink text-paper' : 'text-ink/70 hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {view === 'design' && (
          <div className="flex items-center">
            <ToolButton icon="undo" label="Undo" onClick={customizer.undo} disabled={!customizer.canUndo} />
            <ToolButton icon="redo" label="Redo" onClick={customizer.redo} disabled={!customizer.canRedo} />
          </div>
        )}
      </div>

      {view === 'design' ? (
        <>
          <div className="rounded-xl bg-tint/60 p-3 md:p-5">
            <TemplateCanvas customizer={customizer} onRequestPhoto={onRequestPhoto} />
          </div>

          {activeSlot && (
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
          <p className="text-center text-xs text-ink/55">Tap a space to add a photo · drag to move it · pinch or Ctrl + scroll to zoom</p>
        </>
      ) : (
        <LifestylePreview
          imageUrl={roomImage}
          frameInches={frameInches}
          cutOut={false}
          emptyMessage={photoCount === 0 ? 'Add your photos to see the frame in a room.' : 'Framing your design…'}
        />
      )}
    </div>
  );
}
