'use client';

import { useState } from 'react';
import type { Rect as GeometryRect } from '@bro-pics/shared';
import { dpiTier, fractionRectToCanvasRect, EDITOR_CANVAS_SIZE } from '@bro-pics/shared';
import { DpiBadge } from './DpiBadge';
import type { SlotState } from './PersonalizationEditor';

interface PhotoSlotCardProps {
  slotIndex: number;
  totalSlots: number;
  slot?: SlotState;
  slotRect: GeometryRect;
  isActive: boolean;
  isUploading: boolean;
  uploadError?: string | null;
  onSelect: () => void;
  onFileChange: (file: File) => void;
  onEdit: () => void;
  onRemove: () => void;
  onConfirmLowDpi: (confirmed: boolean) => void;
}

export function PhotoSlotCard({
  slotIndex,
  totalSlots,
  slot,
  slotRect,
  isActive,
  isUploading,
  uploadError,
  onSelect,
  onFileChange,
  onEdit,
  onRemove,
  onConfirmLowDpi,
}: PhotoSlotCardProps) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const inputId = `photo-slot-input-${slotIndex}`;

  const canvasRect = fractionRectToCanvasRect(slotRect, EDITOR_CANVAS_SIZE, EDITOR_CANVAS_SIZE);
  const slotAspectRatio = canvasRect.width / canvasRect.height;
  const isRedDpi = slot ? dpiTier(slot.effectiveDpi) === 'red' : false;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onSelect();
      onFileChange(file);
    }
  };

  // EMPTY SLOT STATE
  if (!slot) {
    const inputElementId = isActive ? 'photo-upload-input' : inputId;
    return (
      <label
        htmlFor={inputElementId}
        className={`relative group rounded-2xl border-2 border-dashed transition-all p-4 flex flex-col items-center justify-center text-center min-h-[140px] cursor-pointer ${
          isDraggingOver
            ? 'border-accent bg-tint'
            : isActive
            ? 'border-gold bg-[#FAF7F2]'
            : 'border-line/80 hover:border-gold hover:bg-[#FCFBF8]'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
        onClick={() => {
          onSelect();
        }}
      >
        <input
          id={inputElementId}
          type="file"
          accept="image/*,.heic,.heif"
          aria-label={isActive ? `Upload a photo for slot ${slotIndex + 1}` : `Add photo for slot ${slotIndex + 1}`}
          disabled={isUploading}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              onSelect();
              onFileChange(file);
              e.target.value = '';
            }
          }}
        />

        {isUploading ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-semibold text-accent">Uploading...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <span
              className="w-10 h-10 rounded-full bg-tint flex items-center justify-center text-accent group-hover:scale-105 transition-transform"
              aria-hidden="true"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </span>
            <span className="text-xs font-bold text-ink">
              Add Photo {totalSlots > 1 ? `#${slotIndex + 1}` : ''}
            </span>
            <span className="text-[11px] text-ink/50">
              Click or drop here
            </span>
          </div>
        )}

        {uploadError && (
          <p className="mt-2 text-2xs text-alert font-medium">{uploadError}</p>
        )}

        <button
          type="button"
          aria-label={`Slot ${slotIndex + 1}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onSelect();
          }}
          className="sr-only"
        >
          Slot {slotIndex + 1}
        </button>
      </label>
    );
  }

  // FILLED SLOT STATE
  return (
    <div
      className={`rounded-2xl border transition-all p-3.5 bg-paper flex flex-col gap-2.5 shadow-xs ${
        isActive ? 'border-gold ring-1 ring-gold/40' : 'border-line/90 hover:border-line'
      }`}
      onClick={() => onSelect()}
    >
      {/* Thumbnail + Slot Header */}
      <div className="flex items-start gap-3">
        {/* Interactive Thumbnail */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
            onEdit();
          }}
          title="Click to crop / edit photo"
          style={{ aspectRatio: `${canvasRect.width} / ${canvasRect.height}` }}
          className="w-20 sm:w-24 shrink-0 rounded-xl overflow-hidden border border-line/80 bg-[#2A2624] relative cursor-pointer group shadow-2xs"
        >
          <img
            src={slot.localPreviewUrl || slot.originalUrl}
            alt={`Slot ${slotIndex + 1}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
          <div className="absolute inset-0 bg-ink/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="bg-paper/90 rounded-full p-1 text-ink shadow-xs">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
            </span>
          </div>
        </div>

        {/* Slot Info & DPI */}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              aria-label={`Slot ${slotIndex + 1}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
              className="text-xs font-bold text-ink hover:text-accent transition-colors truncate text-left"
            >
              Photo {slotIndex + 1}
            </button>
            {isActive && (
              <span className="text-[10px] uppercase font-bold text-accent bg-tint px-1.5 py-0.5 rounded">
                Active
              </span>
            )}
          </div>

          <div className="mt-0.5">
            <DpiBadge effectiveDpi={slot.effectiveDpi} />
          </div>

          {isRedDpi && isActive && (
            <label className="flex items-center gap-1.5 text-2xs text-ink/75 mt-1 cursor-pointer">
              <input
                type="checkbox"
                aria-label="Use this photo anyway"
                checked={slot.confirmedLowDpi}
                onChange={(e) => {
                  e.stopPropagation();
                  onConfirmLowDpi(e.target.checked);
                }}
                className="rounded accent-accent"
              />
              <span>Use this photo anyway</span>
            </label>
          )}
        </div>
      </div>

      {/* Action Buttons: Change, Edit, Remove */}
      <div className="flex items-center justify-between pt-2 border-t border-line/60 gap-1">
        {/* Change button (triggers hidden file input) */}
        <label
          htmlFor={isActive ? 'photo-upload-input' : inputId}
          className="cursor-pointer min-h-[44px] px-3.5 py-2 rounded-xl border border-line text-ink hover:border-accent hover:text-accent text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
          onClick={(e) => e.stopPropagation()}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
          </svg>
          Change
        </label>
        <input
          id={isActive ? 'photo-upload-input' : inputId}
          type="file"
          accept="image/*,.heic,.heif"
          aria-label={isActive ? `Replace a photo for slot ${slotIndex + 1}` : `Replace photo ${slotIndex + 1}`}
          disabled={isUploading}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              onSelect();
              onFileChange(file);
              e.target.value = '';
            }
          }}
        />

        {/* Edit button (opens crop modal) */}
        <button
          type="button"
          aria-label={`Edit photo ${slotIndex + 1}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
            onEdit();
          }}
          className="min-h-[44px] px-3.5 py-2 rounded-xl border border-line text-ink hover:border-accent hover:text-accent text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          Edit
        </button>

        {/* Remove button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove photo ${slotIndex + 1}`}
          className="min-h-[44px] px-3 py-2 rounded-xl text-ink/50 hover:text-alert hover:bg-rose-50 transition-colors text-xs font-semibold flex items-center justify-center gap-1.5"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Remove
        </button>
      </div>

      {uploadError && (
        <p className="text-2xs text-alert font-medium">{uploadError}</p>
      )}
    </div>
  );
}
