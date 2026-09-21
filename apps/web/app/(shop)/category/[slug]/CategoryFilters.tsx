'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useProductFilters } from '../../../../components/filters/use-product-filters';
import { FilterPanel } from '../../../../components/filters/FilterPanel';

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
  const { filters, selectedOrientations, toggleSize, toggleColour, toggleOrientation, clearAll } =
    useProductFilters(params);
  // Filters are a permanent rail on desktop and a disclosure on phones, where
  // they would otherwise push the products themselves below the fold.
  const [isOpenOnMobile, setIsOpenOnMobile] = useState(false);

  const navigate = (next: URLSearchParams) => router.push(`${pathname}?${next.toString()}`);

  const activeCount =
    (filters.sizes?.length ?? 0) + (filters.colours?.length ?? 0) + selectedOrientations.length;

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpenOnMobile((open) => !open)}
        aria-expanded={isOpenOnMobile}
        className="md:hidden w-full flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm font-medium text-ink mb-4"
      >
        <span>Filters{activeCount > 0 ? ` (${activeCount})` : ''}</span>
        <span aria-hidden="true">{isOpenOnMobile ? '−' : '+'}</span>
      </button>

      <div className={`${isOpenOnMobile ? 'block' : 'hidden'} md:block md:sticky md:top-32`}>
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
          onClearAll={() => navigate(clearAll())}
        />
      </div>
    </div>
  );
}
