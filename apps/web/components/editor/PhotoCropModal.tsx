'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { RotationDeg, Variant } from '@bro-pics/shared';
import {
  coverScaleForRotation,
  centeredOffsetForRotation,
  offsetAfterScaleChange,
  EDITOR_CANVAS_SIZE,
  fractionRectToCanvasRect,
  slotCropRectInOriginalPx,
  printDimensionsForRotation,
  effectiveDpiFromCropRect,
} from '@bro-pics/shared';
import { dpiTier } from '@bro-pics/shared';
import { DpiBadge } from './DpiBadge';
import type { SlotState } from './PersonalizationEditor';

const MAX_ZOOM_MULTIPLE = 4;

function calculateDpi(
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

interface PhotoCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  slotIndex: number;
  slot: SlotState;
  slotRect: { x: number; y: number; width: number; height: number; widthMm?: number; heightMm?: number };
  variant: Variant | null;
  onApply: (transform: { scale: number; offsetX: number; offsetY: number; rotationDeg: RotationDeg; effectiveDpi: number }) => void;
  onLiveTransformChange: (slotIndex: number, transform: { scale: number; offsetX: number; offsetY: number; rotationDeg: RotationDeg; effectiveDpi: number }) => void;
}

const ZOOM_STEP = 1.25;

export function PhotoCropModal({
  isOpen,
  onClose,
  slotIndex,
  slot,
  slotRect,
  variant,
  onApply,
  onLiveTransformChange,
}: PhotoCropModalProps) {
  // Capture the initial transform snapshot when modal opens so Cancel can cleanly revert
  const initialTransformRef = useRef({
    scale: slot.scale,
    offsetX: slot.offsetX,
    offsetY: slot.offsetY,
    rotationDeg: slot.rotationDeg,
    effectiveDpi: slot.effectiveDpi,
  });

  const [currentScale, setCurrentScale] = useState(slot.scale);
  const [currentOffsetX, setCurrentOffsetX] = useState(slot.offsetX);
  const [currentOffsetY, setCurrentOffsetY] = useState(slot.offsetY);
  const [currentRotation, setCurrentRotation] = useState<RotationDeg>(slot.rotationDeg);
  const [currentDpi, setCurrentDpi] = useState(slot.effectiveDpi);

  // Sync state when slot changes or modal opens
  useEffect(() => {
    if (isOpen) {
      initialTransformRef.current = {
        scale: slot.scale,
        offsetX: slot.offsetX,
        offsetY: slot.offsetY,
        rotationDeg: slot.rotationDeg,
        effectiveDpi: slot.effectiveDpi,
      };
      setCurrentScale(slot.scale);
      setCurrentOffsetX(slot.offsetX);
      setCurrentOffsetY(slot.offsetY);
      setCurrentRotation(slot.rotationDeg);
      setCurrentDpi(slot.effectiveDpi);
    }
  }, [isOpen, slot]);

  // Viewport / canvas reference for coordinate translation
  const viewportRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, startOffsetX: 0, startOffsetY: 0 });
  const touchPinchRef = useRef<{ initialDistance: number; initialScale: number } | null>(null);

  const [viewportScale, setViewportScale] = useState(1);

  // Calculate canvas rect in 500x500 reference coordinate system
  const canvasRect = fractionRectToCanvasRect(slotRect, EDITOR_CANVAS_SIZE, EDITOR_CANVAS_SIZE);
  const minScale = coverScaleForRotation(canvasRect.width, canvasRect.height, slot.widthPx, slot.heightPx, currentRotation);
  const maxScale = minScale * MAX_ZOOM_MULTIPLE;

  useEffect(() => {
    if (!isOpen) return;
    const updateScale = () => {
      if (viewportRef.current && canvasRect.width > 0) {
        setViewportScale(viewportRef.current.clientWidth / canvasRect.width);
      }
    };
    updateScale();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateScale) : null;
    if (viewportRef.current && ro) {
      ro.observe(viewportRef.current);
    }
    return () => ro?.disconnect();
  }, [isOpen, canvasRect.width]);

  // Aspect ratio for the slot
  const slotAspectRatio = canvasRect.width / canvasRect.height;

  // Notify parent of live changes so the PDP frame preview reflects adjustments instantly
  const emitLiveUpdate = useCallback(
    (scale: number, offsetX: number, offsetY: number, rotationDeg: RotationDeg) => {
      const effectiveDpi = variant
        ? calculateDpi(slotRect, slot.widthPx, slot.heightPx, scale, offsetX, offsetY, rotationDeg, variant)
        : slot.effectiveDpi;
      setCurrentDpi(effectiveDpi);
      onLiveTransformChange(slotIndex, { scale, offsetX, offsetY, rotationDeg, effectiveDpi });
    },
    [variant, slotRect, slot.widthPx, slot.heightPx, slot.effectiveDpi, onLiveTransformChange, slotIndex]
  );

  // Drag handling
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startOffsetX: currentOffsetX,
      startOffsetY: currentOffsetY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !viewportRef.current) return;
    const vpRect = viewportRef.current.getBoundingClientRect();
    // Scale delta from displayed viewport px to reference canvas units
    const factorX = canvasRect.width / vpRect.width;
    const factorY = canvasRect.height / vpRect.height;

    const deltaX = (e.clientX - dragStartRef.current.x) * factorX;
    const deltaY = (e.clientY - dragStartRef.current.y) * factorY;

    const newOffsetX = dragStartRef.current.startOffsetX + deltaX;
    const newOffsetY = dragStartRef.current.startOffsetY + deltaY;

    setCurrentOffsetX(newOffsetX);
    setCurrentOffsetY(newOffsetY);
    emitLiveUpdate(currentScale, newOffsetX, newOffsetY, currentRotation);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture was already lost
    }
  };

  // Zoom slider & buttons
  const handleZoomTo = (newScale: number) => {
    const clamped = Math.min(maxScale, Math.max(minScale, newScale));
    const { offsetX, offsetY } = offsetAfterScaleChange(
      currentOffsetX,
      currentOffsetY,
      currentScale,
      clamped,
      canvasRect.width,
      canvasRect.height
    );
    setCurrentScale(clamped);
    setCurrentOffsetX(offsetX);
    setCurrentOffsetY(offsetY);
    emitLiveUpdate(clamped, offsetX, offsetY, currentRotation);
  };

  const handleZoomStep = (factor: number) => {
    handleZoomTo(currentScale * factor);
  };

  // Rotation
  const handleRotate = () => {
    const newRotation = ((currentRotation + 90) % 360) as RotationDeg;
    const newMinScale = coverScaleForRotation(canvasRect.width, canvasRect.height, slot.widthPx, slot.heightPx, newRotation);
    const newScale = Math.max(currentScale, newMinScale);
    const { offsetX, offsetY } = centeredOffsetForRotation(
      canvasRect.width,
      canvasRect.height,
      slot.widthPx,
      slot.heightPx,
      newScale,
      newRotation
    );
    setCurrentRotation(newRotation);
    setCurrentScale(newScale);
    setCurrentOffsetX(offsetX);
    setCurrentOffsetY(offsetY);
    emitLiveUpdate(newScale, offsetX, offsetY, newRotation);
  };

  // Reset
  const handleReset = () => {
    const scale = coverScaleForRotation(canvasRect.width, canvasRect.height, slot.widthPx, slot.heightPx, 0);
    const { offsetX, offsetY } = centeredOffsetForRotation(
      canvasRect.width,
      canvasRect.height,
      slot.widthPx,
      slot.heightPx,
      scale,
      0
    );
    setCurrentRotation(0);
    setCurrentScale(scale);
    setCurrentOffsetX(offsetX);
    setCurrentOffsetY(offsetY);
    emitLiveUpdate(scale, offsetX, offsetY, 0);
  };

  // Touch pinch-to-zoom
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchPinchRef.current = { initialDistance: dist, initialScale: currentScale };
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && touchPinchRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const factor = dist / touchPinchRef.current.initialDistance;
      handleZoomTo(touchPinchRef.current.initialScale * factor);
    }
  };

  const handleTouchEnd = () => {
    touchPinchRef.current = null;
  };

  // Cancel action
  const handleCancel = () => {
    const init = initialTransformRef.current;
    onLiveTransformChange(slotIndex, init);
    onClose();
  };

  // Apply action
  const handleApply = () => {
    onApply({
      scale: currentScale,
      offsetX: currentOffsetX,
      offsetY: currentOffsetY,
      rotationDeg: currentRotation,
      effectiveDpi: currentDpi,
    });
    onClose();
  };

  // Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  // Viewport display scaling ratio: CSS translate and scale inside the crop viewport
  // The crop viewport represents (canvasRect.width x canvasRect.height).
  // In the viewport, (0,0) is top-left of the slot aperture.
  // The photo image natural size is slot.widthPx x slot.heightPx.
  // Transform: translate(offsetX, offsetY) rotate(rotation) scale(scale).
  // To render via pure CSS inside an aspect-ratio box of width W:
  // viewport scale S = W / canvasRect.width
  const transformStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: `${slot.widthPx}px`,
    height: `${slot.heightPx}px`,
    transformOrigin: '0 0',
    transform: `translate(${currentOffsetX}px, ${currentOffsetY}px) rotate(${currentRotation}deg) scale(${currentScale})`,
    pointerEvents: 'none',
    userSelect: 'none',
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit Photo for Slot ${slotIndex + 1}`}
      className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center items-center bg-ink/75 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto animate-fadeIn"
    >
      {/* Background click dismisses via Cancel */}
      <div className="fixed inset-0 -z-10" onClick={handleCancel} aria-hidden="true" />

      <div className="w-full sm:max-w-2xl bg-paper sm:rounded-3xl border border-line shadow-2xl flex flex-col max-h-[96vh] overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3 shrink-0 bg-paper">
          <div>
            <h3 className="font-display text-base sm:text-lg font-bold text-ink">
              Edit Photo — Slot {slotIndex + 1}
            </h3>
            <p className="text-2xs sm:text-xs text-ink/60">
              Drag to reposition, use controls or pinch to zoom and rotate.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Close"
            className="w-8 h-8 rounded-full border border-line/80 flex items-center justify-center text-ink/70 hover:text-ink hover:border-ink transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="6" />
            </svg>
          </button>
        </div>

        {/* Modal Body / Crop Viewport Area */}
        <div className="p-4 sm:p-6 flex flex-col items-center justify-center bg-[#F7F5F0] overflow-hidden">
          {/* Aspect-ratio constrained viewport representing the exact slot cutout */}
          <div className="relative w-full max-w-[420px] max-h-[50vh] flex items-center justify-center">
            <div
              ref={viewportRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{
                aspectRatio: `${canvasRect.width} / ${canvasRect.height}`,
                width: slotAspectRatio >= 1 ? '100%' : 'auto',
                height: slotAspectRatio < 1 ? 'min(48vh, 420px)' : 'auto',
                maxWidth: '100%',
              }}
              className="relative overflow-hidden rounded-xl border-2 border-dashed border-accent bg-[#2A2624] shadow-md cursor-grab active:cursor-grabbing touch-none select-none"
            >
              {/* Reference coordinate scale wrapper */}
              <div
                style={{
                  position: 'absolute',
                  width: `${canvasRect.width}px`,
                  height: `${canvasRect.height}px`,
                  transformOrigin: '0 0',
                  transform: `scale(${viewportScale})`,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slot.localPreviewUrl || slot.originalUrl}
                  alt={`Slot ${slotIndex + 1}`}
                  style={transformStyle}
                  draggable={false}
                />
              </div>

              {/* Crop aperture guide crosshair overlay (subtle rule-of-thirds) */}
              <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 opacity-20 border border-white/50">
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-white" />
                <div className="border-r border-white" />
                <div />
              </div>

              {/* Reposition helper badge */}
              <div className="absolute bottom-2 left-2 pointer-events-none bg-ink/70 backdrop-blur-xs text-paper px-2 py-0.5 rounded text-[10px] font-medium opacity-80">
                Drag to pan
              </div>
            </div>
          </div>

          {/* Real-time DPI Quality Indicator */}
          <div className="mt-3 flex items-center justify-center">
            <DpiBadge effectiveDpi={currentDpi} />
          </div>
        </div>

        {/* Modal Controls Bar */}
        <div className="p-4 sm:p-5 border-t border-line bg-paper flex flex-col gap-3 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Zoom Slider + Buttons */}
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => handleZoomStep(1 / ZOOM_STEP)}
                className="w-10 h-10 min-w-[44px] min-h-[44px] sm:w-9 sm:h-9 sm:min-w-0 sm:min-h-0 rounded-xl border border-line text-ink hover:border-accent hover:bg-tint/40 transition-colors flex items-center justify-center font-bold text-base shrink-0"
              >
                −
              </button>
              <input
                type="range"
                aria-label="Zoom"
                min={minScale}
                max={maxScale}
                step={(maxScale - minScale) / 100 || 0.001}
                value={currentScale}
                onChange={(e) => handleZoomTo(Number(e.target.value))}
                className="flex-1 min-w-[80px] accent-accent cursor-pointer"
              />
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => handleZoomStep(ZOOM_STEP)}
                className="w-10 h-10 min-w-[44px] min-h-[44px] sm:w-9 sm:h-9 sm:min-w-0 sm:min-h-0 rounded-xl border border-line text-ink hover:border-accent hover:bg-tint/40 transition-colors flex items-center justify-center font-bold text-base shrink-0"
              >
                +
              </button>
            </div>

            {/* Rotate & Reset Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                aria-label="Rotate 90 degrees"
                onClick={handleRotate}
                className="h-10 min-h-[44px] sm:min-h-0 sm:h-9 px-3.5 rounded-xl border border-line text-ink text-xs sm:text-sm font-semibold hover:border-accent hover:bg-tint/40 transition-colors flex items-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                Rotate
              </button>
              <button
                type="button"
                aria-label="Reset position"
                onClick={handleReset}
                className="h-10 min-h-[44px] sm:min-h-0 sm:h-9 px-3.5 rounded-xl border border-line text-ink/80 text-xs sm:text-sm hover:border-ink hover:text-ink transition-colors flex items-center justify-center"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Modal Action Buttons: Cancel & Apply */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-line/60">
            <button
              type="button"
              onClick={handleCancel}
              className="px-5 h-11 min-h-[44px] rounded-full border border-line text-ink text-sm font-medium hover:border-ink transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-6 h-11 min-h-[44px] rounded-full bg-gold hover:bg-gold-deep text-ink text-sm font-bold shadow-xs hover:shadow-sm transition-all"
            >
              Apply Photo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
