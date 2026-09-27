'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useProductFilters } from '../../../../components/filters/use-product-filters';
import { FilterPanel } from '../../../../components/filters/FilterPanel';
import { SortSelect } from '../../../../components/filters/SortSelect';

interface CategoryFiltersProps {
  availableSizes: string[];
  availableColours: string[];
  availableOrientations: string[];
  initialSearch: string;
}

export function CategoryFilters({
  availableSizes,
  availableColours,
  availableOrientations,
  initialSearch,
}: CategoryFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = new URLSearchParams(initialSearch);
  const {
    filters,
    selectedOrientations,
    toggleSize,
    toggleColour,
    toggleOrientation,
    setMinRating,
    toggleInStockOnly,
    setSort,
    clearAll,
  } = useProductFilters(params);
  // [FE-30] A real bottom sheet on mobile (fixed overlay + backdrop,
  // slides up, closes on backdrop tap or the Done button) — replacing
  // the plain inline disclosure this used to be, which pushed the
  // product grid below the fold instead of overlaying it.
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const navigate = (next: URLSearchParams) => router.push(`${pathname}?${next.toString()}`);

  const activeCount =
    (filters.sizes?.length ?? 0) +
    (filters.colours?.length ?? 0) +
    selectedOrientations.length +
    (filters.minRating ? 1 : 0) +
    (filters.inStockOnly ? 1 : 0);

  const panel = (
    <FilterPanel
      availableSizes={availableSizes}
      availableColours={availableColours}
      availableOrientations={availableOrientations}
      selectedSizes={filters.sizes ?? []}
      selectedColours={filters.colours ?? []}
      selectedOrientations={selectedOrientations}
      onToggleSize={(size) => navigate(toggleSize(size))}
      onToggleColour={(colour) => navigate(toggleColour(colour))}
      onToggleOrientation={(orientation) => navigate(toggleOrientation(orientation))}
      minRating={filters.minRating ?? null}
      onSetMinRating={(minRating) => navigate(setMinRating(minRating))}
      inStockOnly={filters.inStockOnly ?? false}
      onToggleInStockOnly={() => navigate(toggleInStockOnly())}
      onClearAll={() => navigate(clearAll())}
    />
  );

  return (
    <div>
      <div className="md:hidden flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setIsSheetOpen(true)}
          aria-expanded={isSheetOpen}
          className="flex-1 flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm font-medium text-ink"
        >
          <span>Filters{activeCount > 0 ? ` (${activeCount})` : ''}</span>
          <span aria-hidden="true">+</span>
        </button>
        <SortSelect value={filters.sort} onChange={(sort) => navigate(setSort(sort))} />
      </div>

      {isSheetOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          <div
            className="absolute inset-0 bg-ink/40"
            aria-hidden="true"
            onClick={() => setIsSheetOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filters"
            className="relative bg-paper rounded-t-2xl max-h-[80vh] overflow-y-auto p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-ink">Filters</h2>
              <button
                type="button"
                onClick={() => setIsSheetOpen(false)}
                className="rounded-full bg-gold text-ink px-4 py-1.5 text-sm font-semibold"
              >
                Done
              </button>
            </div>
            {panel}
          </div>
        </div>
      )}

      <div className="hidden md:block md:sticky md:top-32">
        <SortSelect value={filters.sort} onChange={(sort) => navigate(setSort(sort))} className="mb-4" />
        {panel}
      </div>
    </div>
  );
}
