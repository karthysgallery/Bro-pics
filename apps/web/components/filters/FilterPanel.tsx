'use client';

import { useState } from 'react';
import { Chip } from '../ui/Chip';
import { Swatch } from '../ui/Swatch';

interface FilterPanelProps {
  availableSizes: string[];
  availableColours: string[];
  availableOrientations: string[];
  selectedSizes: string[];
  selectedColours: string[];
  selectedOrientations: string[];
  onToggleSize: (size: string) => void;
  onToggleColour: (colour: string) => void;
  onToggleOrientation: (orientation: string) => void;
  onClearAll: () => void;
  minRating?: number | null;
  onSetMinRating?: (minRating: number | null) => void;
  inStockOnly?: boolean;
  onToggleInStockOnly?: () => void;
}

const RATING_OPTIONS = [4, 3];

const ORIENTATION_LABELS: Record<string, string> = {
  portrait: 'Portrait',
  landscape: 'Landscape',
  square: 'Square',
};

export function FilterPanel({
  availableSizes,
  availableColours,
  availableOrientations,
  selectedSizes,
  selectedColours,
  selectedOrientations,
  onToggleSize,
  onToggleColour,
  onToggleOrientation,
  onClearAll,
  minRating = null,
  onSetMinRating,
  inStockOnly = false,
  onToggleInStockOnly,
}: FilterPanelProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    size: true,
    orientation: true,
    colour: true,
    rating: true,
    availability: true,
  });

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const hasAnyFilter =
    selectedSizes.length > 0 ||
    selectedColours.length > 0 ||
    selectedOrientations.length > 0 ||
    minRating !== null ||
    inStockOnly;

  return (
    <div className="flex flex-col gap-5 divide-y divide-line/40">
      <div className="flex items-center justify-between pb-1">
        <h3 className="text-xs font-bold uppercase tracking-wider text-ink">Filters</h3>
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs font-semibold text-gold-deep hover:underline"
        >
          Clear all
        </button>
      </div>

      {availableSizes.length > 0 && (
        <div className="pt-4">
          <button
            type="button"
            onClick={() => toggleSection('size')}
            aria-expanded={openSections.size}
            className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink/80 hover:text-ink mb-2 py-0.5"
          >
            <span>Size</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`text-ink/40 transition-transform duration-200 ${openSections.size ? 'rotate-180' : ''}`}
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {openSections.size && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {availableSizes.map((size) => (
                <Chip key={size} label={size} active={selectedSizes.includes(size)} onClick={() => onToggleSize(size)} />
              ))}
            </div>
          )}
        </div>
      )}

      {availableOrientations.length > 0 && (
        <div className="pt-4">
          <button
            type="button"
            onClick={() => toggleSection('orientation')}
            aria-expanded={openSections.orientation}
            className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink/80 hover:text-ink mb-2 py-0.5"
          >
            <span>Orientation</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`text-ink/40 transition-transform duration-200 ${openSections.orientation ? 'rotate-180' : ''}`}
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {openSections.orientation && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {availableOrientations.map((orientation) => (
                <Chip
                  key={orientation}
                  label={ORIENTATION_LABELS[orientation] ?? orientation}
                  active={selectedOrientations.includes(orientation)}
                  onClick={() => onToggleOrientation(orientation)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {availableColours.length > 0 && (
        <div className="pt-4">
          <button
            type="button"
            onClick={() => toggleSection('colour')}
            aria-expanded={openSections.colour}
            className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink/80 hover:text-ink mb-2 py-0.5"
          >
            <span>Frame finish</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`text-ink/40 transition-transform duration-200 ${openSections.colour ? 'rotate-180' : ''}`}
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {openSections.colour && (
            <div className="flex flex-wrap gap-2 pt-1">
              {availableColours.map((colour) => (
                <Swatch
                  key={colour}
                  label={colour}
                  active={selectedColours.includes(colour)}
                  onClick={() => onToggleColour(colour)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {onSetMinRating && (
        <div className="pt-4">
          <button
            type="button"
            onClick={() => toggleSection('rating')}
            aria-expanded={openSections.rating}
            className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink/80 hover:text-ink mb-2 py-0.5"
          >
            <span>Rating</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`text-ink/40 transition-transform duration-200 ${openSections.rating ? 'rotate-180' : ''}`}
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {openSections.rating && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {RATING_OPTIONS.map((rating) => (
                <Chip
                  key={rating}
                  label={`${rating}★ & up`}
                  active={minRating === rating}
                  onClick={() => onSetMinRating(minRating === rating ? null : rating)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {onToggleInStockOnly && (
        <div className="pt-4">
          <button
            type="button"
            onClick={() => toggleSection('availability')}
            aria-expanded={openSections.availability}
            className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-ink/80 hover:text-ink mb-2 py-0.5"
          >
            <span>Availability</span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`text-ink/40 transition-transform duration-200 ${openSections.availability ? 'rotate-180' : ''}`}
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {openSections.availability && (
            <div className="pt-1">
              <label className="flex items-center gap-2.5 text-xs font-medium text-ink cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={onToggleInStockOnly}
                  className="rounded border-line text-ink focus:ring-1 focus:ring-ink"
                />
                In stock only
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
